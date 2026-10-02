/**
 * 视口宽度响应式（v1.1 · UI-22）。
 *
 * 为什么不用 CSS 容器查询（`@container`）：那是 Safari 16 / macOS 13 起才支持的，
 * 而本项目最低支持 macOS 11（`tauri.conf.json: minimumSystemVersion: "11.0"`）——
 * 用了就是「在本机好看、在最低支持的系统上完全不生效」。
 * 媒体查询能做的事就交给媒体查询（字号降档），需要换内容（标题短格式）时才用这个 hook。
 */
import { useEffect, useState } from "react";

function evaluate(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(query).matches;
}

/** 视口宽度 ≤ maxWidth 时为 true */
export function useNarrow(maxWidth: number): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => evaluate(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = () => setNarrow(mql.matches);
    onChange();
    // 老 Safari 只有 addListener/removeListener（这里两种都照顾）
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener?.(onChange);
    return () => mql.removeListener?.(onChange);
  }, [query]);

  return narrow;
}
