/**
 * 议程页（v1.3）—— **没有日期的便签与待办**。
 *
 * 定义：一件事要做、但还没决定哪天做 → 放这里（一个标题 + 若干子项，类似 TODO）。
 * 什么时候做已经定了的事 → 那是日历事件，不是议程事项。
 * 唯一的出口是「安排到某天」：建全天事件 + 事项移入已完成（单向，无同步问题）。
 *
 * 见 docs/v1/PLAN-v1.3.md。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  ArrowRightLeft,
  CalendarDays,
  ChevronDown,
  Copy,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { AgendaItem } from "../lib/api";
import { toISO, today } from "../lib/date";
import { agendaProgress, sortAgendaItems, subitemsOf } from "../domain/agenda";
import { useStore, confirmThen } from "../store/useStore";
import Checklist from "./Checklist";
import Collapse from "./Collapse";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { useDialogFocus } from "../lib/dialogFocus";
import Portal from "./Portal";
import { DatePicker } from "./pickers";

/* ============================================================ 事项卡片 */

function ItemCard({ item, onMenu }: {
  item: AgendaItem;
  onMenu: (x: number, y: number, item: AgendaItem) => void;
}) {
  const subs = useStore((s) => s.agendaSubitems);
  const expanded = useStore((s) => s.agendaExpandedIds.includes(item.id));
  const toggleExpanded = useStore((s) => s.toggleAgendaExpanded);
  const addSub = useStore((s) => s.saveAgendaSubitem);
  const toggleSub = useStore((s) => s.toggleAgendaSubitem);
  const renameSub = useStore((s) => s.renameAgendaSubitem);
  const delSub = useStore((s) => s.deleteAgendaSubitem);
  const renameItem = useStore((s) => s.renameAgendaItem);
  const noteDraft = useStore((s) => s.agendaNoteDrafts[item.id]);
  const setNoteDraft = useStore((s) => s.setAgendaNoteDraft);
  const saveNote = useStore((s) => s.saveAgendaNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [focusAdd, setFocusAdd] = useState(false);
  const mine = useMemo(() => subitemsOf(subs, item.id), [subs, item.id]);
  const progress = agendaProgress(mine);
  const editing = useStore((s) => s.agendaEditingId === item.id);
  const setEditing = useStore((s) => s.setAgendaEditing);
  const [title, setTitle] = useState(item.title);
  useEffect(() => { if (!editing) setTitle(item.title); }, [item.title, editing]);
  const commitTitle = () => {
    setEditing(null);
    const next = title.trim();
    if (next && next !== item.title) void renameItem(item, next).catch((e) => setError(String(e)));
  };
  const checklist = (full: boolean) => <Checklist
    entries={(full ? mine : mine.slice(0, 3)).map((s) => ({ id: s.id, title: s.title, done: s.done }))}
    hideAdd={!full} autoFocusAdd={focusAdd}
    placeholder="添加子项，回车即可" emptyText="还没有子项"
    onAdd={(t) => addSub({ itemId: item.id, title: t })}
    onToggle={(e) => { const sub = mine.find((s) => s.id === e.id); if (sub) void toggleSub(sub).catch((e) => setError(String(e))); }}
    onRename={(e, t) => { const sub = mine.find((s) => s.id === e.id); if (sub) void renameSub(sub, t).catch((e) => setError(String(e))); }}
    onDelete={(e) => void delSub(e.id).catch((e) => setError(String(e)))}
  />;
  return <article id={`ag-${item.id}`} className={`cd-card ag-card ${expanded ? "is-expanded" : ""}`} aria-expanded={expanded}
    aria-label={item.title}
    onClick={(e) => { if (e.target === e.currentTarget) toggleExpanded(item.id); }}
    onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY, item); }}>
    <div className="cd-top ag-top">
      <div className="ag-head">
        {editing ? <input className="ag-title-edit" autoFocus maxLength={120} value={title} spellCheck={false}
          onChange={(e) => setTitle(e.target.value)} onBlur={commitTitle}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) commitTitle(); else if (e.key === "Escape") { setTitle(item.title); setEditing(null); } }} />
          : <span className="cd-title ag-title" title={`${item.title} · 双击改名`} onDoubleClick={() => { setTitle(item.title); setEditing(item.id); }}>{item.title}</span>}
      </div>
      <div className="cd-actions">
        {item.pinned ? <span className="tag-pin" title="已置顶" aria-label="已置顶"><Pin size={11} /></span> : null}
        <button className="icon-btn" title="更多" aria-label="更多操作" onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect(); onMenu(r.left, r.bottom + 4, item);
        }}><MoreHorizontal size={14} /></button>
      </div>
    </div>
    <section className="ag-note-section" aria-label="正文">
      <div className="ag-section-label">正文</div>
      {noteDraft !== undefined ? <div className="ag-note-editor">
        <textarea className="field ag-note-input" aria-label="便签正文" autoFocus value={noteDraft} maxLength={10000}
          placeholder="写下一段想法、背景或说明…" disabled={saving}
          onChange={(e) => setNoteDraft(item.id, e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape" && !saving) setNoteDraft(item.id, null); }} />
        <div className="ag-note-tools">
          <button className="btn btn-primary btn-sm" disabled={saving} onClick={async () => {
            setSaving(true); setError("");
            try { await saveNote(item.id, noteDraft); } catch (e) { setError(String(e)); } finally { setSaving(false); }
          }}>{saving ? "保存中…" : "保存文字"}</button>
          <button className="btn btn-outline btn-sm" disabled={saving} onClick={() => { setNoteDraft(item.id, null); setError(""); }}>取消</button>
        </div>
      </div> : <>
        {item.note ? <p className={`ag-note ${expanded ? "" : "is-preview"}`}>{item.note}</p> : <p className="ag-note-empty">留一段想法，也可以只列待办</p>}
        <button className="ag-add-action" onClick={() => { setNoteDraft(item.id, item.note ?? ""); setError(""); }}><Pencil size={13} />{item.note ? "编辑文字" : "添加文字"}</button>
      </>}
    </section>
    <section className="ag-task-section" aria-label="待办">
      <div className="ag-task-head"><span className="ag-section-label">待办</span>
        {mine.length ? <span className={`tag-ms ${progress.allDone ? "is-done" : ""}`}>{progress.badge}</span> : <span className="ag-hint">把事情拆成几步</span>}
      </div>
      {!expanded && mine.length > 0 ? checklist(false) : null}
      <Collapse open={expanded}>{checklist(true)}</Collapse>
      <div className="ag-task-tools">
        <button className="ag-add-action" onClick={() => {
          setFocusAdd(true);
          if (!expanded) toggleExpanded(item.id);
          else document.getElementById(`ag-${item.id}`)?.querySelector<HTMLInputElement>(".ms-input")?.focus();
        }}><Plus size={14} />添加待办</button>
        <button className="ag-expand" aria-expanded={expanded} onClick={() => { setFocusAdd(false); toggleExpanded(item.id); }}>{expanded ? "收起" : "展开全部"}</button>
      </div>
    </section>
    {error ? <div className="form-error" role="alert">{error}</div> : null}
  </article>;
}

/* ============================================================ 安排到某天 */

/** 纸张风格浮层：选一个日期，把事项安排进日历 */
function SchedulePop() {
  const id = useStore((s) => s.scheduleDraftId);
  const items = useStore((s) => s.agendaItems);
  const close = useStore((s) => s.openScheduleDraft);
  const schedule = useStore((s) => s.scheduleAgendaItem);
  const [date, setDate] = useState(toISO(today()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useDialogFocus(!!id);
  useEffect(() => {
    if (id) { setDate(toISO(today())); setError(""); }
  }, [id]);
  useEffect(() => {
    if (!id) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) close(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [id, busy, close]);

  if (!id) return null;
  const item = items.find((x) => x.id === id);
  if (!item) return null;

  return (
    <>
      <div className="mask mask-soft" onClick={() => { if (!busy) close(null); }} />
      <Portal>
        <section ref={dialogRef} className="pop schedule-pop" role="dialog" aria-modal="true" aria-label="安排到某天">
          <div className="pop-head">
            <span className="pop-title">安排到某天</span>
            <button
              className="icon-btn"
              title="关闭"
              aria-label="关闭"
              disabled={busy}
              onClick={() => close(null)}
            >
              <X size={14} />
            </button>
          </div>
          <p className="schedule-note">
            「{item.title}」会成为那天的全天事件（正文和未完成的子项会写进事件备注），
            事项本身移入「已完成」。
          </p>
          <DatePicker value={date} onChange={setDate} />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="schedule-foot">
            <button className="btn btn-outline" disabled={busy} onClick={() => close(null)}>
              取消
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={async () => {
              setBusy(true); setError("");
              try { await schedule(item.id, date); } catch (e) { setError(String(e)); }
              finally { setBusy(false); }
            }}>
              安排
            </button>
          </div>
        </section>
      </Portal>
    </>
  );
}

let agendaScrollTop = 0;
/* ============================================================ 页面 */

export default function AgendaPage() {
  const pageRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    el.scrollTop = agendaScrollTop;
    return () => { agendaScrollTop = el.scrollTop; };
  }, []);
  const items = useStore((s) => s.agendaItems);
  const allSubs = useStore((s) => s.agendaSubitems);
  const saveItem = useStore((s) => s.saveAgendaItem);
  const pinItem = useStore((s) => s.toggleAgendaPin);
  const archiveItem = useStore((s) => s.setAgendaArchived);
  const delItem = useStore((s) => s.deleteAgendaItem);
  const openSchedule = useStore((s) => s.openScheduleDraft);
  const duplicate = useStore((s) => s.duplicateAgendaItem);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  const [showDone, setShowDone] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const active = sortAgendaItems(items.filter((i) => !i.archived));
  const done = items.filter((i) => i.archived);

  const submit = () => {
    const title = draft.trim();
    if (!title || addingRef.current) return;
    addingRef.current = true; setAdding(true);
    void saveItem({ title }).then(() => { setDraft(""); setError(""); }).catch((e) => setError(String(e))).finally(() => { addingRef.current = false; setAdding(false); });
  };

  const onDraftKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
    else if (e.key === "Escape") setDraft("");
  };

  /**
   * 删除确认：**两个入口共用一份文案**（活跃卡片与已完成区）。
   * 早先两处各写一份，已完成区那份漏了「子项会一并删除」——外键级联会真删，
   * 文案却没说，属于「说得比做得轻」。
   */
  const confirmDelete = (item: AgendaItem) => {
    const n = subitemCount(item.id);
    void confirmThen({
      title: "删除议程事项",
      message:
        n > 0
          ? `确定删除「${item.title}」？正文和 ${n} 个子项会一并删除，无法恢复。`
          : `确定删除「${item.title}」？正文会一并删除，无法恢复。`,
      confirmLabel: "删除",
      onConfirm: () => delItem(item.id),
    });
  };

  const subitemCount = (id: string) => allSubs.filter((s) => s.itemId === id).length;

  const menuFor = (x: number, y: number, item: AgendaItem) => {
    setMenu({
      x,
      y,
      items: [
        {
          key: "edit",
          label: "编辑标题",
          icon: <Pencil size={14} />,
          onSelect: () => {
            // 就地展开标题输入框（不用 window.prompt，见 UI-07）
            useStore.getState().setAgendaEditing(item.id);
          },
        },
        {
          key: "pin",
          label: item.pinned ? "取消置顶" : "置顶",
          icon: item.pinned ? <PinOff size={14} /> : <Pin size={14} />,
          active: item.pinned,
          onSelect: () => void pinItem(item),
        },
        {
          key: "schedule",
          label: "安排到某天…",
          icon: <CalendarDays size={14} />,
          onSelect: () => openSchedule(item.id),
        },
        {
          key: "dup",
          label: "复制一份",
          icon: <Copy size={14} />,
          onSelect: () => void duplicate(item.id).catch((e) => setError(String(e))),
        },
        {
          key: "done",
          label: item.archived ? "恢复" : "标记为已完成",
          icon: <ArrowRightLeft size={14} />,
          onSelect: () => void archiveItem(item, !item.archived),
        },
        {
          key: "del",
          label: "删除",
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => confirmDelete(item),
        },
      ],
    });
  };

  return (
    <div className="agenda-page" ref={pageRef}>
      <div className="agenda-col">
        <div className="ag-head-row">
          <h1 className="ag-h1">议程</h1>
          <span className="ag-counts">
            未完成 {active.length} · 已完成 {done.length}
          </span>
        </div>
        <p className="ag-desc">
          还没决定哪天做的事放这里；定了日期就用「安排到某天」把它放进日历。
        </p>

        <div className="ag-quick">
          <input
            className="field ag-quick-input"
            placeholder="记一件要做的事，回车即可"
            maxLength={120}
            value={draft}
            readOnly={adding}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onDraftKey}
           />
          <button
            className="btn btn-primary btn-sm"
            disabled={adding || !draft.trim()}
            onClick={submit}
            title="添加这件事"
          >
            <Plus size={14} />
            添加
          </button>
        </div>

        {error ? <div className="form-error" role="alert">{error}</div> : null}

        <div className="ag-list">
          {active.length === 0 ? (
            <div className="cd-empty">
              <div className="hand">还没有待办</div>
              <div>在上方写一件要做的事，回车即可</div>
            </div>
          ) : (
            active.map((item) => <ItemCard key={item.id} item={item} onMenu={menuFor} />)
          )}
        </div>

        {done.length > 0 ? (
          <button
            className="archive-row ag-done-toggle"
            onClick={() => setShowDone((v) => !v)}
          >
            <ChevronDown
              size={14}
              className="chev"
              style={{ transform: showDone ? "none" : "rotate(-90deg)" }}
            />
            已完成 ({done.length})
            <span className="ag-done-hint">已完成 · 已安排到日历</span>
          </button>
        ) : null}

        {showDone ? (
          <div className="ag-list ag-done-list">
            {done.map((item) => (
              <div className="cd-card ag-card is-archived" key={item.id}>
                <div className="cd-top ag-top">
                  <span className="cd-title ag-title">{item.title}</span>
                  <div className="cd-actions">
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => void archiveItem(item, false)}
                    >
                      恢复
                    </button>
                    <button
                      className="icon-btn"
                      title="删除"
                      aria-label="删除"
                      onClick={() => confirmDelete(item)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {item.note ? <p className="ag-note is-preview">{item.note}</p> : null}
                <span className="ag-section-label">{agendaProgress(subitemsOf(allSubs, item.id)).badge}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      ) : null}
      <SchedulePop />
    </div>
  );
}
