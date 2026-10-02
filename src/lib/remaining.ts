/**
 * 倒计时纯计算（无依赖、无 JSX，可直接用 Node 运行测试）。
 *
 * 语义：
 *  - 设了目标时间 → 目标时刻 = 那一天的该时该分（兼容 `HH:mm` 与 `HH:mm:ss`）
 *  - 没设目标时间 → 目标时刻 = 那一天的 23:59:59.999（「全天」＝到当天结束）
 *
 * 全部用毫秒差直接算，不做日期取整，因此秒是准的。
 */

export const DAY_MS = 86_400_000;
export const HOUR_MS = 3_600_000;
export const MIN_MS = 60_000;

export interface Remaining {
  /** 是否设了具体时间 */
  hasTime: boolean;
  /** 目标时刻（ms） */
  targetMs: number;
  /** 与目标的毫秒差：正 = 还没到，负 = 已过 */
  diffMs: number;
  /** 是否已过 */
  past: boolean;
  /** 绝对差拆解 */
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  /** 未过 且 与目标同一日历日 */
  isToday: boolean;
}

function pad2(n: number): string {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

/** `HH:MM:SS`（三组都恒为两位，保证每秒变化时宽度不抖） */
export function clockText(r: Pick<Remaining, "hours" | "minutes" | "seconds">): string {
  return `${pad2(r.hours)}:${pad2(r.minutes)}:${pad2(r.seconds)}`;
}

const EMPTY: Remaining = {
  hasTime: false,
  targetMs: 0,
  diffMs: 0,
  past: false,
  days: 0,
  hours: 0,
  minutes: 0,
  seconds: 0,
  isToday: false,
};

export function remainingOf(
  c: { targetDate: string; targetTime: string | null },
  nowMs: number = Date.now(),
): Remaining {
  const [y, m, d] = (c.targetDate || "").split("-").map(Number);
  if (!y || !m || !d) return EMPTY;

  const hasTime = Boolean(c.targetTime);
  let target: Date;
  if (hasTime) {
    // 允许 HH:mm，也兼容 HH:mm:ss
    const [hh, mm, ss] = (c.targetTime ?? "00:00").split(":").map(Number);
    target = new Date(y, m - 1, d, hh || 0, mm || 0, ss || 0, 0);
  } else {
    target = new Date(y, m - 1, d, 23, 59, 59, 999);
  }

  const targetMs = target.getTime();
  const diffMs = targetMs - nowMs;
  const past = diffMs <= 0;
  const abs = Math.abs(diffMs);

  const now = new Date(nowMs);
  const sameDay =
    now.getFullYear() === y && now.getMonth() === m - 1 && now.getDate() === d;

  return {
    hasTime,
    targetMs,
    diffMs,
    past,
    days: Math.floor(abs / DAY_MS),
    hours: Math.floor((abs % DAY_MS) / HOUR_MS),
    minutes: Math.floor((abs % HOUR_MS) / MIN_MS),
    seconds: Math.floor((abs % MIN_MS) / 1000),
    isToday: sameDay && !past,
  };
}

/** 进度百分比；仅当设置了起始日期时可算 */
export function progressOf(
  c: { startDate: string | null; targetDate: string },
  nowMs: number = Date.now(),
): number | null {
  if (!c.startDate) return null;
  const [sy, sm, sd] = c.startDate.split("-").map(Number);
  const [ty, tm, td] = (c.targetDate || "").split("-").map(Number);
  if (!ty || !tm || !td) return null;
  const start = new Date(sy, sm - 1, sd).getTime();
  const end = new Date(ty, tm - 1, td, 23, 59, 59).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 100;
  return Math.max(0, Math.min(100, Math.round(((nowMs - start) / (end - start)) * 100)));
}
