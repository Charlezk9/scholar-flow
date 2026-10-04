import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

/** 不接受原始 HTML；公式由 KaTeX 在本地渲染，不加载外部资源。 */
export default function MarkdownReader({ text }: { text: string }) {
  return <article className="lit-md"><ReactMarkdown skipHtml remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[[rehypeKatex, { trust: false, strict: "ignore" }]]} components={{img: ({alt}) => <span className="lit-figure">[图：{alt || "图示"}]</span>, a: ({children, href}) => <span title={href}>{children}</span>}}>{text}</ReactMarkdown></article>;
}
