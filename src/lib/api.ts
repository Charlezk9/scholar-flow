import { diagnosticInvoke } from "./diagnostics";
/**
 * 数据层：Tauri invoke 封装。
 * 在非 Tauri 环境（浏览器 `pnpm dev` 预览）自动降级为 localStorage 内存后端，
 * 方便在没有 Rust 侧的情况下预览界面。
 */

import { validateRoutine, type RoutineSlot, type RoutineKey } from "../domain/routine";
import { sortAgendaItems, subitemsOf, undoneTitles } from "../domain/agenda";

/**
 * 日历视图。`"agenda"` 自 v1.2 起**不再是视图**（议程升为独立页面），
 * 这个取值只作为「老库里存过的 defaultView」的 legacy 哨兵存在 ——
 * `useStore.init` 会把它归一到 `month`，UI 上没有任何地方会渲染它。
 */
export type ViewMode = "month" | "week" | "day" | "agenda";

export interface Countdown {
  id: string;
  title: string;
  targetDate: string;
  targetTime: string | null;
  startDate: string | null;
  note: string | null;
  color: string | null;
  pinned: boolean;
  /** 皇冠：全局唯一的「最重要」倒计时，显示在标题栏下方那一行 */
  crowned: boolean;
  showOnCalendar: boolean;
  repeatRule: string | null;
  archived: boolean;
  remindDays: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CountdownInput = {
  id?: string | null;
  title: string;
  targetDate: string;
  targetTime?: string | null;
  startDate?: string | null;
  note?: string | null;
  color?: string | null;
  pinned?: boolean;
  /** 省略 = 不改动皇冠归属（皇冠只通过 `setCrown` 修改） */
  crowned?: boolean;
  showOnCalendar?: boolean;
  repeatRule?: string | null;
  archived?: boolean;
  remindDays?: string | null;
};

/** 倒计时下的里程碑（TODO 项，v1.1 · CD-16） */
export interface Milestone {
  id: string;
  countdownId: string;
  title: string;
  done: boolean;
  /** 首次勾选时间；取消勾选时清空 */
  doneAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type MilestoneInput = {
  id?: string | null;
  countdownId: string;
  title: string;
  done?: boolean;
  /** 省略 = 已有记录保持原顺序 / 新建时追加到末尾 */
  sortOrder?: number | null;
};

/** 议程事项（v1.2 · AG-01）：没有日期的待办，标题 + 若干子项 */
export interface AgendaItem {
  id: string;
  title: string;
  note: string | null;
  pinned: boolean;
  /** 完成 / 已安排 / 不想做了，统一进「已完成」区 */
  archived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type AgendaItemInput = {
  id?: string | null;
  title: string;
  note?: string | null;
  pinned?: boolean;
  archived?: boolean;
  /** 省略 = 已有记录保持原顺序 / 新建时追加到末尾 */
  sortOrder?: number | null;
};

/** 议程子项（与里程碑同形） */
export interface AgendaSubitem {
  id: string;
  itemId: string;
  title: string;
  done: boolean;
  doneAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type AgendaSubitemInput = {
  id?: string | null;
  itemId: string;
  title: string;
  done?: boolean;
  sortOrder?: number | null;
};

export interface CalEvent {
  id: string;
  title: string;  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  location: string | null;
  color: string | null;
  /** 历史字段：UI 已移除（需求 `NT-01~05` 已作废），保留以兼容既有数据 */
  remindMinutes: number | null;
  repeatRule: string | null;
  repeatUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EventInput = {
  id?: string | null;
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
  location?: string | null;
  color?: string | null;
  remindMinutes?: number | null;
  repeatRule?: string | null;
  repeatUntil?: string | null;
};

export const inTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// ---------------------------------------------------------------- 事件色板

export const EVENT_COLORS = [
  "cinnabar",
  "ochre",
  "indigo",
  "pine",
  "sandalfig",
  "rouge",
  "smoke",
] as const;
export type EventColor = (typeof EVENT_COLORS)[number];

/** 与 tokens.css 中的事件色板一一对应 */
export const COLOR_META: Record<
  EventColor,
  { label: string; dot: string; line: string; fill: string; text: string }
> = {
  cinnabar: {
    label: "朱砂",
    dot: "#C0554A",
    line: "#C0554A",
    fill: "#F0D8D2",
    text: "#8F2C22",
  },
  ochre: {
    label: "赭石",
    dot: "#C98A45",
    line: "#C98A45",
    fill: "#F0E0C8",
    text: "#8A5A22",
  },
  indigo: {
    label: "靛青",
    dot: "#4578B2",
    line: "#4578B2",
    fill: "#D8E0E8",
    text: "#2C5580",
  },
  pine: {
    label: "松绿",
    dot: "#6F9464",
    line: "#6F9464",
    fill: "#DDE6D8",
    text: "#44603C",
  },
  sandalfig: {
    label: "紫檀",
    dot: "#8B76A8",
    line: "#8B76A8",
    fill: "#E2DCE8",
    text: "#5A4A73",
  },
  rouge: {
    label: "胭脂",
    dot: "#C4707F",
    line: "#C4707F",
    fill: "#F3DCE0",
    text: "#8A4351",
  },
  smoke: {
    label: "烟灰",
    dot: "#9C9488",
    line: "#9C9488",
    fill: "#E6E2DA",
    text: "#5C554D",
  },
};

export function colorMeta(key: string | null | undefined) {
  if (key && key in COLOR_META) return COLOR_META[key as EventColor];
  return COLOR_META.indigo;
}

// ---------------------------------------------------------------- 后端

type Backend = {
  listRoutineSlots(date: string): Promise<RoutineSlot[]>;
  saveRoutineSlot(date: string, slotKey: RoutineKey, category: string): Promise<RoutineSlot>;
  clearRoutineSlot(date: string, slotKey: RoutineKey): Promise<void>;
  saveAgendaNote(id: string, note: string): Promise<void>;
  duplicateAgendaItem(id: string): Promise<void>;
  listCountdowns(): Promise<Countdown[]>;
  saveCountdown(input: CountdownInput): Promise<Countdown>;
  deleteCountdown(id: string): Promise<void>;
  /** 设置皇冠（全局唯一）；传 `null` 取消 */
  setCrown(id: string | null): Promise<void>;
  /** 一次全量拿全部里程碑（决议 Q3），前端按 countdownId 归集 */
  listMilestones(): Promise<Milestone[]>;
  saveMilestone(input: MilestoneInput): Promise<Milestone>;
  deleteMilestone(id: string): Promise<void>;
  listAgendaItems(): Promise<AgendaItem[]>;
  saveAgendaItem(input: AgendaItemInput): Promise<AgendaItem>;
  deleteAgendaItem(id: string): Promise<void>;
  listAgendaSubitems(): Promise<AgendaSubitem[]>;
  saveAgendaSubitem(input: AgendaSubitemInput): Promise<AgendaSubitem>;
  deleteAgendaSubitem(id: string): Promise<void>;
  /** 桥（AG-05）：安排到某天 → 建全天事件 + 归档事项，返回新事件 */
  scheduleAgendaItem(id: string, date: string): Promise<CalEvent>;
  listEvents(from: string, to: string): Promise<CalEvent[]>;
  saveEvent(input: EventInput): Promise<CalEvent>;
  moveEvent(id: string, start: string, end: string): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  allSettings(): Promise<[string, string][]>;
  setSetting(key: string, value: string): Promise<void>;
  exportJson(): Promise<string>;
  dataDir(): Promise<string>;
};

async function tauriBackend(): Promise<Backend> {
  const invoke = diagnosticInvoke;
  return {
    listRoutineSlots: (date) => invoke<RoutineSlot[]>("list_daily_routine_slots", { date }),
    saveRoutineSlot: (date, slotKey, category) => invoke<RoutineSlot>("save_daily_routine_slot", { date, slotKey, category }),
    clearRoutineSlot: (date, slotKey) => invoke<void>("clear_daily_routine_slot", { date, slotKey }),
    saveAgendaNote: (id, note) => invoke<void>("save_agenda_note", { id, note }),
    duplicateAgendaItem: (id) => invoke<void>("duplicate_agenda_item", { id }),
    listCountdowns: () => invoke<Countdown[]>("list_countdowns"),
    saveCountdown: (input) => invoke<Countdown>("save_countdown", { input }),
    deleteCountdown: (id) => invoke<void>("delete_countdown", { id }),
    setCrown: (id) => invoke<void>("set_crown", { id }),
    listMilestones: () => invoke<Milestone[]>("list_milestones"),
    saveMilestone: (input) => invoke<Milestone>("save_milestone", { input }),
    deleteMilestone: (id) => invoke<void>("delete_milestone", { id }),
    listAgendaItems: () => invoke<AgendaItem[]>("list_agenda_items"),
    saveAgendaItem: (input) => invoke<AgendaItem>("save_agenda_item", { input }),
    deleteAgendaItem: (id) => invoke<void>("delete_agenda_item", { id }),
    listAgendaSubitems: () => invoke<AgendaSubitem[]>("list_agenda_subitems"),
    saveAgendaSubitem: (input) => invoke<AgendaSubitem>("save_agenda_subitem", { input }),
    deleteAgendaSubitem: (id) => invoke<void>("delete_agenda_subitem", { id }),
    scheduleAgendaItem: (id, date) =>
      invoke<CalEvent>("schedule_agenda_item", { id, date }),
    listEvents: (from, to) => invoke<CalEvent[]>("list_events", { from, to }),
    saveEvent: (input) => invoke<CalEvent>("save_event", { input }),
    moveEvent: (id, start, end) => invoke<void>("move_event", { id, start, end }),
    deleteEvent: (id) => invoke<void>("delete_event", { id }),
    allSettings: () => invoke<[string, string][]>("all_settings"),
    setSetting: (key, value) => invoke<void>("set_setting", { key, value }),
    exportJson: () => invoke<string>("export_json"),
    dataDir: () => invoke<string>("data_dir"),
  };
}

// ---------------------------------------------------------------- 浏览器降级后端

const LS_KEY = "runningdo.preview.v1";

function previewBackend(): Backend {
  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}");
    } catch {
      return {};
    }
  };
  const write = (d: unknown) => localStorage.setItem(LS_KEY, JSON.stringify(d));
  const uid = () =>
    "p-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const now = () => new Date().toISOString().slice(0, 19);
  const seed = () => {
    const d = read();
    if (d.seeded) return;
    const t = new Date();
    const iso = (n: number) => {
      const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n, 12);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(
        x.getDate(),
      ).padStart(2, "0")}`;
    };
    d.seeded = true;
    d.countdowns = [
      {
        id: uid(),
        title: "期末考试",
        targetDate: iso(12),
        targetTime: null,
        startDate: iso(-40),
        note: null,
        color: "cinnabar",
        pinned: true,
        crowned: true,
        showOnCalendar: true,
        repeatRule: null,
        archived: false,
        remindDays: "[7,3,1,0]",
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: uid(),
        title: "论文提交",
        targetDate: iso(0),
        targetTime: null,
        startDate: null,
        note: null,
        color: "indigo",
        pinned: false,
        crowned: false,
        showOnCalendar: true,
        repeatRule: null,
        archived: false,
        remindDays: null,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: uid(),
        title: "项目交付",
        targetDate: iso(45),
        targetTime: "18:00",
        startDate: iso(-30),
        note: "需要提前一周做完回归测试",
        color: "indigo",
        pinned: false,
        crowned: false,
        showOnCalendar: true,
        repeatRule: null,
        archived: false,
        remindDays: null,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: uid(),
        title: "去日本旅行",
        targetDate: iso(102),
        targetTime: null,
        startDate: null,
        note: null,
        color: "ochre",
        pinned: false,
        crowned: false,
        showOnCalendar: true,
        repeatRule: null,
        archived: false,
        remindDays: null,
        createdAt: now(),
        updatedAt: now(),
      },
    ];
    d.events = [
      {
        id: uid(),
        title: "周会",
        startDate: iso(0),
        endDate: iso(0),
        allDay: false,
        startTime: "10:00",
        endTime: "11:30",
        note: null,
        location: "会议室 A",
        color: "indigo",
        remindMinutes: 15,
        repeatRule: null,
        repeatUntil: null,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: uid(),
        title: "健身",
        startDate: iso(0),
        endDate: iso(0),
        allDay: false,
        startTime: "19:00",
        endTime: "21:00",
        note: null,
        location: "健身房",
        color: "cinnabar",
        repeatRule: null,
        repeatUntil: null,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: uid(),
        title: "日本旅行（东京·京都）",
        startDate: iso(2),
        endDate: iso(6),
        allDay: true,
        startTime: null,
        endTime: null,
        note: null,
        location: "东京",
        color: "cinnabar",
        repeatRule: null,
        repeatUntil: null,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: uid(),
        title: "期末考试周",
        startDate: iso(4),
        endDate: iso(8),
        allDay: true,
        startTime: null,
        endTime: null,
        note: null,
        location: null,
        color: "indigo",
        repeatRule: null,
        repeatUntil: null,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: uid(),
        title: "产品评审",
        startDate: iso(3),
        endDate: iso(3),
        allDay: false,
        startTime: "15:00",
        endTime: "17:00",
        note: null,
        location: "会议室 B",
        color: "cinnabar",
        repeatRule: null,
        repeatUntil: null,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: uid(),
        title: "家庭聚餐",
        startDate: iso(6),
        endDate: iso(6),
        allDay: false,
        startTime: "19:00",
        endTime: "21:00",
        note: null,
        location: "居酒屋",
        color: "ochre",
        repeatRule: null,
        repeatUntil: null,
        createdAt: now(),
        updatedAt: now(),
      },
    ];
    d.settings = [];
    // v1.1：给第一条倒计时种几个里程碑，方便肉眼验收展开动效 / 折叠徽章 / 勾选态
    const firstCd = (d.countdowns as Countdown[])[0];
    if (firstCd) {
      const mk = (title: string, done: boolean, sortOrder: number): Milestone => ({
        id: uid(),
        countdownId: firstCd.id,
        title,
        done,
        doneAt: done ? now() : null,
        sortOrder,
        createdAt: now(),
        updatedAt: now(),
      });
      d.milestones = [
        mk("开题报告提纲", true, 0),
        mk("实验数据回收", false, 1),
        mk("初稿", false, 2),
      ];
    }
    // v1.2：议程页的种子事项（带子项，方便预览展开动效）
    const agId = uid();
    d.agendaItems = [
      {
        id: agId,
        title: "准备 WWW 投稿",
        note: null,
        pinned: false,
        archived: false,
        sortOrder: 0,
        createdAt: now(),
        updatedAt: now(),
      },
      {
        id: uid(),
        title: "读完《Designing Data-Intensive Applications》",
        note: null,
        pinned: false,
        archived: false,
        sortOrder: 1,
        createdAt: now(),
        updatedAt: now(),
      },
    ];
    d.agendaSubitems = [
      { id: uid(), itemId: agId, title: "写摘要", done: true, doneAt: now(), sortOrder: 0, createdAt: now(), updatedAt: now() },
      { id: uid(), itemId: agId, title: "全文初稿", done: false, doneAt: null, sortOrder: 1, createdAt: now(), updatedAt: now() },
    ];
    write(d);
  };
  seed();
  return {
    async listCountdowns() {
      return read().countdowns ?? [];
    },
    async saveCountdown(input) {
      const d = read();
      const list: Countdown[] = d.countdowns ?? [];
      const idx = input.id ? list.findIndex((c) => c.id === input.id) : -1;
      const base: Countdown =
        idx >= 0
          ? list[idx]
          : {
              id: uid(),
              title: "",
              targetDate: "",
              targetTime: null,
              startDate: null,
              note: null,
              color: null,
              pinned: false,
              crowned: false,
              showOnCalendar: true,
              repeatRule: null,
              archived: false,
              remindDays: null,
              createdAt: now(),
              updatedAt: now(),
            };
      const next: Countdown = {
        ...base,
        ...input,
        id: base.id,
        updatedAt: now(),
      } as Countdown;
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      d.countdowns = list;
      write(d);
      return next;
    },
    async deleteCountdown(id) {
      const d = read();
      d.countdowns = (d.countdowns ?? []).filter((c: Countdown) => c.id !== id);
      // 与 Rust 侧的外键级联保持一致：删倒计时同时删它的里程碑
      d.milestones = (d.milestones ?? []).filter((m: Milestone) => m.countdownId !== id);
      write(d);
    },
    async setCrown(id) {
      const d = read();
      for (const c of (d.countdowns ?? []) as Countdown[]) c.crowned = c.id === id;
      write(d);
    },
    async listMilestones() {
      return read().milestones ?? [];
    },
    async listRoutineSlots(date) {
      validateRoutine(date);
      return (read().dailyRoutineSlots ?? []).filter((s: RoutineSlot) => s.date === date);
    },
    async saveRoutineSlot(date, slotKey, category) {
      validateRoutine(date, slotKey, category);
      const d = read();
      const slots: RoutineSlot[] = d.dailyRoutineSlots ?? [];
      const old = slots.find((s) => s.date === date && s.slotKey === slotKey);
      const saved = { date, slotKey, category: category.trim(), createdAt: old?.createdAt ?? now(), updatedAt: now() };
      d.dailyRoutineSlots = [...slots.filter((s) => s.date !== date || s.slotKey !== slotKey), saved];
      write(d);
      return saved;
    },
    async clearRoutineSlot(date, slotKey) {
      validateRoutine(date, slotKey);
      const d = read();
      d.dailyRoutineSlots = (d.dailyRoutineSlots ?? []).filter((s: RoutineSlot) => s.date !== date || s.slotKey !== slotKey);
      write(d);
    },
    async saveAgendaNote(id, note) {
      if (Array.from(note).length > 5000) throw new Error("正文不能超过 5000 字符");
      const d = read();
      const item = (d.agendaItems ?? []).find((i: AgendaItem) => i.id === id);
      if (!item) throw new Error("找不到这条议程事项");
      item.note = note.trim() || null;
      item.updatedAt = now();
      write(d);
    },
    async duplicateAgendaItem(id) {
      const d = read();
      const list: AgendaItem[] = d.agendaItems ?? [];
      const item = list.find((i) => i.id === id);
      if (!item) throw new Error("找不到这条议程事项");
      const newId = uid();
      const subs: AgendaSubitem[] = d.agendaSubitems ?? [];
      d.agendaItems = [...list, { ...item, id: newId, title: `${Array.from(item.title).slice(0, 117).join("")} 副本`, pinned: false, archived: false,
        sortOrder: list.reduce((m, i) => Math.max(m, i.sortOrder + 1), 0), createdAt: now(), updatedAt: now() }];
      d.agendaSubitems = [...subs, ...subs.filter((i) => i.itemId === id).map((i) => ({ ...i, id: uid(), itemId: newId, createdAt: now(), updatedAt: now() }))];
      write(d);
    },
    async listAgendaItems() {
      // 排序规则只在 domain/agenda.ts 定义一次（与 Rust 侧的 ORDER BY 对齐）
      return sortAgendaItems(read().agendaItems ?? []);
    },
    async saveAgendaItem(input) {
      const d = read();
      // 与 Rust 侧同样的校验（预览后端以前不校验，两端防御不一致）
      if (!input.title.trim()) throw new Error("标题不能为空");
      const list: AgendaItem[] = d.agendaItems ?? [];
      const idx = input.id ? list.findIndex((x) => x.id === input.id) : -1;
      const next: AgendaItem =
        idx >= 0
          ? {
              ...list[idx],
              title: input.title.trim(),
              note: input.note ?? null,
              pinned: input.pinned ?? list[idx].pinned,
              archived: input.archived ?? list[idx].archived,
              updatedAt: now(),
            }
          : {
              id: uid(),
              title: input.title.trim(),
              note: input.note ?? null,
              pinned: input.pinned ?? false,
              archived: input.archived ?? false,
              sortOrder: list.reduce((mx, x) => Math.max(mx, x.sortOrder + 1), 0),
              createdAt: now(),
              updatedAt: now(),
            };
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      d.agendaItems = list;
      write(d);
      return next;
    },
    async deleteAgendaItem(id) {
      const d = read();
      d.agendaItems = (d.agendaItems ?? []).filter((x: AgendaItem) => x.id !== id);
      // 与 Rust 侧的外键级联保持一致
      d.agendaSubitems = (d.agendaSubitems ?? []).filter(
        (x: AgendaSubitem) => x.itemId !== id,
      );
      write(d);
    },
    async listAgendaSubitems() {
      return read().agendaSubitems ?? [];
    },
    async saveAgendaSubitem(input) {
      const d = read();
      if (!input.title.trim()) throw new Error("子项内容不能为空");
      const items: AgendaItem[] = d.agendaItems ?? [];
      if (!items.some((x) => x.id === input.itemId)) {
        throw new Error("找不到这条议程事项");
      }
      const list: AgendaSubitem[] = d.agendaSubitems ?? [];
      const idx = input.id ? list.findIndex((x) => x.id === input.id) : -1;
      const done = input.done ?? false;
      const next: AgendaSubitem =
        idx >= 0
          ? {
              ...list[idx],
              title: input.title.trim(),
              done,
              doneAt: done ? (list[idx].doneAt ?? now()) : null,
              updatedAt: now(),
            }
          : {
              id: uid(),
              itemId: input.itemId,
              title: input.title.trim(),
              done,
              doneAt: done ? now() : null,
              sortOrder: list
                .filter((x) => x.itemId === input.itemId)
                .reduce((mx, x) => Math.max(mx, x.sortOrder + 1), 0),
              createdAt: now(),
              updatedAt: now(),
            };
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      d.agendaSubitems = list;
      write(d);
      return next;
    },
    async deleteAgendaSubitem(id) {
      const d = read();
      d.agendaSubitems = (d.agendaSubitems ?? []).filter(
        (x: AgendaSubitem) => x.id !== id,
      );
      write(d);
    },
    async scheduleAgendaItem(id, date) {
      validateRoutine(date);
      const d = read();
      const item = (d.agendaItems ?? []).find((x: AgendaItem) => x.id === id);
      if (!item) throw new Error("找不到这条议程事项");
      const subs: AgendaSubitem[] = (d.agendaSubitems ?? []).filter(
        (x: AgendaSubitem) => x.itemId === id,
      );
      const lines: string[] = [];
      if (item.note?.trim()) lines.push(item.note.trim());
      for (const title of undoneTitles(subitemsOf(subs, id))) lines.push(`· ${title}`);

      const event: CalEvent = {
        id: uid(),
        title: item.title,
        startDate: date,
        endDate: date,
        allDay: true,
        startTime: null,
        endTime: null,
        note: lines.length ? lines.join("\n") : null,
        location: null,
        color: "indigo",
        remindMinutes: null,
        repeatRule: null,
        repeatUntil: null,
        createdAt: now(),
        updatedAt: now(),
      };
      d.events = [...(d.events ?? []), event];
      d.agendaItems = (d.agendaItems ?? []).map((x: AgendaItem) =>
        x.id === id ? { ...x, archived: true, updatedAt: now() } : x,
      );
      write(d);
      return event;
    },
    async saveMilestone(input) {
      const d = read();
      const list: Milestone[] = d.milestones ?? [];
      const idx = input.id ? list.findIndex((m) => m.id === input.id) : -1;
      const done = input.done ?? false;
      const next: Milestone =
        idx >= 0
          ? {
              ...list[idx],
              title: input.title.trim(),
              done,
              doneAt: done ? (list[idx].doneAt ?? now()) : null,
              updatedAt: now(),
            }
          : {
              id: uid(),
              countdownId: input.countdownId,
              title: input.title.trim(),
              done,
              doneAt: done ? now() : null,
              sortOrder:
                list
                  .filter((m) => m.countdownId === input.countdownId)
                  .reduce((mx, m) => Math.max(mx, m.sortOrder + 1), 0),
              createdAt: now(),
              updatedAt: now(),
            };
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      d.milestones = list;
      write(d);
      return next;
    },
    async deleteMilestone(id) {
      const d = read();
      d.milestones = (d.milestones ?? []).filter((m: Milestone) => m.id !== id);
      write(d);
    },
    async listEvents(from, to) {
      return (read().events ?? []).filter(
        (e: CalEvent) => e.endDate >= from && e.startDate <= to,
      );
    },
    async saveEvent(input) {
      const d = read();
      const list: CalEvent[] = d.events ?? [];
      const idx = input.id ? list.findIndex((e) => e.id === input.id) : -1;
      const base: CalEvent =
        idx >= 0
          ? list[idx]
          : {
              id: uid(),
              title: "",
              startDate: input.startDate,
              endDate: input.endDate,
              allDay: true,
              startTime: null,
              endTime: null,
              note: null,
              location: null,
              color: null,
              remindMinutes: null,
              repeatRule: null,
              repeatUntil: null,
              createdAt: now(),
              updatedAt: now(),
            };
      let s = input.startDate;
      let e2 = input.endDate || input.startDate;
      if (e2 < s) [s, e2] = [e2, s];
      const next: CalEvent = {
        ...base,
        ...input,
        id: base.id,
        startDate: s,
        endDate: e2,
        startTime: input.allDay ? null : (input.startTime ?? null),
        endTime: input.allDay ? null : (input.endTime ?? null),
        updatedAt: now(),
      } as CalEvent;
      if (idx >= 0) list[idx] = next;
      else list.push(next);
      d.events = list;
      write(d);
      return next;
    },
    async moveEvent(id, startDate, endDate) {
      const d = read();
      const e = (d.events ?? []).find((x: CalEvent) => x.id === id);
      if (e) {
        e.startDate = startDate;
        e.endDate = endDate;
        e.updatedAt = now();
      }
      write(d);
    },
    async deleteEvent(id) {
      const d = read();
      d.events = (d.events ?? []).filter((e: CalEvent) => e.id !== id);
      write(d);
    },
    async allSettings() {
      return read().settings ?? [];
    },
    async setSetting(key, value) {
      const d = read();
      const list: [string, string][] = d.settings ?? [];
      const i = list.findIndex(([k]) => k === key);
      if (i >= 0) list[i] = [key, value];
      else list.push([key, value]);
      d.settings = list;
      write(d);
    },
    async exportJson() {
      return "（浏览器预览模式：备份由 Rust 侧写入磁盘）";
    },
    async dataDir() {
      return "（浏览器预览模式）";
    },
  };
}

let backendPromise: Promise<Backend> | null = null;
function backend(): Promise<Backend> {
  if (!backendPromise) {
    backendPromise = inTauri() ? tauriBackend() : Promise.resolve(previewBackend());
  }
  return backendPromise;
}

export const api: Backend = {
  listRoutineSlots: (d) => backend().then((b) => b.listRoutineSlots(d)),
  saveRoutineSlot: (d, k, c) => backend().then((b) => b.saveRoutineSlot(d, k, c)),
  clearRoutineSlot: (d, k) => backend().then((b) => b.clearRoutineSlot(d, k)),
  saveAgendaNote: (id, note) => backend().then((b) => b.saveAgendaNote(id, note)),
  duplicateAgendaItem: (id) => backend().then((b) => b.duplicateAgendaItem(id)),
  listCountdowns: () => backend().then((b) => b.listCountdowns()),
  saveCountdown: (i) => backend().then((b) => b.saveCountdown(i)),
  deleteCountdown: (id) => backend().then((b) => b.deleteCountdown(id)),
  setCrown: (id) => backend().then((b) => b.setCrown(id)),
  listMilestones: () => backend().then((b) => b.listMilestones()),
  saveMilestone: (i) => backend().then((b) => b.saveMilestone(i)),
  deleteMilestone: (id) => backend().then((b) => b.deleteMilestone(id)),
  listAgendaItems: () => backend().then((b) => b.listAgendaItems()),
  saveAgendaItem: (i) => backend().then((b) => b.saveAgendaItem(i)),
  deleteAgendaItem: (id) => backend().then((b) => b.deleteAgendaItem(id)),
  listAgendaSubitems: () => backend().then((b) => b.listAgendaSubitems()),
  saveAgendaSubitem: (i) => backend().then((b) => b.saveAgendaSubitem(i)),
  deleteAgendaSubitem: (id) => backend().then((b) => b.deleteAgendaSubitem(id)),
  scheduleAgendaItem: (id, date) => backend().then((b) => b.scheduleAgendaItem(id, date)),
  listEvents: (f, t) => backend().then((b) => b.listEvents(f, t)),
  saveEvent: (i) => backend().then((b) => b.saveEvent(i)),
  moveEvent: (id, s, e) => backend().then((b) => b.moveEvent(id, s, e)),
  deleteEvent: (id) => backend().then((b) => b.deleteEvent(id)),
  allSettings: () => backend().then((b) => b.allSettings()),
  setSetting: (k, v) => backend().then((b) => b.setSetting(k, v)),
  exportJson: () => backend().then((b) => b.exportJson()),
  dataDir: () => backend().then((b) => b.dataDir()),
};
