/**
 * 皇冠栏 DOM 行为测试。
 *
 * 皇冠 = 全局唯一「最重要」倒计时，显示在标题栏下方一整行，只放标题 + 倒计时。
 * 这里覆盖：唯一性、显隐条件、文案、交互、持久化。
 */
import { setupDom, section, ok, report, q, qa, text, byText, click, sleep } from "./harness";

setupDom();

async function main() {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useStore, DEFAULT_SETTINGS, applyTheme } = await import("../store/useStore");
  const { api } = await import("../lib/api");
  const { default: CrownBar, crownText } = await import("../components/CrownBar");
  const { default: CountdownPanel } = await import("../components/CountdownPanel");
  const { default: SettingsPage } = await import("../components/SettingsPage");
  const { remainingOf } = await import("../lib/remaining");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);

  // 预览后端会把种子数据写进 localStorage，先清掉拿一块干净纸
  localStorage.clear();
  await React.act(async () => {
    applyTheme(DEFAULT_SETTINGS);
    await useStore.getState().init();
  });

  const st = () => useStore.getState();

  // 预览后端会种一批示例数据（其中一条带皇冠），先清空
  for (const c of st().countdowns) await api.deleteCountdown(c.id);
  await React.act(async () => {
    await st().reloadCountdowns();
  });
  ok("测试起点：库里没有任何倒计时", st().countdowns.length === 0, `${st().countdowns.length} 条`);

  /** 建一条并拿到它的 id（走 api 才有返回值） */
  const cd = async (
    title: string,
    targetDate: string,
    targetTime: string | null = null,
  ) => {
    const saved = await api.saveCountdown({ title, targetDate, targetTime });
    await st().reloadCountdowns();
    return saved;
  };

  const render = async (el: React.ReactElement | null) => {
    await React.act(async () => {
      root.render(el);
    });
  };

  /* ============================================================ 纯文本 */
  section("倒计时文案");
  const mk = (targetDate: string, targetTime: string | null, now: number) =>
    remainingOf({ targetDate, targetTime }, now);

  // 真实时钟只给下面的 DOM 断言用（iso 相对「今天」生成日期）。
  const now = Date.now();
  const d0 = new Date(now);
  const iso = (offsetDays: number) => {
    const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  };

  // 文案断言用固定的「现在」（当天 18:30），否则会随一天中的时刻飘：
  // iso(-3) 12:00 在中午之前只差 2 天 22 小时，`已过去 N 天` 按 24 小时取整
  // 得到 2 —— 同一条断言上午红、下午绿。
  const t0 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), 18, 30, 0, 0).getTime();

  ok(
    "多天前显示「剩余 N 天 HH:MM:SS」",
    /^剩余 [1-5] 天 \d{2}:\d{2}:\d{2}$/.test(crownText(mk(iso(5), "12:00", t0))),
    crownText(mk(iso(5), "12:00", t0)),
  );
  ok(
    "当天（有具体时间）不显示「0 天」",
    /^剩余 \d{2}:\d{2}:\d{2}$/.test(crownText(mk(iso(0), "23:00", t0))),
    crownText(mk(iso(0), "23:00", t0)),
  );
  ok(
    "已过去显示「已过去 N 天 …」",
    crownText(mk(iso(-3), "12:00", t0)).startsWith("已过去 3 天 "),
    crownText(mk(iso(-3), "12:00", t0)),
  );
  ok(
    "时钟恒为两位（宽度不抖）",
    /\d{2}:\d{2}:\d{2}$/.test(crownText(mk(iso(9), null, t0))),
    crownText(mk(iso(9), null, t0)),
  );

  /* ============================================================ 显隐 */
  section("什么时候显示");
  await render(h(CrownBar, null));
  ok("没有皇冠 → 整行不渲染", !q(".crown-bar"));

  const a = await cd("期末考试", iso(12));
  const b = await cd("项目交付", iso(45), "18:00");
  await render(h(CrownBar, null));
  ok("有倒计时但没设皇冠 → 仍然不渲染", !q(".crown-bar"));

  await React.act(async () => {
    await st().setCrown(a.id);
  });
  ok("设了皇冠 → 出现", !!q(".crown-bar"));
  ok("显示的是那条的标题", text(q(".crown-title")) === "期末考试", text(q(".crown-title")));
  ok(
    "只显示标题与倒计时，没有日期/进度/备注",
    text(q(".crown-bar")).replace(/[\d\s天:剩余已过去]/g, "") === "期末考试",
    JSON.stringify(text(q(".crown-bar"))),
  );
  ok(
    "倒计时文案在那儿",
    /剩余 1[12] 天 \d{2}:\d{2}:\d{2}/.test(text(q(".crown-time"))),
    text(q(".crown-time")),
  );

  /* ============================================================ 唯一性 */
  section("皇冠全局唯一");
  await React.act(async () => {
    await st().setCrown(b.id);
  });
  const crowned = () => st().countdowns.filter((c) => c.crowned).map((c) => c.title);
  ok("换人后只剩一个皇冠", crowned().length === 1, crowned().join(","));
  ok("皇冠换成了新的那条", text(q(".crown-title")) === "项目交付", text(q(".crown-title")));
  ok("旧的那条已摘冠", !st().countdowns.find((c) => c.id === a.id)?.crowned);
  ok(
    "倒计时跟着变成新目标的",
    text(q(".crown-time")).includes("剩余 4"),
    text(q(".crown-time")),
  );

  await React.act(async () => {
    await st().setCrown(null);
  });
  ok("取消后整行消失", !q(".crown-bar"));
  ok("数库里没有皇冠了", crowned().length === 0);

  /* ============================================================ 开关 */
  section("设置里的开关");
  await React.act(async () => {
    await st().setCrown(a.id);
  });
  await React.act(async () => {
    await st().updateSetting("showCrownBar", false);
  });
  ok("关掉开关后即使有皇冠也不显示", !q(".crown-bar"));
  await React.act(async () => {
    await st().updateSetting("showCrownBar", true);
  });
  ok("打开开关后恢复", !!q(".crown-bar"));

  /* ============================================================ 归档 */
  section("归档的皇冠不显示");
  const arch = await cd("要被归档的", iso(30));
  await React.act(async () => {
    await st().setCrown(arch.id);
  });
  ok("先确认它在显示", text(q(".crown-title")) === "要被归档的");
  const full = st().countdowns.find((c) => c.id === arch.id)!;
  await React.act(async () => {
    await st().archive(full, true);
  });
  ok("归档后皇冠栏让位给下一个/消失", !q(".crown-bar") || text(q(".crown-title")) !== "要被归档的");
  await React.act(async () => {
    await st().archive({ ...full, archived: true }, false);
  });
  ok("取消归档后回来", text(q(".crown-title")) === "要被归档的");

  /* ============================================================ 交互 */
  section("点和菜单");
  await React.act(async () => {
    await st().setCrown(a.id);
  });
  await React.act(async () => {
    click(q(".crown-title"), "标题");
    await sleep(40);
  });
  ok(
    "点标题打开这条的编辑",
    st().countdownDraft?.id === a.id,
    String(st().countdownDraft?.id),
  );
  await React.act(async () => {
    st().openCountdownDraft(null);
  });

  await React.act(async () => {
    click(q(".crown-off"), "取消皇冠");
    await sleep(40);
  });
  ok("点皇冠按钮取消", !q(".crown-bar") && crowned().length === 0);

  await React.act(async () => {
    await st().setCrown(b.id);
  });

  // 侧栏菜单
  await render(h(CountdownPanel, null));
  const cardOf = (title: string) =>
    qa(".cd-card").find((el) => text(el).includes(title)) ?? null;
  /** 卡片右上角唯一的入口就是「更多」 */
  const openMenu = async (title: string) => {
    await React.act(async () => {
      const btn = cardOf(title)!.querySelector(".cd-actions .icon-btn") as HTMLElement;
      click(btn, "更多");
      await sleep(40);
    });
  };

  // v1.1 · UI-23：右上角只留「更多」，皇冠降为卡片上的**只读标记**（.tag-crown）
  const crownedCards = () =>
    qa(".cd-card")
      .filter((c) => c.querySelector(".tag-crown"))
      .map((c) => text(c).replace(/\s+/g, ""));

  ok(
    "戴冠的那张卡片有只读皇冠标记",
    crownedCards().some((t) => t.includes("项目交付")),
    crownedCards().join(" | "),
  );
  ok(
    "没戴冠的卡片没有标记",
    !crownedCards().some((t) => t.includes("期末考试")),
  );
  ok(
    "卡片右上角只剩一个按钮（更多）",
    qa(".cd-card .cd-actions .icon-btn").length === qa(".cd-card .cd-actions").length,
    `${qa(".cd-card .cd-actions .icon-btn").length} 个按钮 / ${qa(".cd-card .cd-actions").length} 张卡`,
  );
  ok(
    "皇冠标记不是按钮（没有 role/aria-pressed）",
    qa(".tag-crown").every((el) => el.tagName === "SPAN" && el.getAttribute("role") === null),
  );

  // ⋯ 菜单 → 设为皇冠
  await openMenu("期末考试");
  ok("⋯ 菜单里有「设为皇冠」", !!byText(".menu button", "设为皇冠"));
  await React.act(async () => {
    click(byText(".menu button", "设为皇冠"), "设为皇冠");
    await sleep(60);
  });
  ok(
    "菜单设冠生效",
    st().countdowns.find((c) => c.id === a.id)?.crowned === true &&
      st().countdowns.filter((c) => c.crowned).length === 1,
  );
  ok("设冠后卡片立刻出现只读标记", !!cardOf("期末考试")!.querySelector(".tag-crown"));

  // 已戴冠时菜单项用颜色表达状态（v1.1 · UI-24）
  await openMenu("期末考试");
  const crownItem = byText(".menu button", "取消皇冠")!;
  ok("已戴冠时菜单变成「取消皇冠」", !!crownItem);
  ok(
    "皇冠菜单项带 is-active（朱砂色表示「当前就是这个状态」）",
    crownItem.className.includes("is-active"),
    crownItem.className,
  );
  await React.act(async () => {
    click(crownItem, "取消皇冠");
    await sleep(60);
  });
  ok("菜单取消生效", st().countdowns.filter((c) => c.crowned).length === 0);

  // 置顶的状态色（UI-24）
  await openMenu("期末考试");
  const pinItem = byText(".menu button", "置顶")!;
  ok("未置顶时菜单项没有 is-active", !pinItem.className.includes("is-active"), pinItem.className);
  await React.act(async () => {
    click(pinItem, "置顶");
    await sleep(60);
  });
  await openMenu("期末考试");
  const unpin = byText(".menu button", "取消置顶")!;
  ok("置顶后菜单项变成「取消置顶」", !!unpin);
  ok(
    "置顶后菜单项带 is-active",
    unpin.className.includes("is-active"),
    unpin.className,
  );
  await React.act(async () => {
    click(unpin, "取消置顶");
    await sleep(60);
  });
  ok(
    "取消置顶后状态色消失",
    (st().countdowns.find((c) => c.id === a.id)?.pinned ?? true) === false,
  );

  // ContextMenu 的 hidden 支持（归档项不该出现皇冠入口）
  const { default: ContextMenu } = await import("../components/ContextMenu");
  await render(
    h(ContextMenu, {
      x: 10,
      y: 10,
      onClose: () => {},
      items: [
        { key: "a", label: "看得见", onSelect: () => {} },
        { key: "b", label: "看不见", hidden: true, onSelect: () => {} },
      ],
    }),
  );
  ok("hidden 的菜单项被跳过", !byText(".menu button", "看不见"));
  ok("其余菜单项照常渲染", !!byText(".menu button", "看得见"));

  await render(null);

  /* ============================================================ 设置页 */
  section("设置页");
  await React.act(async () => {
    await st().setCrown(a.id);
  });
  await render(h(SettingsPage, null));
  await React.act(async () => {
    click(byText(".settings-nav button", "显示"), "显示");
  });
  const crownSwitch = qa(".switch").find((el) => {
    const row = el.closest(".card-row") as HTMLElement | null;
    return text(row).includes("显示皇冠栏");
  });
  ok("有「显示皇冠栏」开关", !!crownSwitch);
  ok(
    "开关描述里写出当前皇冠是谁",
    text(qa(".card-row").find((r) => text(r).includes("当前皇冠")) ?? null).includes(
      "期末考试",
    ),
    text(qa(".card-row").find((r) => text(r).includes("当前皇冠")) ?? null),
  );
  ok("有取消皇冠按钮", !!byText(".btn", "取消皇冠"));

  await React.act(async () => {
    click(byText(".btn", "取消皇冠"), "取消皇冠");
    await sleep(40);
  });
  ok("设置页也能取消皇冠", st().countdowns.filter((c) => c.crowned).length === 0);
  ok(
    "取消后提示改成「还没有皇冠」",
    text(qa(".card-row").find((r) => text(r).includes("还没有皇冠")) ?? null).length > 0,
  );

  /* ============================================================ 持久化 */
  section("持久化");
  await React.act(async () => {
    await st().setCrown(a.id);
    await st().updateSetting("showCrownBar", false);
  });
  const pairs = await api.allSettings();
  ok(
    "showCrownBar 落库",
    pairs.find(([k]) => k === "showCrownBar")?.[1] === "false",
    JSON.stringify(pairs.find(([k]) => k === "showCrownBar")),
  );
  // 重新读一遍倒计时，皇冠要还在（且只有一个）
  await React.act(async () => {
    await st().reloadCountdowns();
  });
  const after = st().countdowns.filter((c) => c.crowned);
  ok("重新加载后皇冠仍在且唯一", after.length === 1 && after[0].id === a.id, after.length + "");
  await React.act(async () => {
    await st().updateSetting("showCrownBar", true);
  });

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
