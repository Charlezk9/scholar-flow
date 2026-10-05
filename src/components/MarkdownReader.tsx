import { useEffect, useState, type CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { lit } from "../lib/literature";
import "katex/dist/katex.min.css";

/** 仅加载登记产物旁的图片；外部 URL 和路径穿越均不发请求。 */
function LocalFigure({src, alt, extractId}: {src?: string; alt?: string; extractId?: string}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let cancelled = false; let resource: string | undefined;
    setUrl(undefined);
    let asset = "";
    try { asset = decodeURIComponent(src || ""); } catch { /* 畸形引用保持缺失提示 */ }
    if (extractId && /^[^/\\]+\.assets\/[^/\\]+\.png$/.test(asset)) {
      void lit.readAsset(extractId, asset).then(bytes => {
        if (cancelled) return;
        resource = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: "image/png"}));
        setUrl(resource);
      }).catch(() => {});
    }
    return () => { cancelled = true; if (resource) URL.revokeObjectURL(resource); };
  }, [src, extractId]);
  return url ? <img src={url} alt={alt || "论文配图"} /> : <span className="lit-figure">[图：{alt || "图示"}，暂不可用]</span>;
}

export function normalizeMath(text: string) {
  // OCR 常给出单行 $$...$$；remark-math 需要独立行才能识别显示公式。
  return text.replace(/^[ \t]*\$\$([^\n]+?)\$\$[ \t]*$/gm, (_match, formula: string) => `$$\n${formula}\n$$`);
}

// Vite 的 CommonJS 默认导出互操作会让 style-to-js 静默丢掉样式。
// 这里只转换 KaTeX 已生成的布局属性；不启用原始 HTML。
type MathNode = { children?: MathNode[]; properties?: Record<string, unknown> };
function mathStyles() {
  return (tree: MathNode) => {
    const visit = (node: MathNode) => {
      if (typeof node.properties?.style === "string") {
        node.properties.style = Object.fromEntries(node.properties.style.split(";").filter(Boolean).map(declaration => {
          const colon = declaration.indexOf(":");
          const key = declaration.slice(0, colon).trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
          return [key, declaration.slice(colon + 1).trim()];
        }));
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}

export default function MarkdownReader({ text, fontSize = 16, extractId }: { text: string; fontSize?: number; extractId?: string }) {
  const render = (content: string) => <ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore" }], mathStyles]} components={{img: ({src, alt}) => <LocalFigure src={src} alt={alt} extractId={extractId} />, a: ({children, href}) => <span title={href}>{children}</span>}}>{normalizeMath(content)}</ReactMarkdown>;
  const blocks = text.split(/(^:::(?:caption|metadata|note)\s*\n[\s\S]*?\n:::\s*$)/m);
  return <article className="lit-md" style={{"--reader-font-size": `${fontSize}px`} as CSSProperties}>{blocks.map((block, index) => {
    const match = /^:::(caption|metadata|note)\s*\n([\s\S]*?)\n:::\s*$/.exec(block);
    return match ? <aside key={index} className={`lit-semantic lit-${match[1]}`}>{render(match[2])}</aside> : <div key={index}>{render(block)}</div>;
  })}</article>;
}
