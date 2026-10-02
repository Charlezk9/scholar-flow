import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarPlus, MapPin, Plus } from "lucide-react";
import { colorMeta, type CalEvent, type Countdown } from "../lib/api";
import { fromISO, toISO, today, WEEKDAY_CN } from "../lib/date";
import { collectDay } from "../domain/calendar";
import { dayInfo } from "../lib/lunar";
import { fs } from "../lib/fontScale";
import { useStore } from "../store/useStore";
import Portal from "./Portal";

export default function DayPopover({
  iso,
  anchor,
  onClose,
}: {
  iso: string;
  anchor: DOMRect;
  onClose: () => void;
}) {
  const countdowns = useStore((s) => s.countdowns);
  const events = useStore((s) => s.events);
  const openEventDraft = useStore((s) => s.openEventDraft);
  const openCountdownDraft = useStore((s) => s.openCountdownDraft);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.right + 8, top: anchor.top });

  const entries = collectDay(iso, countdowns, events);
  const info = dayInfo(iso);
  const d = fromISO(iso);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let left = anchor.right + 8;
    if (left + r.width > window.innerWidth - 10) left = anchor.left - r.width - 8;
    if (left < 8) left = Math.max(8, window.innerWidth - r.width - 10);
    let top = anchor.top;
    if (top + r.height > window.innerHeight - 10) {
      top = Math.max(8, window.innerHeight - r.height - 10);
    }
    setPos({ left, top });
  }, [anchor, entries.length]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (ref.current?.contains(t)) return;
      if (t.closest(".cell")) return;
      onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  return (
    <Portal>
      <div
        ref={ref}
        className="day-pop"
        style={{ left: pos.left, top: pos.top }}
        onClick={(e) => e.stopPropagation()}
      >
      <div className="ph">
        <span className="d">
          {d.getMonth() + 1} 月 {d.getDate()} 日
        </span>
        <span className="w">
          周{WEEKDAY_CN[d.getDay()]}
          {iso === toISO(today()) ? " · 今天" : ""}
        </span>
        <span style={{ marginLeft: "auto", fontSize: fs(11.5), color: "var(--ink-3)" }}>
          {info.lunarFull}
        </span>
      </div>

      {info.festival ? (
        <div
          style={{
            padding: "7px 12px",
            borderBottom: "1px solid var(--line)",
            fontSize: fs(12.5),
            fontWeight: 600,
            color: info.festivalKind === "lunar" ? "var(--cinnabar)" : "#2C5580",
          }}
        >
          {info.festival}
          {info.badge ? (
            <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--ink-3)" }}>
              {info.badge.name} · {info.badge.text}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="pl">
        {entries.length === 0 ? (
          <div
            style={{
              padding: "18px 8px",
              textAlign: "center",
              color: "var(--ink-3)",
              fontSize: fs(12.5),
            }}
          >
            这天还没有安排
          </div>
        ) : (
          entries.map((it) => {
            const meta = colorMeta(
              it.kind === "countdown" ? (it.color ?? "cinnabar") : it.color,
            );
            return (
              <button
                key={`${it.kind}-${it.id}`}
                className="pop-item"
                onClick={() => {
                  if (it.kind === "countdown") {
                    openCountdownDraft(it.raw as Countdown);
                  } else {
                    openEventDraft(it.raw as CalEvent);
                  }
                  onClose();
                }}
              >
                <span className="dot" style={{ background: meta.dot }} />
                <span className="nm">{it.title}</span>
                {it.range ? (
                  <span className="tm">
                    {it.range.start.slice(5)} – {it.range.end.slice(5)}
                  </span>
                ) : it.time ? (
                  <span className="tm">{it.time}</span>
                ) : null}
                {it.kind === "countdown" ? (
                  <span
                    className="badge badge-cd"
                    style={{ minWidth: 16, height: 16, fontSize: fs(9.5) }}
                  >
                    倒
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      <div className="pf" style={{ display: "flex", gap: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ flex: 1 }}
          onClick={() => {
            openEventDraft({
              startDate: iso,
              endDate: iso,
              allDay: true,
              color: "indigo",
            });
            onClose();
          }}
        >
          <Plus size={13} />
          新建事件
        </button>
        <button
          className="btn btn-outline btn-sm"
          title="新建倒计时（目标日 = 这天）"
          onClick={() => {
            openCountdownDraft({ targetDate: iso });
            onClose();
          }}
        >
          <CalendarPlus size={13} />
          倒计时
        </button>
      </div>

        {entries.some((e) => e.location) ? (
          <div
            style={{
              padding: "0 12px 10px",
              fontSize: fs(11.5),
              color: "var(--ink-3)",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <MapPin size={12} />
            {entries.find((e) => e.location)?.location}
          </div>
        ) : null}
      </div>
    </Portal>
  );
}
