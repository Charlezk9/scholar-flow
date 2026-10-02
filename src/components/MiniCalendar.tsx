import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, fromISO, monthMatrix, toISO, today, WEEKDAY_CN } from "../lib/date";
import { useStore } from "../store/useStore";

/** 周 / 日视图侧栏的迷你月历 */
export default function MiniCalendar() {
  const cursor = useStore((s) => s.cursor);
  const goto = useStore((s) => s.goto);
  const weekStart = useStore((s) => s.settings.weekStart);

  const c = fromISO(cursor);
  const days = monthMatrix(c, weekStart);
  const todayIso = toISO(today());
  const month = c.getMonth();

  const step = (n: number) => {
    const next = addMonths(new Date(c.getFullYear(), c.getMonth(), 1, 12), n);
    goto(toISO(next));
  };

  return (
    <div className="mini-cal">
      <div className="mini-head">
        {/* UI-22：默认不显示年份（当前年份下是多余信息），只在翻到别的年份时才补上；
            完整年月始终放在 title 里 */}
        <span className="t" title={`${c.getFullYear()} 年 ${c.getMonth() + 1} 月`}>
          {c.getFullYear() === new Date().getFullYear()
            ? `${c.getMonth() + 1} 月`
            : `${c.getFullYear()} 年 ${c.getMonth() + 1} 月`}
        </span>
        <span className="nav">
          <button className="icon-btn" title="上个月" onClick={() => step(-1)}>
            <ChevronLeft size={14} />
          </button>
          <button className="icon-btn" title="下个月" onClick={() => step(1)}>
            <ChevronRight size={14} />
          </button>
        </span>
      </div>
      <div className="mini-grid">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={`wd${i}`} className="wd">
            {WEEKDAY_CN[(weekStart + i) % 7]}
          </div>
        ))}
        {days.map((d) => {
          const iso = toISO(d);
          return (
            <button
              key={iso}
              className={[
                "d",
                d.getMonth() !== month ? "is-out" : "",
                iso === todayIso ? "is-today" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => goto(iso)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
