/**
 * 日历标题栏（v1.1 · UI-22）。
 *
 * 覆盖：标题带完整文字的 title 属性、窄窗切换短格式、四个视图按钮、今天/新建事件。
 * 「按钮单行不折行」「标题省略号」这类没法在 jsdom 里量的，由 tokens.test.ts
 * 的样式不变量审计直接读源码看住。
 */
import { setupDom, section, ok, report, q, qa, text, byText, click, sleep } from "./harness";

setupDom();

type MediaStub = {
  matches: boolean;
  media: string;
  addEventListener: () => void;
  removeEventListener: () => void;
  addListener: () => void;
  removeListener: () => void;
  dispatchEvent: () => boolean;
};

function stubMatchMedia(matches: boolean) {
  (window as unknown as { matchMedia: (q: string) => MediaStub }).matchMedia = (
    query: string,
  ) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

async function main() {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useStore, DEFAULT_SETTINGS, applyTheme } = await import("../store/useStore");
  const { default: CalendarHeader } = await import("../components/CalendarHeader");
  const { default: MiniCalendar } = await import("../components/MiniCalendar");
  const { weekDays, fromISO, today, toISO } = await import("../lib/date");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);

  localStorage.clear();
  stubMatchMedia(false); // 先按「宽窗」启动
  await React.act(async () => {
    applyTheme(DEFAULT_SETTINGS);
    await useStore.getState().init();
  });

  const st = () => useStore.getState();
  const render = async () => {
    await React.act(async () => {
      root.render(h(CalendarHeader, null));
    });
  };

  await React.act(async () => {
    st().setView("week");
    await sleep(10);
  });

  /* ------------------------------------------------------------ 宽窗：长格式 */
  section("宽窗（>1180）");
  await render();
  const long = text(q(".cal-title"));
  ok("周视图标题不显示年份", !long.includes("年") && long.includes("日"), long);
  ok(
    "周视图标题没有按视图分档（与月视图同一套字号/字重）",
    !q(".cal-title")!.className.includes("is-compact"),
    q(".cal-title")!.className,
  );
  ok(
    "title 属性保留完整年份（截断/想看全时仍能拿到）",
    (q(".cal-title")!.getAttribute("title") ?? "").includes("年"),
    String(q(".cal-title")!.getAttribute("title")),
  );

  /* ------------------------------------------------------------ 窄窗：短格式 */
  section("窄窗（≤1180）");
  await React.act(async () => {
    root.render(null);
  });
  stubMatchMedia(true);
  await render();
  const short = text(q(".cal-title"));
  ok("窄窗切成短格式", short.includes("/") && !short.includes(" 年 "), short);
  ok("短格式确实更短", short.length < long.length, `${short.length} vs ${long.length}`);

  /* ------------------------------------------------------------ 迷你月历标题 */
  section("迷你月历标题（周/日视图的侧栏）");
  await React.act(async () => {
    root.render(h(MiniCalendar, null));
  });
  const miniTitle = text(q(".mini-head .t"));
  ok("不显示年份（当前年份下）", !miniTitle.includes("年"), miniTitle);
  ok("只显示月份", /^\d+ 月$/.test(miniTitle), miniTitle);
  ok(
    "完整年月放在 title 属性里",
    (q(".mini-head .t")!.getAttribute("title") ?? "").includes("年"),
    String(q(".mini-head .t")!.getAttribute("title")),
  );
  await React.act(async () => {
    st().goto(toISO(new Date(new Date().getFullYear() + 1, 2, 1, 12)));
    await sleep(20);
  });
  ok("翻到别的年份时才补上年份", text(q(".mini-head .t")).includes("年"), text(q(".mini-head .t")));

  await React.act(async () => {
    st().goto(toISO(today()));
    await sleep(10);
    await render();
  });

  /* ------------------------------------------------------------ 控件还在 */
  section("控件");
  ok("有「今天」按钮", !!byText(".btn", "今天"));
  // v1.2：议程升为顶栏页面，视图分段只剩三档
  ok(
    "视图切换剩三档（月/周/日）",
    qa(".segmented button").map((b) => text(b)).join("/") === "月/周/日",
    qa(".segmented button").map((b) => text(b)).join("/"),
  );
  ok("有「新建事件」按钮", !!byText(".btn", "新建事件"));
  ok("按钮文字不含换行符（真折行由 nowrap 不变量兜底）",
    qa(".cal-header button").every((b) => !text(b).includes("\n")));

  await React.act(async () => {
    click(byText(".segmented button", "日"), "日");
    await sleep(20);
  });
  ok("点「日」切换视图", st().view === "day", st().view);

  await React.act(async () => {
    st().shift(1);
    await sleep(10);
    click(byText(".btn", "今天"), "今天");
    await sleep(20);
  });
  ok("点「今天」回到今天", st().cursor === toISO(today()), st().cursor);

  await React.act(async () => {
    st().setView("day");
    await sleep(20);
  });
  const dayTitle = text(q(".cal-title"));
  ok("日视图标题也不显示年份", !dayTitle.includes("年") && dayTitle.includes("星期"), dayTitle);
  ok("日视图标题同样没有按视图分档", !q(".cal-title")!.className.includes("is-compact"));

  await React.act(async () => {
    st().setView("month");
    await sleep(20);
  });
  ok(
    "月视图标题带年份，且与周/日视图用同一个类名（字体一致）",
    text(q(".cal-title")).includes("年") &&
      q(".cal-title")!.className.trim() === "cal-title",
    `${text(q(".cal-title"))} | ${q(".cal-title")!.className}`,
  );

  await React.act(async () => {
    st().setView("week");
    await sleep(10);
  });
  ok(
    "周标题覆盖 7 天（周一起算）",
    weekDays(fromISO(st().cursor), st().settings.weekStart).length === 7,
  );

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
