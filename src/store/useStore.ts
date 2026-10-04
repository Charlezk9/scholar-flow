import { create } from "zustand";
import {
  api,
  type AgendaItem,
  type AgendaItemInput,
  type AgendaSubitem,
  type CalEvent,
  type Countdown,
  type EventInput,
  type CountdownInput,
  type Milestone,
  type MilestoneInput,
  type ViewMode,
} from "../lib/api";
import { addDays, fromISO, today, toISO } from "../lib/date";
import { DEFAULT_FONT_SIZE, hourHeight, type FontSizeKey } from "../lib/fontScale";

export interface Settings {
  weekStart: 0 | 1;
  defaultView: ViewMode;
  /** 启动后落在哪个页面（v1.2 · SET-14） */
  defaultPage: "calendar" | "agenda";
  /** v1.2 旧设置，v1.3 不再显示预览；仅兼容保存的值。 */
  showAgendaUpcoming: boolean;
  showLunar: boolean;
  showTerms: boolean;
  showHolidays: boolean;
  showHolidayBadge: boolean;
  showCountdownMark: boolean;
  /** 标题栏下方那一行皇冠倒计时 */
  showCrownBar: boolean;
  paperTexture: boolean;
  paperDecorations: boolean;
  theme: string;
  density: "comfortable" | "compact";
  fontSize: FontSizeKey;
  menuBarIcon: boolean;
  closeBehavior: "hide" | "quit";
  launchAtLogin: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  weekStart: 1,
  defaultView: "month",
  defaultPage: "calendar",
  showAgendaUpcoming: true,
  showLunar: true,
  showTerms: true,
  showHolidays: true,
  showHolidayBadge: true,
  showCountdownMark: true,
  showCrownBar: true,
  paperTexture: true,
  paperDecorations: true,
  theme: "xuan",
  density: "comfortable",
  fontSize: DEFAULT_FONT_SIZE,
  menuBarIcon: true,
  closeBehavior: "hide",
  launchAtLogin: false,
};

const SETTING_KEYS: (keyof Settings)[] = [
  "weekStart",
  "defaultView",
  "defaultPage",
  "showAgendaUpcoming",
  "showLunar",
  "showTerms",
  "showHolidays",
  "showHolidayBadge",
  "showCountdownMark",
  "showCrownBar",
  "paperTexture",
  "paperDecorations",
  "theme",
  "density",
  "fontSize",
  "menuBarIcon",
  "closeBehavior",
  "launchAtLogin",
];

function decodeSettings(pairs: [string, string][]): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  const map = new Map(pairs);
  for (const key of SETTING_KEYS) {
    const raw = map.get(key);
    if (raw === undefined) continue;
    const def = DEFAULT_SETTINGS[key];
    if (typeof def === "boolean") {
      (s[key] as boolean) = raw === "true" || raw === "1";
    } else if (typeof def === "number") {
      const n = Number(raw);
      if (!Number.isNaN(n)) (s[key] as number) = n;
    } else {
      (s[key] as string) = raw;
    }
  }
  return s;
}

export function applyTheme(s: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = s.theme;
  root.dataset.texture = s.paperTexture ? "on" : "off";
  root.dataset.decor = s.paperDecorations ? "on" : "off";
  root.dataset.density = s.density;
  root.dataset.font = s.fontSize;
  // 时间轴行高由 JS 取整后写回，保证 CSS 布局与 WeekView 里的像素运算完全一致
  root.style.setProperty("--hour-h", `${hourHeight(s.fontSize)}px`);
}

/** 纸张风格确认弹窗的请求体 */
export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
}

interface Store {
  ready: boolean;
  page: "calendar" | "agenda" | "literature" | "settings";
  view: ViewMode;
  cursor: string;
  selected: string;
  countdowns: Countdown[];
  /** 全部里程碑（决议 Q3：一次全量，按 countdownId 归集） */
  milestones: Milestone[];
  /** 当前展开显示里程碑的那张卡片；单选，不落库（决议 Q4/Q5） */
  expandedId: string | null;
  /** 议程事项（v1.2 · AG-*） */
  agendaItems: AgendaItem[];
  agendaSubitems: AgendaSubitem[];
  /** 议程页可同时展开多张便签，不落库 */
  agendaExpandedIds: string[];
  agendaNoteDrafts: Record<string, string>;
  setAgendaNoteDraft: (id: string, text: string | null) => void;
  saveAgendaNote: (id: string, note: string) => Promise<void>;
  duplicateAgendaItem: (id: string) => Promise<void>;
  /** 议程页正在就地改名的事项（菜单里的「编辑标题」用它唤起） */
  agendaEditingId: string | null;
  /** 「安排到某天」浮层正在处理的事项 id */
  scheduleDraftId: string | null;
  events: CalEvent[];
  settings: Settings;
  loading: boolean;
  /** 事件抽屉 */
  eventDraft: Partial<CalEvent> | null;
  /** 倒计时编辑（行内展开） */
  countdownDraft: Partial<Countdown> | null;
  toast: string | null;
  dataDir: string;
  /** 站内确认弹窗（不用 window.confirm —— Tauri 的 WKWebView 里它不弹窗且恒返回 false） */
  dialog: ConfirmRequest | null;

  init: () => Promise<void>;
  setPage: (p: "calendar" | "agenda" | "literature" | "settings") => void;
  setView: (v: ViewMode) => void;
  goto: (iso: string) => void;
  shift: (dir: -1 | 1) => void;
  goToday: () => void;
  select: (iso: string) => void;

  reloadCountdowns: () => Promise<void>;
  reloadEvents: () => Promise<void>;
  reloadMilestones: () => Promise<void>;

  /** 展开 / 收起某张卡片的里程碑区（单选；再点一次收起） */
  toggleExpanded: (id: string) => void;
  saveMilestone: (input: MilestoneInput) => Promise<void>;
  /** 勾选 / 取消勾选（走整条覆写，单一入口） */
  toggleMilestone: (m: Milestone) => Promise<void>;
  renameMilestone: (m: Milestone, title: string) => Promise<void>;
  deleteMilestone: (id: string) => Promise<void>;
  /** 复制倒计时（含里程碑，完成态重置 —— 决议 Q7） */
  duplicateCountdown: (c: Countdown) => Promise<void>;
  /**
   * 事项改名（单一入口）。
   * 必须整体转发 `note / pinned / archived` —— `saveAgendaItem` 是整条覆写，
   * 只传 `{id, title}` 会把 `note` 静默写成 NULL（第二轮独立验证发现的真 bug）。
   */
  renameAgendaItem: (item: AgendaItem, title: string) => Promise<void>;

  reloadAgenda: () => Promise<void>;
  saveAgendaItem: (input: AgendaItemInput) => Promise<void>;
  setAgendaArchived: (item: AgendaItem, archived: boolean) => Promise<void>;
  toggleAgendaPin: (item: AgendaItem) => Promise<void>;
  deleteAgendaItem: (id: string) => Promise<void>;
  toggleAgendaExpanded: (id: string) => void;
  setAgendaEditing: (id: string | null) => void;
  saveAgendaSubitem: (input: {
    id?: string | null;
    itemId: string;
    title: string;
    done?: boolean;
  }) => Promise<void>;
  toggleAgendaSubitem: (sub: AgendaSubitem) => Promise<void>;
  renameAgendaSubitem: (sub: AgendaSubitem, title: string) => Promise<void>;
  deleteAgendaSubitem: (id: string) => Promise<void>;
  /** 打开「安排到某天」浮层 */
  openScheduleDraft: (id: string | null) => void;
  /** 确认安排：建事件 + 事项归档（AG-05） */
  scheduleAgendaItem: (id: string, date: string) => Promise<void>;

  saveCountdown: (input: CountdownInput) => Promise<void>;
  deleteCountdown: (id: string) => Promise<void>;
  /** 设置皇冠（全局唯一）；传 null 取消 */
  setCrown: (id: string | null) => Promise<void>;
  togglePin: (c: Countdown) => Promise<void>;
  archive: (c: Countdown, archived: boolean) => Promise<void>;
  openCountdownDraft: (d: Partial<Countdown> | null) => void;

  openEventDraft: (d: Partial<CalEvent> | null) => void;
  saveEvent: (input: EventInput) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;
  moveEvent: (id: string, start: string, end: string) => Promise<void>;
  duplicateEvent: (e: CalEvent) => Promise<void>;

  updateSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => Promise<void>;
  notify: (msg: string) => void;
  clearToast: () => void;

  askConfirm: (req: ConfirmRequest) => void;
  dismissDialog: () => void;
}

let toastTimer: number | undefined;

export const useStore = create<Store>((set, get) => ({
  ready: false,
  page: "calendar",
  view: DEFAULT_SETTINGS.defaultView,
  cursor: toISO(today()),
  selected: toISO(today()),
  countdowns: [],
  milestones: [],
  expandedId: null,
  agendaItems: [],
  agendaSubitems: [],
  agendaExpandedIds: [],
  agendaNoteDrafts: {},
  agendaEditingId: null,
  scheduleDraftId: null,
  events: [],
  settings: DEFAULT_SETTINGS,
  loading: true,
  eventDraft: null,
  countdownDraft: null,
  toast: null,
  dataDir: "",
  dialog: null,

  async init() {
    try {
      const [countdowns, settingsPairs, events, dataDir, milestones, agendaItems, agendaSubitems] =
        await Promise.all([
          api.listCountdowns(),
          api.allSettings(),
          api.listEvents("1900-01-01", "2200-12-31"),
          api.dataDir(),
          api.listMilestones(),
          api.listAgendaItems(),
          api.listAgendaSubitems(),
        ]);
      const settings = decodeSettings(settingsPairs);
      applyTheme(settings);
      // v1.2：议程升为独立页面，「等 = 视图」的老库可能存着 defaultView: "agenda"，
      // 直接用它会让日历区渲染成空 —— 归一到 month
      const view: ViewMode = settings.defaultView === "agenda" ? "month" : settings.defaultView;
      set({
        countdowns,
        events,
        milestones,
        agendaItems,
        agendaSubitems,
        settings,
        page: settings.defaultPage,
        view,
        dataDir,
        ready: true,
        loading: false,
      });
    } catch (err) {
      set({ loading: false, ready: true });
      get().notify(`初始化失败：${String(err)}`);
    }
  },

  setPage: (page) => set({ page }),
  setView: (view) => set({ view }),
  goto: (iso) => set({ cursor: iso, selected: iso }),
  goToday: () => {
    const t = toISO(today());
    set({ cursor: t, selected: t });
  },

  shift: (dir) => {
    const { view, cursor } = get();
    const d = fromISO(cursor);
    let next: Date;
    if (view === "month") {
      next = new Date(d.getFullYear(), d.getMonth() + dir, 1, 12);
    } else if (view === "week") {
      next = addDays(d, 7 * dir);
    } else if (view === "day") {
      next = addDays(d, dir);
    } else {
      next = addDays(d, 30 * dir);
    }
    set({ cursor: toISO(next) });
  },

  select: (iso) => set({ selected: iso }),

  async reloadCountdowns() {
    set({ countdowns: await api.listCountdowns() });
  },

  async reloadEvents() {
    set({ events: await api.listEvents("1900-01-01", "2200-12-31") });
  },

  async reloadMilestones() {
    set({ milestones: await api.listMilestones() });
  },

  toggleExpanded(id) {
    set((s) => ({ expandedId: s.expandedId === id ? null : id }));
  },

  async saveMilestone(input) {
    await api.saveMilestone(input);
    await get().reloadMilestones();
  },

  async toggleMilestone(m) {
    await api.saveMilestone({
      id: m.id,
      countdownId: m.countdownId,
      title: m.title,
      done: !m.done,
    });
    await get().reloadMilestones();
  },

  async renameMilestone(m, title) {
    const next = title.trim();
    if (!next || next === m.title) return;
    await api.saveMilestone({ id: m.id, countdownId: m.countdownId, title: next, done: m.done });
    await get().reloadMilestones();
  },

  async deleteMilestone(id) {
    const m = get().milestones.find((x) => x.id === id);
    await api.deleteMilestone(id);
    await get().reloadMilestones();
    if (m) get().notify(`已删除「${m.title}」`);
  },

  async reloadAgenda() {
    const [agendaItems, agendaSubitems] = await Promise.all([
      api.listAgendaItems(),
      api.listAgendaSubitems(),
    ]);
    set({ agendaItems, agendaSubitems });
  },

  async saveAgendaItem(input) {
    const saved = await api.saveAgendaItem(input);
    await get().reloadAgenda();
    const isNew = !input.id;
    get().notify(isNew ? `已添加「${saved.title}」` : `已保存「${saved.title}」`);
  },

  async renameAgendaItem(item, title) {
    const next = title.trim();
    if (!next || next === item.title) return;
    await api.saveAgendaItem({
      id: item.id,
      title: next,
      note: item.note,
      pinned: item.pinned,
      archived: item.archived,
    });
    await get().reloadAgenda();
  },

  async setAgendaArchived(item, archived) {
    await api.saveAgendaItem({
      id: item.id,
      title: item.title,
      note: item.note,
      pinned: item.pinned,
      archived,
    });
    await get().reloadAgenda();
    if (archived) set((s) => ({ agendaExpandedIds: s.agendaExpandedIds.filter((x) => x !== item.id) }));
    get().notify(archived ? `「${item.title}」已完成` : "已恢复");
  },

  async toggleAgendaPin(item) {
    await api.saveAgendaItem({
      id: item.id,
      title: item.title,
      note: item.note,
      pinned: !item.pinned,
      archived: item.archived,
    });
    await get().reloadAgenda();
  },

  async deleteAgendaItem(id) {
    const item = get().agendaItems.find((x) => x.id === id);
    await api.deleteAgendaItem(id);
    await get().reloadAgenda();
    set((s) => ({ agendaExpandedIds: s.agendaExpandedIds.filter((x) => x !== id) }));
    get().setAgendaNoteDraft(id, null);
    if (item) get().notify(`已删除「${item.title}」`);
  },

  toggleAgendaExpanded(id) {
    set((s) => ({ agendaExpandedIds: s.agendaExpandedIds.includes(id) ? s.agendaExpandedIds.filter((x) => x !== id) : [...s.agendaExpandedIds, id] }));
  },
  setAgendaNoteDraft(id, text) {
    set((s) => {
      const drafts = { ...s.agendaNoteDrafts };
      if (text === null) delete drafts[id]; else drafts[id] = text;
      return { agendaNoteDrafts: drafts };
    });
  },
  async saveAgendaNote(id, note) {
    await api.saveAgendaNote(id, note);
    await get().reloadAgenda();
    get().setAgendaNoteDraft(id, null);
    get().notify("正文已保存");
  },
  async duplicateAgendaItem(id) {
    await api.duplicateAgendaItem(id);
    await get().reloadAgenda();
    get().notify("已复制便签与待办");
  },

  setAgendaEditing: (id) => set({ agendaEditingId: id }),

  async saveAgendaSubitem(input) {
    await api.saveAgendaSubitem(input);
    await get().reloadAgenda();
  },

  async toggleAgendaSubitem(sub) {
    await api.saveAgendaSubitem({
      id: sub.id,
      itemId: sub.itemId,
      title: sub.title,
      done: !sub.done,
    });
    await get().reloadAgenda();
  },

  async renameAgendaSubitem(sub, title) {
    const next = title.trim();
    if (!next || next === sub.title) return;
    await api.saveAgendaSubitem({
      id: sub.id,
      itemId: sub.itemId,
      title: next,
      done: sub.done,
    });
    await get().reloadAgenda();
  },

  async deleteAgendaSubitem(id) {
    const sub = get().agendaSubitems.find((x) => x.id === id);
    await api.deleteAgendaSubitem(id);
    await get().reloadAgenda();
    if (sub) get().notify(`已删除「${sub.title}」`);
  },

  openScheduleDraft: (id) => set({ scheduleDraftId: id }),

  async scheduleAgendaItem(id, date) {
    const item = get().agendaItems.find((x) => x.id === id);
    const ev = await api.scheduleAgendaItem(id, date);
    await get().reloadAgenda();
    await get().reloadEvents();
    set((s) => ({ scheduleDraftId: null, agendaExpandedIds: s.agendaExpandedIds.filter((x) => x !== id) }));
    const nice = `${ev.startDate.slice(5, 7)} 月 ${Number(ev.startDate.slice(8, 10))} 日`;
    get().notify(`已安排到 ${nice}${item ? ` ·「${item.title}」移入已完成` : ""}`);
  },

  async duplicateCountdown(c) {
    const saved = await api.saveCountdown({
      title: `${c.title} 副本`,
      targetDate: c.targetDate,
      targetTime: c.targetTime,
      startDate: c.startDate,
      note: c.note,
      color: c.color,
      showOnCalendar: c.showOnCalendar,
    });
    // 决议 Q7：把里程碑一并带过去，但完成态重置（副本当作新的一份来用）
    for (const m of get().milestones.filter((x) => x.countdownId === c.id)) {
      await api.saveMilestone({
        countdownId: saved.id,
        title: m.title,
        done: false,
        sortOrder: m.sortOrder,
      });
    }
    await get().reloadCountdowns();
    await get().reloadMilestones();
    get().notify(`已复制「${c.title}」`);
  },

  async saveCountdown(input) {
    const saved = await api.saveCountdown(input);
    await get().reloadCountdowns();
    set({ countdownDraft: null });
    get().notify(`已保存「${saved.title}」`);
  },

  async deleteCountdown(id) {
    await api.deleteCountdown(id);
    await get().reloadCountdowns();
    await get().reloadMilestones();
    if (get().expandedId === id) set({ expandedId: null });
    set({ countdownDraft: null });
    get().notify("已删除");
  },

  async setCrown(id) {
    await api.setCrown(id);
    await get().reloadCountdowns();
    const c = id ? get().countdowns.find((x) => x.id === id) : null;
    get().notify(c ? `「${c.title}」已戴上皇冠` : "已取消皇冠");
  },

  async togglePin(c) {
    await api.saveCountdown({
      id: c.id,
      title: c.title,
      targetDate: c.targetDate,
      targetTime: c.targetTime,
      startDate: c.startDate,
      note: c.note,
      color: c.color,
      pinned: !c.pinned,
      showOnCalendar: c.showOnCalendar,
      repeatRule: c.repeatRule,
      archived: c.archived,
      remindDays: c.remindDays,
    });
    await get().reloadCountdowns();
  },

  async archive(c, archived) {
    await api.saveCountdown({
      id: c.id,
      title: c.title,
      targetDate: c.targetDate,
      targetTime: c.targetTime,
      startDate: c.startDate,
      note: c.note,
      color: c.color,
      pinned: c.pinned,
      showOnCalendar: c.showOnCalendar,
      repeatRule: c.repeatRule,
      archived,
      remindDays: c.remindDays,
    });
    await get().reloadCountdowns();
    get().notify(archived ? "已归档" : "已恢复");
  },

  openCountdownDraft: (d) => set({ countdownDraft: d }),

  openEventDraft: (d) => set({ eventDraft: d }),

  async saveEvent(input) {
    await api.saveEvent(input);
    await get().reloadEvents();
    set({ eventDraft: null });
    get().notify(`已保存「${input.title}」`);
  },

  async deleteEvent(id) {
    await api.deleteEvent(id);
    await get().reloadEvents();
    set({ eventDraft: null });
    get().notify("已删除");
  },

  async moveEvent(id, start, end) {
    await api.moveEvent(id, start, end);
    await get().reloadEvents();
  },

  async duplicateEvent(e) {
    await api.saveEvent({
      title: `${e.title} 副本`,
      startDate: e.startDate,
      endDate: e.endDate,
      allDay: e.allDay,
      startTime: e.startTime,
      endTime: e.endTime,
      note: e.note,
      location: e.location,
      color: e.color,
    });
    await get().reloadEvents();
    get().notify("已复制");
  },

  async updateSetting(k, v) {
    const next = { ...get().settings, [k]: v };
    set({ settings: next });
    applyTheme(next);
    const raw = typeof v === "boolean" ? String(v) : String(v);
    await api.setSetting(k as string, raw);
  },

  notify(msg) {
    set({ toast: msg });
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => set({ toast: null }), 2200);
  },

  clearToast: () => set({ toast: null }),

  askConfirm: (req) => set({ dialog: req }),

  dismissDialog: () => set({ dialog: null }),
}));

/**
 * 让「确认 → 执行」有一个统一入口：
 * 用于所有破坏性操作，保证不会因为 WebView 不支持原生 confirm 而静默失效。
 */
export async function confirmThen(req: ConfirmRequest) {
  const s = useStore.getState();
  s.askConfirm({
    ...req,
    onConfirm: async () => {
      useStore.getState().dismissDialog();
      await req.onConfirm();
    },
  });
}

export type { Store as AppStore };
