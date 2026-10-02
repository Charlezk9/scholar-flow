/**
 * 日期 / 时间选择器的真实 DOM 交互测试。
 *
 * 存在理由：曾经用「透明覆盖的原生 input[type=time]」，在 WKWebView 里点击无反馈；
 * 后来时间选择器改成双滚轮，必须证明「拖/滚/点」三种方式都能正确落值。
 */
import { setupDom, section, ok, report, q, qa, text, byText, click, mouseDown, sleep } from "./harness";

const dom = setupDom();

/** 模拟「滚轮滚到某一格」：直接设 scrollTop 再派发 scroll */
function scrollWheelTo(wheel: HTMLElement, index: number, itemH = 32) {
  wheel.scrollTop = index * itemH;
  wheel.dispatchEvent(new dom.window.Event("scroll"));
}

async function main() {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { DatePicker, TimePicker } = await import("../components/pickers");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);

  const TimeHarness = ({ seen, initial = "" }: { seen: string[]; initial?: string }) => {
    const [v, setV] = React.useState(initial);
    return h(TimePicker, {
      value: v,
      onChange: (x: string) => {
        seen.push(x);
        setV(x);
      },
    });
  };
  const DateHarness = ({ seen, initial }: { seen: string[]; initial: string }) => {
    const [v, setV] = React.useState(initial);
    return h(DatePicker, {
      value: v,
      onChange: (x: string) => {
        seen.push(x);
        setV(x);
      },
    });
  };

  /* ============================================================ 时间选择器 */
  section("时间选择器 · 双滚轮");
  const t1: string[] = [];

  await React.act(async () => {
    root.render(h(TimeHarness, { key: "a", seen: t1 }));
  });

  ok("初始渲染出触发器", !!q(".picker"));
  ok("空值时显示「全天」语义", text(q(".picker")).includes("全天"), text(q(".picker")));
  ok("初始没有浮层", !q(".pop"));

  await React.act(async () => {
    click(q(".picker"), "时间触发器");
  });

  ok("点击后浮层出现", !!q(".pop"));
  ok("有两个滚轮（时 / 分）", !!q('[data-wheel="hour"]') && !!q('[data-wheel="minute"]'));
  ok("小时滚轮 = 24 格", qa('[data-wheel="hour"] .wheel-item').length === 24);
  ok("分钟滚轮 = 60 格（每分钟可选）", qa('[data-wheel="minute"] .wheel-item').length === 60);
  ok(
    "小时文本是 00–23",
    text(qa('[data-wheel="hour"] .wheel-item')[0]) === "00" &&
      text(qa('[data-wheel="hour"] .wheel-item')[23]) === "23",
  );
  ok(
    "分钟文本是 00–59",
    text(qa('[data-wheel="minute"] .wheel-item')[0]) === "00" &&
      text(qa('[data-wheel="minute"] .wheel-item')[59]) === "59",
  );
  ok("两轮之间有冒号", text(q(".wheel-colon")) === ":");
  ok("两列各有「时」「分」标签", qa(".wheel-cap").map(text).join("") === "时分");
  ok("有中间高亮带", !!q(".wheel-band"));
  ok("有「设为全天」", !!byText(".btn", "设为全天"));
  ok("有「现在」", !!byText(".btn", "现在"));
  ok("读数区此时显示「全天」", text(q(".time-readout .t")) === "全天");

  // 关掉，换成固定初值的 harness，保证断言是确定性的
  await React.act(async () => {
    mouseDown(document.body);
  });
  await React.act(async () => {
    root.render(h(TimeHarness, { key: "fixed", seen: t1, initial: "00:00" }));
  });
  await React.act(async () => {
    click(q(".picker"), "打开");
  });
  ok("重挂后浮层打开", !!q(".pop"));

  /* ---------- 点选 ---------- */
  await React.act(async () => {
    click(byText('[data-wheel="hour"] .wheel-item', "09"), "09 时");
  });
  ok("点小时格 → 09:00", t1.at(-1) === "09:00", `实际：${t1.at(-1)}`);
  ok("选完小时浮层仍开着（还能接着选分）", !!q(".pop"));

  await React.act(async () => {
    click(byText('[data-wheel="minute"] .wheel-item', "30"), "30 分");
  });
  ok("点分钟格 → 09:30", t1.at(-1) === "09:30", `实际：${t1.at(-1)}`);
  ok("滚轮式交互不自动收起浮层", !!q(".pop"));

  /* ---------- 滚动 ---------- */
  await React.act(async () => {
    scrollWheelTo(q('[data-wheel="minute"]')!, 45);
  });
  ok("滚到 45 分 → 立即上报 09:45", t1.at(-1) === "09:45", `实际：${t1.at(-1)}`);

  await React.act(async () => {
    scrollWheelTo(q('[data-wheel="hour"]')!, 23);
  });
  ok("滚到 23 时 → 上报 23:45", t1.at(-1) === "23:45", `实际：${t1.at(-1)}`);

  const countAfterScroll = t1.length;
  await React.act(async () => {
    await sleep(260); // 等 150ms 的吸附定时器
  });
  ok("停止滚动后的自动吸附不产生多余上报", t1.length === countAfterScroll);

  /* ---------- 吸附 ---------- */
  const w2 = q('[data-wheel="minute"]')!;
  await React.act(async () => {
    w2.scrollTop = 12 * 32 + 10; // 停在 12.31 格
    w2.dispatchEvent(new dom.window.Event("scroll"));
  });
  await React.act(async () => {
    await sleep(260);
  });
  ok("停在两格之间会吸附到最近一格（12 分）", t1.at(-1) === "23:12", `实际：${t1.at(-1)}`);

  /* ---------- 快捷键 ---------- */
  await React.act(async () => {
    click(byText(".btn", "现在"), "现在");
  });
  const n = new Date();
  const expectNow = `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  ok("「现在」填当前时刻", t1.at(-1) === expectNow, `实际：${t1.at(-1)}`);

  await React.act(async () => {
    click(q(".picker"), "打开");
  });
  ok("重开后滚轮停在「现在」附近", !!q('[data-wheel="hour"] .wheel-item.is-on'));
  await React.act(async () => {
    click(byText(".btn", "设为全天"), "设为全天");
  });
  ok("「设为全天」把值清空", t1.at(-1) === "", `实际：${JSON.stringify(t1.at(-1))}`);

  await React.act(async () => {
    mouseDown(document.body);
  });
  ok("点外部关闭", !q(".pop"));

  /* ============================================================ 日期选择器 */
  section("日期选择器");
  const d1: string[] = [];

  await React.act(async () => {
    root.render(h(DateHarness, { seen: d1, initial: "2026-06-07" }));
  });

  ok("触发器显示已选日期", text(q(".picker")).includes("2026-06-07"), text(q(".picker")));
  await React.act(async () => {
    click(q(".picker"), "日期触发器");
  });
  ok("日期浮层出现", !!q(".pop"));
  ok("日格 = 42 个（6×7）", qa(".pop-day").length === 42);
  ok("星期表头 7 个", qa(".pop-week span").length === 7);
  ok("有「今天」快捷键", !!byText(".btn", "今天"));

  await React.act(async () => {
    click(byText(".pop-day", "15"), "15 日");
  });
  ok("点某天 → 2026-06-15", d1.at(-1) === "2026-06-15", `实际：${d1.at(-1)}`);
  ok("选完日期自动关闭", !q(".pop"));

  await React.act(async () => {
    click(q(".picker"), "打开");
  });
  const titleBefore = text(q(".pop-title"));
  await React.act(async () => {
    click(q('[title="下个月"]'), "下个月");
  });
  ok("可以翻到下个月", titleBefore !== text(q(".pop-title")), text(q(".pop-title")));
  ok("翻月后仍有 42 格", qa(".pop-day").length === 42);
  await React.act(async () => {
    click(q('[title="上个月"]'), "上个月");
  });
  await React.act(async () => {
    click(q('[title="上个月"]'), "上个月");
  });
  ok("可以往前翻两个月", text(q(".pop-title")) !== titleBefore, text(q(".pop-title")));

  await React.act(async () => {
    mouseDown(document.body);
  });
  ok("点外部关闭", !q(".pop"));

  /* ============================================================ 互斥 */
  section("多选择器互斥");
  await React.act(async () => {
    root.render(
      h(
        "div",
        null,
        h(TimePicker, { key: "x", value: "09:00", onChange: () => {} }),
        h(TimePicker, { key: "y", value: "18:00", onChange: () => {} }),
      ),
    );
  });
  ok("渲染出 2 个触发器", qa(".picker").length === 2);

  await React.act(async () => {
    click(qa(".picker")[0], "第一个");
  });
  ok("打开第一个 → 1 个浮层", qa(".pop").length === 1);
  await React.act(async () => {
    click(qa(".picker")[1], "第二个");
  });
  ok("再开第二个 → 仍只有 1 个浮层", qa(".pop").length === 1, `实际：${qa(".pop").length}`);
  ok("浮层内容是 18:00 那个", text(q(".time-readout .t")) === "18:00");
  ok(
    "滚轮停在 18 与 00",
    text(q('[data-wheel="hour"] .wheel-item.is-on')) === "18" &&
      text(q('[data-wheel="minute"] .wheel-item.is-on')) === "00",
    `${text(q('[data-wheel="hour"] .wheel-item.is-on'))}:${text(q('[data-wheel="minute"] .wheel-item.is-on'))}`,
  );

  report();
}

main().catch((e) => {
  console.error("测试崩溃：", e);
  process.exit(1);
});
