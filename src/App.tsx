import { useEffect } from "react";
import TopBar from "./components/TopBar";
import CrownBar from "./components/CrownBar";
import CountdownPanel from "./components/CountdownPanel";
import CalendarHeader from "./components/CalendarHeader";
import MonthView from "./components/MonthView";
import WeekView from "./components/WeekView";
import AgendaPage from "./components/AgendaPage";
import EventDrawer from "./components/EventDrawer";
import CountdownDrawer from "./components/CountdownDrawer";
import SettingsPage from "./components/SettingsPage";
import Toast from "./components/Toast";
import ConfirmDialog from "./components/ConfirmDialog";
import { inTauri } from "./lib/api";
import { useStore } from "./store/useStore";
import { toISO, today } from "./lib/date";

/** 可选的顺手按键：`[` `]` 切周期、`Esc` 关面板。界面上均有可见按钮，非必需路径。 */
function useOptionalKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /INPUT|TEXTAREA|SELECT/.test(t.tagName) && e.key !== "Escape") return;
      const s = useStore.getState();
      if (e.key === "[") s.shift(-1);
      else if (e.key === "]") s.shift(1);
      else if (e.key === "Escape") {
        if (s.eventDraft) s.openEventDraft(null);
        else if (s.countdownDraft) s.openCountdownDraft(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export default function App() {
  const ready = useStore((s) => s.ready);
  const page = useStore((s) => s.page);
  const view = useStore((s) => s.view);
  const init = useStore((s) => s.init);
  const openEventDraft = useStore((s) => s.openEventDraft);
  const openCountdownDraft = useStore((s) => s.openCountdownDraft);
  const goToday = useStore((s) => s.goToday);

  useOptionalKeys();

  useEffect(() => {
    void init();
  }, [init]);

  // 菜单栏 / 原生菜单 → 前端动作（MAC-02 / MAC-04）
  useEffect(() => {
    if (!inTauri()) return;
    let off: Array<() => void> = [];
    void (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      off.push(
        await listen<string>("menu-action", (e) => {
          const todayIso = toISO(today());
          const s = useStore.getState();
          switch (e.payload) {
            case "new_countdown":
              s.setPage("calendar");
              openCountdownDraft({ targetDate: todayIso });
              break;
            case "new_event":
              s.setPage("calendar");
              openEventDraft({
                startDate: s.selected,
                endDate: s.selected,
                allDay: true,
                color: "indigo",
              });
              break;
            case "today":
              s.setPage("calendar");
              goToday();
              break;
            default:
              break;
          }
        }),
      );
      off.push(
        await listen<string>("nav", (e) => {
          const s = useStore.getState();
          if (e.payload === "prev") s.shift(-1);
          else if (e.payload === "next") s.shift(1);
        }),
      );
    })();
    return () => {
      off.forEach((f) => f());
      off = [];
    };
  }, [openCountdownDraft, openEventDraft, goToday]);

  if (!ready) {
    return <div className="loading">正在铺开纸页…</div>;
  }

  return (
    <div className="app">
      <TopBar />
      <CrownBar />
      {page === "settings" ? (
        <SettingsPage />
      ) : page === "agenda" ? (
        <AgendaPage />
      ) : (
        <div className="body">
          <CountdownPanel />
          <main className="main">
            <CalendarHeader />
            <div className="cal-body">
              {view === "month" && <MonthView />}
              {view === "week" && <WeekView mode="week" />}
              {view === "day" && <WeekView mode="day" />}
            </div>
          </main>
        </div>
      )}
      <EventDrawer />
      <CountdownDrawer />
      <ConfirmDialog />
      <Toast />
    </div>
  );
}
