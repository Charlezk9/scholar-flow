/**
 * 字号功能的 DOM 行为测试。
 *
 * 除了「能调」，这里重点验证「调完之后不畸变」：
 *   - 结构尺寸变量随档位更新，且 CSS 与 JS 用同一个整数行高
 *   - 滚轮格高随档位变化，并重新定位到同一个值（不会选着选着就偏了）
 *   - 设置页有 4 档、能点、能恢复默认、能落库
 */
import {
  setupDom,
  section,
  ok,
  report,
  q,
  qa,
  text,
  byText,
  click,
  sleep,
} from "./harness";

setupDom();

async function main() {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useStore, applyTheme, DEFAULT_SETTINGS } = await import("../store/useStore");
  const { hourHeight, wheelHeight, FONT_SIZES } = await import("../lib/fontScale");
  const { TimePicker } = await import("../components/pickers");
  const { default: SettingsPage } = await import("../components/SettingsPage");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);
  const rootEl = document.documentElement;

  /* ============================================================ 主题变量 */
  section("结构尺寸变量");
  for (const key of ["md", "xl"] as const) {
    await React.act(async () => {
      applyTheme({ ...DEFAULT_SETTINGS, fontSize: key });
    });
    ok(
      `data-font=${key} 写到了 <html>`,
      rootEl.dataset.font === key,
      String(rootEl.dataset.font),
    );
    ok(
      `--hour-h 被 JS 覆写为 ${hourHeight(key)}px（与时间轴计算同源）`,
      rootEl.style.getPropertyValue("--hour-h") === `${hourHeight(key)}px`,
      rootEl.style.getPropertyValue("--hour-h"),
    );
  }
  ok(
    "特大档的行高确实比标准档大",
    hourHeight("xl") > hourHeight("md"),
    `${hourHeight("md")} → ${hourHeight("xl")}`,
  );

  await React.act(async () => {
    applyTheme({ ...DEFAULT_SETTINGS, fontSize: "md" });
  });

  /* ============================================================ 滚轮 */
  section("滚轮格高随字号");
  let pick: string | null = null;
  const Harness = () => {
    const [v, setV] = React.useState("09:00");
    pick = v;
    return h(TimePicker, {
      value: v,
      onChange: (x: string) => {
        pick = x;
        setV(x);
      },
    });
  };

  await React.act(async () => {
    root.render(h(Harness, null));
  });
  await React.act(async () => {
    click(q(".picker"), "时间触发器");
  });

  const itemHOf = (wheel: string) => {
    const el = qa(`[data-wheel="${wheel}"] .wheel-item`)[0] as HTMLElement;
    return parseInt(el.style.height, 10);
  };
  const wheelScrollTop = () =>
    (q('[data-wheel="hour"]') as HTMLElement).scrollTop;

  ok(
    "标准档格高 = 32px",
    itemHOf("hour") === wheelHeight("md"),
    String(itemHOf("hour")),
  );
  ok("标准档滚轮定位到 9 点", wheelScrollTop() === 9 * wheelHeight("md"), String(wheelScrollTop()));

  // 切到特大档：格高应变大，且仍停在 9 点
  await React.act(async () => {
    await useStore.getState().updateSetting("fontSize", "xl");
  });

  ok(
    "切到特大档后格高跟着变大",
    itemHOf("hour") === wheelHeight("xl"),
    `${wheelHeight("md")} → ${itemHOf("hour")}`,
  );
  ok(
    "切档后仍停在同一个值（9 点），没有选中错位",
    wheelScrollTop() === 9 * wheelHeight("xl"),
    `scrollTop=${wheelScrollTop()} 期望=${9 * wheelHeight("xl")}`,
  );
  ok(
    "五分钟格同样重新对齐",
    itemHOf("minute") === wheelHeight("xl"),
    String(itemHOf("minute")),
  );
  ok("切档不会改变已选值", pick === "09:00", String(pick));

  // 切回去
  await React.act(async () => {
    await useStore.getState().updateSetting("fontSize", "md");
  });
  ok(
    "切回标准档仍然停在 9 点",
    wheelScrollTop() === 9 * wheelHeight("md"),
    String(wheelScrollTop()),
  );

  await React.act(async () => {
    root.render(h("div", null));
  });

  /* ============================================================ 设置页 */
  section("设置页字号控件");
  await React.act(async () => {
    root.render(h(SettingsPage, null));
  });

  await React.act(async () => {
    click(byText(".settings-nav button", "显示"), "显示");
  });

  ok("显示分区已打开", text(q(".settings-head h1")) === "显示", text(q(".settings-head h1")));

  const seg = qa(".segmented.mini button").filter((b) =>
    FONT_SIZES.some((f) => f.label === text(b)),
  );
  ok("有 4 档字号按钮", seg.length === 4, `实际：${seg.length}`);
  ok(
    "档位文案是 小/标准/大/特大",
    seg.map(text).join("") === "小标准大特大",
    seg.map(text).join("/"),
  );
  ok("有字号预览区", !!q(".font-preview"));
  ok("预览里有「剩余 12 天」", text(q(".fp-clock")).includes("剩余"), text(q(".fp-clock")));
  ok("预览标题/正文/事件都在", !!q(".fp-title") && !!q(".fp-meta") && !!q(".fp-event"));

  await React.act(async () => {
    click(byText(".segmented.mini button", "特大"), "特大");
    await sleep(30);
  });
  ok(
    "点「特大」后设置与 DOM 同步",
    useStore.getState().settings.fontSize === "xl" && rootEl.dataset.font === "xl",
    `${useStore.getState().settings.fontSize} / ${rootEl.dataset.font}`,
  );
  ok(
    "「特大」被标记为选中",
    byText(".segmented.mini button", "特大")?.classList.contains("is-on") === true,
  );
  ok(
    "副标题反映了当前比例",
    text(q(".card-row .sub")).includes("130%"),
    text(q(".card-row .sub")),
  );

  const reset = byText(".btn", "恢复默认");
  ok("有「恢复默认」按钮", !!reset);
  await React.act(async () => {
    click(reset, "恢复默认");
    await sleep(30);
  });
  ok(
    "恢复默认回到标准档",
    useStore.getState().settings.fontSize === "md",
    useStore.getState().settings.fontSize,
  );

  await React.act(async () => {
    click(byText(".segmented.mini button", "小"), "小");
    await sleep(30);
  });
  ok(
    "选「小」也生效（能往下调，不只是放大）",
    useStore.getState().settings.fontSize === "sm" && rootEl.dataset.font === "sm",
    useStore.getState().settings.fontSize,
  );

  /* ============================================================ 落库 */
  section("设置持久化");
  const pairs = await useStore.getState().settings;
  void pairs;
  const stored = await (
    await import("../lib/api")
  ).api.allSettings();
  const saved = stored.find(([k]) => k === "fontSize");
  ok("fontSize 已写入设置存储", saved?.[1] === "sm", JSON.stringify(saved));

  await React.act(async () => {
    await useStore.getState().updateSetting("fontSize", "md");
  });

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
