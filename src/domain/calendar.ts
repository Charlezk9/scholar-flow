/**
 * 日历引擎：
 *  - 月视图网格
 *  - 区间事件「泳道」排布（避免重叠）
 *  - 按天归集倒计时 / 事件，供格内渲染
 */
import type { CalEvent, Countdown } from "../lib/api";
import { addDays, fromISO, startOfWeek, toISO } from "../lib/date";

/** 一个区间事件在某一周内的可见片段 */
export interface EventSegment {
  event: CalEvent;
  lane: number;
  /** 本周内的起止列（0..6，闭区间） */
  startCol: number;
  endCol: number;
  /** 是否与真实起止日相接（决定圆角/箭头） */
  opensLeft: boolean;
  opensRight: boolean;
}

export interface WeekLanes {
  segments: EventSegment[];
  laneCount: number;
}

/**
 * 把落在 [weekStart, weekStart+6] 区间内的事件排布到泳道。
 * 全天/跨日事件参与排布；定时事件不参与（它们在时间网格里）。
 */
export function layoutWeekLanes(events: CalEvent[], weekStart: Date): WeekLanes {
  const days = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));
  const first = days[0];
  const last = days[6];

  const spanning = events
    .filter((e) => e.endDate >= first && e.startDate <= last)
    .filter((e) => e.allDay || e.startDate !== e.endDate)
    .map((e) => {
      const s = e.startDate < first ? first : e.startDate;
      const en = e.endDate > last ? last : e.endDate;
      return {
        event: e,
        startCol: days.indexOf(s),
        endCol: days.indexOf(en),
        opensLeft: e.startDate < first,
        opensRight: e.endDate > last,
        span: days.indexOf(en) - days.indexOf(s),
      };
    })
    .filter((x) => x.startCol >= 0 && x.endCol >= 0)
    .sort((a, b) => a.startCol - b.startCol || b.span - a.span);

  const lanes: number[][] = [];
  const segments: EventSegment[] = [];

  for (const item of spanning) {
    let lane = 0;
    for (;;) {
      const occupied = lanes[lane] ?? (lanes[lane] = []);
      const conflict = occupied.some(
        (end) => end >= item.startCol,
      );
      if (!conflict) {
        occupied.push(item.endCol);
        break;
      }
      lane += 1;
      if (lane > 40) break;
    }
    segments.push({
      event: item.event,
      lane,
      startCol: item.startCol,
      endCol: item.endCol,
      opensLeft: item.opensLeft,
      opensRight: item.opensRight,
    });
  }

  return { segments, laneCount: lanes.length };
}

/** 某天包含的全部条目（倒计时 + 事件），用于「点击某日」的清单 */
export interface DayEntry {
  kind: "countdown" | "event";
  id: string;
  title: string;
  color: string | null;
  time: string | null;
  note: string | null;
  location: string | null;
  /** 跨日事件 */
  range?: { start: string; end: string };
  raw: Countdown | CalEvent;
}

export function collectDay(
  iso: string,
  countdowns: Countdown[],
  events: CalEvent[],
): DayEntry[] {
  const out: DayEntry[] = [];
  for (const c of countdowns) {
    if (!c.showOnCalendar || c.archived) continue;
    if (c.targetDate === iso) {
      out.push({
        kind: "countdown",
        id: c.id,
        title: c.title,
        color: c.color ?? "cinnabar",
        time: c.targetTime,
        note: c.note,
        location: null,
        raw: c,
      });
    }
  }
  for (const e of events) {
    if (e.startDate <= iso && e.endDate >= iso) {
      out.push({
        kind: "event",
        id: e.id,
        title: e.title,
        color: e.color,
        time: e.allDay ? null : e.startTime,
        note: e.note,
        location: e.location,
        range:
          e.startDate !== e.endDate ? { start: e.startDate, end: e.endDate } : undefined,
        raw: e,
      });
    }
  }
  return out.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "countdown" ? -1 : 1;
    if (!a.time && !b.time) return 0;
    if (!a.time) return -1;
    if (!b.time) return 1;
    return a.time.localeCompare(b.time);
  });
}

/** 议程视图：从某日起，逐日列出有内容的日期 */
export function agendaEntries(
  countdowns: Countdown[],
  events: CalEvent[],
  fromIso: string,
  days = 60,
): { date: string; entries: DayEntry[] }[] {
  const base = fromISO(fromIso);
  const out: { date: string; entries: DayEntry[] }[] = [];
  for (let i = 0; i < days; i += 1) {
    const iso = toISO(addDays(base, i));
    const entries = collectDay(iso, countdowns, events);
    if (entries.length > 0) out.push({ date: iso, entries });
  }
  return out;
}

/** 判断某日是否存在倒计时（用于格内「倒」角标） */
export function countdownsOn(iso: string, countdowns: Countdown[]): Countdown[] {
  return countdowns.filter(
    (c) => c.showOnCalendar && !c.archived && c.targetDate === iso,
  );
}

export { fromISO, startOfWeek };
