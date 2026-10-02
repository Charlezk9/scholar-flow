import assert from "node:assert/strict";
import { test } from "node:test";
import { ROUTINE_SLOTS, validateRoutine, routineGeometry, clockLabel } from "./routine.ts";

test("每天四个固定时段，起止逐分对应需求", () => {
  assert.deepEqual(ROUTINE_SLOTS.map((s) => `${clockLabel(s.start)}–${clockLabel(s.end)}`), ["08:30–10:00", "10:15–12:00", "14:30–16:30", "19:00–20:30"]);
  assert.equal(new Set(ROUTINE_SLOTS.map((s) => s.key)).size, 4);
});
test("块高度与共享时间轴一致，包含 15 分钟刻度和字号缩放", () => {
  for (const h of [40, 44, 51, 57]) {
    const block = routineGeometry(615, 720, h);
    assert.equal(block.top, 10.25 * h);
    assert.equal(block.height, 1.75 * h);
    assert.equal(block.top + block.height, 12 * h);
  }
});
test("日常类别支持自定义及 Unicode，拒绝非法日期、slotKey、空串及超长类别", () => {
  validateRoutine("2028-02-29", "evening", "😀".repeat(20));
  validateRoutine("2026-10-02", "morning_1", "我的新类别");
  for (const date of ["2026-02-30", "2025-02-29", "2026-2-02", "bad"]) assert.throws(() => validateRoutine(date));
  assert.throws(() => validateRoutine("2026-10-02", "other"));
  for (const c of ["   ", "类".repeat(21)]) assert.throws(() => validateRoutine("2026-10-02", "evening", c));
});
