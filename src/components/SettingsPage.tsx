import { useState } from "react";
import {
  Calendar,
  Check,
  Database,
  Eye,
  FolderOpen,
  Monitor,
  Palette,
  RefreshCw,
  Settings as SettingsIcon,
  Crown,
  Type,
} from "lucide-react";
import { api } from "../lib/api";
import type { ViewMode } from "../lib/api";
import {
  DEFAULT_FONT_SIZE,
  FONT_SIZES,
  fontScaleOf,
  fontSizeLabel,
} from "../lib/fontScale";
import { useStore, type Settings } from "../store/useStore";
import { useCrown } from "./CrownBar";

type Section = "general" | "calendar" | "display" | "data" | "theme";

const NAV: { key: Section; label: string; icon: React.ReactNode }[] = [
  { key: "general", label: "常规", icon: <SettingsIcon size={16} /> },
  { key: "calendar", label: "日历", icon: <Calendar size={16} /> },
  { key: "display", label: "显示", icon: <Monitor size={16} /> },
  { key: "data", label: "数据", icon: <Database size={16} /> },
  { key: "theme", label: "主题", icon: <Palette size={16} /> },
];

const HEAD: Record<Section, { title: string; sub: string; icon: React.ReactNode }> = {
  general: {
    title: "常规",
    sub: "设置应用的基础行为与启动选项",
    icon: <SettingsIcon size={20} />,
  },
  calendar: { title: "日历", sub: "日历内容与周起始日", icon: <Calendar size={20} /> },
  display: { title: "显示", sub: "纸张质感与信息密度", icon: <Monitor size={20} /> },
  data: { title: "数据", sub: "备份与数据位置", icon: <Database size={20} /> },
  theme: { title: "主题", sub: "选择界面使用的纸张纹理", icon: <Palette size={20} /> },
};

function Card({
  icon,
  title,
  desc,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <h3>
        {icon}
        {title}
      </h3>
      {desc ? <p className="desc">{desc}</p> : <div style={{ height: 10 }} />}
      {children}
    </section>
  );
}

function CheckRow({
  on,
  label,
  onToggle,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button className={`check ${on ? "is-on" : ""}`} onClick={onToggle}>
      <span className="box">
        <Check size={11} strokeWidth={3} />
      </span>
      {label}
    </button>
  );
}

function SwitchRow({
  name,
  sub,
  on,
  onToggle,
}: {
  name: string;
  sub?: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="card-row">
      <span className="k">
        <span className="name">{name}</span>
        {sub ? <span className="sub">{sub}</span> : null}
      </span>
      <button
        className={`switch ${on ? "is-on" : ""}`}
        onClick={onToggle}
        title={name}
      />
    </div>
  );
}

export default function SettingsPage() {
  const [section, setSection] = useState<Section>("general");
  const s = useStore((st) => st.settings);
  const up = useStore((st) => st.updateSetting);
  const notify = useStore((st) => st.notify);
  const dataDir = useStore((st) => st.dataDir);
  const crown = useCrown();
  const setCrown = useStore((st) => st.setCrown);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => void up(k, v);
  const head = HEAD[section];

  const doBackup = async () => {
    try {
      const path = await api.exportJson();
      notify(`备份已写入：${path}`);
    } catch (e) {
      notify(`备份失败：${String(e)}`);
    }
  };

  return (
    <div className="settings">
      <nav className="settings-nav">
        {NAV.map((n) => (
          <button
            key={n.key}
            className={section === n.key ? "is-on" : ""}
            onClick={() => setSection(n.key)}
          >
            {n.icon}
            {n.label}
          </button>
        ))}
      </nav>

      <div className="settings-main">
        <div className="settings-head">
          <span className="ic">{head.icon}</span>
          <h1>{head.title}</h1>
        </div>
        <p className="settings-sub">{head.sub}</p>

        {section === "general" ? (
          <div className="settings-cols">
            <Card icon={<Calendar size={17} />} title="时间与视图" desc="决定日历的排列方式">
              <div className="card-row">
                <span className="k">
                  <span className="name">一周开始于</span>
                </span>
                <div className="segmented mini">
                  <button
                    className={s.weekStart === 1 ? "is-on" : ""}
                    onClick={() => set("weekStart", 1)}
                  >
                    周一
                  </button>
                  <button
                    className={s.weekStart === 0 ? "is-on" : ""}
                    onClick={() => set("weekStart", 0)}
                  >
                    周日
                  </button>
                </div>
              </div>
              <div className="card-row">
                <span className="k">
                  <span className="name">默认视图</span>
                </span>
                <div className="segmented mini">
                  {(
                    [
                      ["month", "月"],
                      ["week", "周"],
                      ["day", "日"],
                    ] as [ViewMode, string][]
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      // 老库里可能存着 legacy 的 "agenda"，此时按「月」高亮（与 init 的归一一致）
                      className={(s.defaultView === "agenda" ? "month" : s.defaultView) === k ? "is-on" : ""}
                      onClick={() => set("defaultView", k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="card-row">
                <span className="k">
                  <span className="name">启动后打开</span>
                  <span className="sub">日历还是议程页</span>
                </span>
                <div className="segmented mini">
                  {(
                    [
                      ["calendar", "日历"],
                      ["agenda", "议程"],
                    ] as ["calendar" | "agenda", string][]
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      className={s.defaultPage === k ? "is-on" : ""}
                      onClick={() => set("defaultPage", k)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </Card>

            <Card
              icon={<Monitor size={17} />}
              title="应用行为"
              desc="纸张质感、常驻与启动方式"
            >
              <SwitchRow
                name="纸张装饰"
                sub="水墨、竹叶、胶带等装饰元素"
                on={s.paperDecorations}
                onToggle={() => set("paperDecorations", !s.paperDecorations)}
              />
              <SwitchRow
                name="纸张纹理"
                sub="纸面细噪点"
                on={s.paperTexture}
                onToggle={() => set("paperTexture", !s.paperTexture)}
              />
              <SwitchRow
                name="菜单栏常驻"
                sub="关闭窗口后仍留在菜单栏，点图标可重新打开"
                on={s.menuBarIcon}
                onToggle={() => set("menuBarIcon", !s.menuBarIcon)}
              />
              <div className="card-row">
                <span className="k">
                  <span className="name">关闭按钮行为</span>
                  <span className="sub">点击窗口左上角关闭按钮时</span>
                </span>
                <div className="segmented mini">
                  <button
                    className={s.closeBehavior === "hide" ? "is-on" : ""}
                    onClick={() => set("closeBehavior", "hide")}
                  >
                    隐藏窗口
                  </button>
                  <button
                    className={s.closeBehavior === "quit" ? "is-on" : ""}
                    onClick={() => set("closeBehavior", "quit")}
                  >
                    直接退出
                  </button>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {section === "calendar" ? (
          <div className="settings-cols">
            <Card
              icon={<Eye size={17} />}
              title="日历内容显示"
              desc="在日历中显示以下中国传统与节日信息"
            >
              <div className="checks">
                <CheckRow
                  on={s.showLunar}
                  label="农历"
                  onToggle={() => set("showLunar", !s.showLunar)}
                />
                <CheckRow
                  on={s.showTerms}
                  label="节气"
                  onToggle={() => set("showTerms", !s.showTerms)}
                />
                <CheckRow
                  on={s.showHolidays}
                  label="节日"
                  onToggle={() => set("showHolidays", !s.showHolidays)}
                />
                <CheckRow
                  on={s.showHolidayBadge}
                  label="法定节假日（休 / 班角标）"
                  onToggle={() => set("showHolidayBadge", !s.showHolidayBadge)}
                />
                <CheckRow
                  on={s.showCountdownMark}
                  label="倒计时角标（朱砂「倒」）"
                  onToggle={() => set("showCountdownMark", !s.showCountdownMark)}
                />
              </div>
            </Card>

            <Card icon={<Calendar size={17} />} title="周起始日" desc="同时作用于月视图与迷你月历">
              <div className="card-row">
                <span className="k">
                  <span className="name">一周开始于</span>
                  <span className="sub">改动后月视图网格会立即重排</span>
                </span>
                <div className="segmented mini">
                  <button
                    className={s.weekStart === 1 ? "is-on" : ""}
                    onClick={() => set("weekStart", 1)}
                  >
                    周一
                  </button>
                  <button
                    className={s.weekStart === 0 ? "is-on" : ""}
                    onClick={() => set("weekStart", 0)}
                  >
                    周日
                  </button>
                </div>
              </div>
            </Card>
          </div>
        ) : null}

        {section === "display" ? (
          <div className="settings-cols">
            <Card
              icon={<Type size={17} />}
              title="字号"
              desc="只放大文字，并让容器按需一起长高 —— 不会裁切文字或让布局错位"
            >
              <div className="card-row">
                <span className="k">
                  <span className="name">界面字号</span>
                  <span className="sub">
                    当前：{fontSizeLabel(s.fontSize)}（
                    {Math.round(fontScaleOf(s.fontSize) * 100)}%）
                  </span>
                </span>
                <div className="segmented mini">
                  {FONT_SIZES.map((f) => (
                    <button
                      key={f.key}
                      className={s.fontSize === f.key ? "is-on" : ""}
                      onClick={() => set("fontSize", f.key)}
                      title={f.hint}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="font-preview" aria-label="字号预览">
                <div className="fp-clock">剩余 12 天</div>
                <div className="fp-title">期末考试</div>
                <div className="fp-meta">2026-06-07 周日 · 09:30</div>
                <div className="fp-event">
                  <span className="dot" style={{ background: "var(--ev-indigo-line)" }} />
                  项目讨论
                </div>
              </div>

              <div className="card-row" style={{ borderTop: "none", paddingTop: 4 }}>
                <span className="k">
                  <span className="sub">
                    时间轴行高、月视图行高、左栏宽度会自动跟着调整
                  </span>
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  disabled={s.fontSize === DEFAULT_FONT_SIZE}
                  onClick={() => set("fontSize", DEFAULT_FONT_SIZE)}
                >
                  恢复默认
                </button>
              </div>
            </Card>

            <Card
              icon={<Crown size={17} />}
              title="皇冠栏"
              desc="标题栏下方常驻一行，只显示最重要那条倒计时的标题与倒计时"
            >
              <SwitchRow
                name="显示皇冠栏"
                sub="关掉后那一行不占高度"
                on={s.showCrownBar}
                onToggle={() => set("showCrownBar", !s.showCrownBar)}
              />
              <div className="card-row">
                <span className="k">
                  <span className="sub">
                    {crown
                      ? `当前皇冠：「${crown.title}」`
                      : "还没有皇冠 —— 在左侧倒计时卡片的 ⋯ 菜单里选「设为皇冠」"}
                  </span>
                </span>
                {crown ? (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => void setCrown(null)}
                  >
                    取消皇冠
                  </button>
                ) : null}
              </div>
            </Card>

            <Card icon={<Monitor size={17} />} title="信息密度" desc="影响列表与时间轴的间距">
              <div className="card-row">
                <span className="k">
                  <span className="name">密度</span>
                </span>
                <div className="segmented mini">
                  <button
                    className={s.density === "comfortable" ? "is-on" : ""}
                    onClick={() => set("density", "comfortable")}
                  >
                    舒适
                  </button>
                  <button
                    className={s.density === "compact" ? "is-on" : ""}
                    onClick={() => set("density", "compact")}
                  >
                    紧凑
                  </button>
                </div>
              </div>
              <SwitchRow
                name="纸张纹理"
                sub="关掉后纸面更平，长时间阅读更省眼"
                on={s.paperTexture}
                onToggle={() => set("paperTexture", !s.paperTexture)}
              />
            </Card>
            <Card
              icon={<Palette size={17} />}
              title="装饰元素"
              desc="水墨、竹叶、胶带、图钉"
            >
              <SwitchRow
                name="纸张装饰"
                sub="关闭后仅保留纸色与排版"
                on={s.paperDecorations}
                onToggle={() => set("paperDecorations", !s.paperDecorations)}
              />
            </Card>
          </div>
        ) : null}

        {section === "data" ? (
          <div className="settings-cols">
            <Card icon={<Database size={17} />} title="数据" desc="全部数据保存在本地 SQLite，不联网">
              <div className="card-row">
                <span className="k">
                  <span className="name">手动备份</span>
                  <span className="sub">导出为 JSON 文件（含倒计时、里程碑、事件、议程、日常安排与设置）</span>
                </span>
                <button className="btn btn-outline btn-sm" onClick={() => void doBackup()}>
                  <RefreshCw size={13} />
                  立即备份
                </button>
              </div>
              <div className="card-row">
                <span className="k">
                  <span className="name">数据位置</span>
                  <span className="sub">数据库与备份所在的文件夹</span>
                </span>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => notify(dataDir || "（未获取到路径）")}
                >
                  <FolderOpen size={13} />
                  查看
                </button>
              </div>
              <div className="path-box" title={dataDir}>
                {dataDir || "…"}
              </div>
            </Card>
          </div>
        ) : null}

        {section === "theme" ? (
          <Card
            icon={<Palette size={17} />}
            title="纸张主题"
            desc="选择界面使用的纸张纹理，让记录更有温度"
          >
            <div className="theme-grid">
              <button
                className={`theme-card ${s.theme === "xuan" ? "is-on" : ""}`}
                onClick={() => set("theme", "xuan")}
              >
                <span
                  className="sw"
                  style={{
                    background:
                      "linear-gradient(135deg,#F6F2EB 0%,#F0E9E2 60%,#E8DFD3 100%)",
                  }}
                />
                <span className="nm">宣纸</span>
                <span className="ds">传统水墨纹理，典雅柔和</span>
                {s.theme === "xuan" ? (
                  <span className="tick">
                    <Check size={11} strokeWidth={3} />
                  </span>
                ) : null}
              </button>

              <button className="theme-card is-locked" disabled title="接口已预留">
                <span
                  className="sw"
                  style={{
                    backgroundImage:
                      "linear-gradient(#EAE4D8 1px, transparent 1px), linear-gradient(90deg,#EAE4D8 1px,transparent 1px)",
                    backgroundSize: "12px 12px",
                    backgroundColor: "#FCFAF5",
                  }}
                />
                <span className="nm">米白格纸</span>
                <span className="ds">清新简约，适合专注记录</span>
              </button>

              <button className="theme-card is-locked" disabled title="接口已预留">
                <span
                  className="sw"
                  style={{
                    background:
                      "linear-gradient(135deg,#D8BE97 0%,#C8A97C 60%,#B08F62 100%)",
                  }}
                />
                <span className="nm">牛皮纸</span>
                <span className="ds">质朴自然，敬请期待</span>
              </button>
            </div>
            <p className="desc" style={{ marginTop: 12, marginBottom: 0 }}>
              色板、圆角、阴影全部走 CSS 变量（theme token），新增主题只需补一份
              同名变量，组件层无需改动。
            </p>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
