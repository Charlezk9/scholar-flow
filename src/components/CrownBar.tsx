import { Crown } from "lucide-react";
import { useNow } from "../lib/tick";
import { useStore } from "../store/useStore";
import { clockText, remainingOf, type Remaining } from "./countdownShared";

/** 「剩余 12 天 05:32:11」/「已过去 3 天 02:11:05」/ 不足一天时只剩时钟 */
export function crownText(r: Remaining): string {
  const lead = r.past ? "已过去" : "剩余";
  const days = r.days > 0 ? `${r.days} 天 ` : "";
  return `${lead} ${days}${clockText(r)}`;
}

/** 当前戴皇冠的那一条（没有则 null） */
export function useCrown() {
  return useStore((s) => s.countdowns.find((c) => c.crowned && !c.archived) ?? null);
}

/**
 * 皇冠栏 —— 标题栏下方一整行。
 * 只显示最重要那条倒计时的 **标题 + 倒计时**，不放日期、进度、备注等细节。
 * v1.1（UI-14）：图标 + 标题 + 倒计时作为一组**整体水平居中**；
 * 「取消皇冠」按钮绝对定位在右端，不参与居中（否则它的宽度会把内容组推偏）。
 *
 * 没设皇冠、或设置里关掉了这一栏时，整行不渲染（不留空白）。
 */
export default function CrownBar() {
  const show = useStore((s) => s.settings.showCrownBar);
  const crown = useCrown();
  const openDraft = useStore((s) => s.openCountdownDraft);
  const setCrown = useStore((s) => s.setCrown);

  const nowMs = useNow();

  if (!show || !crown) return null;

  const r = remainingOf(crown, nowMs);
  const txt = crownText(r);

  return (
    <div
      className={`crown-bar ${r.past ? "is-past" : ""} ${r.isToday ? "is-today" : ""}`}
      data-crown-id={crown.id}
    >
      <span className="crown-main">
        <span className="crown-ic" aria-hidden>
          <Crown size={14} />
        </span>

        <button
          className="crown-title"
          onClick={() => openDraft(crown)}
          title="编辑这条倒计时"
        >
          {crown.title}
        </button>

        <span className="crown-time" title={`${crown.title} · ${txt}`}>
          {txt}
        </span>
      </span>

      <button
        className="crown-off"
        title="取消皇冠"
        aria-label="取消皇冠"
        onClick={() => void setCrown(null)}
      >
        <Crown size={13} />
      </button>
    </div>
  );
}
