/** 日常安排不是日历事件：每天四个固定时段，空块不落库。 */
export const ROUTINE_SLOTS = [
  { key: "morning_1", start: 510, end: 600 },
  { key: "morning_2", start: 615, end: 720 },
  { key: "afternoon", start: 870, end: 990 },
  { key: "evening", start: 1140, end: 1230 },
] as const;
export type RoutineKey = (typeof ROUTINE_SLOTS)[number]["key"];
export interface RoutineSlot {
  date: string;
  slotKey: RoutineKey;
  category: string;
  createdAt: string;
  updatedAt: string;
}
export const ROUTINE_CATEGORIES = ["英语", "实验", "开发", "文献", "写作", "课程"];
export const ROUTINE_COLORS: Record<string, string> = {
  英语: "indigo", 实验: "pine", 开发: "ochre", 文献: "sandalfig", 写作: "rouge", 课程: "cinnabar",
};
export function validateRoutine(date: string, slotKey?: string, category?: string): void {
  const d = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== date)
    throw new Error("日期无效");
  if (slotKey !== undefined && !ROUTINE_SLOTS.some((s) => s.key === slotKey)) throw new Error("时间块无效");
  if (category !== undefined && (!category.trim() || Array.from(category.trim()).length > 20))
    throw new Error("类别须为 1–20 个字符");
}
export function routineGeometry(start: number, end: number, hourHeight: number) {
  return { top: start / 60 * hourHeight, height: (end - start) / 60 * hourHeight };
}
export function clockLabel(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}
