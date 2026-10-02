import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BASE_HOUR_H,
  BASE_WHEEL_H,
  FONT_SIZES,
  fontScaleOf,
  fontSizeLabel,
  fs,
  hourHeight,
  isFontSizeKey,
  wheelHeight,
} from "./fontScale.ts";

test("档位按字号单调递增", () => {
  const scales = FONT_SIZES.map((f) => f.scale);
  for (let i = 1; i < scales.length; i += 1) {
    assert.ok(scales[i] > scales[i - 1], `第 ${i} 档没有变大：${scales}`);
  }
});

test("标准档正好是 1.0（不放大也不缩小）", () => {
  assert.equal(fontScaleOf("md"), 1);
});

test("四档都在合理区间内（不能小到看不清，也不能大到撑爆布局）", () => {
  for (const f of FONT_SIZES) {
    assert.ok(f.scale >= 0.85 && f.scale <= 1.5, `${f.key}=${f.scale} 超出安全区间`);
  }
});

test("hourHeight 与 CSS 基准值 44px 同源", () => {
  assert.equal(BASE_HOUR_H, 44);
  assert.equal(hourHeight("md"), 44);
  assert.equal(hourHeight("xl"), Math.round(44 * 1.3));
});

test("wheelHeight 与 CSS 基准值 32px 同源", () => {
  assert.equal(BASE_WHEEL_H, 32);
  assert.equal(wheelHeight("md"), 32);
  assert.equal(wheelHeight("xl"), Math.round(32 * 1.3));
});

test("行高始终是整数（小数会与 CSS 产生累积偏差）", () => {
  for (const f of FONT_SIZES) {
    assert.ok(Number.isInteger(hourHeight(f.key)), `${f.key} hourHeight 非整数`);
    assert.ok(Number.isInteger(wheelHeight(f.key)), `${f.key} wheelHeight 非整数`);
  }
});

test("时间轴行高随档位单调递增（大字必须配更高的行）", () => {
  const hs = FONT_SIZES.map((f) => hourHeight(f.key));
  for (let i = 1; i < hs.length; i += 1) {
    assert.ok(hs[i] > hs[i - 1], `行高没有递增：${hs}`);
  }
});

test("fs() 产出随缩放变化的表达式，而不是固定像素", () => {
  assert.equal(fs(13), "calc(13px * var(--font-scale))");
  assert.equal(fs(11.5), "calc(11.5px * var(--font-scale))");
  assert.ok(fs(13).includes("var(--font-scale)"));
  assert.ok(!/^[0-9.]+px$/.test(fs(13)));
});

test("非法值安全回退，不抛异常", () => {
  assert.equal(isFontSizeKey("md"), true);
  assert.equal(isFontSizeKey("huge"), false);
  assert.equal(isFontSizeKey(undefined), false);
  assert.equal(fontScaleOf("nope" as never), 1);
  assert.equal(fontSizeLabel("nope" as never), "标准");
});

test("每档都有中文标签与提示", () => {
  for (const f of FONT_SIZES) {
    assert.ok(f.label.length > 0, `${f.key} 缺 label`);
    assert.ok(f.hint.length > 0, `${f.key} 缺 hint`);
  }
});
