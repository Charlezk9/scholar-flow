import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Archive,
  ArchiveRestore,
  Calendar,
  ChevronDown,
  ChevronRight,
  Copy,
  Crown,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from "lucide-react";
import type { Countdown } from "../lib/api";
import { formatCardDate, today, toISO } from "../lib/date";
import { fs } from "../lib/fontScale";
import { useNow } from "../lib/tick";
import { confirmThen, useStore } from "../store/useStore";
import ContextMenu, { type MenuItem } from "./ContextMenu";
import { DatePicker, TimePicker } from "./pickers";
import Collapse from "./Collapse";
import Milestones from "./Milestones";
import {
  ColorDot,
  clockText,
  progressOf,
  remainingOf,
  type Remaining,
} from "./countdownShared";

/* ============================================================ 主视觉 */

/** 倒计时大字：天级以上显示「剩余 N 天」，不足一天直接显示 HH:MM:SS */
function BigCount({ r }: { r: Remaining }) {
  const bigClock = r.hasTime && r.days === 0;

  if (bigClock) {
    return (
      <div className="cd-days is-clock">
        <span className="label">{r.past ? "已过" : "剩余"}</span>
        <span className="num clock-num" title={`${r.days} 天 ${clockText(r)}`}>
          {clockText(r)}
        </span>
      </div>
    );
  }

  if (!r.hasTime && !r.past && r.days === 0) {
    return (
      <div className="cd-days">
        <span className="num" style={{ fontSize: fs(26) }}>
          就是今天
        </span>
      </div>
    );
  }

  return (
    <div className="cd-days">
      <span className="label">{r.past ? "已过去" : "剩余"}</span>
      <span className="num">{r.days}</span>
      <span className="unit">天</span>
      {/* v1.1 · UI-24：时分秒接在天数后面，不再单独占一行（原来那行前还有个灰色的「还有」） */}
      {r.hasTime ? (
        <span className="clock-inline" title={`${r.days} 天 ${clockText(r)}`}>
          {clockText(r)}
        </span>
      ) : null}
    </div>
  );
}

/* ============================================================ 新建表单 */

function CreateForm() {
  const saveCountdown = useStore((s) => s.saveCountdown);
  const draft = useStore((s) => s.countdownDraft);
  const openDraft = useStore((s) => s.openCountdownDraft);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toISO(today()));
  const [time, setTime] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (draft && !draft.id) inputRef.current?.focus();
  }, [draft]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      inputRef.current?.focus();
      return;
    }
    await saveCountdown({
      title: title.trim(),
      targetDate: date,
      targetTime: time || null,
      color: "cinnabar",
      showOnCalendar: true,
    });
    setTitle("");
    setDate(toISO(today()));
    setTime("");
    openDraft(null);
    inputRef.current?.focus();
  }

  return (
    <section className="panel panel-create">
      <form className="panel-pad" onSubmit={submit}>
        <div className="panel-title">
          <span className="mark">
            <Plus size={15} strokeWidth={2.4} />
          </span>
          新建倒计时
        </div>
        <div className="stack">
          <input
            ref={inputRef}
            className="field"
            placeholder="请输入标题，如：期末考试"
            value={title}
            maxLength={60}
            onChange={(e) => setTitle(e.target.value)}
          />
          <DatePicker value={date} onChange={setDate} placeholder="选择目标日期" />
          <TimePicker value={time} onChange={setTime} />
          <button className="btn btn-primary btn-block" type="submit">
            添加
          </button>
        </div>
      </form>
    </section>
  );
}

/* ============================================================ 卡片 */

function Card({
  c,
  onMenu,
}: {
  c: Countdown;
  onMenu: (x: number, y: number, c: Countdown) => void;
}) {
  const expanded = useStore((s) => s.expandedId === c.id);
  const toggleExpanded = useStore((s) => s.toggleExpanded);
  const milestones = useStore((s) => s.milestones);

  const nowMs = useNow();
  const r = remainingOf(c, nowMs);
  const pct = progressOf(c, nowMs);

  const mine = milestones.filter((m) => m.countdownId === c.id);
  const msDone = mine.filter((m) => m.done).length;
  const allDone = mine.length > 0 && msDone === mine.length;

  const cls = [
    "cd-card",
    r.isToday ? "is-today" : "",
    r.past ? "is-past" : "",
    expanded ? "is-expanded" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="cd-wrap">
      <div
        className={cls}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${c.title}，${expanded ? "收起" : "展开"}里程碑`}
        onClick={() => toggleExpanded(c.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          onMenu(e.clientX, e.clientY, c);
        }}
        onKeyDown={(e) => {
          // 只处理卡片自身的按键：里程碑输入框 / 就地改名输入框的回车会冒泡上来，
          // 不拦的话「加一条里程碑」会顺手把卡片折起来
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleExpanded(c.id);
          }
        }}
      >
        <div className="cd-top">
          <BigCount r={r} />
          {/* v1.1 · UI-23：右上角只留「更多」一个入口，其余动作全部收进菜单 */}
          <div className="cd-actions">
            <button
              className="icon-btn"
              title="更多"
              aria-label="更多操作"
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                onMenu(rect.left, rect.bottom + 4, c);
              }}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        </div>

        <div className="cd-title">{c.title}</div>

        <div className="cd-meta">
          <Calendar size={12} />
          {formatCardDate(c.targetDate)}
          <span className={c.targetTime ? "" : "is-allday"}>
            · {c.targetTime ?? "全天"}
          </span>
          {r.isToday ? <span className="tag-today">今天</span> : null}
          {/* 皇冠与颜色降为只读标记：它们是「状态」不是「动作」，既不进⋯菜单也不长成按钮 */}
          {c.crowned ? (
            <span
              className="tag-crown"
              title="当前皇冠：显示在标题栏下方"
              aria-label="当前皇冠"
            >
              <Crown size={11} />
            </span>
          ) : null}
          <ColorDot color={c.color} />
          {/* 折叠态徽章（CD-18）：折叠时也能一眼看出有里程碑、做到哪了 */}
          {mine.length > 0 && !expanded ? (
            <span className={`tag-ms ${allDone ? "is-done" : ""}`}>
              {allDone ? "✓" : "☑"} {msDone}/{mine.length}
            </span>
          ) : null}
        </div>

        {pct !== null ? (
          <div className="cd-progress">
            <span className={`bar ${pct >= 100 ? "is-done" : ""}`}>
              <i style={{ width: `${pct}%` }} />
            </span>
            <span className="bar-pct">{pct}%</span>
          </div>
        ) : null}

        {/* 里程碑区在**同一个泡**里（UI-15 的同泡原则），分隔线在折叠区内部 */}
        <Collapse open={expanded}>
          <Milestones countdownId={c.id} />
        </Collapse>
      </div>
    </div>
  );
}

/* ============================================================ 面板 */

export default function CountdownPanel() {
  const countdowns = useStore((s) => s.countdowns);
  const openDraft = useStore((s) => s.openCountdownDraft);
  const togglePin = useStore((s) => s.togglePin);
  const archive = useStore((s) => s.archive);
  const del = useStore((s) => s.deleteCountdown);
  const setCrown = useStore((s) => s.setCrown);
  const duplicateCountdown = useStore((s) => s.duplicateCountdown);
  const milestones = useStore((s) => s.milestones);

  const [sort, setSort] = useState<"days" | "created">("days");
  const [showArchived, setShowArchived] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(
    null,
  );

  const active = countdowns.filter((c) => !c.archived);
  const archived = countdowns.filter((c) => c.archived);

  // 未过期的按时间升序；已过期的沉到列表后面
  const nowMs = Date.now();
  const sorted = [...active].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (sort === "days") {
      const ra = remainingOf(a, nowMs).past;
      const rb = remainingOf(b, nowMs).past;
      if (ra !== rb) return ra ? 1 : -1;
      return (
        remainingOf(a, nowMs).targetMs - remainingOf(b, nowMs).targetMs
      );
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  const menuFor = (x: number, y: number, c: Countdown) => {
    setMenu({
      x,
      y,
      items: [
        {
          key: "edit",
          label: "编辑",
          icon: <Pencil size={14} />,
          onSelect: () => openDraft(c),
        },
        {
          key: "crown",
          // 归档项不参与（皇冠栏只认未归档的那一条，否则会设了却看不见）
          hidden: c.archived,
          label: c.crowned ? "取消皇冠" : "设为皇冠",
          icon: <Crown size={14} />,
          // UI-24：卡片上的皇冠按钮收进菜单后，状态得在菜单里看得出来
          active: c.crowned,
          onSelect: () => void setCrown(c.crowned ? null : c.id),
        },
        {
          key: "pin",
          label: c.pinned ? "取消置顶" : "置顶",
          icon: c.pinned ? <PinOff size={14} /> : <Pin size={14} />,
          active: c.pinned,
          onSelect: () => void togglePin(c),
        },
        {
          key: "dup",
          label: "复制一份",
          icon: <Copy size={14} />,
          // 决议 Q7：副本携带里程碑，但完成态重置
          onSelect: () => void duplicateCountdown(c),
        },
        {
          key: "arch",
          label: "归档",
          icon: <Archive size={14} />,
          onSelect: () => void archive(c, true),
        },
        {
          key: "del",
          label: "删除",
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => {
            const n = milestones.filter((m) => m.countdownId === c.id).length;
            void confirmThen({
              title: "删除倒计时",
              message:
                n > 0
                  ? `确定删除「${c.title}」？它下面的 ${n} 个里程碑会一并删除，且无法恢复。`
                  : `确定删除「${c.title}」？删除后无法恢复。`,
              confirmLabel: "删除",
              onConfirm: () => del(c.id),
            });
          },
        },
      ],
    });
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-scroll">
        <CreateForm />

        <div>
          <div className="group-head">
            <ChevronDown size={14} />
            进行中的倒计时
            <span className="count">({active.length})</span>
            <button
              className="sort"
              onClick={() => setSort((s) => (s === "days" ? "created" : "days"))}
              title="切换排序方式"
            >
              {sort === "days" ? "按剩余天数" : "按创建时间"}
              <ChevronDown size={12} />
            </button>
          </div>

          <div className="cd-list" style={{ marginTop: 10 }}>
            {sorted.length === 0 ? (
              <div className="cd-empty">
                <div className="hand">还没有倒计时</div>
                <div>在上方输入标题、选个日期，点「添加」</div>
              </div>
            ) : (
              sorted.map((c) => <Card key={c.id} c={c} onMenu={menuFor} />)
            )}
          </div>
        </div>

        {archived.length > 0 ? (
          <button className="archive-row" onClick={() => setShowArchived((v) => !v)}>
            <Archive size={14} />
            已归档 ({archived.length})
            <ChevronRight
              size={14}
              className="chev"
              style={{ transform: showArchived ? "rotate(90deg)" : "none" }}
            />
          </button>
        ) : null}

        {showArchived ? (
          <div className="cd-list">
            {archived.map((c) => (
              <div key={c.id} className="panel">
                <div className="panel-pad" style={{ padding: 12 }}>
                  <div className="cd-title" style={{ marginTop: 0 }}>
                    {c.title}
                  </div>
                  <div className="cd-meta">
                    {formatCardDate(c.targetDate)} · {c.targetTime ?? "全天"}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => void archive(c, false)}
                    >
                      <ArchiveRestore size={13} />
                      恢复
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ marginLeft: "auto", color: "var(--cinnabar)" }}
                      onClick={() =>
                        void confirmThen({
                          title: "删除倒计时",
                          message: `确定删除「${c.title}」？删除后无法恢复。`,
                          confirmLabel: "删除",
                          onConfirm: () => del(c.id),
                        })
                      }
                    >
                      <Trash2 size={13} />
                      删除
                    </button>
                  </div>
                </div>
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
    </aside>
  );
}
