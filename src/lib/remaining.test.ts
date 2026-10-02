/**
 * 倒计时纯计算测试。
 * 运行：node --test src/lib/remaining.test.ts
 * （Node 22.6+ 支持直接执行 TypeScript，需 --experimental-strip-types 或默认开启）
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { clockText, progressOf, remainingOf } from "./remaining.ts";

const at = (s: string) => new Date(s).getTime();

test("剩余的秒真的会走", () => {
  const c = { targetDate: "2026-06-07", targetTime: "09:00" };
  const a = remainingOf(c, at("2026-06-07T08:00:00"));
  const b = remainingOf(c, at("2026-06-07T08:00:01"));
  assert.equal(a.diffMs - b.diffMs, 1000);
  assert.equal(clockText(a), "01:00:00");
  assert.equal(clockText(b), "00:59:59");
  assert.equal(a.past, false);
  assert.equal(b.past, false);
});

test("天 + 时钟同时正确", () => {
  const r = remainingOf(
    { targetDate: "2026-06-10", targetTime: "14:30" },
    at("2026-06-07T09:15:20"),
  );
  assert.equal(r.days, 3);
  assert.equal(r.hours, 5);
  assert.equal(r.minutes, 14);
  assert.equal(r.seconds, 40);
  assert.equal(clockText(r), "05:14:40");
});

test("到点即过期，边界是 <= 0", () => {
  const c = { targetDate: "2026-06-07", targetTime: "09:00" };
  assert.equal(remainingOf(c, at("2026-06-07T08:59:59")).past, false);
  assert.equal(remainingOf(c, at("2026-06-07T09:00:00")).past, true);
  assert.equal(remainingOf(c, at("2026-06-07T09:00:01")).past, true);
});

test("已过时的拆解取绝对值", () => {
  const r = remainingOf(
    { targetDate: "2026-06-07", targetTime: "09:00" },
    at("2026-06-08T10:00:30"),
  );
  assert.equal(r.past, true);
  assert.equal(r.days, 1);
  assert.equal(r.hours, 1);
  assert.equal(r.minutes, 0);
  assert.equal(r.seconds, 30);
});

test("全天 = 当天 23:59:59，当天不会在 00:00 就变已过", () => {
  const c = { targetDate: "2026-06-07", targetTime: null };
  assert.equal(remainingOf(c, at("2026-06-07T00:00:00")).past, false);
  assert.equal(remainingOf(c, at("2026-06-07T12:00:00")).isToday, true);
  assert.equal(remainingOf(c, at("2026-06-07T23:59:59")).past, false);
  // 次日才过期
  assert.equal(remainingOf(c, at("2026-06-08T00:00:00")).past, true);
});

test("全天跨天只显示天数，且 isToday 为假", () => {
  const r = remainingOf(
    { targetDate: "2026-06-07", targetTime: null },
    at("2026-06-05T10:00:00"),
  );
  assert.equal(r.hasTime, false);
  assert.equal(r.days, 2);
  assert.equal(r.isToday, false);
});

test("秒跨分钟、分钟跨小时、小时跨天都进位正确", () => {
  const t = at("2026-06-07T00:00:00");
  const r = remainingOf({ targetDate: "2026-06-08", targetTime: "00:00" }, t);
  assert.equal(r.days, 1);
  assert.equal(r.hours, 0);
  assert.equal(r.minutes, 0);
  assert.equal(r.seconds, 0);

  const r2 = remainingOf({ targetDate: "2026-06-07", targetTime: "23:59" }, t);
  assert.equal(r2.days, 0);
  assert.equal(r2.hours, 23);
  assert.equal(r2.minutes, 59);
  assert.equal(r2.seconds, 0);

  // 目标时间不含秒时，秒由「当前时刻的秒」补齐：00:00:01 → 还剩 23:58:59
  const r3 = remainingOf(
    { targetDate: "2026-06-07", targetTime: "23:59" },
    at("2026-06-07T00:00:01"),
  );
  assert.equal(r3.hours, 23);
  assert.equal(r3.minutes, 58);
  assert.equal(r3.seconds, 59);
});

test("永远不出现负数或 60 以上的分量", () => {
  for (let i = 0; i < 400; i += 7) {
    const r = remainingOf(
      { targetDate: "2026-06-07", targetTime: "09:00" },
      at("2026-06-07T09:00:00") + i * 997,
    );
    assert.ok(r.hours >= 0 && r.hours < 24, `hours=${r.hours}`);
    assert.ok(r.minutes >= 0 && r.minutes < 60, `minutes=${r.minutes}`);
    assert.ok(r.seconds >= 0 && r.seconds < 60, `seconds=${r.seconds}`);
  }
});

test("非法日期返回安全空值，不抛异常", () => {
  const r = remainingOf({ targetDate: "", targetTime: null }, Date.now());
  assert.equal(r.diffMs, 0);
  assert.equal(r.past, false);
  assert.equal(r.days, 0);
});

test("clockText 恒定两位（宽度不抖）", () => {
  assert.equal(clockText({ hours: 0, minutes: 0, seconds: 0 }), "00:00:00");
  assert.equal(clockText({ hours: 5, minutes: 9, seconds: 3 }), "05:09:03");
  assert.equal(clockText({ hours: 23, minutes: 59, seconds: 59 }), "23:59:59");
});

test("进度条 0 → 100，边界不外溢", () => {
  const c = { startDate: "2026-06-01", targetDate: "2026-06-11" };
  assert.equal(progressOf(c, at("2026-06-01T00:00:00")), 0);
  // 总跨度 06-01 00:00 → 06-11 23:59:59，已过 5.5 天 / 约 10.999 天 ≈ 50%
  assert.equal(progressOf(c, at("2026-06-06T12:00:00")), 50);
  assert.equal(progressOf(c, at("2026-06-20T00:00:00")), 100);
  assert.equal(progressOf({ startDate: null, targetDate: "2026-06-11" }), null);
});
