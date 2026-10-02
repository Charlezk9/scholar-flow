/**
 * 通用「清单」（v1.2 由 Milestones 抽取，里程碑与议程子项共用）。
 *
 * 这里只负责渲染与交互，**不碰数据层**：新增 / 勾选 / 改名 / 删除都由外部注入，
 * 这样倒计时里程碑（`milestones` 表）与议程子项（`agenda_subitems` 表）能用同一套
 * 交互与动效，不会长出两份实现。
 *
 * 硬性约束（PLAN-v1.1 §4.5 / PLAN-v1.2 §5.2）：
 *  1. 必须渲染在父卡片**内部** —— 不允许出现第二个「泡」或缝隙，分隔线在折叠区内部；
 *  2. 复选框**自绘**，禁止原生 `<input type="checkbox">`（与 UI-01/02 同一原则）；
 *  3. 行内所有交互都要 stopPropagation，否则点勾会顺手把卡片折叠起来。
 */
import { useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, X } from "lucide-react";

export interface ChecklistEntry {
  id: string;
  title: string;
  done: boolean;
}

export interface ChecklistProps {
  entries: ChecklistEntry[];
  onAdd: (title: string) => void | Promise<void>;
  onToggle: (entry: ChecklistEntry) => void;
  onRename: (entry: ChecklistEntry, title: string) => void;
  onDelete: (entry: ChecklistEntry) => void;
  /** 输入行占位文案（两类场景略有不同） */
  placeholder?: string;
  /** 空态文案；不传则不渲染空态 */
  emptyText?: string;
  hideAdd?: boolean;
  autoFocusAdd?: boolean;
}

/** 单行 */
function Row({
  entry,
  onToggle,
  onRename,
  onDelete,
}: {
  entry: ChecklistEntry;
  onToggle: (e: ChecklistEntry) => void;
  onRename: (e: ChecklistEntry, title: string) => void;
  onDelete: (e: ChecklistEntry) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(entry.title);

  const commit = () => {
    setEditing(false);
    onRename(entry, text);
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) commit();
    else if (e.key === "Escape") {
      setText(entry.title);
      setEditing(false);
    }
  };

  return (
    <div className={`ms-row ${entry.done ? "is-done" : ""}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={entry.done}
        aria-label={`${entry.done ? "取消完成" : "完成"}：${entry.title}`}
        className={`ms-check ${entry.done ? "is-on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(entry);
        }}
      >
        {entry.done ? <Check size={12} strokeWidth={3} /> : null}
      </button>

      {editing ? (
        <input
          className="ms-edit"
          autoFocus
          maxLength={80}
          value={text}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={commit}
        />
      ) : (
        <span
          className="ms-title"
          title="双击改名"
          onDoubleClick={(e) => {
            e.stopPropagation();
            setText(entry.title);
            setEditing(true);
          }}
        >
          {entry.title}
        </span>
      )}

      <button
        type="button"
        className="ms-del"
        title="删除这一项"
        aria-label={`删除：${entry.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete(entry);
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

export default function Checklist({
  entries,
  onAdd,
  onToggle,
  onRename,
  onDelete,
  placeholder = "添加一项，回车即可",
  emptyText,
  hideAdd = false,
  autoFocusAdd = false,
}: ChecklistProps) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const doneCount = entries.filter((e) => e.done).length;

  const submit = async () => {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true); setError("");
    try { await onAdd(title); setDraft(""); }
    catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  };

  const onKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    // IME 组合态下的回车是「选字」，不能当成提交（EventDrawer 有同样处理）
    if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
    else if (e.key === "Escape") setDraft("");
  };

  return (
    <div className="ms" onClick={(e) => e.stopPropagation()}>
      {entries.length === 0 ? (
        emptyText ? <div className="ms-empty">{emptyText}</div> : null
      ) : (
        <div className="ms-rows">
          {entries.map((entry) => (
            <Row
              key={entry.id}
              entry={entry}
              onToggle={onToggle}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {!hideAdd ? <div className="ms-add">
        <input
          className="ms-input"
          autoFocus={autoFocusAdd}
          readOnly={busy}
          maxLength={80}
          placeholder={placeholder}
          value={draft}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
        />
      </div> : null}

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {entries.length > 0 && !hideAdd ? (
        <div className={`ms-count ${doneCount === entries.length ? "is-all-done" : ""}`}>
          {doneCount === entries.length
            ? `✓ 全部完成 ${doneCount}/${entries.length}`
            : `已完成 ${doneCount}/${entries.length}`}
        </div>
      ) : null}
    </div>
  );
}
