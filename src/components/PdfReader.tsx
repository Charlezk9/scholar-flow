import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask, TextLayer as PDFTextLayer } from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";

export default function PdfReader({ bytes }: { bytes: Uint8Array }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(600);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    setError(""); setDoc(null); setPage(1); setLoading(true);
    void (async () => {
      const pdf = await import("pdfjs-dist");
      pdf.GlobalWorkerOptions.workerSrc = new URL("../../node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
      if (cancelled) return;
      task = pdf.getDocument({ data: bytes.slice() });
      const next = await task.promise;
      if (!cancelled) setDoc(next);
    })().catch(() => { if (!cancelled) { setError("PDF.js 无法读取此附件，可尝试系统预览。"); setLoading(false); } });
    return () => { cancelled = true; void task?.destroy(); };
  }, [bytes]);

  useEffect(() => {
    if (!host.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(100, entry.contentRect.width - 24)));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    let text: PDFTextLayer | undefined;
    setLoading(true); setError("");
    void (async () => {
      const current = await doc.getPage(page);
      const pdf = await import("pdfjs-dist");
      if (cancelled || !canvas.current || !layer.current) return;
      const viewport = current.getViewport({ scale: width / current.getViewport({ scale: 1 }).width * zoom });
      const element = canvas.current;
      const context = element.getContext("2d");
      if (!context) throw new Error("canvas unavailable");
      const ratio = window.devicePixelRatio || 1;
      element.width = Math.ceil(viewport.width * ratio); element.height = Math.ceil(viewport.height * ratio);
      element.style.width = `${viewport.width}px`; element.style.height = `${viewport.height}px`;
      render = current.render({ canvas: element, canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] });
      await render.promise;
      // WKWebView 尚无 ReadableStream 异步迭代；TextLayer 自己使用 getReader 泵。
      const content = current.streamTextContent();
      if (cancelled) return;
      layer.current.replaceChildren();
      layer.current.style.setProperty("--scale-factor", String(viewport.scale));
      layer.current.style.setProperty("--total-scale-factor", String(viewport.scale));
      text = new pdf.TextLayer({ textContentSource: content, container: layer.current, viewport });
      await text.render();
      if (!cancelled) setLoading(false);
    })().catch(() => { if (!cancelled) { setError("本页渲染失败，可尝试系统预览。"); setLoading(false); } });
    return () => { cancelled = true; render?.cancel(); text?.cancel(); };
  }, [doc, page, zoom, width]);

  useEffect(() => () => { if (fallback) URL.revokeObjectURL(fallback); }, [fallback]);
  return <section className="lit-reader" ref={host} aria-label="PDF 阅读器">
    <div className="lit-reader-tools">
      <button className="btn btn-outline btn-sm" disabled={!doc || page === 1} onClick={() => setPage(page - 1)}>上一页</button>
      <span>{page} / {doc?.numPages ?? "…"}</span>
      <button className="btn btn-outline btn-sm" disabled={!doc || page === doc.numPages} onClick={() => setPage(page + 1)}>下一页</button>
      <button className="btn btn-outline btn-sm" aria-label="缩小" disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .25))}>−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button className="btn btn-outline btn-sm" aria-label="放大" disabled={zoom >= 2} onClick={() => setZoom(Math.min(2, zoom + .25))}>＋</button>
    </div>
    {loading && <p role="status">正在渲染…</p>}
    {error && <p role="alert">{error} <button className="btn btn-outline btn-sm" onClick={() => setFallback(URL.createObjectURL(new Blob([bytes.slice()], {type: "application/pdf"})))}>系统预览</button></p>}
    {fallback ? <iframe className="lit-pdf" src={fallback} title="系统 PDF 预览" /> : <div className="lit-pdf-scroll"><div className="lit-pdf-sheet"><canvas ref={canvas} aria-label={`第 ${page} 页`} /><div ref={layer} className="textLayer" /></div></div>}
  </section>;
}
