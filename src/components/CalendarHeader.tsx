import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useStore } from "../store/useStore";
import { DatePicker } from "./pickers";
import type { ViewMode } from "../lib/api";
import { useNarrow } from "../lib/viewport";
import {
  formatFullDate,
  formatMonthTitle,
  formatWeekRange,
  fromISO,
  today,
  toISO,
  weekDays,
} from "../lib/date";

const VIEWS: { key: ViewMode; label: string }[] = [
  { key: "month", label: "月" },
  { key: "week", label: "周" },
  { key: "day", label: "日" },
];

export default function CalendarHeader() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const cursor = useStore((s) => s.cursor);
  const weekStart = useStore((s) => s.settings.weekStart);
  const shift = useStore((s) => s.shift);
  const goToday = useStore((s) => s.goToday);
  const goto = useStore((s) => s.goto);
  const openEventDraft = useStore((s) => s.openEventDraft);
  // v1.1 · UI-22：窄窗时标题用短格式（长格式在特大字号下光自己就要 600px）
  const narrow = useNarrow(1180);

  const d = fromISO(cursor);
  // v1.1 · UI-22：周 / 日视图的标题**不显示年份**（字体与月视图一致，不做分档）；
  // 完整信息（含年份）放在 title 属性里，hover 仍看得到。
  const visible =
    view === "month"
      ? formatMonthTitle(d)
      : view === "week"
        ? formatWeekRange(weekDays(d, weekStart), narrow ? "short" : "long")
        : view === "day"
          ? formatFullDate(d, false)
          : "未来安排";
  const full =
    view === "month"
      ? formatMonthTitle(d)
      : view === "week"
        ? formatWeekRange(weekDays(d, weekStart), "full")
        : view === "day"
          ? formatFullDate(d)
          : "未来安排";

  return (
    <div className="cal-header">
      <button className="nav-sq" title="上一周期" onClick={() => shift(-1)}>
        <ChevronLeft size={17} />
      </button>
      <button className="nav-sq" title="下一周期" onClick={() => shift(1)}>
        <ChevronRight size={17} />
      </button>

      {/* 标题是唯一可以让位的元素：被截断时 hover 能看到完整文字 */}
      <div className="cal-title" title={full}>
        {visible}
      </div>

      <div className="right">
        <button className="btn btn-outline btn-sm" onClick={goToday}>
          今天
        </button>

        <span className="jump-wrap">
          <DatePicker value={cursor} onChange={goto} label={(iso) => iso} />
        </span>

        <div className="segmented">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              className={view === v.key ? "is-on" : ""}
              onClick={() => setView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>

        <button
          className="btn btn-primary btn-sm"
          onClick={() =>
            openEventDraft({
              startDate: cursor,
              endDate: cursor,
              allDay: true,
              color: "indigo",
            })
          }
        >
          <Plus size={14} />
          新建事件
        </button>
      </div>
    </div>
  );
}

export { VIEWS };
export const TODAY_ISO = () => toISO(today());
