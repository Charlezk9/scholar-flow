import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { MapPin } from "lucide-react";
import { colorMeta, type CalEvent } from "../lib/api";
import {
  fromISO,
  timeToMin,
  toISO,
  today,
  weekDays,
  WEEKDAY_CN,
} from "../lib/date";
import { dayInfo } from "../lib/lunar";
import { layoutWeekLanes } from "../domain/calendar";
import { fs, hourHeight } from "../lib/fontScale";
import { useStore } from "../store/useStore";
import RoutineColumn from "./RoutineColumn";
import { useNow } from "../lib/tick";
import MiniCalendar from "./MiniCalendar";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DOW_LABEL = WEEKDAY_CN;
const timelineScrollHours: Partial<Record<"week" | "day", number>> = {};

/** 同一天内的时间事件泳道排布 */
function layoutTimed(events: CalEvent[], dayIso: string) {
  const items = events
    .filter((e) => !e.allDay && e.startDate === dayIso && e.endDate === dayIso)
    .map((e) => ({
      event: e,
      s: timeToMin(e.startTime ?? "00:00"),
      en: Math.max(timeToMin(e.endTime ?? e.startTime ?? "00:00"), timeToMin(e.startTime ?? "00:00") + 30),
    }))
    .sort((a, b) => a.s - b.s || b.en - a.en);

  const lanes: number[][] = [];
  const out: { event: CalEvent; lane: number; s: number; en: number }[] = [];
  for (const it of items) {
    let lane = 0;
    for (;;) {
      const occ = lanes[lane] ?? (lanes[lane] = []);
      if (!occ.some((end) => end > it.s)) {
        occ.push(it.en);
        break;
      }
      lane += 1;
      if (lane > 12) break;
    }
    out.push({ event: it.event, lane, s: it.s, en: it.en });
  }
  const laneCount = Math.max(1, lanes.length);
  return { blocks: out, laneCount };
}

export default function WeekView({ mode }: { mode: "week" | "day" }) {
  const cursor = useStore((s) => s.cursor);
  const weekStart = useStore((s) => s.settings.weekStart);
  const fontSize = useStore((s) => s.settings.fontSize);
  const HOUR_H = hourHeight(fontSize);
  const events = useStore((s) => s.events);
  const countdowns = useStore((s) => s.countdowns);
  const select = useStore((s) => s.select);
  const openEventDraft = useStore((s) => s.openEventDraft);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousScale = useRef<{ mode: string; height: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const days = useMemo(
    () => (mode === "week" ? weekDays(fromISO(cursor), weekStart) : [fromISO(cursor)]),
    [cursor, mode, weekStart],
  );
  const isoDays = days.map(toISO);
  const todayIso = toISO(today());
  const colW = 100 / days.length;

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const old = previousScale.current;
    el.scrollTop = old?.mode === mode ? el.scrollTop * HOUR_H / old.height : (timelineScrollHours[mode] ?? ((mode === "day" ? 8 : 7) - 8 / HOUR_H)) * HOUR_H;
    previousScale.current = { mode, height: HOUR_H };
    return () => { timelineScrollHours[mode] = el.scrollTop / HOUR_H; };
  }, [mode, HOUR_H]);
  // 标题与全天区补上原生滚动条占用的宽度，否则右边两列会错位。
  useEffect(() => {
    const el = scrollRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap) return;
    const sync = () => wrap.style.setProperty("--timeline-scrollbar", `${el.offsetWidth - el.clientWidth}px`);
    sync();
    window.addEventListener("resize", sync);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(el);
    return () => { window.removeEventListener("resize", sync); observer?.disconnect(); };
  }, [mode]);

  const lanes = useMemo(
    () => (mode === "week" ? layoutWeekLanes(events, days[0]) : null),
    [events, days, mode],
  );

  const timedByDay = useMemo(
    () => isoDays.map((iso) => layoutTimed(events, iso)),
    [events, isoDays],
  );

  const weekCountdowns = countdowns.filter(
    (c) => !c.archived && isoDays.includes(c.targetDate),
  );

  const now = new Date(useNow());
  const dayAllDay = events.filter((e) => (e.allDay || e.startDate !== e.endDate) && e.startDate <= cursor && e.endDate >= cursor);
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H;

  return (
    <>
      <div className="rail">
        <MiniCalendar />
        <div className="rail-card">
          <h4>本周倒计时</h4>
          {weekCountdowns.length === 0 ? (
            <div style={{ fontSize: fs(12), color: "var(--ink-3)" }}>这一周没有倒计时目标日</div>
          ) : (
            <div className="rail-list">
              {weekCountdowns.map((c) => (
                <button
                  key={c.id}
                  className="rail-item"
                  onClick={() => useStore.getState().openCountdownDraft(c)}
                >
                  <span
                    className="dot"
                    style={{ background: colorMeta(c.color).dot }}
                  />
                  <span className="name">{c.title}</span>
                  <span style={{ marginLeft: "auto", fontSize: fs(11.5), color: "var(--ink-3)" }}>
                    {c.targetDate.slice(5)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div ref={wrapRef} className={`time-wrap ${mode === "day" ? "day-time-wrap" : ""}`} style={{ "--hour-h": `${HOUR_H}px` } as React.CSSProperties}>
        {/* 日期表头 */}
        <div className="tg-head">
          {mode === "week" ? <div className="gutter" /> : null}
          {days.map((d) => {
            const iso = toISO(d);
            const info = dayInfo(iso);
            const dow = d.getDay();
            return (
              <button
                key={iso}
                className={[
                  "col",
                  dow === 0 || dow === 6 ? "is-weekend" : "",
                  iso === todayIso ? "is-today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => select(iso)}
              >
                <span className="dnum">
                  {mode === "week" ? `${d.getMonth() + 1}/${d.getDate()}` : `${d.getDate()} 日`}
                </span>
                <span className="dlun">
                  周{DOW_LABEL[dow]}
                  {info.line ? ` · ${info.line}` : ""}
                  {iso === todayIso ? " · 今" : ""}
                </span>
              </button>
            );
          })}
        </div>

        {mode === "day" ? <div className="day-column-head"><span className="day-axis-spacer" /><div className="day-column-titles"><span>日常安排</span><span>事件</span></div></div> : null}
        {/* 全天 / 跨日 */}
        <div className="tg-allday">
          <div className="gutter">全天</div>
          {mode === "day" ? <div className="day-allday-blank" aria-hidden="true" /> : null}
          <div className="track">
            {Array.from({ length: Math.max(1, lanes ? lanes.laneCount : dayAllDay.length) }).map(
              (_, lane) => (
                <div className="line" key={lane}>
                  {lanes
                    ? lanes.segments
                        .filter((s) => s.lane === lane)
                        .map((s) => {
                          const meta = colorMeta(s.event.color);
                          const isStart = !s.opensLeft;
                          return (
                            <button
                              key={s.event.id}
                              className="allday-bar"
                              style={{
                                left: `calc(${s.startCol * colW}% + 2px)`,
                                width: `calc(${(s.endCol - s.startCol + 1) * colW}% - 4px)`,
                                background: meta.fill,
                                borderLeft: isStart ? `3px solid ${meta.line}` : "none",
                                color: meta.text,
                              }}
                              onClick={() => openEventDraft(s.event)}
                              title={`${s.event.title} ${s.event.startDate} – ${s.event.endDate}`}
                            >
                              {s.event.title}
                              <span
                                style={{ marginLeft: 6, color: "var(--ink-3)", fontSize: fs(11) }}
                              >
                                {s.event.startDate.slice(5)} – {s.event.endDate.slice(5)}
                              </span>
                            </button>
                          );
                        })
                    : dayAllDay.slice(lane, lane + 1)
                        .map((e) => {
                          const meta = colorMeta(e.color);
                          return (
                            <button
                              key={e.id}
                              className="allday-bar"
                              style={{
                                left: 2,
                                width: "calc(100% - 4px)",
                                background: meta.fill,
                                borderLeft: `3px solid ${meta.line}`,
                                color: meta.text,
                              }}
                              onClick={() => openEventDraft(e)}
                            >
                              {e.title}
                            </button>
                          );
                        })}
                </div>
              ),
            )}
          </div>
        </div>

        {/* 时间网格 */}
        <div className="tg-scroll" ref={scrollRef}>
          <div className="tg-grid">
            <div className="tg-hrs">
              {HOURS.map((h) => (
                <div className="h" key={h}>
                  {String(h).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            <div className={`tg-cols ${mode === "day" ? "day-two-cols" : ""}`}>
              {mode === "day" ? <RoutineColumn key={cursor} date={cursor} hourHeight={HOUR_H} isToday={cursor === todayIso} nowTop={nowTop} /> : null}
              {isoDays.map((iso, di) => {
                const { blocks, laneCount } = timedByDay[di];
                const isToday = iso === todayIso;
                return (
                  <div
                    key={iso}
                    className={`tg-col ${isToday ? "is-today" : ""}`}
                    onDoubleClick={(e) => {
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      if ((e.target as HTMLElement).closest("button")) return;
                      const y = e.clientY - rect.top;
                      const mins = Math.min(1410, Math.max(0, Math.round(((y / HOUR_H) * 60) / 30) * 30));
                      const hh = String(Math.min(23, Math.floor(mins / 60))).padStart(2, "0");
                      const mm = String(mins % 60).padStart(2, "0");
                      openEventDraft({
                        startDate: iso,
                        endDate: iso,
                        allDay: false,
                        startTime: `${hh}:${mm}`,
                        endTime: `${String(Math.floor(Math.min(1439, mins + 60) / 60)).padStart(2, "0")}:${String(Math.min(1439, mins + 60) % 60).padStart(2, "0")}`,
                        color: "indigo",
                      });
                    }}
                  >
                    {HOURS.map((h) => (
                      <div className="hline" key={h} />
                    ))}

                    {isToday ? (
                      <div className="tg-now" style={{ top: nowTop }} />
                    ) : null}

                    {blocks.map((b) => {
                      const meta = colorMeta(b.event.color);
                      const top = (b.s / 60) * HOUR_H;
                      const height = Math.max(20, ((b.en - b.s) / 60) * HOUR_H - 3);
                      const w = 100 / laneCount;
                      return (
                        <button
                          key={b.event.id}
                          className="ev-block"
                          style={{
                            top,
                            height,
                            left: `calc(${b.lane * w}% + 2px)`,
                            width: `calc(${w}% - 4px)`,
                            background: meta.fill,
                            borderColor: meta.line,
                            color: meta.text,
                          }}
                          onClick={() => openEventDraft(b.event)}
                          title={`${b.event.title} ${b.event.startTime ?? ""}–${
                            b.event.endTime ?? ""
                          }${b.event.location ? " · " + b.event.location : ""}`}
                        >
                          <div className="t">
                            {b.event.startTime} – {b.event.endTime}
                          </div>
                          <div className="n">{b.event.title}</div>
                          {height > HOUR_H && b.event.location ? (
                            <div className="l">
                              <MapPin size={9} style={{ marginRight: 3 }} />
                              {b.event.location}
                            </div>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export { layoutTimed };
