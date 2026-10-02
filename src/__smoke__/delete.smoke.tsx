/**
 * 删除倒计时的端到端交互测试。
 *
 * 这个测试的存在理由：删除的二次确认曾经用 `window.confirm`，
 * 而 Tauri 用的 wry 在 macOS 上没有实现 `runJavaScriptConfirmPanel`，
 * 按 WebKit 规范此时 confirm() 不弹窗、直接返回 false，
 * 于是 `if (confirm(...)) doDelete()` 永远不执行 —— 用户报「删除功能好像没实现」。
 *
 * 这里真点一遍：⋯ → 删除 → 弹窗 → 确认 → 数据真的少了。
 */
import { setupDom, section, ok, report, q, qa, text, byText, click, sleep } from "./harness";

setupDom();

async function main() {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useStore } = await import("../store/useStore");
  const { default: CountdownPanel } = await import("../components/CountdownPanel");
  const { default: ConfirmDialog } = await import("../components/ConfirmDialog");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);

  // 预览后端会塞入种子数据
  await useStore.getState().init();

  const before = useStore.getState().countdowns.length;
  const first = useStore.getState().countdowns[0];

  section("初始状态");
  ok("种子数据已加载", before > 0, `实际：${before} 条`);
  ok("被删对象存在", !!first, first?.title);

  await React.act(async () => {
    root.render(
      h(React.Fragment, null, h(CountdownPanel, null), h(ConfirmDialog, null)),
    );
  });

  ok("卡片已渲染", qa(".cd-card").length === before, `实际：${qa(".cd-card").length}`);

  /* ---------------- 右键菜单里的删除 ---------------- */

  section("⋯ 菜单 → 删除");
  const moreBtn = qa("[title='更多']")[0];
  ok("找到「更多」按钮", !!moreBtn);

  await React.act(async () => {
    click(moreBtn, "更多");
  });

  ok("右键菜单弹出", !!q(".menu"));
  const delItem = byText(".menu button", "删除");
  ok("菜单里有「删除」", !!delItem);

  await React.act(async () => {
    click(delItem, "菜单里的删除");
  });

  ok("弹出确认弹窗（而不是静默失败）", !!q(".confirm"));
  ok(
    "弹窗标题正确",
    text(q(".confirm h3")) === "删除倒计时",
    text(q(".confirm h3")),
  );
  ok(
    "弹窗里带上了标题",
    text(q(".confirm-msg")).includes(first.title),
    text(q(".confirm-msg")),
  );
  ok("有「取消」按钮", !!byText(".confirm-foot button", "取消"));
  ok("有「删除」确认按钮", !!byText(".confirm-foot button", "删除"));
  ok("展示的是危险操作样式", !!q(".confirm-ic.is-danger"));

  await React.act(async () => {
    click(byText(".confirm-foot button", "删除"), "确认删除");
    await sleep(80);
  });

  const after = useStore.getState().countdowns.length;
  ok("数据真的少了一条", after === before - 1, `${before} → ${after}`);
  ok(
    "被删的那条不在列表里了",
    !useStore.getState().countdowns.some((c) => c.id === first.id),
  );
  ok("弹窗已关闭", !q(".confirm"));
  ok("卡片同步减少", qa(".cd-card").length === after, `实际：${qa(".cd-card").length}`);

  /* ---------------- 取消不应删除 ---------------- */

  section("取消不删除");
  const beforeCancel = useStore.getState().countdowns.length;

  await React.act(async () => {
    click(qa("[title='更多']")[0], "更多");
  });
  await React.act(async () => {
    click(byText(".menu button", "删除"), "删除");
  });
  ok("确认弹窗再次弹出", !!q(".confirm"));
  await React.act(async () => {
    click(byText(".confirm-foot button", "取消"), "取消");
    await sleep(60);
  });
  ok("点取消后弹窗关闭", !q(".confirm"));
  ok(
    "点取消不会删数据",
    useStore.getState().countdowns.length === beforeCancel,
    `${beforeCancel} → ${useStore.getState().countdowns.length}`,
  );

  /* ---------------- Esc 取消 ---------------- */

  section("Esc 取消");
  await React.act(async () => {
    click(qa("[title='更多']")[0], "更多");
  });
  await React.act(async () => {
    click(byText(".menu button", "删除"), "删除");
  });
  ok("弹窗弹出", !!q(".confirm"));
  await React.act(async () => {
    window.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await sleep(60);
  });
  ok("Esc 关闭弹窗", !q(".confirm"));
  ok("Esc 不删数据", useStore.getState().countdowns.length === beforeCancel);

  /* ---------------- 归档列表里的删除 ---------------- */

  section("归档列表 → 删除");
  // 先归档一条，让归档区出现
  const target = useStore.getState().countdowns[0];
  await React.act(async () => {
    await useStore.getState().archive(target, true);
  });
  ok("归档区出现", !!q(".archive-row"));
  await React.act(async () => {
    click(q(".archive-row"), "已归档");
  });
  const countBeforeArchiveDel = useStore.getState().countdowns.length;
  const archivedDel = qa(".archive-row ~ .cd-list .btn").find(
    (b) => text(b).includes("删除"),
  );
  ok("归档区有删除按钮", !!archivedDel);
  await React.act(async () => {
    click(archivedDel ?? null, "归档区删除");
  });
  ok("归档区删除也走确认弹窗", !!q(".confirm"), text(q(".confirm h3")));
  await React.act(async () => {
    click(byText(".confirm-foot button", "删除"), "确认");
    await sleep(80);
  });
  ok(
    "归档条目被删除",
    useStore.getState().countdowns.length === countBeforeArchiveDel - 1,
    `${countBeforeArchiveDel} → ${useStore.getState().countdowns.length}`,
  );

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
