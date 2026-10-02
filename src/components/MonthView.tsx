import { useMemo, useState } from "react";
import { colorMeta, type CalEvent } from "../lib/api";
import type { FontSizeKey } from "../lib/fontScale";
import { fromISO, monthMatrix, toISO, today, WEEKDAY_CN } from "../lib/date";
import { dayInfo } from "../lib/lunar";
import { collectDay, layoutWeekLanes } from "../domain/calendar";
import { fontScaleOf } from "../lib/fontScale";
import { useStore } from "../store/useStore";
import DayPopover from "./DayPopover";

/**
 * 格内最多显示几行内容（节日名与跨日横条各占一行额度）。
 * 字号越大，单行越高，就必须少显示几行 —— 否则内容会被格子裁掉。
 */
function maxContentRows(fontSize: FontSizeKey): number {
  return fontScaleOf(fontSize) <= 1.05 ? 3 : 2;
}

export default function MonthView() {
  const cursor = useStore((s) => s.cursor);
  const fontSize = useStore((s) => s.settings.fontSize);
  const settings = useStore((s) => s.settings);
  const events = useStore((s) => s.events);
  const countdowns = useStore((s) => s.countdowns);
  const selected = useStore((s) => s.selected);
  const select = useStore((s) => s.select);
  const openEventDraft = useStore((s) => s.openEventDraft);

  const [pop, setPop] = useState<{ iso: string; rect: DOMRect } | null>(null);

  const ws = settings.weekStart;
  const days = useMemo(
    () => monthMatrix(fromISO(cursor), ws),
    [cursor, ws],
  );
  const todayIso = toISO(today());
  const month = fromISO(cursor).getMonth();
  const contentRows = maxContentRows(fontSize);

  const rows = useMemo(() => {
    const out: { days: Date[]; lanes: ReturnType<typeof layoutWeekLanes> }[] = [];
    for (let r = 0; r < 6; r += 1) {
      const rowDays = days.slice(r * 7, r * 7 + 7);
      out.push({
        days: rowDays,
        lanes: layoutWeekLanes(events, rowDays[0]),
      });
    }
    return out;
  }, [days, events]);

  const weekdayLabels = useMemo(
    () => Array.from({ length: 7 }, (_, i) => WEEKDAY_CN[(ws + i) % 7]),
    [ws],
  );

  const isWeekendCol = (col: number) => {
    const dow = (ws + col) % 7;
    return dow === 0 || dow === 6;
  };

  return (
    <div className="month">
      <div className="weekday-row">
        {weekdayLabels.map((w, i) => (
          <div key={w + i} className={isWeekendCol(i) ? "is-weekend" : ""}>
            周{w}
          </div>
        ))}
      </div>

      <div className="month-grid">
        {rows.map((row) =>
          row.days.map((date, ci) => {
            const iso = toISO(date);
            const out = date.getMonth() !== month;
            const isToday = iso === todayIso;
            const info = dayInfo(iso);
            const showLunar =
              settings.showLunar && !out && (settings.showTerms || !info.isTerm);
            const showFestival = settings.showHolidays && !out && Boolean(info.festival);

            // 本周区间事件在本列的片段
            const segs = row.lanes.segments
              .filter((s) => ci >= s.startCol && ci <= s.endCol)
              .sort((a, b) => a.lane - b.lane);
            const spanRows = Math.min(segs.length, 1);

            const contentBudget = contentRows - (showFestival ? 1 : 0) - spanRows;

            const all = out ? [] : collectDay(iso, countdowns, events);
            const singles = all.filter((e) => {
              if (e.kind === "countdown") return true;
              const ev = e.raw as CalEvent;
              return ev.allDay === false && ev.startDate === ev.endDate;
            });
            const shown = singles.slice(0, Math.max(0, contentBudget));
            const more = singles.length - shown.length;

            return (
              <div
                key={iso}
                className={[
                  "cell",
                  out ? "is-out" : "",
                  isToday ? "is-today" : "",
                  iso === selected ? "is-sel" : "",
                  isWeekendCol(ci) ? "is-weekend" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={(e) => {
                  select(iso);
                  setPop({
                    iso,
                    rect: (e.currentTarget as HTMLElement).getBoundingClientRect(),
                  });
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  openEventDraft({
                    startDate: iso,
                    endDate: iso,
                    allDay: true,
                    color: "indigo",
                  });
                }}
              >
                <div className="cell-head">
                  <span className="cell-day">{date.getDate()}</span>
                  <span className="cell-badges">
                    {settings.showCountdownMark && !out
                      ? countdowns
                          .filter(
                            (c) => c.showOnCalendar && !c.archived && c.targetDate === iso,
                          )
                          .slice(0, 1)
                          .map((c) => (
                            <span key={c.id} className="badge badge-cd" title={`倒计时：${c.title}`}>
                              倒
                            </span>
                          ))
                      : null}
                    {settings.showHolidayBadge && info.badge && !out ? (
                      <span
                        className={`badge ${
                          info.badge.text === "休" ? "badge-rest" : "badge-work"
                        }`}
                        title={info.badge.name}
                      >
                        {info.badge.text}
                      </span>
                    ) : null}
                    {isToday ? <span className="badge-today">今</span> : null}
                  </span>
                </div>

                {showLunar && info.line ? (
                  <div className={`cell-lunar ${info.isTerm ? "is-term" : ""}`}>
                    {info.line}
                  </div>
                ) : null}

                {showFestival ? (
                  <div
                    className={`cell-festival ${
                      info.festivalKind === "solar" ? "is-solar" : ""
                    }`}
                    title={info.festival}
                  >
                    {info.festival}
                  </div>
                ) : null}

                {spanRows > 0 ? (
                  <div className="cell-spans">
                    {segs.slice(0, 1).map((s) => {
                      const meta = colorMeta(s.event.color);
                      const isStart = ci === s.startCol || !s.opensLeft;
                      const isEnd = ci === s.endCol || !s.opensRight;
                      return (
                        <div
                          key={s.event.id + s.lane}
                          className={[
                            "span-bar",
                            isStart ? "l-closed" : "l-open",
                            isEnd ? "r-closed" : "r-open",
                          ].join(" ")}
                          style={{
                            background: meta.fill,
                            color: meta.text,
                            marginLeft: isStart ? 0 : -7,
                            marginRight: isEnd ? 0 : -7,
                          }}
                          title={`${s.event.title} ${s.event.startDate} – ${s.event.endDate}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEventDraft(s.event);
                          }}
                        >
                          {isStart ? s.event.title : ""}
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                <div className="cell-events">
                  {shown.map((e) => {
                    const meta = colorMeta(
                      e.kind === "countdown" ? (e.color ?? "cinnabar") : e.color,
                    );
                    return (
                      <div
                        key={`${e.kind}-${e.id}`}
                        className={`ev-row ${e.kind === "countdown" ? "is-cd" : ""}`}
                        title={`${e.title}${e.time ? " " + e.time : ""}`}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (e.kind === "countdown") {
                            useStore.getState().openCountdownDraft(e.raw as never);
                          } else {
                            openEventDraft(e.raw as CalEvent);
                          }
                        }}
                      >
                        <span className="dot" style={{ background: meta.dot }} />
                        <span className="txt">{e.title}</span>
                      </div>
                    );
                  })}
                  {more > 0 ? <div className="ev-more">+{more}</div> : null}
                </div>
              </div>
            );
          }),
        )}
      </div>

      {pop ? (
        <DayPopover iso={pop.iso} anchor={pop.rect} onClose={() => setPop(null)} />
      ) : null}
    </div>
  );
}
