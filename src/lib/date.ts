/**
 * 日期工具。
 * 全部以「本地日期语义」运算，锚定正午以规避夏令时/时区导致的跨天误差。
 */

export const WEEKDAY_CN = ["日", "一", "二", "三", "四", "五", "六"];

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function today(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function addMonths(d: Date, n: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth() + n, 1, 12, 0, 0, 0);
  const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(d.getDate(), last));
  return x;
}

/** 两个日期相差的「日历天数」 */
export function diffDays(a: Date, b: Date): number {
  const A = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const B = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((A - B) / 86_400_000);
}

export function startOfWeek(d: Date, weekStart: number): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
  const delta = (base.getDay() - weekStart + 7) % 7;
  return addDays(base, -delta);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 6 × 7 月视图网格 */
export function monthMatrix(cursor: Date, weekStart: number): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12, 0, 0, 0);
  const gridStart = startOfWeek(first, weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

export function weekDays(cursor: Date, weekStart: number): Date[] {
  const s = startOfWeek(cursor, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

const MONTHS = [
  "1 月",
  "2 月",
  "3 月",
  "4 月",
  "5 月",
  "6 月",
  "7 月",
  "8 月",
  "9 月",
  "10 月",
  "11 月",
  "12 月",
];

/** "2026 年 6 月" */
export function formatMonthTitle(d: Date): string {
  return `${d.getFullYear()} 年 ${MONTHS[d.getMonth()]}`;
}

/** "2026 年 6 月 1 日 星期一"；`withYear: false` → "6 月 1 日 星期一"（日视图标题用，见 UI-22） */
export function formatFullDate(d: Date, withYear = true): string {
  return `${withYear ? `${d.getFullYear()} 年 ` : ""}${MONTHS[d.getMonth()]} ${d.getDate()} 日 星期${
    WEEKDAY_CN[d.getDay()]
  }`;
}

/** "2026-06-07 周日" */
export function formatCardDate(iso: string): string {
  const d = fromISO(iso);
  return `${iso} 周${WEEKDAY_CN[d.getDay()]}`;
}

/** "6月1日" */
export function formatShort(iso: string): string {
  const d = fromISO(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/**
 * 周视图标题。三种粒度（v1.1 · UI-22 追加）：
 *  - `long`（默认）：**不显示年份**，只在跨年时补 —— "10 月 5 日 – 11 日"
 *  - `short`：数字式，窄窗用 —— "10/5 – 10/11"
 *  - `full`：完整年月，给 `title` 提示（hover 才看得到完整信息）
 */
export function formatWeekRange(
  days: Date[],
  style: "long" | "short" | "full" = "long",
): string {
  if (days.length === 0) return "";
  const a = days[0];
  const b = days[days.length - 1];
  const crossYear = a.getFullYear() !== b.getFullYear();
  // 跨年时年份必须写出来，否则「12 月 28 日 – 1 月 3 日」看着像同一年的同一周
  const yearA = crossYear ? `${a.getFullYear()} 年 ` : "";
  const yearB = crossYear ? `${b.getFullYear()} 年 ` : "";

  if (style === "short") {
    const prefix = crossYear ? `${a.getFullYear()}/` : "";
    const tail = crossYear
      ? `${b.getFullYear()}/${b.getMonth() + 1}/${b.getDate()}`
      : `${b.getMonth() + 1}/${b.getDate()}`;
    return `${prefix}${a.getMonth() + 1}/${a.getDate()} – ${tail}`;
  }

  if (style === "full") {
    return `${a.getFullYear()} 年 ${MONTHS[a.getMonth()]} ${a.getDate()} 日 – ${
      b.getFullYear()
    } 年 ${MONTHS[b.getMonth()]} ${b.getDate()} 日`;
  }

  // long：不带年份
  if (a.getMonth() !== b.getMonth()) {
    return `${yearA}${MONTHS[a.getMonth()]} ${a.getDate()} 日 – ${yearB}${
      MONTHS[b.getMonth()]
    } ${b.getDate()} 日`;
  }
  return `${yearA}${MONTHS[a.getMonth()]} ${a.getDate()} 日 – ${b.getDate()} 日`;
}

/** 时间字符串 → 分钟数 */
export function timeToMin(t: string | null | undefined): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minToTime(min: number): string {
  const c = Math.max(0, Math.min(24 * 60, Math.round(min)));
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
}

/** 距目标日期剩余天数（本地日期语义） */
export function daysUntil(targetISO: string): number {
  return diffDays(fromISO(targetISO), today());
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
