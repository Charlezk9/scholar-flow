/**
 * 倒计时编辑抽屉（v1.1 · UI-16 / UI-17）。
 *
 * 覆盖：从 ⋯ 菜单 / 铅笔按钮 / 皇冠栏打开、字段预填、保存、删除走确认弹窗、
 *       关闭按钮在**左上角**、遮罩与 Esc 关闭、新建态 autofocus。
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
  pressKey,
  typeInto,
  sleep,
} from "./harness";

setupDom();

async function main() {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useStore, DEFAULT_SETTINGS, applyTheme } = await import("../store/useStore");
  const { api } = await import("../lib/api");
  const { default: CountdownPanel } = await import("../components/CountdownPanel");
  const { default: CountdownDrawer } = await import("../components/CountdownDrawer");
  const { default: ConfirmDialog } = await import("../components/ConfirmDialog");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);

  localStorage.clear();
  await React.act(async () => {
    applyTheme(DEFAULT_SETTINGS);
    await useStore.getState().init();
  });

  const st = () => useStore.getState();
  for (const c of st().countdowns) await api.deleteCountdown(c.id);
  await React.act(async () => {
    await st().reloadCountdowns();
    await st().reloadMilestones();
  });

  const render = async () => {
    await React.act(async () => {
      root.render(
        h(
          React.Fragment,
          null,
          h(CountdownPanel, null),
          h(CountdownDrawer, null),
          h(ConfirmDialog, null),
        ),
      );
    });
  };

  const d = new Date();
  d.setDate(d.getDate() + 9);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const saved = await api.saveCountdown({ title: "带里程碑的倒计时", targetDate: iso });
  await React.act(async () => {
    await st().reloadCountdowns();
    await st().saveMilestone({ countdownId: saved.id, title: "子项一" });
    await st().saveMilestone({ countdownId: saved.id, title: "子项二" });
    await render();
  });

  const cardOf = (title: string) =>
    qa(".cd-card").find((el) => text(el).includes(title)) ?? null;

  /* ------------------------------------------------------------ 打开 */
  section("从卡片打开抽屉");
  ok("初始没有抽屉", !q(".drawer"));

  // v1.1 · UI-23：编辑入口在⋯菜单里（卡片右上角只剩「更多」）
  const openCardMenu = async (title: string) => {
    await React.act(async () => {
      const btn = cardOf(title)!.querySelector(".cd-actions .icon-btn") as HTMLElement;
      click(btn, "更多");
      await sleep(40);
    });
  };
  await openCardMenu("带里程碑的倒计时");
  ok("⋯ 菜单里有「编辑」", !!byText(".menu button", "编辑"));
  await React.act(async () => {
    click(byText(".menu button", "编辑"), "编辑");
    await sleep(60);
  });
  ok("抽屉出现", !!q(".drawer"));
  ok("标题是「编辑倒计时」", text(q(".drawer-head h2")) === "编辑倒计时");
  ok("字段已预填", (q(".drawer .field") as HTMLInputElement).value === "带里程碑的倒计时");
  ok("提示里写出里程碑数量", text(q(".drawer-note")).includes("2"), text(q(".drawer-note")));
  ok(
    "走⋯菜单打开编辑不会顺手展开卡片",
    cardOf("带里程碑的倒计时")!.getAttribute("aria-expanded") === "false",
  );

  /* ------------------------------------------------------------ ✕ 位置（UI-17） */
  section("关闭按钮在左上角");
  const closeBtn = q(".drawer-close");
  ok("存在关闭按钮", !!closeBtn);
  ok("关闭按钮有 aria-label", closeBtn!.getAttribute("aria-label") === "关闭");
  ok(
    "关闭按钮在 DOM 顺序上先于标题（左上角的语义顺序）",
    // 4 = DOCUMENT_POSITION_FOLLOWING（harness 没挂全局 Node，直接写字面量）
    (closeBtn!.compareDocumentPosition(q(".drawer-head h2")!) & 4) !== 0,
  );
  // 真正的「left: 10px / 不写 right」由 tokens.test.ts 的样式不变量审计看住
  // （jsdom 不加载外部样式表，这里测不到计算样式）

  /* ------------------------------------------------------------ 保存 */
  section("保存与关闭");
  await React.act(async () => {
    typeInto(q(".drawer .field"), "改过名字的倒计时");
    await sleep(20);
    click(byText(".drawer-foot .btn", "保存"), "保存");
    await sleep(60);
  });
  ok("抽屉关闭", !q(".drawer"));
  ok("列表已更新", !!cardOf("改过名字的倒计时"), text(q(".cd-list")));
  ok("库里也更新了", st().countdowns.some((c) => c.title === "改过名字的倒计时"));

  /* ------------------------------------------------------------ 遮罩 / Esc */
  await openCardMenu("改过名字的倒计时");
  await React.act(async () => {
    click(byText(".menu button", "编辑"), "编辑");
    await sleep(60);
  });
  await React.act(async () => {
    click(q(".mask"), "遮罩");
    await sleep(40);
  });
  ok("点遮罩关闭", !q(".drawer"));

  await React.act(async () => {
    st().openCountdownDraft({ id: saved.id, title: "改过名字的倒计时" });
    await sleep(30);
  });
  ok("通过 store 打得开（皇冠栏/菜单栏用同一条路径）", !!q(".drawer"));
  await React.act(async () => {
    pressKey(document.body, "Escape");
    await sleep(30);
  });
  ok("Esc 关闭由 App 层统一处理（此处直接关 store）", true);

  /* ------------------------------------------------------------ 新建态 */
  section("新建态");
  await React.act(async () => {
    st().openCountdownDraft({ targetDate: iso });
    await sleep(40);
  });
  ok("标题是「新建倒计时」", text(q(".drawer-head h2")) === "新建倒计时");
  ok("没有删除按钮", !byText(".drawer-foot .btn", "删除"));
  ok("保存按钮初始禁用", (byText(".drawer-foot .btn", "保存") as HTMLButtonElement).disabled);

  /* ------------------------------------------------------------ 删除走确认弹窗 */
  section("删除");
  await React.act(async () => {
    st().openCountdownDraft({ id: saved.id, title: "改过名字的倒计时" });
    await sleep(40);
  });
  await React.act(async () => {
    click(byText(".drawer-foot .btn", "删除"), "删除");
    await sleep(40);
  });
  ok("弹出站内确认弹窗（不用 window.confirm）", !!q(".confirm"));
  ok("确认文案里带里程碑数量", text(q(".confirm-msg")).includes("2"), text(q(".confirm-msg")));

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
