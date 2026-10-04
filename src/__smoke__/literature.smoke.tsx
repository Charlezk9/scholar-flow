/**
 * v1.4 · 文献页 DOM 行为测试（`LIT-01` ~ `LIT-11`）。
 *
 * 覆盖：三栏渲染、空态、文件夹树、条目录入与状态、附件导入（预览后端）、
 *       提取入口的可用性约束、提取失败态、破坏性操作必须过站内确认。
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
  const { resetPreviewLiterature } = await import("../lib/literature");
  const { default: LiteraturePage } = await import("../components/LiteraturePage");

  const h = React.createElement;
  const root = createRoot(document.getElementById("root")!);
  const st = () => useStore.getState();

  localStorage.clear();
  resetPreviewLiterature();
  await React.act(async () => {
    applyTheme(DEFAULT_SETTINGS);
    await st().init();
  });
  await React.act(async () => {
    root.render(h(LiteraturePage));
  });

  const flush = async () => {
    await React.act(async () => {
      await sleep(0);
    });
  };
  await flush();

  section("骨架与空态");
  ok("渲染三栏", !!q(".lit-page") && !!q(".lit-tree") && !!q(".lit-list") && !!q(".lit-detail"));
  ok("树里有「全部文献」与「未分类」", !!byText(".lit-node", "全部文献（0）") && !!byText(".lit-node", "未分类（0）"));
  ok("空态提示出现", text(q(".lit-empty")).includes("还没有文献"));
  ok("未选文献时详情给提示", text(q(".lit-detail .lit-empty")).includes("选一条文献"));

  section("文件夹树");
  await React.act(async () => {
    typeInto(q(".lit-newfolder-input"), "多模态");
    click(byText(".btn", "新建"));
  });
  await flush();
  ok("新文件夹出现在树里", !!byText(".lit-node", "多模态（0）"), text(q(".lit-tree")));
  ok("新建后输入框清空", (q(".lit-newfolder-input") as HTMLInputElement).value === "");

  section("文献录入");
  await React.act(async () => {
    typeInto(q(".lit-new-title"), "Attention Is All You Need");
    typeInto(q(".lit-new-year"), "2017");
    typeInto(q(".lit-new-venue"), "NeurIPS");
  });
  await React.act(async () => {
    click(byText(".btn", "添加文献"));
  });
  await flush();
  const item = qa(".lit-item").find((el) => text(el).includes("Attention")) ?? null;
  ok("列表出现新文献", !!item, text(q(".lit-items")));
  ok("新文献落在当前文件夹（多模态（1））", !!byText(".lit-node", "多模态（1）"));
  ok("详情显示标题与期刊", text(q(".lit-title")) === "Attention Is All You Need" && (q(".lit-edit-venue") as HTMLInputElement).value === "NeurIPS");
  ok("列表项带年份与状态", text(item).includes("2017") && text(item).includes("未读"));

  section("标题唯一 + 轻松改名（回车保存）");
  await React.act(async () => {
    typeInto(q(".lit-new-title"), "attention is all you need");
  });
  await React.act(async () => {
    click(byText(".btn", "添加文献"));
  });
  await flush();
  ok("重复标题被拒绝", qa(".lit-item").length === 1, `${qa(".lit-item").length} 条`);
  ok("给出「不能重复」提示", (st().toast ?? "").includes("不能重复"), st().toast ?? "");
  await React.act(async () => {
    const input = q(".lit-edit-title") as HTMLInputElement;
    typeInto(input, "Attention（改名后）");
    pressKey(input, "Enter");
  });
  await flush();
  ok("回车保存标题", text(q(".lit-item")).includes("Attention（改名后）"), text(q(".lit-item")));
  ok("详情标题同步", (q(".lit-edit-title") as HTMLInputElement).value === "Attention（改名后）");
  ok("界面不暴露磁盘文件名", !text(q(".lit-page")).includes(".pdf"), text(q(".lit-file")));

  section("标签与文件夹正交");
  await React.act(async () => { typeInto(q(".lit-tag-input"), "Transformer"); click(q(".lit-tag-add")); });
  await flush();
  ok("新增标签并关联当前文献", q(".lit-tag-options .chip")?.getAttribute("aria-pressed") === "true");
  await React.act(async () => { click(q(".lit-tag-options .chip")); }); await flush();
  ok("取消关联不删除标签", q(".lit-tag-options .chip")?.getAttribute("aria-pressed") === "false");
  await React.act(async () => { typeInto(q(".lit-tag-input"), "Transformer"); click(q(".lit-tag-add")); }); await flush();
  ok("同名标签幂等复用", qa(".lit-tag-options .chip").length === 1 && q(".lit-tag-options .chip")?.getAttribute("aria-pressed") === "true");

  section("状态与附件约束");
  await React.act(async () => {
    click(byText(".chip", "在读"));
  });
  await flush();
  ok("切到「在读」后 chip 高亮", byText(".chip", "在读")?.className.includes("is-on") === true);
  ok("列表项状态同步", text(q(".lit-item")).includes("在读"));
  ok("没有附件时提取按钮禁用", (q(".lit-extract-fast") as HTMLButtonElement).disabled === true);

  section("附件导入（预览后端）");
  await React.act(async () => {
    typeInto(q(".lit-import-path"), "/tmp/attention.pdf");
    click(byText(".btn", "导入"));
  });
  await flush();
  ok("附件以用途呈现（不显示磁盘文件名）", text(q(".lit-file")).includes("正文") && !text(q(".lit-file")).includes(".pdf"), text(q(".lit-file")));
  ok("导入后输入框清空", (q(".lit-import-path") as HTMLInputElement).value === "");
  ok("提示词消失", !text(q(".lit-block")).includes("还没有附件"));
  ok("有附件后本地快线可用", (q(".lit-extract-fast") as HTMLButtonElement).disabled === false);

  section("提取入口（预览模式预期失败但有记录）");
  await React.act(async () => {
    click(q(".lit-extract-fast"));
  });
  await flush();
  const extract = q(".lit-extract");
  ok("产生一条提取记录", !!extract, text(q(".lit-block:last-of-type")));
  ok("记录状态为 failed", text(q(".lit-extract .s")) === "failed", text(q(".lit-extract .s")));
  ok("失败原因可见", text(q(".lit-extract .warn")).includes("预览"));
  ok("没有产物时不显示建议元数据", !q(".lit-suggest"));

  section("破坏性操作必须过站内确认");
  const before = qa(".lit-item").length;
  await React.act(async () => {
    click(q(".lit-delete-paper"), "文献删除按钮");
  });
  await flush();
  ok("点删除不会立刻删掉（等确认弹窗）", qa(".lit-item").length === before);
  ok("确实进入确认流程", st().dialog !== null, JSON.stringify(st().dialog?.title ?? null));
  ok("确认文案提到附件与提取记录", (st().dialog?.message ?? "").includes("提取记录"));

  report();
}

void main();
