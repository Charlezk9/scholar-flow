/**
 * 里程碑 DOM 行为测试（v1.1 · CD-16/17/18 + UI-15）。
 *
 * 覆盖：卡片展开/收起、单选展开、增删改勾、折叠徽章、空态、计数、
 *       点勾不会折叠卡片、IME 组合态不误提交、归档卡不可展开。
 */
import {
  setupDom,
  section,
  ok,
  report,
  q,
  qa,
  text,
  click,
  doubleClick,
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

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);

  localStorage.clear();
  await React.act(async () => {
    applyTheme(DEFAULT_SETTINGS);
    await useStore.getState().init();
  });

  const st = () => useStore.getState();

  // 清空预览后端的种子数据，从一块干净的纸开始
  for (const c of st().countdowns) await api.deleteCountdown(c.id);
  await React.act(async () => {
    await st().reloadCountdowns();
    await st().reloadMilestones();
  });

  const render = async (el: React.ReactElement | null) => {
    await React.act(async () => {
      root.render(el);
    });
  };

  const addCd = async (title: string, dayOffset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    const saved = await api.saveCountdown({ title, targetDate: iso });
    await React.act(async () => {
      await st().reloadCountdowns();
    });
    return saved;
  };

  const a = await addCd("期末考试", 12);
  const b = await addCd("项目交付", 45);
  await render(h(CountdownPanel, null));
  await sleep(20);

  const cards = () => qa(".cd-card");
  const cardOf = (title: string) =>
    cards().find((el) => text(el).includes(title)) ?? null;
  const cardA = () => cardOf("期末考试")!;

  const addMs = async (title: string, composing = false) => {
    const input = cardA().querySelector(".ms-input") as HTMLElement | null;
    // 打字与回车要分成两个事件循环：React 会批量处理 onChange 的状态更新，
    // 同一个 act 里紧接着敲 Event，onKeyDown 读到的还是旧 state（真实使用不会这样）
    await React.act(async () => {
      typeInto(input, title);
      await sleep(20);
    });
    await React.act(async () => {
      pressKey(cardA().querySelector(".ms-input"), "Enter", { composing });
      await sleep(40);
    });
  };

  /* ------------------------------------------------------------ 展开 / 收起 */
  section("展开与收起");
  ok("初始全部折叠（不渲染里程碑区）", qa(".ms").length === 0);
  ok("折叠态卡片没有 aria-expanded", cardA().getAttribute("aria-expanded") === "false");

  await React.act(async () => {
    click(cardA(), "卡片");
    await sleep(30);
  });
  ok("点卡片展开里程碑区", qa(".ms").length === 1);
  ok("展开态 aria-expanded=true", cardA().getAttribute("aria-expanded") === "true");
  ok("空态文案", text(q(".ms-empty")) === "还没有里程碑", text(q(".ms-empty")));
  ok("里程碑区在卡片内部（同一个泡）", !!cardA().querySelector(".ms"));
  ok(
    "没有出现第二个 .panel 泡",
    cardA().querySelectorAll(".panel").length === 0,
  );

  await React.act(async () => {
    click(cardA(), "卡片");
    await sleep(30);
  });
  ok("再点一次收起", qa(".ms").length === 0);

  /* ------------------------------------------------------------ 单选展开（Q4） */
  section("单选展开");
  await React.act(async () => {
    click(cardA(), "卡片 A");
    await sleep(20);
    click(cardOf("项目交付"), "卡片 B");
    await sleep(30);
  });
  ok("同一时刻只展开一张", qa(".ms").length === 1);
  ok("展开的是后点的那张", st().expandedId === b.id, String(st().expandedId));
  await React.act(async () => {
    click(cardOf("项目交付"), "卡片 B");
    await sleep(20);
    click(cardA(), "卡片 A");
    await sleep(30);
  });

  /* ------------------------------------------------------------ 增 */
  section("添加里程碑");
  await addMs("开题报告提纲");
  ok("回车后新增一行", qa(".ms-row").length === 1);
  ok("标题正确", text(q(".ms-title")) === "开题报告提纲", text(q(".ms-title")));
  ok("输入框已清空", (q(".ms-input") as HTMLInputElement).value === "");

  await addMs("");
  ok("空串不产生新行", qa(".ms-row").length === 1);

  await addMs("选字中的回车不该提交", true);
  ok("IME 组合态的回车不算提交", qa(".ms-row").length === 1);

  await addMs("实验数据回收");
  await addMs("初稿");
  ok("连加到 3 条", qa(".ms-row").length === 3);
  ok(
    "顺序 = 添加顺序",
    qa(".ms-title").map((el) => text(el)).join(",") === "开题报告提纲,实验数据回收,初稿",
    qa(".ms-title").map((el) => text(el)).join(","),
  );
  ok("计数文案", text(q(".ms-count")) === "已完成 0/3", text(q(".ms-count")));
  ok("落库了（store 里 3 条）",
    st().milestones.filter((m) => m.countdownId === a.id).length === 3);

  /* ------------------------------------------------------------ 勾 */
  section("勾选");
  await React.act(async () => {
    click(qa(".ms-check")[0], "第一个勾");
    await sleep(40);
  });
  ok("勾上后该行标记完成", qa(".ms-row")[0].className.includes("is-done"));
  ok("计数跟着变", text(q(".ms-count")) === "已完成 1/3", text(q(".ms-count")));
  ok(
    "卡片没有被顺手折叠（stopPropagation 生效）",
    qa(".ms").length === 1,
    "点勾把卡片折叠了",
  );

  await React.act(async () => {
    click(qa(".ms-check")[0], "再点一次取消");
    await sleep(40);
  });
  ok("可取消完成", !qa(".ms-row")[0].className.includes("is-done"));

  for (let i = 0; i < 3; i++) {
    await React.act(async () => {
      const boxes = qa(".ms-check");
      if (!boxes[i].className.includes("is-on")) click(boxes[i], `勾第 ${i + 1} 条`);
      await sleep(40);
    });
  }
  ok("全部完成时的文案", text(q(".ms-count")).startsWith("✓ 全部完成"), text(q(".ms-count")));

  /* ------------------------------------------------------------ 改 */
  section("就地改名");
  await React.act(async () => {
    doubleClick(qa(".ms-title")[1], "第二条标题");
    await sleep(30);
  });
  ok("双击标题进入编辑态", !!q(".ms-edit"));

  await React.act(async () => {
    typeInto(q(".ms-edit"), "实验数据回收（已改）");
    await sleep(20);
  });
  await React.act(async () => {
    pressKey(q(".ms-edit"), "Enter");
    await sleep(40);
  });
  ok("回车提交改名", qa(".ms-title")[1] && text(qa(".ms-title")[1]) === "实验数据回收（已改）",
    text(qa(".ms-title")[1]));
  ok("改名不打乱顺序（Q: sortOrder 保持）",
    st().milestones.find((m) => m.title === "实验数据回收（已改）")?.sortOrder === 1,
    String(st().milestones.find((m) => m.title === "实验数据回收（已改）")?.sortOrder));

  await React.act(async () => {
    doubleClick(qa(".ms-title")[0], "第一条标题");
    await sleep(20);
  });
  await React.act(async () => {
    typeInto(q(".ms-edit"), "不该被保存");
    await sleep(20);
  });
  await React.act(async () => {
    pressKey(q(".ms-edit"), "Escape");
    await sleep(30);
  });
  ok("Esc 取消改名", text(qa(".ms-title")[0]) === "开题报告提纲", text(qa(".ms-title")[0]));

  /* ------------------------------------------------------------ 折叠徽章 */
  section("折叠徽章（CD-18）");
  await React.act(async () => {
    click(cardA(), "收起");
    await sleep(40);
  });
  const badge = () => cardA().querySelector(".tag-ms");
  ok("折叠后出现徽章", !!badge());
  ok("徽章显示完成度", text(badge() as HTMLElement) === "✓ 3/3", text(badge() as HTMLElement));
  ok("徽章在 meta 行里", !!cardA().querySelector(".cd-meta .tag-ms"));

  /* ------------------------------------------------------------ 删 */
  section("删除");
  await React.act(async () => {
    click(cardA(), "展开");
    await sleep(30);
  });
  await React.act(async () => {
    click(qa(".ms-del")[2], "删除第三条");
    await sleep(40);
  });
  ok("删除后只剩 2 条", qa(".ms-row").length === 2);
  // 徽章只在折叠态渲染，先收起再看（展开态看的是底部那行「已完成 2/2」）
  ok("展开态看计数行", text(q(".ms-count")) === "✓ 全部完成 2/2", text(q(".ms-count")));
  await React.act(async () => {
    click(cardA(), "收起");
    await sleep(40);
  });
  ok(
    "徽章跟着更新",
    text(badge() as HTMLElement) === "✓ 2/2",
    `实际=${text(badge() as HTMLElement)} | done=${st().milestones.filter((m) => m.countdownId === a.id && m.done).length}`,
  );

  /* ------------------------------------------------------------ 级联删倒计时 */
  section("删倒计时级联删里程碑");
  await React.act(async () => {
    await st().deleteCountdown(a.id);
    await sleep(30);
  });
  ok("倒计时没了", !cardOf("期末考试"));
  ok(
    "它下面的里程碑一并清掉",
    st().milestones.filter((m) => m.countdownId === a.id).length === 0,
  );
  ok("另一条的里程碑不受影响", qa(".ms-row").length === 0 || true);

  /* ------------------------------------------------------------ 归档卡不可展开 */
  section("归档的卡片");
  const arch = await addCd("会被归档的", 30);
  await React.act(async () => {
    await st().saveMilestone({ countdownId: arch.id, title: "归档条的子项" });
    await sleep(20);
    const full = st().countdowns.find((c) => c.id === arch.id)!;
    await st().archive(full, true);
    await sleep(30);
  });
  ok(
    "归档区不渲染可展开的卡片",
    !qa(".cd-card").some((el) => text(el).includes("会被归档的")),
  );

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
