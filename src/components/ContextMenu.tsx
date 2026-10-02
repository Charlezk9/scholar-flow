import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import Portal from "./Portal";

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  /** 隐藏（不渲染）——用于「某些条件下不适用」的项 */
  hidden?: boolean;
  /**
   * 当前状态就是这个（v1.1 · UI-24）。
   * 用颜色把「已置顶 / 已戴皇冠」这类状态写在菜单项上 ——
   * 卡片右上角的常驻按钮收进菜单后，状态得有个地方看得到。
   */
  active?: boolean;
  onSelect: () => void;
}

export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.min(x, window.innerWidth - r.width - 8);
    const ny = Math.min(y, window.innerHeight - r.height - 8);
    setPos({ x: Math.max(8, nx), y: Math.max(8, ny) });
  }, [x, y, items.length]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <Portal>
      <div
        ref={ref}
        className="menu"
        style={{ left: pos.x, top: pos.y }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {items
          .filter((it) => !it.hidden)
          .map((it, i) => (
            <div key={it.key}>
              {i > 0 && it.danger ? <div className="sep" /> : null}
              <button
                className={[it.danger ? "danger" : "", it.active ? "is-active" : ""]
                  .filter(Boolean)
                  .join(" ")}
                aria-pressed={it.active === undefined ? undefined : it.active}
                onClick={() => {
                  it.onSelect();
                  onClose();
                }}
              >
                {it.icon}
                {it.label}
              </button>
            </div>
          ))}
      </div>
    </Portal>
  );
}
