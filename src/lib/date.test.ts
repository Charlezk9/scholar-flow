/**
 * 日期格式化单测（v1.1 · UI-22：周范围标题的长/短两种格式）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatFullDate, formatWeekRange } from "./date.ts";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);

test("周标题默认不显示年份（同年同月）", () => {
  assert.equal(formatWeekRange([d(2026, 10, 5), d(2026, 10, 11)]), "10 月 5 日 – 11 日");
});

test("周标题默认不显示年份（同年跨月）", () => {
  assert.equal(formatWeekRange([d(2026, 9, 28), d(2026, 10, 4)]), "9 月 28 日 – 10 月 4 日");
});

test("跨年时必须补年份（否则看起来像同一周）", () => {
  assert.equal(
    formatWeekRange([d(2026, 12, 28), d(2027, 1, 3)]),
    "2026 年 12 月 28 日 – 2027 年 1 月 3 日",
  );
});

test("full 格式保留年份（给 title 提示用）", () => {
  assert.equal(
    formatWeekRange([d(2026, 10, 5), d(2026, 10, 11)], "full"),
    "2026 年 10 月 5 日 – 2026 年 10 月 11 日",
  );
});

test("日视图标题可以不带年份", () => {
  assert.equal(formatFullDate(d(2026, 10, 2), false), "10 月 2 日 星期五");
  assert.equal(formatFullDate(d(2026, 10, 2)), "2026 年 10 月 2 日 星期五");
});

test("短格式：同年省掉年份", () => {
  assert.equal(formatWeekRange([d(2026, 10, 5), d(2026, 10, 11)], "short"), "10/5 – 10/11");
});

test("短格式：跨年补上年份（否则 12/28 – 1/3 看起来像同一年）", () => {
  assert.equal(
    formatWeekRange([d(2026, 12, 28), d(2027, 1, 3)], "short"),
    "2026/12/28 – 2027/1/3",
  );
});

test("三种粒度依次变短：short < long < full（标题降档的三级刹车）", () => {
  const days = [d(2026, 10, 5), d(2026, 10, 11)];
  const short = formatWeekRange(days, "short");
  const long = formatWeekRange(days, "long");
  const full = formatWeekRange(days, "full");
  assert.ok(short.length < long.length, `${short} 应该比 ${long} 短`);
  assert.ok(long.length < full.length, `${long} 应该比 ${full} 短`);
  assert.ok(!long.includes("年"), `默认标题不该带年份：${long}`);
});

test("空数组返回空串", () => {
  assert.equal(formatWeekRange([]), "");
  assert.equal(formatWeekRange([], "short"), "");
});
