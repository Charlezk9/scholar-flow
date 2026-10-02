import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { api, colorMeta } from "../lib/api";
import { ROUTINE_SLOTS, ROUTINE_CATEGORIES, ROUTINE_COLORS, routineGeometry, clockLabel, type RoutineSlot, type RoutineKey } from "../domain/routine";
import { useDialogFocus } from "../lib/dialogFocus";
import Portal from "./Portal";

/** key=date 保证切日卸载旧编辑器；查询响应还需取消，不能串到下一天。 */
export default function RoutineColumn({ date, hourHeight, isToday, nowTop }: {
  date: string; hourHeight: number; isToday: boolean; nowTop: number;
}) {
  const [slots, setSlots] = useState<RoutineSlot[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<{ key: RoutineKey; category: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    alive.current = true;
    let active = true;
    setReady(false); setError("");
    api.listRoutineSlots(date).then((rows) => { if (active) { setSlots(rows); setReady(true); } })
      .catch((e) => { if (active) setError(String(e)); });
    return () => { active = false; alive.current = false; };
  }, [date, retry]);
  useEffect(() => {
    if (!draft) return;
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) { e.stopPropagation(); setDraft(null); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [draft, busy]);
  const commit = async (clear = false) => {
    if (!draft || busy) return;
    setBusy(true); setError("");
    try {
      if (clear) await api.clearRoutineSlot(date, draft.key);
      else await api.saveRoutineSlot(date, draft.key, draft.category);
      const rows = await api.listRoutineSlots(date);
      if (alive.current) { setSlots(rows); setDraft(null); }
    } catch (e) { if (alive.current) setError(String(e)); }
    finally { if (alive.current) setBusy(false); }
  };
  const dialogRef = useDialogFocus(!!draft);
  const chosen = ROUTINE_SLOTS.find((s) => s.key === draft?.key);
  return <div className={`tg-col routine-col ${isToday ? "is-today" : ""}`} aria-label="日常安排">
    {Array.from({ length: 24 }, (_, h) => <div className="hline" key={h} />)}
    {isToday ? <div className="tg-now" style={{ top: nowTop }} /> : null}
    {!ready ? <div className="routine-status" role="status">{error || "正在读取安排…"}
      {error ? <button className="ag-add-action" onClick={() => setRetry((n) => n + 1)}>重试</button> : null}</div> : null}
    {ROUTINE_SLOTS.map((slot) => {
      const saved = slots.find((s) => s.slotKey === slot.key);
      const meta = colorMeta(saved ? (ROUTINE_COLORS[saved.category] ?? "smoke") : "smoke");
      const range = `${clockLabel(slot.start)}–${clockLabel(slot.end)}`;
      return <button key={slot.key} className={`routine-block ${saved ? "is-filled" : "is-empty"}`}
        data-slot={slot.key} disabled={!ready} title={`${range} · ${saved?.category ?? "添加类别"}`}
        aria-label={`${range}，${saved?.category ?? "添加类别"}`} style={{ ...routineGeometry(slot.start, slot.end, hourHeight),
          background: saved ? meta.fill : undefined, borderColor: saved ? meta.line : undefined, color: saved ? meta.text : undefined }}
        onClick={() => { setError(""); setDraft({ key: slot.key, category: saved?.category ?? "" }); }}>
        {saved ? <span className="routine-category">{saved.category}</span> : <span className="routine-add"><Plus size={13} /><span>添加类别</span></span>}
      </button>;
    })}
    {draft && chosen ? <Portal>
      <div className="mask mask-soft" onClick={() => { if (!busy) setDraft(null); }} />
      <section ref={dialogRef} className="pop routine-pop" role="dialog" aria-modal="true" aria-label="编辑日常类别">
        <div className="pop-head"><span className="pop-title">日常安排</span>
          <button className="icon-btn" disabled={busy} aria-label="关闭类别编辑" onClick={() => setDraft(null)}><X size={14} /></button></div>
        <p className="routine-pop-caption">{date} · {clockLabel(chosen.start)}–{clockLabel(chosen.end)}</p>
        <div className="routine-options">{ROUTINE_CATEGORIES.map((c) => <button className="btn btn-outline btn-sm" key={c} disabled={busy}
          aria-pressed={draft.category === c} onClick={() => setDraft({ ...draft, category: c })}>{c}</button>)}</div>
        <label className="routine-label">类别（可自定义）<input className="field" aria-label="自定义类别" autoFocus value={draft.category} maxLength={40} disabled={busy}
          placeholder="填写类别，例如英语" onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && draft.category.trim()) void commit(); }} /></label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="routine-pop-actions">
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => void commit(true)}>清空类别</button>
          <button className="btn btn-primary btn-sm" disabled={busy || !draft.category.trim()} onClick={() => void commit()}>{busy ? "保存中…" : "保存类别"}</button>
        </div>
      </section>
    </Portal> : null}
  </div>;
}
