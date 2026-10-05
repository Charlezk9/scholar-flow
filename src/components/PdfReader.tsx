import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask, TextLayer as PDFTextLayer } from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";

function Page({doc, number, width, zoom, root, ratio}: {doc: PDFDocumentProxy; number: number; width: number; zoom: number; root: HTMLDivElement | null; ratio: number}) {
  const host = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), layer = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(number === 1), [error, setError] = useState(false);
  useEffect(() => {
    if (!host.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {root, rootMargin: "100% 0px"});
    observer.observe(host.current); return () => observer.disconnect();
  }, [root]);
  useEffect(() => {
    let cancelled = false; let render: RenderTask | undefined; let text: PDFTextLayer | undefined;
    const element = canvas.current, textElement = layer.current;
    if (!visible) { if (element) { element.width = 0; element.height = 0; } textElement?.replaceChildren(); return; }
    setError(false);
    void (async () => {
      const page = await doc.getPage(number); const pdf = await import("pdfjs-dist");
      if (cancelled || !element || !textElement) return;
      const viewport = page.getViewport({scale: width * zoom / page.getViewport({scale: 1}).width});
      const context = element.getContext("2d"); if (!context) throw new Error("canvas unavailable");
      const dpr = window.devicePixelRatio || 1;
      element.width = Math.ceil(viewport.width * dpr); element.height = Math.ceil(viewport.height * dpr);
      element.style.width = `${viewport.width}px`; element.style.height = `${viewport.height}px`;
      render = page.render({canvas: element, canvasContext: context, viewport, transform: [dpr, 0, 0, dpr, 0, 0]});
      await render.promise; if (cancelled) return;
      textElement.replaceChildren();
      textElement.style.setProperty("--scale-factor", String(viewport.scale));
      textElement.style.setProperty("--total-scale-factor", String(viewport.scale));
      // streamTextContent 的 getReader 泵兼容 WKWebView。
      text = new pdf.TextLayer({textContentSource: page.streamTextContent(), container: textElement, viewport});
      await text.render();
    })().catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; render?.cancel(); text?.cancel(); };
  }, [doc, number, width, zoom, visible]);
  return <div ref={host} className="lit-pdf-sheet" data-page={number} style={{width: width * zoom, height: width * zoom * ratio}}><canvas ref={canvas} aria-label={`第 ${number} 页`} /><div ref={layer} className="textLayer" />{error && <p role="alert">第 {number} 页渲染失败</p>}</div>;
}

export default function PdfReader({ bytes, toolbar }: { bytes: Uint8Array; toolbar?: HTMLElement | null }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null), [page, setPage] = useState(1), [zoom, setZoom] = useState(1), [width, setWidth] = useState(600), [error, setError] = useState("");
  const [ratios, setRatios] = useState<number[]>([]);
  const dimensions = useRef({width: 600, zoom: 1});
  const host = useRef<HTMLDivElement>(null); const [scroll, setScroll] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    let cancelled = false; let task: ReturnType<typeof import("pdfjs-dist").getDocument> | undefined;
    setDoc(null); setRatios([]); setPage(1); setError("");
    void (async () => {
      const pdf = await import("pdfjs-dist");
      pdf.GlobalWorkerOptions.workerSrc = new URL("../../node_modules/pdfjs-dist/build/pdf.worker.mjs", import.meta.url).href;
      if (cancelled) return;
      task = pdf.getDocument({data: bytes.slice()}); const next = await task.promise;
      const sizes = [];
      for (let number = 1; number <= next.numPages; number++) {
        if (cancelled) return;
        const current = await next.getPage(number); const viewport = current.getViewport({scale: 1});
        sizes.push(viewport.height / viewport.width);
      }
      if (!cancelled) { setRatios(sizes); setDoc(next); }
    })().catch(() => { if (!cancelled) setError("PDF.js 无法读取此附件，请检查原始 PDF。"); });
    return () => { cancelled = true; void task?.destroy(); };
  }, [bytes]);
  useEffect(() => {
    if (!host.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(100, entry.contentRect.width - 32)));
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const previous = dimensions.current;
    if (scroll) scroll.scrollTop *= (width * zoom) / (previous.width * previous.zoom);
    dimensions.current = {width, zoom};
  }, [width, zoom, scroll]);
  const changeZoom = (next: number) => setZoom(next);
  return <section className="lit-reader" ref={host} aria-label="PDF 阅读器">
    {toolbar ? createPortal(<div className="lit-reader-tools"><span>{page} / {doc?.numPages ?? "…"}</span><button className="btn btn-outline btn-sm" aria-label="缩小" disabled={zoom <= .5} onClick={() => changeZoom(Math.max(.5, Math.round((zoom - .1) * 10) / 10))}>−</button><span>{Math.round(zoom * 100)}%</span><button className="btn btn-outline btn-sm" aria-label="放大" disabled={zoom >= 2} onClick={() => changeZoom(Math.min(2, Math.round((zoom + .1) * 10) / 10))}>＋</button></div>, toolbar) : <div className="lit-reader-tools"><span>{page} / {doc?.numPages ?? "…"}</span><button className="btn btn-outline btn-sm" aria-label="缩小" disabled={zoom <= .5} onClick={() => changeZoom(Math.max(.5, Math.round((zoom - .1) * 10) / 10))}>−</button><span>{Math.round(zoom * 100)}%</span><button className="btn btn-outline btn-sm" aria-label="放大" disabled={zoom >= 2} onClick={() => changeZoom(Math.min(2, Math.round((zoom + .1) * 10) / 10))}>＋</button></div>}
    {error && <p role="alert">{error}</p>}
    {!doc && !error && <p role="status">正在读取 PDF…</p>}
    <div className="lit-pdf-scroll" ref={setScroll} onScroll={() => {
      if (!scroll) return;
      const boundary = scroll.getBoundingClientRect().top + scroll.clientHeight * .3;
      const sheets = [...scroll.querySelectorAll<HTMLElement>("[data-page]")];
      const current = sheets.find(element => element.getBoundingClientRect().bottom > boundary);
      if (current) setPage(Number(current.dataset.page));
    }}>{doc && Array.from({length: doc.numPages}, (_, index) => <Page key={index} doc={doc} number={index + 1} width={width} zoom={zoom} root={scroll} ratio={ratios[index]} />)}</div>
  </section>;
}
