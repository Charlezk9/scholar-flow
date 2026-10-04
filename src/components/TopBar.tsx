import { useEffect } from "react";
import { CalendarDays, ListTodo, Settings, Sun } from "lucide-react";
import { useStore } from "../store/useStore";
import { formatFullDate } from "../lib/date";
import { useNow } from "../lib/tick";

const pad = (n: number) => String(n).padStart(2, "0");

/** 顶栏实时时钟（同时写入窗口标题） */
function LiveNow() {
  const now = useNow();
  const d = new Date(now);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  useEffect(() => {
    document.title = `${time} · RunningDO`;
  }, [time]);

  return (
    <>
      <Sun size={15} />
      <span className="d">{formatFullDate(d)}</span>
      <span className="sep">·</span>
      <span className="clock" title="当前时间">
        {time}
      </span>
    </>
  );
}

export default function TopBar() {
  const page = useStore((s) => s.page);
  const setPage = useStore((s) => s.setPage);
  const goToday = useStore((s) => s.goToday);

  return (
    <header className="topbar" data-tauri-drag-region>
      <div className="brand">RunningDO</div>
      <button
        className="topbar-date"
        onClick={() => {
          setPage("calendar");
          goToday();
        }}
        title="回到今天"
      >
        <LiveNow />
      </button>

      <div className="topbar-spacer" />

      <button
        className={`ghost-btn ${page === "calendar" ? "is-active" : ""}`}
        onClick={() => setPage("calendar")}
      >
        <CalendarDays size={15} />
        日历
      </button>
      <button
        className={`ghost-btn ${page === "agenda" ? "is-active" : ""}`}
        onClick={() => setPage("agenda")}
        title="没有日期的待办都放这里"
      >
        <ListTodo size={15} />
        议程
      </button>
      <button
        className={`ghost-btn ${page === "settings" ? "is-active" : ""}`}
        onClick={() => setPage("settings")}
      >
        <Settings size={15} />
        设置
      </button>
    </header>
  );
}
