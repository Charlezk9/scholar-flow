/**
 * 事件抽屉里的选择浮层测试。
 *
 * 存在理由：`.drawer` 的滑入动画用了 transform，而 `animation-fill-mode: both`
 * 让 `transform` 在动画结束后依然保留。CSS 规范规定任何非 none 的 transform
 * 都会让元素成为 `position: fixed` 后代的**包含块**，
 * 于是抽屉里的选择浮层不再按视口定位，被推到屏幕外 —— 用户报「时间无法点击」。
 *
 * 这里锁住两条不变量：
 *   1. 浮层必须渲染到 document.body，不能留在抽屉子树里（portal）
 *   2. 抽屉动画结束后不能残留 transform
 */
import { readFileSync } from "node:fs";
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
  mouseDown,
} from "./harness";

setupDom();

async function main() {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { useStore } = await import("../store/useStore");
  const { default: EventDrawer } = await import("../components/EventDrawer");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);

  /* ---------------- 静态约束：抽屉动画不得残留 transform ---------------- */
  section("CSS 不变量");
  const css = readFileSync("src/styles/app.css", "utf8");
  const at = css.indexOf("@keyframes slide-in");
  // 取到该 at-rule 的闭合花括号为止
  let depth = 0;
  let end = at;
  for (let i = css.indexOf("{", at); i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  const slideBlock = css.slice(at, end);
  ok(
    "slide-in 的 to 帧是 transform: none（否则抽屉会成为 fixed 包含块）",
    /to\s*\{[^}]*transform:\s*none/.test(slideBlock),
    slideBlock.replace(/\s+/g, " ").slice(0, 120),
  );

  /* ---------------- 打开抽屉 ---------------- */
  section("事件抽屉");
  useStore.setState({
    eventDraft: {
      id: "e1",
      title: "项目讨论",
      startDate: "2026-06-04",
      endDate: "2026-06-04",
      allDay: false,
      startTime: "14:00",
      endTime: "16:00",
      color: "indigo",
      remindMinutes: 15,
    },
  });

  await React.act(async () => {
    root.render(h(EventDrawer, null));
  });

  ok("抽屉已渲染", !!q(".drawer"));
  const pickers = qa(".drawer .picker");
  // 4 个日期/时间选择器 + 地点输入，共 5 个 .picker（v1.4 移除已作废的「提醒」下拉）
  ok("抽屉里的 .picker 共 5 个（含地点）", pickers.length === 5, `实际：${pickers.length}`);
  const startTimeBtn = byText(".drawer .picker", "14:00");
  const endTimeBtn = byText(".drawer .picker", "16:00");
  ok("能定位到开始时间（显示 14:00）", !!startTimeBtn);
  ok("能定位到结束时间（显示 16:00）", !!endTimeBtn);

  /* ---------------- 时间选择器 ---------------- */
  section("开始时间可点开");
  ok(
    "开始时间显示的是纯时间，不带「目标时间」前缀",
    text(startTimeBtn) === "14:00",
    text(startTimeBtn),
  );

  await React.act(async () => {
    click(startTimeBtn, "开始时间");
  });

  ok("浮层已弹出", !!q(".pop"));
  ok("浮层不在抽屉子树里（已 portal 到 body）", !q(".drawer .pop"));
  ok(
    "浮层的父节点就是 body 层级",
    q(".pop")?.parentElement === document.body,
    String(q(".pop")?.parentElement?.className || q(".pop")?.parentElement?.tagName),
  );
  ok("小时滚轮有 24 格", qa('[data-wheel="hour"] .wheel-item').length === 24);
  ok("分钟滚轮有 60 格", qa('[data-wheel="minute"] .wheel-item').length === 60);
  ok("滚轮停在 14:00", text(q('[data-wheel="hour"] .wheel-item.is-on')) === "14");

  await React.act(async () => {
    click(q('[data-wheel="hour"] .wheel-item.is-on')!, "当前小时");
  });
  ok("在抽屉里也能改动时间", useStore.getState().eventDraft?.startTime !== undefined);

  await React.act(async () => {
    mouseDown(document.body);
  });
  ok("点外部关闭", !q(".pop"));

  /* ---------------- 日期选择器同样要逃出去 ---------------- */
  section("日期选择器可点开");
  await React.act(async () => {
    click(byText(".drawer .picker", "2026-06-04 周四"), "开始日期");
  });
  ok("日期浮层弹出", !!q(".pop"));
  ok("日期浮层也不在抽屉里", !q(".drawer .pop"));
  ok("日期浮层父节点是 body", q(".pop")?.parentElement === document.body);
  ok("日格 42 个", qa(".pop-day").length === 42);
  await React.act(async () => {
    mouseDown(document.body);
  });

  /* ---------------- 结束时间 ---------------- */
  section("结束时间可点开");
  await React.act(async () => {
    click(endTimeBtn, "结束时间");
  });
  ok("结束时间浮层弹出", !!q(".pop"));
  ok("结束时间显示纯时间", text(endTimeBtn) === "16:00", text(endTimeBtn));
  ok("滚轮停在 16:00", text(q('[data-wheel="hour"] .wheel-item.is-on')) === "16");
  await React.act(async () => {
    mouseDown(document.body);
  });
  ok("关闭后无残留浮层", !q(".pop"));

  /* ---------------- 上下文菜单也要逃出去 ---------------- */
  section("确认弹窗层级");
  const { default: ConfirmDialog } = await import("../components/ConfirmDialog");
  await React.act(async () => {
    root.render(h(React.Fragment, null, h(EventDrawer, null), h(ConfirmDialog, null)));
    useStore.setState({
      dialog: {
        title: "删除事件",
        message: "确定删除？",
        confirmLabel: "删除",
        onConfirm: () => {},
      },
    });
  });
  ok("确认弹窗渲染到 body 层级", q(".confirm")?.parentElement === document.body);
  ok("遮罩也在 body 层级", q(".mask-soft")?.parentElement === document.body);
  await React.act(async () => {
    useStore.setState({ dialog: null });
  });

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
