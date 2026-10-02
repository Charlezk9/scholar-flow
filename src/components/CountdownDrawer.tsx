/**
 * 倒计时编辑抽屉（v1.1 · UI-16 / UI-17）。
 *
 * 为什么把编辑从卡片里搬出来：卡片点击已经让给「展开里程碑」，
 * 而编辑是低频、9 个字段的表单 —— 塞在 372px 的窄栏里本来就挤，
 * 事件编辑已经证明抽屉更合适。搬走之后卡片回归「看清倒计时 + 一件件划掉里程碑」。
 *
 * 复用事件抽屉的全部视觉语言（`.drawer` / `.form-row` / `.picker` / `.swatch`），
 * 只是关闭按钮按 Q8 移到**左上角**。
 */
import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  EVENT_COLORS,
  colorMeta,
  type Countdown,
  type EventColor,
} from "../lib/api";
import { toISO, today } from "../lib/date";
import { fs } from "../lib/fontScale";
import { confirmThen, useStore } from "../store/useStore";
import { DatePicker, TimePicker } from "./pickers";

export default function CountdownDrawer() {
  const draft = useStore((s) => s.countdownDraft);
  const close = useStore((s) => s.openCountdownDraft);
  const saveCountdown = useStore((s) => s.saveCountdown);
  const deleteCountdown = useStore((s) => s.deleteCountdown);
  const milestones = useStore((s) => s.milestones);

  const [f, setF] = useState({
    title: "",
    targetDate: toISO(today()),
    targetTime: "",
    startDate: "",
    note: "",
    color: "cinnabar" as EventColor,
    pinned: false,
    showOnCalendar: true,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  useEffect(() => {
    if (!draft) return;
    setF({
      title: draft.title ?? "",
      targetDate: draft.targetDate ?? toISO(today()),
      targetTime: draft.targetTime ?? "",
      startDate: draft.startDate ?? "",
      note: draft.note ?? "",
      color: (draft.color ?? "cinnabar") as EventColor,
      pinned: Boolean(draft.pinned),
      showOnCalendar: draft.showOnCalendar ?? true,
    });
  }, [draft]);

  if (!draft) return null;

  const isNew = !draft.id;
  const base = draft as Partial<Countdown>;
  const msCount = draft.id
    ? milestones.filter((m) => m.countdownId === draft.id).length
    : 0;

  const submit = () => {
    if (!f.title.trim()) return;
    void saveCountdown({
      id: draft.id ?? null,
      title: f.title.trim(),
      targetDate: f.targetDate,
      targetTime: f.targetTime || null,
      startDate: f.startDate || null,
      note: f.note.trim() || null,
      color: f.color,
      pinned: f.pinned,
      showOnCalendar: f.showOnCalendar,
      archived: base.archived ?? false,
      repeatRule: base.repeatRule ?? null,
    });
  };

  return (
    <>
      <div className="mask" onClick={() => close(null)} />
      <aside
        className="drawer"
        role="dialog"
        aria-label={isNew ? "新建倒计时" : "编辑倒计时"}
      >
        <div className="drawer-head">
          {/* Q8：关闭按钮统一在左上角（事件抽屉同步） */}
          <button
            className="drawer-close"
            onClick={() => close(null)}
            title="关闭"
            aria-label="关闭"
          >
            <X size={17} />
          </button>
          <h2>{isNew ? "新建倒计时" : "编辑倒计时"}</h2>
        </div>

        <div className="drawer-body">
          <div className="form-row">
            <label className="form-label">
              标题<span className="req">*</span>
            </label>
            <input
              className="field"
              autoFocus
              maxLength={60}
              placeholder="这件事叫什么？如：期末考试"
              value={f.title}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              onChange={(e) => set("title", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
              }}
            />
          </div>

          <div className="form-2">
            <div className="form-row">
              <label className="form-label">
                目标日期<span className="req">*</span>
              </label>
              <DatePicker value={f.targetDate} onChange={(v) => set("targetDate", v)} />
            </div>
            <div className="form-row">
              <label className="form-label">
                目标时间<span className="hint">留空 = 全天</span>
              </label>
              <TimePicker value={f.targetTime} onChange={(v) => set("targetTime", v)} />
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">
              起始日期<span className="hint">可选，用于进度条</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ flex: 1 }}>
                <DatePicker
                  value={f.startDate}
                  onChange={(v) => set("startDate", v)}
                  placeholder="起始日期（可选）"
                />
              </span>
              {f.startDate ? (
                <button
                  type="button"
                  className="icon-btn"
                  title="清除起始日期"
                  aria-label="清除起始日期"
                  onClick={() => set("startDate", "")}
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="form-row">
            <div className="form-label" style={{ marginBottom: 6 }}>
              颜色标签
            </div>
            <div className="swatches" style={{ gap: 10 }}>
              {EVENT_COLORS.map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`swatch ${f.color === k ? "is-on" : ""}`}
                  style={{ background: colorMeta(k).dot }}
                  title={colorMeta(k).label}
                  aria-label={`颜色：${colorMeta(k).label}`}
                  onClick={() => set("color", k)}
                />
              ))}
            </div>
          </div>

          <button
            type="button"
            className="card-row switch-row"
            style={{ borderTop: "none", padding: "2px 0", width: "100%", textAlign: "left" }}
            onClick={() => set("pinned", !f.pinned)}
          >
            <span className={`switch ${f.pinned ? "is-on" : ""}`} />
            <span className="txt">
              <span className="name" style={{ fontSize: fs(13) }}>
                置顶
              </span>
              <span className="sub">固定在列表最上方</span>
            </span>
          </button>

          <button
            type="button"
            className="card-row switch-row"
            style={{
              borderTop: "1px solid var(--line-soft)",
              padding: "8px 0 2px",
              width: "100%",
              textAlign: "left",
            }}
            onClick={() => set("showOnCalendar", !f.showOnCalendar)}
          >
            <span className={`switch ${f.showOnCalendar ? "is-on" : ""}`} />
            <span className="txt">
              <span className="name" style={{ fontSize: fs(13) }}>
                在日历中显示
              </span>
              <span className="sub">目标日会标上朱砂「倒」角标</span>
            </span>
          </button>

          <div className="form-row" style={{ marginTop: 4 }}>
            <label className="form-label">备注</label>
            <textarea
              className="field"
              rows={3}
              maxLength={500}
              placeholder="可选"
              value={f.note}
              spellCheck={false}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>

          {!isNew && msCount > 0 ? (
            <p className="drawer-note">
              这条倒计时下有 <b>{msCount}</b> 个里程碑，在卡片内直接勾选与增删。
            </p>
          ) : null}
        </div>

        <div className="drawer-foot">
          {!isNew ? (
            <button
              type="button"
              className="btn btn-outline"
              style={{ color: "var(--cinnabar)", borderColor: "var(--cinnabar-soft)" }}
              title="删除这条倒计时"
              onClick={() =>
                void confirmThen({
                  title: "删除倒计时",
                  message:
                    msCount > 0
                      ? `确定删除「${f.title || "未命名"}」？它下面的 ${msCount} 个里程碑会一并删除，且无法恢复。`
                      : `确定删除「${f.title || "未命名"}」？删除后无法恢复。`,
                  confirmLabel: "删除",
                  onConfirm: () => deleteCountdown(draft.id!),
                })
              }
            >
              <Trash2 size={14} />
              删除
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => close(null)}
          >
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary btn-save"
            disabled={!f.title.trim()}
            onClick={submit}
          >
            保存
          </button>
        </div>
      </aside>
    </>
  );
}
