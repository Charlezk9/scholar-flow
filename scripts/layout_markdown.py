"""结构分类与真实 PDF 图区裁切。模型不返回改写正文；每个原文区块必须恰好分类一次。"""
from __future__ import annotations
import base64
import json
import math
import re
import time
from pathlib import Path
from urllib.parse import quote

KINDS = {"body", "heading", "caption", "note", "metadata"}

class LayoutFailure(ValueError):
    """Only controlled rules and integer locations may reach logs or the UI."""
    MESSAGES = {
        "block_coverage": "遗漏或重复原文区块",
        "invalid_structure": "整理结果不是有效的区块结构",
        "invalid_classification": "无效语义分类",
        "invalid_heading": "无效标题层级",
        "invalid_json": "整理结果不是有效 JSON",
        "output_truncated": "整理输出截断",
        "figure_source": "图注与图片来源不一致",
        "figure_caption": "无法识别图注编号",
        "figure_bbox": "无效图片区裁切范围",
        "source_page": "来源页码越界",
        "missing_key": "缺少云整理密钥",
        "empty_source": "原稿为空",
    }

    def __init__(self, rule, blocks=(), block_id=None):
        self.rule = rule if rule in self.MESSAGES else "invalid_structure"
        self.batch_ids = [b["id"] for b in blocks if type(b.get("id")) is int]
        self.block_id = block_id if type(block_id) is int else None
        pages = sorted({b["page"] for b in blocks if type(b.get("page")) is int})
        location = "（第 " + "、".join(map(str, pages)) + " 页）" if pages else ""
        super().__init__(f"LAYOUT_VALIDATION_FAILED：排版失败{location}：{self.MESSAGES[self.rule]} [{self.rule}]")


# Normal numbering, supplemental S1 and appendix B.11 / A-1 are all valid.
FIGURE_CAPTION = re.compile(r"(?<!\w)(?:Figure|Fig\.?|图)\s*(?:[A-Z]\s*[.\-]?\s*)?\d+(?:[.\-]\d+)*(?!\w)", re.I)


def validate_figures(blocks, labels, figures, page_count):
    if not isinstance(figures, list) or any(not isinstance(f, dict) for f in figures):
        raise LayoutFailure("invalid_structure", blocks)
    by_id = {b["id"]: b for b in blocks}
    for figure in figures:
        caption_id, number, bbox = figure.get("caption_id"), figure.get("page"), figure.get("bbox")
        caption = by_id.get(caption_id) if type(caption_id) is int else None
        if not caption or type(number) is not int or not 1 <= number <= page_count or number != caption["page"] or labels[caption_id]["type"] != "caption":
            raise LayoutFailure("figure_source", blocks, caption_id)
        if not FIGURE_CAPTION.search(caption["text"]):
            raise LayoutFailure("figure_caption", blocks, caption_id)
        if not isinstance(bbox, list) or len(bbox) != 4 or not all(type(x) in (int, float) and math.isfinite(x) and 0 <= x <= 1 for x in bbox) or bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
            raise LayoutFailure("figure_bbox", blocks, caption_id)
    return figures


def parse_response(content, finish_reason, blocks, page_count):
    if finish_reason == "length":
        raise LayoutFailure("output_truncated", blocks)
    try:
        data = json.loads(content or "{}")
    except (json.JSONDecodeError, TypeError):
        raise LayoutFailure("invalid_json", blocks) from None
    labels = validate(blocks, data)
    figures = validate_figures(blocks, labels, data.get("figures", []), page_count)
    return labels, figures

def parse_blocks(raw):
    parts = re.split(r"<!--\s*page\s+(\d+)\s*-->", raw)
    blocks = []
    chunks = [(1, parts[0])] if parts[0].strip() else []
    chunks += [(int(parts[i]), parts[i + 1]) for i in range(1, len(parts), 2)]
    for page, text in chunks:
        for paragraph in re.split(r"\n\s*\n", text.strip()):
            if paragraph.strip():
                blocks.append({"id": len(blocks), "page": page, "text": paragraph.strip()})
    return blocks

def validate(blocks, data):
    if not isinstance(data, dict):
        raise LayoutFailure("invalid_structure", blocks)
    labels = data.get("blocks", [])
    if not isinstance(labels, list) or any(not isinstance(x, dict) or type(x.get("id")) is not int for x in labels):
        raise LayoutFailure("invalid_structure", blocks)
    if len(labels) != len(blocks) or {x["id"] for x in labels} != {x["id"] for x in blocks}:
        raise LayoutFailure("block_coverage", blocks)
    for item in labels:
        if not isinstance(item.get("type"), str) or item["type"] not in KINDS or not isinstance(item.get("join_previous", False), bool):
            raise LayoutFailure("invalid_classification", blocks, item["id"])
        if item["type"] == "heading" and (type(item.get("level", 2)) is not int or item.get("level", 2) not in range(1, 7)):
            raise LayoutFailure("invalid_heading", blocks, item["id"])
    return {x["id"]: x for x in labels}

def render_blocks(blocks, labels, figures):
    output = []
    last_body = None
    for block in blocks:
        label = labels[block["id"]]; kind = label["type"]; text = block["text"]
        # OCR 的图片地址不是资产；仅由经 PDF 裁切验证的图片替换。
        if re.fullmatch(r'!\[[^\]]*\]\(page-\d+-figure-\d+\)', text):
            if any(b['page'] == block['page'] and b['id'] in figures for b in blocks): continue
            text = '[配图尚不可用：' + text + ']'
            kind = 'note'
        source = f'<!-- page {block["page"]} -->'
        if kind == "body" and label.get("join_previous") and last_body is not None:
            output[last_body]["text"] += " " + text
            output[last_body]["pages"].append(block["page"])
            continue
        if kind == "heading":
            text = "#" * label.get("level", 2) + " " + re.sub(r'^#{1,6}\s*', '', text)
        elif kind in {"caption", "metadata", "note"}:
            image = figures.get(block["id"])
            text = (f'![论文配图]({image})\n\n' if image else '') + f':::{kind}\n{text}\n:::'
        output.append({"pages": [block["page"]], "text": text})
        if kind == "body": last_body = len(output) - 1
        elif kind == "heading": last_body = None
    return "\n\n".join("\n".join(f"<!-- page {page} -->" for page in dict.fromkeys(item["pages"])) + "\n\n" + item["text"] for item in output) + "\n"

PROMPT = '''你只分类学术论文原稿区块，不改写正文，不恢复或猜补公式。返回 JSON 对象：
{"blocks":[{"id":整数,"type":"body|heading|caption|note|metadata","level":1至6,"join_previous":false}],"figures":[{"caption_id":整数,"page":整数,"bbox":[左,上,右,下]}]}
每个输入 id 必须且只能出现一次。原文顺序不可改变。只有跨页/脚注打断的同一正文段才 join_previous=true。
识别作者机构版权为 metadata，图注为 caption，脚注说明为 note，原文引用保留 body。
页面图像用于核对图注和定位真实图区；bbox 是图像宽高的0至1比例，不包含图注。仅为明确的 Figure/Fig 图注返回图区；不要把表格、公式、空白页或文字段裁成图。没有图则 figures=[]。'''

def organize(src: Path, raw_path: Path, out: Path, env: dict, max_pages=None):
    import pymupdf
    from openai import OpenAI
    from extract_markdown import DEFAULT_MODEL, DEFAULT_BASE_URL, quality_of, write_progress
    key = env.get("GLM_API_KEY", "").strip()
    if not key: raise LayoutFailure("missing_key")
    model = env.get("GLM_MODEL", DEFAULT_MODEL); endpoint = env.get("GLM_BASE_URL", DEFAULT_BASE_URL)
    client = OpenAI(api_key=key, base_url=endpoint, timeout=120, max_retries=0)
    blocks = parse_blocks(raw_path.read_text(encoding="utf-8"))
    if max_pages: blocks = [b for b in blocks if b["page"] <= max_pages]
    if not blocks: raise LayoutFailure("empty_source")
    pdf = pymupdf.open(src) if src.suffix.lower() == '.pdf' else None
    labels = {}; images = {}; assets = []; started = time.monotonic()
    usage = {"promptTokens": 0, "completionTokens": 0}
    page_ids = sorted({b['page'] for b in blocks})
    write_progress(out, 0, len(page_ids))
    asset_dir = out.with_suffix('.assets')
    try:
        for start in range(0, len(page_ids), 3):
            pages = page_ids[start:start + 3]
            batch = [b for b in blocks if b['page'] in pages]
            context = [b for b in blocks if b['page'] == pages[0] - 1][-2:]
            content = [{"type":"text", "text": PROMPT + '\n仅供衔接参考（无需分类）：' + json.dumps(context, ensure_ascii=False) + '\n需分类区块：' + json.dumps(batch, ensure_ascii=False)}]
            if pdf:
                for number in pages:
                    if not 1 <= number <= len(pdf): raise LayoutFailure("source_page", batch)
                    png = pdf[number-1].get_pixmap(dpi=120).tobytes('png')
                    content += [{"type":"text","text":f'PDF 第 {number} 页'}, {"type":"image_url","image_url":{"url":"data:image/png;base64,"+base64.b64encode(png).decode()}}]
            response = client.chat.completions.create(model=model, max_tokens=8192, response_format={"type":"json_object"}, extra_body={"thinking":{"type":"enabled"}, "reasoning_effort":"low"}, messages=[{"role":"user", "content":content}])
            if not response.choices: raise LayoutFailure("invalid_structure", batch)
            batch_labels, figures = parse_response(response.choices[0].message.content, response.choices[0].finish_reason, batch, len(pdf) if pdf is not None else 0)
            labels.update(batch_labels)
            if response.usage:
                usage['promptTokens'] += response.usage.prompt_tokens or 0
                usage['completionTokens'] += response.usage.completion_tokens or 0
            for index, figure in enumerate(figures):
                caption_id = figure['caption_id']; number = figure['page']; bbox = figure['bbox']
                page = pdf[number-1]; r = page.rect
                clip = pymupdf.Rect(bbox[0]*r.width, bbox[1]*r.height, bbox[2]*r.width, bbox[3]*r.height)
                # 模型给出粗边界，PDF 原有文字框补全靠近边缘的竖排标签。
                for block in page.get_text("blocks"):
                    rect = pymupdf.Rect(block[:4]); center = (rect.tl + rect.br) / 2
                    if clip.contains(center): clip |= rect
                clip = pymupdf.Rect(clip.x0-6, clip.y0-6, clip.x1+6, clip.y1+6) & r
                asset_dir.mkdir(parents=True, exist_ok=True)
                path = asset_dir / f'page-{number}-figure-{index+1}.png'
                page.get_pixmap(dpi=160, clip=clip).save(path)
                relative = f'{asset_dir.name}/{path.name}'
                images[caption_id] = quote(relative, safe="/")
                assets.append({"path":relative,"page":number,"captionBlock":caption_id,"bbox":[clip.x0/r.width,clip.y0/r.height,clip.x1/r.width,clip.y1/r.height]})
            write_progress(out, start + len(pages), len(page_ids))
    finally:
        if pdf is not None: pdf.close()
    markdown = render_blocks(blocks, labels, images)
    usage.update(seconds=round(time.monotonic()-started,3), estimatedCost=None, currency='unknown')
    if model == DEFAULT_MODEL and endpoint.rstrip('/') == DEFAULT_BASE_URL:
        usage.update(estimatedCost=round((usage['promptTokens']*.8+usage['completionTokens']*2.8)/1e6,8),currency='CNY')
    raw_meta = raw_path.with_suffix('.meta.json')
    suggested = json.loads(raw_meta.read_text()).get('suggested', {}) if raw_meta.is_file() else {}
    return markdown, {"engine":"layout", "engine_version": model + '-structure-v1', "quality":{**quality_of([markdown]), "pages":len(page_ids), "charsPerPage":round(len(markdown)/len(page_ids),1)}, "suggested":suggested, "usage":usage,"assets":assets,"source":raw_path.name,"blocks":len(blocks),"structure":[labels[b["id"]] for b in blocks]}
