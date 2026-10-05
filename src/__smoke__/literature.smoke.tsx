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
  const { resetPreviewLiterature, lit } = await import("../lib/literature");
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
  ok("资料库与阅读器两区", !!q(".lit-tree") && !!q(".lit-editor") && !q(".lit-list"));
  ok("详情默认隐藏", !q(".lit-detail"));
  ok("树里有「全部文献」与「未分类」", !!byText(".lit-node", "全部文献（0）") && !!byText(".lit-node", "未分类（0）"));
  ok("空态提示出现", text(q(".lit-empty")).includes("还没有文献"));
  ok("未选文献时阅读区给提示", text(q(".lit-editor .lit-empty")).includes("从左侧选择"));
  await React.act(async () => { click(q(".lit-new-paper")); });
  ok("新建表单位于左侧资料库", !!q(".lit-tree .lit-form"));
  await React.act(async () => { click(byText(".btn", "添加文献")); });
  ok("空标题有明确提示", (st().toast ?? "").includes("请先填写文献标题"));

  section("文件夹树");
  await React.act(async () => {click(q(".lit-new-folder"));});
  await React.act(async () => {
    typeInto(q(".lit-newfolder-input"), "多模态");
    click(byText(".btn", "新建"));
  });
  await flush();
  ok("新文件夹出现在树里", !!byText(".lit-node", "多模态（0）"), text(q(".lit-tree")));
  ok("创建后文件夹表单收起", !q(".lit-newfolder-input"));

  section("文献录入");
  await React.act(async () => {click(q(".lit-new-paper"));});
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
  ok("创建后详情仍默认隐藏", !q(".lit-detail"));
  await React.act(async () => { click(q(".lit-details-toggle")); });
  ok("点击右侧入口展开详情", !!q(".lit-detail"));
  ok("详情显示标题与期刊", text(q(".lit-reader-title")) === "Attention Is All You Need" && (q(".lit-edit-venue") as HTMLInputElement).value === "NeurIPS");
  ok("文献使用紧凑标题行，元信息不挤占树", !!item?.querySelector(".t") && !item?.querySelector(".m"));
  const folderRow = byText(".lit-node", "多模态（1）");
  await React.act(async () => {click(folderRow!.parentElement!.querySelector(".lit-folder-chevron"));});
  ok("文件夹可折叠且不打断阅读", !q(".lit-item") && text(q(".lit-reader-title")).includes("Attention"));
  await React.act(async () => {click(folderRow!.parentElement!.querySelector(".lit-folder-chevron"));});
  ok("展开恢复文献条目", !!q(".lit-item"));

  section("目录右键与文献拖放");
  await React.act(async()=>{const event = new MouseEvent("contextmenu",{bubbles:true,clientX:20,clientY:20});folderRow!.dispatchEvent(event);});
  ok("文件夹右键菜单在 body", q('[role="menu"]')?.parentElement === document.body);
  await React.act(async()=>{click(byText('[role="menuitem"]',"新建子文件夹"));});
  ok("右键开启子文件夹创建", !!q(".lit-newfolder-input") && q(".lit-node.is-on") === folderRow);
  await React.act(async()=>{pressKey(q(".lit-newfolder-input"),"Escape");});
  const transfer = {types:["application/x-runningdo-paper"],getData:()=> (awaitedPaperId),dropEffect:"move"};
  const awaitedPaperId = (await lit.listPapers())[0].id;
  const drop = (element: Element) => {const event = new Event("drop",{bubbles:true,cancelable:true});Object.defineProperty(event,"dataTransfer",{value:transfer});element.dispatchEvent(event);};
  await React.act(async()=>{drop(byText(".lit-node","未分类（0）")!);});await flush();
  ok("拖放移动到未分类并持久化", (await lit.listPapers())[0].nodeId === null);
  await React.act(async()=>{drop(byText(".lit-node","多模态（0）")!);});await flush();
  ok("拖放移动回文件夹", (await lit.listPapers())[0].nodeId !== null);

  section("文献右键目录选择卡");
  const openMove = async()=>{await React.act(async()=>{q('.lit-item')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));});await React.act(async()=>{click(byText('[role="menuitem"]','移动到目录'));});};
  await openMove();
  ok('目录卡 Portal 到 body',q('.lit-move-backdrop')?.parentElement===document.body && !!q('[role="dialog"]'));
  await React.act(async()=>{click(byText('.lit-move-targets .lit-node','未分类'));});
  await React.act(async()=>{click(q('.lit-move-confirm'));});await flush();
  ok('选择目录移动成功并关闭卡片',(await lit.listPapers())[0].nodeId===null && !q('.lit-move-card'));
  await openMove();
  await React.act(async()=>{click(byText('.lit-move-targets .lit-node','多模态'));});
  await React.act(async()=>{click(q('.lit-move-confirm'));});await flush();
  ok('可移动回其他目录',(await lit.listPapers())[0].nodeId!==null);

  section("选择折叠分离、定位与完整菜单");
  const activeFolder=byText('.lit-node','多模态（1）')!;
  await React.act(async()=>{click(activeFolder);});
  ok('点击名称不折叠目录',!!q('.lit-item'));
  await React.act(async()=>{click(activeFolder.parentElement!.querySelector('.lit-folder-chevron'));});
  await React.act(async()=>{click(q('.lit-reveal-current'));await sleep(30);});
  ok('定位展开当前文献祖先并高亮',!!q('.lit-item.is-locating'));
  await React.act(async()=>{activeFolder.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));});
  ok('文件夹右键提供五个常用操作',qa('[role="menuitem"]').length===5);
  await React.act(async()=>{click(byText('[role="menuitem"]','重命名'));});
  await React.act(async()=>{typeInto(q('.lit-rename-input'),'多模态改名');});
  await React.act(async()=>{click(q('.lit-rename-save'));});await flush();
  ok('文件夹重命名持久化',(await lit.listNodes())[0].name==='多模态改名');
  await lit.saveNode({parentId:(await lit.listNodes())[0].id,name:'子目录验证'});
  await React.act(async()=>{click(byText('.lit-status .chip','未读'));});await flush();
  await React.act(async()=>{byText('.lit-node','多模态改名（1）')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));});
  await React.act(async()=>{click(byText('[role="menuitem"]','移动文件夹'));});
  ok('移动卡具有结构箭头且禁止自身',!!q('.lit-move-targets .lit-folder-chevron') && (byText('.lit-move-targets .lit-node','多模态改名') as HTMLButtonElement).disabled);
  ok('移动卡显示层级且禁止后代',(byText('.lit-move-targets .lit-node','子目录验证') as HTMLButtonElement).disabled && !!q('.lit-destination-row[style*="14px"]'));
  await React.act(async()=>{click(byText('.lit-move-card .btn','取消'));});
  await React.act(async()=>{q('.lit-item')!.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));});
  ok('文献右键提供四个常用操作',qa('[role="menuitem"]').length===4);
  await React.act(async()=>{document.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true}));});
  const dragValues=new Map<string,string>();const dragTransfer={types:['application/x-runningdo-paper'],setData:(key:string,value:string)=>dragValues.set(key,value),getData:(key:string)=>dragValues.get(key)??'',effectAllowed:'',dropEffect:''};
  const dragEvent=(element:Element,type:string)=>{const e=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:dragTransfer});element.dispatchEvent(e);return e;};
  await React.act(async()=>{dragEvent(q('.lit-item')!,'dragstart');const target=byText('.lit-node','未分类（0）')!;dragEvent(target,'dragover');dragEvent(target,'drop');});await flush();
  ok('完整dragstart到drop链移动成功',(await lit.listPapers())[0].nodeId===null);
  await React.act(async()=>{dragEvent(q('.lit-item')!,'dragend');});
  await openMove();await React.act(async()=>{click(byText('.lit-move-targets .lit-node','多模态改名'));});await React.act(async()=>{click(q('.lit-move-confirm'));});await flush();

  section("父目录累计计数");
  const countChild=(await lit.listNodes()).find(n=>n.name==='子目录验证')!;
  await lit.saveNode({parentId:countChild.id,name:'孙目录计数'});
  await React.act(async()=>{click(byText('.lit-status .chip','未读'));});await flush();
  await openMove();await React.act(async()=>{click(byText('.lit-move-targets .lit-node','孙目录计数'));});await React.act(async()=>{click(q('.lit-move-confirm'));});await flush();
  ok('多层子目录文献计入所有祖先',!!byText('.lit-node','多模态改名（1）') && !!byText('.lit-node','子目录验证（1）') && !!byText('.lit-node','孙目录计数（1）'));
  await React.act(async()=>{click(q('[aria-label="折叠多模态改名"]'));});
  ok('折叠不改变累计计数',!!byText('.lit-node','多模态改名（1）'));
  await React.act(async()=>{click(q('[aria-label="展开多模态改名"]'));});
  await openMove();await React.act(async()=>{click(byText('.lit-move-targets .lit-node','多模态改名'));});await React.act(async()=>{click(q('.lit-move-confirm'));});await flush();
  ok('移动后各层计数更新且父目录不重复计数',!!byText('.lit-node','多模态改名（1）') && !!byText('.lit-node','子目录验证（0）') && !!byText('.lit-node','孙目录计数（0）'));

  section("标题唯一 + 轻松改名（回车保存）");
  await React.act(async () => { click(q(".lit-new-paper")); });
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
  ok("阅读状态保留在详情", !!byText(".lit-status .is-on", "在读"));
  ok("没有附件时提取按钮禁用", (q(".lit-extract-fast") as HTMLButtonElement).disabled === true);

  section("原生附件选择与取消");
  const originalChoose = lit.chooseFile;
  const oldToast = st().toast;
  lit.chooseFile = async () => null;
  await React.act(async () => { click(q(".lit-choose-file")); }); await flush();
  ok("取消选择不新增附件", !q(".lit-file"));
  ok("取消选择不显示成功提示", st().toast === oldToast);
  lit.chooseFile = async () => { throw new Error("文件选择失败"); };
  await React.act(async () => { click(q(".lit-choose-file")); }); await flush();
  ok("选择失败有反馈且可重试", st().toast === "文件选择失败" && !(q(".lit-choose-file") as HTMLButtonElement).disabled);
  lit.chooseFile = async paperId => lit.importFile({paperId, srcPath: "/tmp/attention.pdf"});
  section("选择附件后入库（预览后端）");
  await React.act(async () => {
    click(q(".lit-choose-file"));
  });
  await flush();
  ok("附件按文件名呈现", text(q(".lit-file")).includes("attention.pdf"), text(q(".lit-file")));
  ok("不再显示路径输入框", !q(".lit-import-path"));
  lit.chooseFile = originalChoose;
  ok("已有 PDF 源隐藏导入", !q(".lit-choose-file"));
  ok("提供清空 PDF 源", q(".lit-attachment-delete")?.getAttribute("title") === "清空 PDF 源");
  ok("标题栏移除转换按钮", !q(".lit-reader-extract"));
  ok("详情只有三个主分区", qa(".lit-detail > .lit-detail-section").length === 3);
  ok("详情 Portal 到 body", q(".lit-detail")?.parentElement === document.body);
  ok("详情不参与阅读分栏", !q(".lit-workspace.has-details"));
  ok("提示词消失", !text(q(".lit-block")).includes("还没有附件"));
  ok("读取失败不残留加载提示", text(q(".lit-editor-body")).includes("PDF 读取失败") && !text(q(".lit-editor-body")).includes("正在读取"));
  ok("有 PDF 时可选 PDF 视图", !(q(".lit-tab-pdf") as HTMLButtonElement).disabled);
  ok("没有提取稿时 MD 禁用", (q(".lit-tab-md") as HTMLButtonElement).disabled);
  ok("有附件后本地快线可用", (q(".lit-extract-fast") as HTMLButtonElement).disabled === false);

  section("提取入口（预览模式预期失败但有记录）");
  await React.act(async () => {
    click(q(".lit-extract-fast"));
  });
  await flush();
  const extract = q(".lit-extract");
  ok("产生一条提取记录", !!extract, text(q(".lit-block:last-of-type")));
  ok("记录状态为 failed", text(q(".lit-extract .s")) === "转换失败", text(q(".lit-extract .s")));
  ok("失败原因可见", text(q(".lit-extract .warn")).includes("预览"));
  ok("没有产物时不显示建议元数据", !q(".lit-suggest"));
  ok("提取失败有进度反馈", !!q(".lit-progress.is-failed"));

  section("异步提取进度与 PDF/MD 切换");
  const originalExtract = lit.extract;
  const originalList = lit.listExtracts;
  const originalRead = lit.readExtract;
  const records = await lit.listExtracts();
  const success = { ...records[0], id: "reader-success", status: "done" as const, chars: 100, relPath: "sample.fast.md" };
  const {api} = await import("../lib/api");
  await api.setSetting("literature.cloudConsent.glm", "true");
  const originalReady = lit.cloudReady;
  lit.cloudReady = async () => true;
  const final = {...success, id: "reader-final", engine: "layout"};
  let finalReady = false;
  let finish!:  (value: import("../lib/literature").PaperExtract) => void;
  lit.extract = (_id, engine) => engine === "layout" ? new Promise(resolve => { finish = value => {finalReady = true;resolve(value);}; }) : new Promise(resolve => { finish = resolve; });
  lit.listExtracts = async () => finalReady ? [final, success, ...records] : [success, ...records];
  lit.readExtract = async id => id === final.id ? "# 预览模式\n\n提取完成后的正文" : originalRead(id);
  await React.act(async () => { click(q(".lit-extract-fast")); });
  ok("处理中显示不定量进度条", !!q(".lit-progress.is-running progress") && !q(".lit-progress progress")?.hasAttribute("value"));
  await React.act(async () => { finish(success); }); await flush();
  ok("原稿不开放阅读，自动排版仍在进行", (q(".lit-tab-md") as HTMLButtonElement).disabled && !!q(".lit-progress.is-organizing"));
  ok("内部原稿没有查看入口", !q(".lit-extract button"));
  await React.act(async () => { finish(final); }); await flush();
  ok("成功后收起进度条", !q(".lit-progress"));
  ok("成功后 MD 入口亮起", !(q(".lit-tab-md") as HTMLButtonElement).disabled);
  await React.act(async () => { click(q(".lit-tab-md")); }); await flush();
  ok("切换 MD 显示提取稿", text(q(".lit-editor .lit-md")).includes("预览模式"));
  await React.act(async () => { click(q(".lit-tab-pdf")); });
  ok("可切回 PDF", q(".lit-tab-pdf")?.getAttribute("aria-pressed") === "true" && !q(".lit-editor .lit-md"));
  await React.act(async () => { click(q(".lit-details-toggle")); });
  ok("详情收起后阅读器保留", !q(".lit-detail") && !!q(".lit-editor"));
  await React.act(async () => { click(q(".lit-details-toggle")); });
  section("自动整理与独立阅读字号");
  const engines: string[] = [];
  const layout = {...success, id: "organized", engine: "layout"};
  let organized = false;
  lit.extract = async (_paperId, engine) => { engines.push(engine); if(engine === "layout") {organized=true;return layout;} return success; };
  lit.listExtracts = async () => organized ? [layout, success, ...records] : [success,...records];
  lit.readExtract = async id => id === layout.id ? "# 整理稿\n\n:::caption\nFigure 1: 图注\n:::" : "# 原始稿";
  await React.act(async () => { click(q(".lit-extract-fast")); }); await flush();
  ok("提取后自动调用整理引擎", engines.join(",") === "fast,layout");
  await React.act(async () => { click(q(".lit-tab-md")); }); await flush();
  ok("默认阅读整理稿", text(q(".lit-md")).includes("整理稿") && !!q(".lit-caption"));
  await React.act(async () => { click(q('[aria-label="增大阅读字号"]')); });
  ok("字号增大作用于阅读正文", !!q(".lit-md")?.getAttribute("style")?.includes("18px"));
  await React.act(async () => { click(q('[aria-label="恢复阅读字号"]')); });
  ok("阅读字号可恢复默认", !!q(".lit-md")?.getAttribute("style")?.includes("16px"));
  section("翻译入口与中英切换");
  const savedTranslationExtract=lit.extract, savedTranslationList=lit.listExtracts, savedTranslationRead=lit.readExtract, savedTranslationMapping=lit.readTranslation, savedTranslationProgress=lit.translationProgress;
  const translated={...layout,id:'translated',engine:'translation',meta:JSON.stringify({sourceExtractId:layout.id,blocks:[{id:0,source:'# 整理稿',translation:'# 中文译稿'},{id:1,source:':::caption\nFigure 1: 图注\n:::',translation:':::caption\n图1：图注\n:::'}]})};
  lit.readTranslation=async()=>JSON.parse(translated.meta).blocks;
  let translationReady=false;
  let finishTranslation!:(value:import('../lib/literature').PaperExtract)=>void;
  lit.translationProgress=async()=>({completed:1,total:2,stage:'retrying',updatedAt:Date.now()});
  lit.extract=(_id,engine)=>{ok('翻译使用独立引擎',engine==='translation');return new Promise(resolve=>{finishTranslation=value=>{translationReady=true;resolve(value);};});};
  lit.listExtracts=async()=>translationReady?[translated,layout,success,...records]:[layout,success,...records];
  lit.readExtract=async id=>id===translated.id?'<!-- translation-block 0 -->\n\n# 中文译稿\n\n:::caption\n图1：图注\n:::':savedTranslationRead(id);
  ok('没有译文时中文入口禁用',(q('.lit-tab-zh') as HTMLButtonElement).disabled);
  await React.act(async()=>{click(q('.lit-translate'));});await flush();
  ok('翻译显示已完成段落及重试状态',text(q('.lit-progress')).includes('已完成 1/2 段')&&q('.lit-progress progress')?.getAttribute('value')==='1');
  await React.act(async()=>{finishTranslation(translated);});await flush();
  ok('翻译完成自动单独阅读中文',q('.lit-tab-zh')?.getAttribute('aria-pressed')==='true'&&text(q('.lit-md')).includes('中文译稿'));
  await React.act(async()=>{click(q('.lit-tab-parallel'));});
  ok('可切换双栏对照',qa('.lit-translation-pair').length===2&&!!q('.lit-translation-cell[lang="en"]')&&!!q('.lit-translation-cell[lang="zh-CN"]'));
  await React.act(async()=>{click(q('.lit-tab-md'));});
  ok('原稿仍可独立阅读',!q('.lit-translation-grid')&&text(q('.lit-md')).includes('整理稿'));
  lit.readExtract=async id=>{if(id===translated.id)throw new Error('missing');return savedTranslationRead(id);};
  lit.listExtracts=async()=>[{...translated,id:'missing-translation'},layout,success,...records];
  lit.readExtract=async id=>{if(id==='missing-translation')throw new Error('missing');return savedTranslationRead(id);};
  await React.act(async()=>{click(byText('.lit-status .chip','在读'));});await flush();
  await React.act(async()=>{click(q('.lit-tab-zh'));});
  ok('译稿读取失败不残留加载状态',text(q('.lit-editor-body')).includes('中文译稿读取失败'));
  ok('译稿缺失提供重新翻译入口',text(q('.lit-translate'))==='重新翻译');
  lit.extract=savedTranslationExtract;lit.listExtracts=savedTranslationList;lit.readExtract=savedTranslationRead;lit.readTranslation=savedTranslationMapping;lit.translationProgress=savedTranslationProgress;
  await React.act(async()=>{click(byText('.lit-status .chip','在读'));});await flush();
  await React.act(async()=>{click(q('.lit-tab-md'));});
  lit.extract = async (_paperId, engine) => engine === "layout" ? {...layout,status:"failed",error:"测试整理失败"} : success;
  await React.act(async () => { click(q(".lit-extract-fast")); }); await flush();
  ok("整理失败仍可阅读已有完成稿", !(q(".lit-tab-md") as HTMLButtonElement).disabled && !!q(".lit-progress.is-failed"));
  ok("MD 删除只显示图标", text(q(".lit-delete-md")) === "×");
  ok("源删除只显示图标", text(q(".lit-attachment-delete")) === "×");
  ok("已有源不残留空导入行", !q(".lit-detail-section:nth-child(2) > .lit-inline:empty"));
  ok("详情只显示最终 Markdown", qa(".lit-extract").length === 1 && text(q(".lit-extract .e")).endsWith(".md") && !text(q(".lit-extract")).includes("layout"));
  section("MD 读取失败反馈");
  const readableList = lit.listExtracts, readableRead = lit.readExtract;
  lit.listExtracts = async()=>[{...layout,id:"missing-md"},success,...records];
  lit.readExtract = async()=>{throw new Error("缺失文件");};
  await React.act(async()=>{click(byText('.lit-status .chip','在读'));});await flush();
  await React.act(async()=>{click(q('.lit-tab-md'));});await flush();
  ok('MD 读取失败不残留加载提示',text(q('.lit-editor-body')).includes('Markdown 读取失败')&&!text(q('.lit-editor-body')).includes('正在读取'));
  lit.listExtracts=readableList;lit.readExtract=readableRead;
  await React.act(async()=>{click(byText('.lit-status .chip','在读'));});await flush();

  section("删除最终 MD 保留源与原稿");
  const originalDeleteExtract = lit.deleteExtract;
  let deletedMd = '';
  lit.deleteExtract = async id=>{deletedMd=id;organized=false;};
  await React.act(async()=>{click(q('.lit-delete-md'));});
  ok("删除 MD 先确认", st().dialog?.title === "删除 Markdown？" && !deletedMd);
  await React.act(async()=>{await st().dialog?.onConfirm();st().dismissDialog();});await flush();
  ok("删除 MD 后入口禁用但 PDF 源保留", deletedMd===layout.id && (q('.lit-tab-md') as HTMLButtonElement).disabled && !!q('.lit-file'));
  lit.deleteExtract = originalDeleteExtract;
  organized=true;

  section("Office 转换也自动排版");
  lit.chooseFile = async paperId => lit.importFile({paperId, srcPath: "/tmp/paper.docx"});
  await lit.importFile({paperId: (await lit.listPapers())[0].id, srcPath:"/tmp/paper.docx"});
  await React.act(async()=>{click(byText(".lit-status .chip", "在读"));}); await flush();
  lit.chooseFile = originalChoose;
  engines.length = 0;
  lit.extract = async (_id, engine) => {engines.push(engine);return engine === "layout" ? layout : success;};
  const officeRow = qa(".lit-file").at(-1)!;
  await React.act(async () => {click(officeRow.querySelector("button"));}); await flush();
  ok("Office 阅读串接转换与排版", engines.join(",") === "markitdown,layout");
  ok("Office 只打开排版后的 MD", q(".lit-tab-md")?.getAttribute("aria-pressed") === "true" && text(q(".lit-md")).includes("整理稿"));
  lit.cloudReady = async () => false;
  lit.listExtracts = async () => [success];
  lit.extract = async () => success;
  await React.act(async () => { click(q(".lit-extract-fast")); }); await flush();
  ok("缺少排版配置不开放原稿", (q(".lit-tab-md") as HTMLButtonElement).disabled && !q(".lit-extract button") && !!q(".lit-progress.is-failed"));
  lit.listExtracts = async () => [layout,success,...records];
  lit.cloudReady = originalReady;

  section("切换文献后的迟到响应");
  let lateMd!: (value: string) => void;
  lit.readExtract = async () => new Promise(resolve => { lateMd = resolve; });
  const firstId = qa(".lit-item")[0];
  if (!q(".lit-new-title")) await React.act(async () => { click(q(".lit-new-paper")); });
  await React.act(async () => { typeInto(q(".lit-new-title"), "另一篇论文"); });
  await React.act(async () => { click(byText(".btn", "添加文献")); }); await flush();
  const secondItem = qa(".lit-item").find(el => text(el).includes("另一篇论文"))!;
  await React.act(async () => { click(firstId); }); await flush();
  await React.act(async () => { click(secondItem); }); await flush();
  await React.act(async () => { lateMd("# 不应出现在另一篇论文"); }); await flush();
  ok("迟到的 MD 不覆盖当前文献", !text(q(".lit-editor")).includes("不应出现在"));
  ok("无提取稿的新文献 MD 保持禁用", (q(".lit-tab-md") as HTMLButtonElement).disabled);
  lit.extract = originalExtract; lit.listExtracts = originalList; lit.readExtract = originalRead;

  section("破坏性操作必须过站内确认");
  const before = qa(".lit-item").length;
  await React.act(async () => {
    click(q(".lit-delete-paper"), "文献删除按钮");
  });
  await flush();
  ok("点删除不会立刻删掉（等确认弹窗）", qa(".lit-item").length === before);
  ok("确实进入确认流程", st().dialog !== null, JSON.stringify(st().dialog?.title ?? null));
  ok("确认文案提到附件与提取记录", (st().dialog?.message ?? "").includes("提取记录"));

  section('浏览状态重挂载恢复');
  await React.act(async()=>{st().dismissDialog();});
  const folderToRemember=qa('.lit-folder-row .lit-node').find(el=>text(el).includes('多模态改名'))!;
  await React.act(async()=>{click(folderToRemember);click(folderToRemember.parentElement!.querySelector('.lit-folder-chevron'));});
  const rememberedTitle=text(q('.lit-reader-title'));
  const rememberedScroll=q('.lit-tree-content')!;rememberedScroll.scrollTop=55;
  await React.act(async()=>{rememberedScroll.dispatchEvent(new Event('scroll',{bubbles:true}));});
  await React.act(async()=>{root.render(null);});
  await React.act(async()=>{root.render(h(LiteraturePage));});await flush();
  ok('恢复选中文献',text(q('.lit-reader-title'))===rememberedTitle);
  ok('恢复折叠目录',q('[aria-label="展开多模态改名"]')?.getAttribute('aria-expanded')==='false');
  ok('恢复目录选择与滚动',text(q('.lit-folder-row .lit-node.is-on')).includes('多模态改名')&&q('.lit-tree-content')!.scrollTop===55);
  await React.act(async()=>{root.render(null);});
  localStorage.setItem('runningdo.literature.browse.v1',JSON.stringify({folder:'removed',selectedId:'removed',collapsed:['removed'],scroll:0}));
  await React.act(async()=>{root.render(h(LiteraturePage));});await flush();
  ok('失效浏览记录安全回退',text(q('.lit-node.is-on')).includes('全部文献') && text(q('.lit-reader-title'))==='文献阅读器');
  await React.act(async()=>{root.render(null);});
  report();
}

void main();
