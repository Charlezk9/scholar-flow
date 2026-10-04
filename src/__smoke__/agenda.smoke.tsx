/**
 * 议程页（v1.2 起 · AG-01 ~ AG-05 / UI-25 ~ UI-28；v1.3 改为两列便签）。
 *
 * 覆盖：页面切换、快速添加、空态、展开/收起、子项增删改勾、折叠徽章、
 *       stopPropagation、IME 组合态、双击改名（事项与子项）、置顶、
 *       ⋯ 菜单、安排到某天（浮层 + 落库 + 归档 + Toast）、已完成区、
 *       正文／待办分区与完整复制、不显示七天预览、级联删除。
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
  const { default: AgendaPage } = await import("../components/AgendaPage");
  const { default: ConfirmDialog } = await import("../components/ConfirmDialog");
  const { default: Toast } = await import("../components/Toast");
  const { default: TopBar } = await import("../components/TopBar");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);

  localStorage.clear();
  await React.act(async () => {
    applyTheme(DEFAULT_SETTINGS);
    await useStore.getState().init();
  });

  const st = () => useStore.getState();

  // 清空预览后端的种子，从一块干净的纸开始
  for (const it of st().agendaItems) await api.deleteAgendaItem(it.id);
  for (const c of st().countdowns) await api.deleteCountdown(c.id);
  await React.act(async () => {
    await st().reloadAgenda();
    await st().reloadCountdowns();
  });

  const render = async () => {
    await React.act(async () => {
      root.render(
        h(React.Fragment, null, h(TopBar, null), h(AgendaPage, null), h(ConfirmDialog, null), h(Toast, null)),
      );
    });
  };
  await render();

  const cards = () => qa(".ag-list .cd-card");
  const cardOf = (title: string) =>
    cards().find((el) => text(el).includes(title)) ?? null;
  const addItem = async (title: string, composing = false) => {
    const input = q(".ag-quick-input");
    await React.act(async () => {
      typeInto(input, title);
      await sleep(20);
    });
    await React.act(async () => {
      pressKey(q(".ag-quick-input"), "Enter", { composing });
      await sleep(50);
    });
  };
  const addSub = async (title: string, composing = false) => {
    const input = cardOf(current)!.querySelector(".ms-input");
    await React.act(async () => {
      typeInto(input as HTMLElement, title);
      await sleep(20);
    });
    await React.act(async () => {
      pressKey(cardOf(current)!.querySelector(".ms-input"), "Enter", { composing });
      await sleep(50);
    });
  };
  const openMenu = async (title: string) => {
    await React.act(async () => {
      const btn = cardOf(title)!.querySelector(".cd-actions .icon-btn") as HTMLElement;
      click(btn, "更多");
      await sleep(50);
    });
  };

  /* ============================================================ 页面与顶栏 */
  section("页面与顶栏");
  ok("顶栏有四个页面入口（v1.4 起含「文献」）",
    qa(".ghost-btn").map((b) => text(b)).join("/") === "日历/议程/文献/设置",
    qa(".ghost-btn").map((b) => text(b)).join("/"));
  // 先把页面摆到日历，再点「议程」——否则这条断言几乎恒真（等于没测）
  await React.act(async () => {
    st().setPage("calendar");
    await sleep(10);
  });
  ok("起点是日历页", st().page === "calendar", st().page);
  await React.act(async () => {
    click(byText(".ghost-btn", "议程"), "议程");
    await sleep(30);
  });
  ok("点「议程」切到议程页", st().page === "agenda", st().page);

  section("独立议程页面");
  ok("默认不显示七天预览", !q(".ag-upcoming"));
  await React.act(async () => { await st().updateSetting("showAgendaUpcoming", true); });
  ok("旧设置为 true 也不显示七天预览", !q(".ag-upcoming"));

  /* ============================================================ 空态 + 快速添加 */
  section("空态与快速添加");
  ok("初始是空态", !!q(".cd-empty") && text(q(".cd-empty")).includes("还没有待办"), text(q(".cd-empty")));
  ok("有空态引导文案", !!byText(".cd-empty .hand", "还没有待办"));

  await addItem("准备 WWW 投稿");
  const current = "准备 WWW 投稿";
  // 先给它一条备注，用来验证「改名不丢 note」
  await React.act(async () => {
    const id = st().agendaItems.find((i) => i.title === current)?.id ?? "";
    await st().saveAgendaItem({ id, title: current, note: "原名备注（不该被改名抹掉）" });
    await sleep(40);
  });
  ok("回车后新增一张卡片", cards().length === 1);
  ok("卡片显示标题", text(cardOf(current)!.querySelector(".cd-title")) === current);
  ok("输入框已清空", (q(".ag-quick-input") as HTMLInputElement).value === "");

  await addItem("   ");
  ok("空串不新增", cards().length === 1);

  // 两个后端对空标题的防御要一致（独立验证发现的 P3：预览后端以前不校验）
  let emptyRejected = false;
  try {
    await api.saveAgendaItem({ title: "   " });
  } catch {
    emptyRejected = true;
  }
  ok("后端拒绝全空白标题（与 Rust 侧一致）", emptyRejected);

  let orphanRejected = false;
  try {
    await api.saveAgendaSubitem({ itemId: "不存在的-id", title: "孤儿" });
  } catch {
    orphanRejected = true;
  }
  ok("后端拒绝挂到不存在的事项上（与 Rust 侧一致）", orphanRejected);

  await addItem("选字中的回车不算提交", true);
  ok("IME 组合态不提交", cards().length === 1);

  ok("计数文案", text(q(".ag-counts")) === "未完成 1 · 已完成 0", text(q(".ag-counts")));
  ok("没有子项时给提示", !!q(".ag-hint"));

  /* ============================================================ 展开与子项 */
  section("展开与子项");
  ok("初始折叠（不渲染清单）", qa(".ms").length === 0);
  await React.act(async () => {
    click(cardOf(current), "卡片");
    await sleep(40);
  });
  ok("点卡片展开", qa(".ms").length === 1);
  ok("展开态 aria-expanded=true", cardOf(current)!.getAttribute("aria-expanded") === "true");
  ok("空态文案", text(q(".ms-empty")) === "还没有子项", text(q(".ms-empty")));
  ok("子项区在卡片内部（同一个泡）", !!cardOf(current)!.querySelector(".ms"));
  ok("没有出现第二个 .panel 泡", cardOf(current)!.querySelectorAll(".panel").length === 0);
  ok("复选框不是原生 input", !cardOf(current)!.querySelector('input[type="checkbox"]'));

  await addSub("写摘要");
  await addSub("画图");
  await addSub("全文初稿");
  ok("三个子项都加上了", qa(".ms-row").length === 3);
  ok(
    "顺序 = 添加顺序",
    qa(".ms-title").map((el) => text(el)).join(",") === "写摘要,画图,全文初稿",
    qa(".ms-title").map((el) => text(el)).join(","),
  );
  ok("清单里有计数", text(q(".ms-count")) === "已完成 0/3", text(q(".ms-count")));

  await React.act(async () => {
    click(qa(".ms-check")[0], "勾第一个");
    await sleep(50);
  });
  ok("勾选后该行标记完成", qa(".ms-row")[0].className.includes("is-done"));
  ok("卡片折叠徽章跟着变", text(cardOf(current)!.querySelector(".tag-ms")) === "☑ 1/3",
    text(cardOf(current)!.querySelector(".tag-ms")));
  ok("点勾不会折叠卡片（stopPropagation）", qa(".ms").length === 1);

  await React.act(async () => {
    doubleClick(qa(".ms-title")[1], "子项标题");
    await sleep(30);
  });
  ok("双击子项进入编辑态", !!q(".ms-edit"));
  await React.act(async () => {
    typeInto(q(".ms-edit"), "画图（改）");
    await sleep(20);
  });
  await React.act(async () => {
    pressKey(q(".ms-edit"), "Enter");
    await sleep(50);
  });
  ok("改名生效", text(qa(".ms-title")[1]) === "画图（改）", text(qa(".ms-title")[1]));

  await React.act(async () => {
    click(qa(".ms-del")[2], "删除第三个子项");
    await sleep(50);
  });
  ok("删除子项", qa(".ms-row").length === 2);

  /* ============================================================ 事项改名 / 置顶 */
  section("事项改名与置顶");
  await React.act(async () => {
    doubleClick(cardOf(current)!.querySelector(".ag-title"), "事项标题");
    await sleep(30);
  });
  ok("双击事项标题进入编辑态", !!q(".ag-title-edit"));
  await React.act(async () => {
    typeInto(q(".ag-title-edit"), "准备 WWW 投稿（v2）");
    await sleep(20);
  });
  await React.act(async () => {
    pressKey(q(".ag-title-edit"), "Enter");
    await sleep(60);
  });
  ok("事项改名生效", st().agendaItems.some((i) => i.title === "准备 WWW 投稿（v2）"));
  // 回归（第二轮独立验证发现）：saveAgendaItem 是整条覆写，
  // 改名时只传 {id,title} 会把 note 静默写成 NULL —— 必须整体转发
  ok(
    "改名不会把 note 清空",
    st().agendaItems.find((i) => i.title === "准备 WWW 投稿（v2）")?.note ===
      "原名备注（不该被改名抹掉）",
    String(st().agendaItems.find((i) => i.title === "准备 WWW 投稿（v2）")?.note),
  );

  const renamed = "准备 WWW 投稿（v2）";
  await openMenu(renamed);
  ok(
    "⋯ 菜单六项齐全（编辑标题/置顶/安排到某天…/复制一份/标记为已完成/删除）",
    qa(".menu button").map((b) => text(b)).join("|") ===
      "编辑标题|置顶|安排到某天…|复制一份|标记为已完成|删除",
    qa(".menu button").map((b) => text(b)).join("|"),
  );
  ok("⋯ 菜单里有「置顶」", !!byText(".menu button", "置顶"));
  await React.act(async () => {
    click(byText(".menu button", "置顶"), "置顶");
    await sleep(60);
  });
  await openMenu(renamed);
  const unpin = byText(".menu button", "取消置顶");
  ok("置顶后菜单项变「取消置顶」", !!unpin);
  ok("置顶菜单项带 is-active（状态色）", unpin!.className.includes("is-active"), unpin!.className);
  ok("卡片上出现只读置顶标记", !!cardOf(renamed)!.querySelector(".tag-pin"));
  await React.act(async () => {
    click(unpin!, "取消置顶");
    await sleep(60);
  });

  /* ============================================================ 安排到某天 */
  section("安排到某天（AG-05）");
  await openMenu(renamed);
  ok("⋯ 菜单里有「安排到某天…」", !!byText(".menu button", "安排到某天…"));
  await React.act(async () => {
    click(byText(".menu button", "安排到某天…"), "安排到某天");
    await sleep(60);
  });
  ok("弹出安排浮层", !!q(".schedule-pop"));
  ok("浮层里有日期选择器", !!q(".schedule-pop .picker"));
  ok("浮层里写清后果", text(q(".schedule-note")).includes("全天事件"), text(q(".schedule-note")));

  const beforeEvents = st().events.length;
  await React.act(async () => {
    click(byText(".schedule-pop .btn", "安排"), "安排");
    await sleep(120);
  });
  ok("浮层关闭", !q(".schedule-pop"));
  ok("事项移入已完成（不再在待办列表）", !cardOf(renamed));
  ok("库里事项已归档", st().agendaItems.find((i) => i.title === renamed)?.archived === true);
  ok("日历多了一个事件", st().events.length === beforeEvents + 1);
  const ev = st().events[st().events.length - 1];
  ok("事件标题取事项标题", ev.title === renamed, ev.title);
  ok("事件是全天", ev.allDay === true);
  ok("未完成子项写进了事件备注", (ev.note ?? "").includes("画图（改）"), String(ev.note));
  ok(
    "已完成/已删除的子项不再列进备注",
    !(ev.note ?? "").includes("写摘要") && !(ev.note ?? "").includes("全文初稿"),
    String(ev.note),
  );
  ok("Toast 提示了安排结果", text(q(".toast")).includes("已安排到"), text(q(".toast")));
  ok("计数更新", text(q(".ag-counts")) === "未完成 0 · 已完成 1", text(q(".ag-counts")));

  /* ============================================================ 已完成区 */
  section("已完成区");
  ok("出现已完成入口", !!q(".ag-done-toggle"));
  await React.act(async () => {
    click(q(".ag-done-toggle"), "展开已完成");
    await sleep(40);
  });
  ok("已完成区列出事项", text(q(".ag-done-list")).includes(renamed), text(q(".ag-done-list")));
  await React.act(async () => {
    click(byText(".ag-done-list .btn", "恢复"), "恢复");
    await sleep(80);
  });
  ok("恢复后回到待办列表", st().agendaItems.find((i) => i.title === renamed)?.archived === false);

  /* ============================================================ 删除走确认弹窗 */
  section("删除");
  const deletedId = st().agendaItems.find((i) => i.title === renamed)?.id ?? "";
  ok("删除前它确实有子项", st().agendaSubitems.filter((s) => s.itemId === deletedId).length > 0);
  await openMenu(renamed);
  await React.act(async () => {
    click(byText(".menu button", "删除"), "删除");
    await sleep(60);
  });
  ok("弹出站内确认弹窗", !!q(".confirm"));
  ok(
    "确认文案提到子项（与活跃卡片同一份文案）",
    text(q(".confirm-msg")).includes("子项"),
    text(q(".confirm-msg")),
  );
  await React.act(async () => {
    click(byText(".confirm .btn", "删除"), "确认删除");
    await sleep(120);
  });
  ok("事项被删除", !st().agendaItems.some((i) => i.title === renamed));
  ok(
    "它的子项一并清掉（级联）",
    st().agendaSubitems.filter((s) => s.itemId === deletedId).length === 0,
  );

  /* ============================================================ 两个入口的删除文案一致 */
  section("删除文案一致性（独立验证发现的 P2 回归）");
  await addItem("带子项的事项");
  const forDelete = "带子项的事项";
  await React.act(async () => {
    click(cardOf(forDelete), "展开");
    await sleep(40);
  });
  const addSubFor = async (itemTitle: string, subTitle: string) => {
    await React.act(async () => {
      typeInto(cardOf(itemTitle)!.querySelector(".ms-input") as HTMLElement, subTitle);
      await sleep(20);
    });
    await React.act(async () => {
      pressKey(cardOf(itemTitle)!.querySelector(".ms-input"), "Enter");
      await sleep(50);
    });
  };
  await addSubFor(forDelete, "子项甲");
  await addSubFor(forDelete, "子项乙");
  ok("两个子项都加上了", st().agendaSubitems.filter((x) => x.title.startsWith("子项")).length === 2);
  // 归档（进已完成区）
  await React.act(async () => {
    const id = st().agendaItems.find((i) => i.title === forDelete)?.id ?? "";
    await st().setAgendaArchived(
      st().agendaItems.find((i) => i.id === id)!,
      true,
    );
    await sleep(60);
  });
  await React.act(async () => {
    const toggle = q(".ag-done-toggle");
    if (toggle && !q(".ag-done-list")) click(toggle, "展开已完成");
    await sleep(40);
  });
  const doneCard = qa(".ag-done-list .cd-card").find((el) =>
    text(el).includes(forDelete),
  );
  ok("已完成区里能找到它", !!doneCard);
  await React.act(async () => {
    const btn = doneCard!.querySelector('button[aria-label="删除"]') as HTMLElement;
    click(btn, "已完成区删除");
    await sleep(60);
  });
  ok(
    "已完成区的删除确认也写明子项数量",
    text(q(".confirm-msg")).includes("2 个子项"),
    text(q(".confirm-msg")),
  );
  await React.act(async () => {
    click(byText(".confirm .btn", "取消"), "取消");
    await sleep(40);
  });

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
