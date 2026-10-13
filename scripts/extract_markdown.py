#!/usr/bin/env python3
"""RunningDO · 论文 → Markdown 提取器（v1.4 · LIT-07 / LIT-08 / LIT-10）

两种引擎：
  fast  —— 本地快线：PyMuPDF 取文本层，按页拼 Markdown（离线、秒级、零成本）
  glm   —— 云 OCR/VLM：逐页渲染成图 → 多模态接口（默认 glm-5.3-flash）→ Markdown
           按 Q10 附加要求，提示词要求模型**必须返回标题与期刊/会议**，写入 meta.suggested

输出：
  --out  Markdown 文件
  --meta JSON 元数据（pages / chars / quality / engine_version / usage / suggested）

密钥读取顺序：环境变量 → `~/.config/runningdo/secrets.env`（GLM_API_KEY / GLM_BASE_URL / GLM_MODEL）。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

DEFAULT_BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
DEFAULT_MODEL = "glm-5.3-flash"


def load_env() -> dict[str, str]:
    env = dict(os.environ)
    for candidate in (Path.home() / ".config/runningdo/secrets.env",):
        if not candidate.is_file():
            continue
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
    return env


def write_progress(out, completed, total):
    """主协调线程写入；进度是旁路信息，失败不影响产物。"""
    if out is None or total <= 0:
        return
    path = Path(out).with_suffix(".progress.json")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".json.tmp")
        temporary.write_text(json.dumps({"completed": completed, "total": total,
                                        "updatedAt": int(time.time() * 1000)}))
        temporary.replace(path)
    except OSError:
        pass


def quality_of(pages: list[str]) -> dict:
    text = "\n".join(pages)
    cid = text.count("(cid:")
    chars = len(text)
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    return {
        "chars": chars,
        "pages": len(pages),
        "charsPerPage": round(chars / len(pages), 1) if pages else 0,
        "cidResidue": cid,
        "cjkRatio": round(cjk / chars, 4) if chars else 0.0,
        "looksScanned": chars / max(len(pages), 1) < 200,
    }


# ---------------------------------------------------------------- fast


def extract_fast(pdf: Path, out: Path | None = None) -> tuple[str, dict]:
    import pymupdf  # noqa: PLC0415

    doc = pymupdf.open(pdf)
    parts: list[str] = []
    pages: list[str] = []
    write_progress(out, 0, len(doc))
    for index, page in enumerate(doc, start=1):
        text = page.get_text("text")
        pages.append(text)
        parts.append(f"<!-- page {index} -->\n\n{text.strip()}\n")
        write_progress(out, index, len(doc))
    meta_title = (doc.metadata or {}).get("title") or ""
    suggested = {"title": meta_title.strip() or pdf.stem, "venue": "", "authors": "", "year": "", "doi": ""}
    meta = {
        "engine": "fast",
        "engine_version": f"pymupdf-{pymupdf.__doc__ or ''}".split()[0] or "pymupdf",
        "quality": quality_of(pages),
        "suggested": suggested,
        "usage": {},
    }
    doc.close()
    return "\n".join(parts), meta


# ---------------------------------------------------------------- glm


PROMPT = """你是论文解析器。把这一页学术论文转成结构良好的 Markdown：
- 保留标题层级（# / ## / ###）、列表、表格（Markdown 表格）
- 公式用 LaTeX（行内 $...$，独立块 $$...$$）
- 图表用占位行 `![figure](page-N-figure-K)`，不要编造图中内容
- 不要翻译，保留原文语言
最后**必须**追加一个 JSON 代码块，键固定为 title / authors / year / venue / doi，值为你从本页能确定的字符串（不确定就留空）：
```json
{"title": "", "authors": "", "year": "", "venue": "", "doi": ""}
```
"""


def extract_glm(pdf: Path, env: dict[str, str], dpi: int = 200, max_pages: int | None = None, out: Path | None = None) -> tuple[str, dict]:
    import pymupdf  # noqa: PLC0415
    from openai import OpenAI  # noqa: PLC0415

    api_key = env.get("GLM_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("缺少 GLM_API_KEY（环境变量或 ~/.config/runningdo/secrets.env）")
    base_url = env.get("GLM_BASE_URL", DEFAULT_BASE_URL).strip() or DEFAULT_BASE_URL
    model = env.get("GLM_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL

    client = OpenAI(api_key=api_key, base_url=base_url, timeout=120, max_retries=0)
    doc = pymupdf.open(pdf)
    parts: list[str] = []
    texts: list[str] = []
    suggested: dict[str, str] = {"title": "", "authors": "", "year": "", "venue": "", "doi": ""}
    usage = {"promptTokens": 0, "completionTokens": 0, "pages": 0, "seconds": 0.0}
    started = time.time()

    pages = [(index, page) for index, page in enumerate(doc, start=1) if not max_pages or index <= max_pages]
    try:
        concurrency = max(1, min(8, int(env.get("GLM_CONCURRENCY", "4"))))
    except ValueError:
        concurrency = 4

    def extract_page(item):
        index, page = item
        png = page.get_pixmap(dpi=dpi).tobytes("png")
        b64 = base64.b64encode(png).decode()
        resp = client.chat.completions.create(
            model=model,
            max_tokens=8192,
            extra_body={"thinking": {"type": "enabled"}, "reasoning_effort": "low"},
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PROMPT},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                    ],
                }
            ],
        )
        if resp.choices[0].finish_reason == "length":
            raise ValueError("云输出达到上限，拒绝保存截断页")
        content = resp.choices[0].message.content or ""
        if not content.strip():
            raise ValueError("云引擎返回空页")
        page_usage = {"promptTokens": 0, "completionTokens": 0}
        if getattr(resp, "usage", None):
            page_usage = {
                "promptTokens": getattr(resp.usage, "prompt_tokens", 0) or 0,
                "completionTokens": getattr(resp.usage, "completion_tokens", 0) or 0,
            }

        match = re.search(r"```json\s*(\{.*?\})\s*```", content, re.S)
        if match:
            try:
                data = json.loads(match.group(1))
                for key in suggested:
                    value = str(data.get(key, "") or "").strip()
                    if value and not suggested[key]:
                        suggested[key] = value
            except json.JSONDecodeError:
                pass
            content = content[: match.start()].rstrip()

        return index, content, page_usage

    results = {}
    write_progress(out, 0, len(pages))
    with ThreadPoolExecutor(max_workers=concurrency) as pool:
        futures = [pool.submit(extract_page, item) for item in pages]
        for future in as_completed(futures):
            index, content, page_usage = future.result()
            results[index] = (content, page_usage)
            write_progress(out, len(results), len(pages))

    for index in sorted(results):
        content, page_usage = results[index]
        usage["pages"] += 1
        usage["promptTokens"] += page_usage["promptTokens"]
        usage["completionTokens"] += page_usage["completionTokens"]
        texts.append(content)
        parts.append(f"<!-- page {index} -->\n\n{content.strip()}\n")

    usage["seconds"] = round(time.time() - started, 3)
    # 没有核实当前端点单价时，保持 unknown，不把未知成本记作零。
    known_price = model == "glm-5.3-flash" and base_url.rstrip("/") == DEFAULT_BASE_URL
    input_price = env.get("GLM_INPUT_PRICE_PER_M", "0.8" if known_price else None)
    output_price = env.get("GLM_OUTPUT_PRICE_PER_M", "2.8" if known_price else None)
    usage["estimatedCost"] = round((usage["promptTokens"] * float(input_price) + usage["completionTokens"] * float(output_price)) / 1_000_000, 8) if input_price and output_price else None
    usage["currency"] = env.get("GLM_PRICE_CURRENCY", "CNY" if known_price else "unknown")
    usage["pricingSource"] = env.get("GLM_PRICING_SOURCE", "https://docs.bigmodel.cn/cn/guide/start/pricing.md (2026-10-04)" if known_price else "unverified")
    doc.close()
    meta = {
        "engine": "glm",
        "engine_version": model,
        "quality": quality_of(texts),
        "suggested": suggested,
        "usage": usage,
    }
    return "\n".join(parts), meta


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="out", required=True)
    ap.add_argument("--meta", dest="meta", required=True)
    ap.add_argument("--dpi", type=int, default=200)
    ap.add_argument("--max-pages", type=int)
    ap.add_argument("--engine", default="fast", choices=["fast", "glm", "markitdown", "layout", "translation"])
    ap.add_argument("--raw")
    args = ap.parse_args()

    src = Path(args.src)
    if not src.is_file():
        print(f"输入文件不存在：{src}", file=sys.stderr)
        return 2

    started = time.monotonic()
    if args.engine == "translation":
        from translate_markdown import translate
        if not args.raw: raise ValueError("翻译需要整理稿")
        markdown, meta = translate(Path(args.raw), load_env(), Path(args.out))
    elif args.engine == "layout":
        from layout_markdown import organize
        if not args.raw: raise ValueError("整理需要原始提取稿")
        markdown, meta = organize(src, Path(args.raw), Path(args.out), load_env(), args.max_pages)
    elif args.engine == "markitdown":
        from markitdown import MarkItDown
        markdown = MarkItDown().convert(str(src)).text_content
        meta = {"engine": "markitdown", "engine_version": "markitdown", "quality": quality_of([markdown]), "suggested": {}, "usage": {}}
    elif args.engine == "fast":
        markdown, meta = extract_fast(src, Path(args.out))
    else:
        markdown, meta = extract_glm(src, load_env(), dpi=args.dpi, max_pages=args.max_pages, out=Path(args.out))

    meta.setdefault("usage", {})["totalSeconds"] = round(time.monotonic() - started, 3)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(markdown, encoding="utf-8")
    Path(args.meta).write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"ok": True, "engine": args.engine, "chars": meta["quality"]["chars"]}, ensure_ascii=False))
    return 0


def failure_message(exc):
    """Preserve only local controlled failures; never reveal API response text."""
    from translate_markdown import TranslationFailure
    from layout_markdown import LayoutFailure
    if isinstance(exc, LayoutFailure):
        from diagnostics import event
        attrs = {"rule": exc.rule, "batchIds": exc.batch_ids}
        if exc.block_id is not None: attrs["blockId"] = exc.block_id
        event("LAYOUT_VALIDATION_FAILED", "layout", **attrs)
        return str(exc)
    if isinstance(exc, TranslationFailure):
        return str(exc)
    status = getattr(exc, "status_code", None)
    return f"{type(exc).__name__}（HTTP {status}）" if type(status) is int else type(exc).__name__


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        # API 异常对象可能含请求信息，不将响应或密钥写入日志／前端。
        message = failure_message(exc)
        print(f"提取失败：{message}", file=sys.stderr)
        raise SystemExit(1)
