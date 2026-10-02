/**
 * 倒计时卡片的信息行（v1.1 · UI-24）。
 *
 * 「剩余 N 天」和时分秒现在在同一行，不再有单独的时钟行、也没有灰色的「还有」。
 */
import { setupDom, section, ok, report, q, qa, text, sleep } from "./harness";

setupDom();

async function main() {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useStore, DEFAULT_SETTINGS, applyTheme } = await import("../store/useStore");
  const { api } = await import("../lib/api");
  const { default: CountdownPanel } = await import("../components/CountdownPanel");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);

  localStorage.clear();
  await React.act(async () => {
    applyTheme(DEFAULT_SETTINGS);
    await useStore.getState().init();
  });

  const st = () => useStore.getState();
  for (const c of st().countdowns) await api.deleteCountdown(c.id);

  const iso = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  };

  await api.saveCountdown({ title: "有具体时间的", targetDate: iso(5), targetTime: "18:30" });
  await api.saveCountdown({ title: "全天的", targetDate: iso(5) });
  await api.saveCountdown({ title: "就在今天", targetDate: iso(0), targetTime: "23:59" });
  await api.saveCountdown({ title: "已经过去了", targetDate: iso(-3), targetTime: "12:00" });

  await React.act(async () => {
    await st().reloadCountdowns();
    await st().reloadMilestones();
    root.render(h(CountdownPanel, null));
    await sleep(30);
  });

  const cardOf = (title: string) =>
    qa(".cd-card").find((el) => text(el).includes(title)) ?? null;
  const daysLine = (title: string) => cardOf(title)!.querySelector(".cd-days") as HTMLElement;

  /* ------------------------------------------------------------ 有具体时间 */
  section("有具体时间（剩余 N 天 + 时分秒同一行）");
  const line = daysLine("有具体时间的");
  ok("信息行里有内联时钟", !!line.querySelector(".clock-inline"));
  ok(
    "时钟是 HH:MM:SS",
    /^\d{2}:\d{2}:\d{2}$/.test(text(line.querySelector(".clock-inline"))),
    text(line.querySelector(".clock-inline")),
  );
  ok(
    "整行文本是「剩余 N 天 HH:MM:SS」",
    /^剩余\s*\d+\s*天\s*\d{2}:\d{2}:\d{2}$/.test(text(line)),
    text(line),
  );
  ok("卡片里不再出现灰色的「还有」", !text(cardOf("有具体时间的")).includes("还有"));
  ok("卡片里不再有独立的时钟行", !cardOf("有具体时间的")!.querySelector(".cd-clock"));
  ok("「剩余」只出现一次", (text(cardOf("有具体时间的")).match(/剩余/g) ?? []).length === 1);

  /* ------------------------------------------------------------ 全天 */
  section("全天（只有天数）");
  const allDay = daysLine("全天的");
  ok("全天不显示时分秒", !allDay.querySelector(".clock-inline"));
  ok("全天文案是「剩余 N 天」", /^剩余\s*\d+\s*天$/.test(text(allDay)), text(allDay));

  /* ------------------------------------------------------------ 不足一天 */
  section("不足一天（主视觉就是时钟）");
  const todayLine = daysLine("就在今天");
  ok("用大字时钟做主视觉", !!todayLine.querySelector(".clock-num"));
  ok("不显示「0 天」", !text(todayLine).includes("0 天"), text(todayLine));
  ok("也没有「还有」", !text(cardOf("就在今天")).includes("还有"));

  /* ------------------------------------------------------------ 已过期 */
  section("已过期");
  const pastLine = daysLine("已经过去了");
  ok("已过去也把时分秒接在天数后", !!pastLine.querySelector(".clock-inline"));
  ok(
    "文案是「已过去 N 天 HH:MM:SS」",
    /^已过去\s*\d+\s*天\s*\d{2}:\d{2}:\d{2}$/.test(text(pastLine)),
    text(pastLine),
  );
  ok("过期卡片也不出现「还有」", !text(cardOf("已经过去了")).includes("还有"));

  /* ------------------------------------------------------------ 卡片高度 */
  section("卡片结构");
  ok("每张卡右上角只有一个按钮", qa(".cd-actions .icon-btn").length === qa(".cd-card").length);
  ok(
    "内联时钟的 title 里带完整信息",
    (q(".clock-inline")!.getAttribute("title") ?? "").includes("天"),
    String(q(".clock-inline")!.getAttribute("title")),
  );

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
