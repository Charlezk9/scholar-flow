import { colorMeta } from "../lib/api";

export {
  DAY_MS,
  HOUR_MS,
  MIN_MS,
  clockText,
  progressOf,
  remainingOf,
  type Remaining,
} from "../lib/remaining";

export function ColorDot({
  color,
  size,
}: {
  color: string | null;
  size?: "lg";
}) {
  const meta = colorMeta(color);
  return (
    <span
      className={size === "lg" ? "dot dot-lg" : "dot"}
      style={{ background: meta.dot }}
      title={`颜色标签：${meta.label}`}
    />
  );
}
