/**
 * 字号档位。
 *
 * 设计原则：**只放大文字，并让「必须跟着长」的容器一起长。**
 *  - 全部 `font-size` 写成 `calc(Npx * var(--font-scale))`
 *  - 承载文字的固定高度一律改 `min-height`，元素自己长高而不是裁掉文字
 *  - 顶栏高 / 左栏宽 / 抽屉宽 / 月视图行高 / 时间轴行高随字号温和变化
 *  - 间距 token（--sp-*）刻意不缩放，避免整体位移感
 *
 * 时间轴行高与滚轮格高由 JS 计算并写回 CSS 变量，
 * 保证 CSS 布局与 JS 里的像素运算**完全一致**（否则会出现累积偏差）。
 */

export const FONT_SIZES = [
  { key: "sm", label: "小", hint: "更多信息量", scale: 0.9 },
  { key: "md", label: "标准", hint: "默认", scale: 1 },
  { key: "lg", label: "大", hint: "更易读", scale: 1.15 },
  { key: "xl", label: "特大", hint: "低视力友好", scale: 1.3 },
] as const;

export type FontSizeKey = (typeof FONT_SIZES)[number]["key"];

export const FONT_SIZE_KEYS: FontSizeKey[] = FONT_SIZES.map((f) => f.key);

export const DEFAULT_FONT_SIZE: FontSizeKey = "md";

const SCALE_MAP: Record<FontSizeKey, number> = FONT_SIZES.reduce(
  (acc, f) => {
    acc[f.key] = f.scale;
    return acc;
  },
  {} as Record<FontSizeKey, number>,
);

export function isFontSizeKey(v: unknown): v is FontSizeKey {
  return typeof v === "string" && v in SCALE_MAP;
}

export function fontScaleOf(key: FontSizeKey): number {
  return SCALE_MAP[key] ?? 1;
}

export function fontSizeLabel(key: FontSizeKey): string {
  return FONT_SIZES.find((f) => f.key === key)?.label ?? "标准";
}

/**
 * 内联样式用：把像素字号换算成随缩放变化的 CSS 表达式。
 * 组件里**不要**写裸 `fontSize: 13`，否则这一处不会跟着字号变。
 */
export const fs = (px: number): string => `calc(${px}px * var(--font-scale))`;

/** 时间轴基础行高（css 里 --hour-h 的基准值） */
export const BASE_HOUR_H = 44;
/** 滚轮单格基础高（css 里 --wheel-h 的基准值） */
export const BASE_WHEEL_H = 32;

/** 时间轴每小时行高，CSS 与 JS 必须用同一个值 */
export function hourHeight(key: FontSizeKey): number {
  return Math.round(BASE_HOUR_H * fontScaleOf(key));
}

/** 滚轮单格高 */
export function wheelHeight(key: FontSizeKey): number {
  return Math.round(BASE_WHEEL_H * fontScaleOf(key));
}
