/**
 * 展开 / 收起容器（v1.1 · UI-15，v1.2 起由里程碑与议程子项共用）。
 *
 * 为什么不用 `grid-template-rows: 0fr → 1fr`：本项目最低支持 macOS 11（Safari 14），
 * 该属性动画在那一代 WebKit 上不被支持，会静默失效。
 * 为什么不用 `transform: scaleY`：DESIGN §5.11 —— 非 `none` 的 transform 会成为
 * `position: fixed` 后代的包含块，本项目为此踩过坑（浮层被推到屏幕外）。
 */
import { useLayoutEffect, useRef, useState } from "react";

export default function Collapse({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState(open);
  const [height, setHeight] = useState<number | "auto">(open ? "auto" : 0);

  useLayoutEffect(() => {
    if (open) {
      setRendered(true);
      setHeight(0);
      const raf = window.requestAnimationFrame(() => {
        setHeight(inner.current?.scrollHeight ?? 0);
      });
      // 过渡结束后交回 auto：之后增删条目时高度自动跟随，不会被裁
      const done = window.setTimeout(() => setHeight("auto"), 260);
      return () => {
        window.cancelAnimationFrame(raf);
        window.clearTimeout(done);
      };
    }
    // 收起：先把当前高度固定住，下一帧再置 0（height:auto 无法被过渡）
    const from = inner.current?.scrollHeight ?? 0;
    // 量不出高度（无布局引擎的环境 / 内容本为空）时不必等动画结束，直接卸载
    if (from === 0) {
      setHeight(0);
      setRendered(false);
      return;
    }
    setHeight(from);
    const raf = window.requestAnimationFrame(() => setHeight(0));
    const done = window.setTimeout(() => setRendered(false), 260);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [open]);

  return (
    <div
      className={`ms-collapse ${open ? "is-open" : ""}`}
      style={{ height: height === "auto" ? "auto" : height }}
      aria-hidden={!open}
    >
      <div className="ms-collapse-inner" ref={inner}>
        {rendered ? children : null}
      </div>
    </div>
  );
}
