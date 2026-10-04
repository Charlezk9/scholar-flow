import { useEffect, useState } from "react";
import { MapPin, Trash2, X } from "lucide-react";
import {
  EVENT_COLORS,
  colorMeta,
  type CalEvent,
  type EventColor,
} from "../lib/api";
import { toISO, today } from "../lib/date";
import { confirmThen, useStore } from "../store/useStore";
import { DatePicker, TimePicker } from "./pickers";

export default function EventDrawer() {
  const draft = useStore((s) => s.eventDraft);
  const close = useStore((s) => s.openEventDraft);
  const saveEvent = useStore((s) => s.saveEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const duplicateEvent = useStore((s) => s.duplicateEvent);

  const [f, setF] = useState({
    title: "",
    startDate: toISO(today()),
    endDate: toISO(today()),
    allDay: true,
    startTime: "09:00",
    endTime: "10:00",
    note: "",
    location: "",
    color: "indigo" as EventColor,
    remindMinutes: 15,
  });
  useEffect(() => {
    if (!draft) return;
    setF({
      title: draft.title ?? "",
      startDate: draft.startDate ?? toISO(today()),
      endDate: draft.endDate ?? draft.startDate ?? toISO(today()),
      allDay: draft.allDay ?? true,
      startTime: draft.startTime ?? "09:00",
      endTime: draft.endTime ?? "10:00",
      note: draft.note ?? "",
      location: draft.location ?? "",
      color: (draft.color as EventColor) ?? "indigo",
      remindMinutes: draft.remindMinutes ?? 15,
    });
  }, [draft]);

  if (!draft) return null;

  const isNew = !draft.id;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!f.title.trim()) return;
    void saveEvent({
      id: draft.id ?? null,
      title: f.title.trim(),
      startDate: f.startDate,
      endDate: f.endDate || f.startDate,
      allDay: f.allDay,
      startTime: f.allDay ? null : f.startTime,
      endTime: f.allDay ? null : f.endTime,
      note: f.note.trim() || null,
      location: f.location.trim() || null,
      color: f.color,
      remindMinutes: f.remindMinutes,
      repeatRule: draft.repeatRule ?? null,
      repeatUntil: draft.repeatUntil ?? null,
    });
  };

  return (
    <>
      <div className="mask" onClick={() => close(null)} />
      <aside className="drawer" role="dialog" aria-label={isNew ? "新建事件" : "编辑事件"}>
        <div className="drawer-head">
          <h2>{isNew ? "新建事件" : "编辑事件"}</h2>
          <button className="drawer-close" onClick={() => close(null)} title="关闭">
            <X size={17} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="form-row">
            <label className="form-label">
              标题<span className="req">*</span>
            </label>
            <input
              className="field"
              autoFocus
              maxLength={80}
              placeholder="这件事叫什么？"
              value={f.title}
              onChange={(e) => set("title", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
              }}
            />
          </div>

          <div className="form-2">
            <div className="form-row">
              <label className="form-label">
                开始日期<span className="req">*</span>
              </label>
              <DatePicker
                value={f.startDate}
                onChange={(v) => {
                  set("startDate", v);
                  if (f.endDate < v) set("endDate", v);
                }}
              />
            </div>
            <div className="form-row">
              <label className="form-label">
                结束日期
                <span className="hint">同一天即单日事件</span>
              </label>
              <DatePicker
                value={f.endDate || f.startDate}
                onChange={(v) => set("endDate", v < f.startDate ? f.startDate : v)}
              />
            </div>
          </div>

          <div className="card-row switch-row" style={{ padding: "4px 0" }}>
            <span className="txt">
              <span className="name">全天</span>
              <span className="sub">开启后将不设置具体时间</span>
            </span>
            <button
              className={`switch ${f.allDay ? "is-on" : ""}`}
              onClick={() => set("allDay", !f.allDay)}
              title="切换全天"
            />
          </div>

          {!f.allDay ? (
            <div className="form-2">
              <div className="form-row">
                <label className="form-label">开始时间</label>
                <TimePicker
                  value={f.startTime}
                  onChange={(v) => set("startTime", v || f.startTime)}
                  allowClear={false}
                  prefix=""
                  placeholder="选择开始时间"
                />
              </div>
              <div className="form-row">
                <label className="form-label">结束时间</label>
                <TimePicker
                  value={f.endTime}
                  onChange={(v) => set("endTime", v || f.endTime)}
                  allowClear={false}
                  prefix=""
                  placeholder="选择结束时间"
                />
              </div>
            </div>
          ) : null}

          <div className="form-row">
            <label className="form-label">事件颜色</label>
            <div className="swatches">
              {EVENT_COLORS.map((k) => (
                <button
                  key={k}
                  className={`swatch ${f.color === k ? "is-on" : ""}`}
                  style={{ background: colorMeta(k).dot }}
                  title={colorMeta(k).label}
                  onClick={() => set("color", k)}
                />
              ))}
            </div>
          </div>

          <div className="form-row">
            <label className="form-label">地点</label>
            <label className="picker">
              <MapPin size={14} />
              <input
                className="field"
                style={{
                  position: "static",
                  padding: 0,
                  height: 20,
                  border: "none",
                  background: "none",
                  boxShadow: "none",
                }}
                placeholder="可选"
                value={f.location}
                maxLength={80}
                onChange={(e) => set("location", e.target.value)}
              />
            </label>
          </div>

          <div className="form-row">
            <label className="form-label">备注</label>
            <textarea
              className="field"
              rows={4}
              maxLength={500}
              placeholder="想补充点什么…"
              value={f.note}
              onChange={(e) => set("note", e.target.value)}
            />
            <div className="counter">{f.note.length}/500</div>
          </div>
        </div>

        <div className="drawer-foot">
          {!isNew ? (
            <button
              className="btn btn-outline"
              style={{ color: "var(--cinnabar)", borderColor: "var(--cinnabar-soft)" }}
              onClick={() =>
                void confirmThen({
                  title: "删除事件",
                  message: `确定删除「${f.title || "未命名"}」？删除后无法恢复。`,
                  confirmLabel: "删除",
                  onConfirm: () => deleteEvent(draft.id!),
                })
              }
            >
              <Trash2 size={14} />
              删除
            </button>
          ) : null}
          {!isNew ? (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => void duplicateEvent(draft as CalEvent)}
              title="复制一份"
            >
              复制
            </button>
          ) : null}
          <button
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
