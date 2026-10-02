/**
 * 日期 / 时间选择器（自绘，纸张风格）。
 *
 * 时间选择器使用**双滚轮**（时 / 分），参考系统闹钟的交互：
 * 拖拽或滚动停止后自动吸附到最近一格，中间有高亮带，上下渐隐。
 *
 * 为什么不用透明的原生 `<input type="date|time">` 覆盖层：
 * 在 WKWebView 里点击后没有任何视觉反馈，用户会认为「点不动」。
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Clock, X } from "lucide-react";
import {
  addMonths,
  formatCardDate,
  fromISO,
  monthMatrix,
  toISO,
  today,
  WEEKDAY_CN,
} from "../lib/date";
import { fs, wheelHeight, fontScaleOf } from "../lib/fontScale";
import { useStore } from "../store/useStore";
import Portal from "./Portal";

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

/* ============================================================ 全局互斥 */

let closeCurrent: (() => void) | null = null;

function usePopover() {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const close = useCallback(() => {
    setAnchor(null);
    if (closeCurrent === close) closeCurrent = null;
  }, []);

  const toggle = useCallback(() => {
    if (anchor) {
      close();
      return;
    }
    closeCurrent?.();
    closeCurrent = close;
    setAnchor(btnRef.current!.getBoundingClientRect());
  }, [anchor, close]);

  useEffect(
    () => () => {
      if (closeCurrent === close) closeCurrent = null;
    },
    [close],
  );

  return { btnRef, anchor, close, toggle };
}

/* ============================================================ 浮层定位 */

function Pop({
  anchor,
  width,
  onClose,
  children,
}: {
  anchor: DOMRect;
  width: number;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = anchor.left;
    if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10;
    if (left < 10) left = 10;
    let top = anchor.bottom + 6;
    if (top + r.height > window.innerHeight - 10) {
      top = Math.max(10, anchor.top - r.height - 6);
    }
    setPos({ left, top });
  }, [anchor, width]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t)) return;
      if (t.closest("[data-picker-trigger]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    // 页面滚动 → 关闭浮层。
    // 注意：必须排除浮层内部自己的滚动（滚轮滚动时也会触发 window 的捕获监听），
    // 否则「滚一下分钟」就会把整个浮层关掉。
    const onScroll = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      onClose();
    };

    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  return (
    <Portal>
      <div
        ref={ref}
        className="pop"
        style={{
          width,
          left: pos?.left ?? 0,
          top: pos?.top ?? 0,
          visibility: pos ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </Portal>
  );
}

/* ============================================================ 滚轮 */

const VISIBLE = 5;

/**
 * 单列滚轮。
 * - 拖拽 / 滚轮 / 点击 三种方式都能改值
 * - 停止后自动吸附到最近一格
 * - 中间高亮带 + 上下渐隐 + 距离中心越远越淡
 */
function Wheel({
  items,
  value,
  onChange,
  label,
  dataAttr,
}: {
  items: string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
  dataAttr: string;
}) {
  const fontSize = useStore((st) => st.settings.fontSize);
  // 格高随字号走，且与 CSS var(--wheel-h) 同源，避免吸附对不齐
  const ITEM_H = wheelHeight(fontSize);
  const ref = useRef<HTMLDivElement>(null);
  const height = ITEM_H * VISIBLE;
  const padPx = (height - ITEM_H) / 2;

  const [active, setActive] = useState(() => Math.max(0, items.indexOf(value)));
  const lastReported = useRef(value);
  /** 正在执行程序化滚动（点选 / 吸附 / 外部改值）时为 true */
  const suppress = useRef(false);
  /** 程序化滚动的目标位置；到达后立刻解除抑制，不必等超时 */
  const pending = useRef<number | null>(null);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const settle = useRef<number | undefined>(undefined);
  const unsuppress = useRef<number | undefined>(undefined);

  const clampIdx = (i: number) => Math.max(0, Math.min(items.length - 1, i));
  const idxOf = (v: string) => Math.max(0, items.indexOf(v));

  const scrollToIdx = useCallback((i: number, smooth: boolean) => {
    const el = ref.current;
    if (!el) return;
    const top = clampIdx(i) * ITEM_H;
    // 抑制期间的程序化滚动不该被当成用户滚动上报；
    // 到达目标位置就立刻解除，避免误伤紧随其后的真实滚动。
    suppress.current = true;
    pending.current = top;
    if (unsuppress.current) window.clearTimeout(unsuppress.current);
    unsuppress.current = window.setTimeout(() => {
      suppress.current = false;
      pending.current = null;
    }, 600);
    if (smooth) el.scrollTo({ top, behavior: "smooth" });
    else el.scrollTop = top;
  }, [ITEM_H]);

  const commit = useCallback(
    (i: number) => {
      const idx = clampIdx(i);
      const v = items[idx];
      if (v === undefined) return;
      setActive(idx);
      if (v === lastReported.current) return;
      lastReported.current = v;
      onChange(v);
    },
    [items, onChange],
  );

  const snap = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const i = clampIdx(Math.round(el.scrollTop / ITEM_H));
    scrollToIdx(i, true);
    commit(i);
  }, [commit, scrollToIdx]);

  // 首次挂载定位
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const i = idxOf(lastReported.current);
    el.scrollTop = i * ITEM_H;
    setActive(i);
    // 字号变化时格高会变，需要重新定位到同一个值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ITEM_H]);

  // 外部改值（「现在」「设为全天」）→ 平滑滚过去
  useEffect(() => {
    if (value === lastReported.current) return;
    lastReported.current = value;
    const i = idxOf(value);
    setActive(i);
    scrollToIdx(i, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, scrollToIdx]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = clampIdx(Math.round(el.scrollTop / ITEM_H));
    setActive(i);

    // 程序化滚动到位 → 立刻解除抑制
    if (pending.current !== null && Math.abs(el.scrollTop - pending.current) < 2) {
      suppress.current = false;
      pending.current = null;
      if (unsuppress.current) window.clearTimeout(unsuppress.current);
    }

    if (suppress.current || drag.current) return;
    commit(i); // 立即上报（commit 内部按 lastReported 去重）
    if (settle.current) window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => snap(), 150);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    drag.current = { y: e.clientY, top: el.scrollTop, moved: false };
    suppress.current = true;

    const move = (ev: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dy = ev.clientY - d.y;
      if (Math.abs(dy) > 3) d.moved = true;
      el.scrollTop = d.top - dy;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (!d.moved) {
        suppress.current = false; // 交给 click 处理
        return;
      }
      snap();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pick = (i: number) => {
    scrollToIdx(i, true);
    commit(i);
  };

  return (
    <div className="wheel-wrap" style={{ height }}>
      <div className="wheel-band" style={{ top: padPx, height: ITEM_H }} />
      <div
        ref={ref}
        className="wheel"
        data-wheel={dataAttr}
        style={{ height }}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        role="listbox"
        aria-label={label}
      >
        <div style={{ height: padPx }} />
        {items.map((t, i) => {
          const dist = Math.abs(i - active);
          return (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={dist === 0}
              className={`wheel-item ${dist === 0 ? "is-on" : ""}`}
              style={{
                height: ITEM_H,
                opacity: dist === 0 ? 1 : dist === 1 ? 0.5 : dist === 2 ? 0.24 : 0.1,
              }}
              onClick={() => pick(i)}
            >
              {t}
            </button>
          );
        })}
        <div style={{ height: padPx }} />
      </div>
    </div>
  );
}

/* ============================================================ 日期选择器 */

export function DatePicker({
  value,
  onChange,
  placeholder = "选择日期",
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: (iso: string) => string;
}) {
  const weekStart = useStore((s) => s.settings.weekStart);
  const fontStep = fontScaleOf(useStore((s) => s.settings.fontSize)) - 1;
  const { btnRef, anchor, close, toggle } = usePopover();
  const [cursor, setCursor] = useState(() => fromISO(value || toISO(today())));

  const todayIso = toISO(today());
  const days = useMemo(() => monthMatrix(cursor, weekStart), [cursor, weekStart]);
  const month = cursor.getMonth();
  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) => WEEKDAY_CN[(weekStart + i) % 7]),
    [weekStart],
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-picker-trigger
        className={`picker ${value ? "" : "is-empty"}`}
        onClick={() => {
          setCursor(fromISO(value || toISO(today())));
          toggle();
        }}
      >
        <Calendar size={15} />
        <span>{value ? (label ? label(value) : formatCardDate(value)) : placeholder}</span>
        <ChevronDown size={15} className="chev" />
      </button>

      {anchor ? (
        <Pop anchor={anchor} width={Math.round(286 + fontStep * 46)} onClose={close}>
          <div className="pop-head">
            <button
              className="icon-btn"
              title="上个月"
              onClick={() =>
                setCursor((c) => addMonths(new Date(c.getFullYear(), c.getMonth(), 1, 12), -1))
              }
            >
              <ChevronLeft size={15} />
            </button>
            <span className="pop-title">
              {cursor.getFullYear()} 年 {cursor.getMonth() + 1} 月
            </span>
            <button
              className="icon-btn"
              title="下个月"
              onClick={() =>
                setCursor((c) => addMonths(new Date(c.getFullYear(), c.getMonth(), 1, 12), 1))
              }
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="pop-grid pop-week">
            {weekdayLabels.map((w, i) => (
              <span key={w + i}>{w}</span>
            ))}
          </div>

          <div className="pop-grid pop-days">
            {days.map((d) => {
              const iso = toISO(d);
              const out = d.getMonth() !== month;
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    "pop-day",
                    out ? "is-out" : "",
                    iso === todayIso ? "is-today" : "",
                    iso === value ? "is-on" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    onChange(iso);
                    close();
                  }}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          <div className="pop-foot">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => {
                const t = toISO(today());
                setCursor(fromISO(t));
                onChange(t);
                close();
              }}
            >
              今天
            </button>
            <span style={{ marginLeft: "auto", fontSize: fs(11.5), color: "var(--ink-3)" }}>
              {value ? formatCardDate(value) : "未选择"}
            </span>
          </div>
        </Pop>
      ) : null}
    </>
  );
}

/* ============================================================ 时间选择器（双滚轮） */

function nowHm(): { h: string; m: string } {
  const n = new Date();
  return { h: pad(n.getHours()), m: pad(n.getMinutes()) };
}

export function TimePicker({
  value,
  onChange,
  placeholder = "全天（倒计时到当天结束）",
  allowClear = true,
  prefix = "目标时间",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  /** 已选值前面的说明词；传空串则只显示时间本身 */
  prefix?: string;
}) {
  const { btnRef, anchor, close, toggle } = usePopover();
  const fontStep = fontScaleOf(useStore((st) => st.settings.fontSize)) - 1;

  // 没设时间时滚轮停在「现在」，但值仍然是空（全天），滚动后才真正落值
  const [h, m] = value ? value.split(":") : [];
  const fallback = useMemo(nowHm, [anchor]);
  const curH = h ?? fallback.h;
  const curM = m ?? fallback.m;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-picker-trigger
        className={`picker ${value ? "" : "is-empty"}`}
        onClick={toggle}
      >
        <Clock size={15} />
        <span>{value ? (prefix ? `${prefix} ${value}` : value) : placeholder}</span>
        <ChevronDown size={15} className="chev" />
      </button>

      {anchor ? (
        <Pop anchor={anchor} width={Math.round(232 + fontStep * 44)} onClose={close}>
          <div className="time-readout">
            <Clock size={14} />
            <span className="t">{value || "全天"}</span>
            <span className="s">
              {value ? "拖动或滚动选择" : "滚动后即为精确时间"}
            </span>
            {value && allowClear ? (
              <button
                type="button"
                className="icon-btn"
                title="改回全天"
                onClick={() => {
                  onChange("");
                  close();
                }}
              >
                <X size={13} />
              </button>
            ) : null}
          </div>

          <div className="wheels">
            <div className="wheel-col">
              <Wheel
                dataAttr="hour"
                label="时"
                items={HOURS}
                value={curH}
                onChange={(v) => onChange(`${v}:${curM}`)}
              />
              <div className="wheel-cap">时</div>
            </div>
            <span className="wheel-colon">:</span>
            <div className="wheel-col">
              <Wheel
                dataAttr="minute"
                label="分"
                items={MINUTES}
                value={curM}
                onChange={(v) => onChange(`${curH}:${v}`)}
              />
              <div className="wheel-cap">分</div>
            </div>
          </div>

          <div className="pop-foot">
            {allowClear ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  onChange("");
                  close();
                }}
              >
                设为全天
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ marginLeft: "auto" }}
              onClick={() => {
                const n = nowHm();
                onChange(`${n.h}:${n.m}`);
                close();
              }}
            >
              现在
            </button>
          </div>
        </Pop>
      ) : null}
    </>
  );
}
