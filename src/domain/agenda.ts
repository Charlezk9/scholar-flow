/**
 * 议程的纯逻辑（可被 Node 直接测，不依赖 React / Tauri）。
 *
 * 排序与完成度只在这里定义一次：Rust 侧按同一规则出数据（`list_agenda_items` 里
 * `ORDER BY pinned DESC, sort_order`），前端预览后端与页面渲染都调这里 ——
 * 避免三处各写一遍、然后慢慢漂移。
 */
import type { AgendaItem, AgendaSubitem } from "../lib/api";

/** 待办排序：置顶优先，其次手动顺序，最后按创建时间兜底 */
export function sortAgendaItems(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** 某事项的子项（按 sortOrder，创建时间兜底） */
export function subitemsOf(subitems: AgendaSubitem[], itemId: string): AgendaSubitem[] {
  return subitems
    .filter((s) => s.itemId === itemId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export interface AgendaProgress {
  total: number;
  done: number;
  allDone: boolean;
  /** 折叠徽章文案：`☑ 2/5` / `✓ 5/5` / 无子项时为空串 */
  badge: string;
  /** 展开区的计数文案 */
  label: string;
}

/** 完成度：事项本身没有 done，状态完全由子项决定（决议 Q4） */
export function agendaProgress(subitems: AgendaSubitem[]): AgendaProgress {
  const total = subitems.length;
  const done = subitems.filter((s) => s.done).length;
  const allDone = total > 0 && done === total;
  if (total === 0) {
    return { total, done, allDone: false, badge: "", label: "" };
  }
  return {
    total,
    done,
    allDone,
    badge: `${allDone ? "✓" : "☑"} ${done}/${total}`,
    label: allDone ? `✓ 全部完成 ${done}/${total}` : `已完成 ${done}/${total}`,
  };
}

/** 未完成子项的标题（「安排到某天」时写进事件备注） */
export function undoneTitles(subitems: AgendaSubitem[]): string[] {
  return subitems.filter((s) => !s.done).map((s) => s.title);
}
