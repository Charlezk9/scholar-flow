/**
 * 农历 / 节气 / 节日 / 法定节假日。
 * 全部本地计算，无网络依赖（lunar-typescript 内置节假日数据）。
 *
 * 展示优先级（PRD LN-01~LN-05）：
 *   节气 > 传统节日 > 公历节日 > 农历初一月名 > 农历日
 */
import { HolidayUtil, Solar } from "lunar-typescript";
import { fromISO, toISO } from "./date";

export interface DayInfo {
  /** 月格第二行显示的文本：节气 > 农历初一月名 > 农历日 */
  line: string;
  /** 是否为节气（用于加粗/着色） */
  isTerm: boolean;
  /** 需要突出显示的节日名（传统节日优先） */
  festival: string;
  festivalKind: "lunar" | "solar" | "none";
  /** 法定节假日角标 */
  badge: { text: "休" | "班"; name: string } | null;
  /** "五月初八" 完整农历 */
  lunarFull: string;
}

const cache = new Map<string, DayInfo>();

const EMPTY: DayInfo = {
  line: "",
  isTerm: false,
  festival: "",
  festivalKind: "none",
  badge: null,
  lunarFull: "",
};

export function dayInfo(iso: string): DayInfo {
  const hit = cache.get(iso);
  if (hit) return hit;

  let info: DayInfo = EMPTY;
  try {
    const d = fromISO(iso);
    const solar = Solar.fromYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const lunar = solar.getLunar();

    const jieQi = safeStr(() => lunar.getJieQi());
    const dayCn = safeStr(() => lunar.getDayInChinese());
    const monthCn = safeStr(() => lunar.getMonthInChinese());
    const lunarFestivals = safeArr(() => lunar.getFestivals());
    const solarFestivals = safeArr(() => solar.getFestivals());

    const line = jieQi || (dayCn === "初一" ? `${monthCn}月` : dayCn);

    let festival = "";
    let kind: DayInfo["festivalKind"] = "none";
    if (lunarFestivals.length > 0) {
      festival = lunarFestivals[0];
      kind = "lunar";
    } else if (solarFestivals.length > 0) {
      festival = solarFestivals[0];
      kind = "solar";
    }

    let badge: DayInfo["badge"] = null;
    try {
      const hol = HolidayUtil.getHoliday(
        d.getFullYear(),
        d.getMonth() + 1,
        d.getDate(),
      );
      if (hol) {
        badge = { text: hol.isWork() ? "班" : "休", name: hol.getName() };
      }
    } catch {
      badge = null;
    }

    info = {
      line,
      isTerm: Boolean(jieQi),
      festival,
      festivalKind: kind,
      badge,
      lunarFull: `${monthCn}月${dayCn}`,
    };
  } catch {
    info = EMPTY;
  }

  cache.set(iso, info);
  return info;
}

function safeStr(fn: () => string): string {
  try {
    return fn() ?? "";
  } catch {
    return "";
  }
}

function safeArr(fn: () => unknown[]): string[] {
  try {
    const v = fn();
    return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as string[]) : [];
  } catch {
    return [];
  }
}

/** 预填缓存，避免切换月份时的抖动 */
export function warmDayInfo(dates: Date[]): void {
  for (const d of dates) dayInfo(toISO(d));
}
