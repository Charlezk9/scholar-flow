/**
 * v1.4 · 文献页（`LIT-01` ~ `LIT-11`）
 *
 * 三栏：库树（文件夹 / 未分类）｜文献列表｜详情（元数据 + 附件 + 提取产物）。
 * 与既有页面的约定保持一致：整页布局、站内确认弹窗、破坏性操作都过确认。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, FolderPlus, FolderTree, RefreshCw, Trash2, Wand2 } from "lucide-react";
import {
  lit,
  PAPER_KINDS,
  PAPER_STATUSES,
  suggestedOf,
  type LibraryNode,
  type Paper,
  type PaperExtract,
  type PaperFile,
  type PaperKind,
  type PaperStatus,
  type Tag,
} from "../lib/literature";
import { api } from "../lib/api";
import PdfReader from "./PdfReader";
import MarkdownReader from "./MarkdownReader";
import { confirmThen, useStore } from "../store/useStore";

type FolderKey = "all" | "none" | string;

/** 附件只显示用途，不暴露磁盘文件名（用户要求：文件名可隐藏） */
const FILE_ROLE_LABEL: Record<string, string> = {
  main: "正文",
  supplement: "补充材料",
  slides: "幻灯片",
  other: "其他附件",
};

export default function LiteraturePage() {
  const notify = useStore((s) => s.notify);

  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [files, setFiles] = useState<PaperFile[]>([]);
  const [extracts, setExtracts] = useState<PaperExtract[]>([]);
  const [folder, setFolder] = useState<FolderKey>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [newFolder, setNewFolder] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<PaperKind>("paper");
  const [newYear, setNewYear] = useState("");
  const [newVenue, setNewVenue] = useState("");
  const [importPath, setImportPath] = useState("");
  const [tags, setTags] = useState<Tag[]>([]);
  const [paperTags, setPaperTags] = useState<Tag[]>([]);
  const [tagName, setTagName] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [md, setMd] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const reload = async () => {
    const [n, p, f, e] = await Promise.all([
      lit.listNodes(),
      lit.listPapers(),
      lit.listFiles(),
      lit.listExtracts(),
    ]);
    setNodes(n);
    setPapers(p);
    setFiles(f);
    setExtracts(e);
  };

  useEffect(() => {
    void reload().catch(() => notify("文献加载失败，请重新进入文献页"));
  }, []);

  const depthOf = (node: LibraryNode): number => {
    let depth = 0;
    let cursor = node.parentId;
    while (cursor) {
      const parent = nodes.find((n) => n.id === cursor);
      if (!parent) break;
      depth += 1;
      cursor = parent.parentId;
    }
    return depth;
  };

  const visibleNodes = useMemo(
    () => [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [nodes],
  );

  const visiblePapers = useMemo(() => {
    if (folder === "all") return papers;
    if (folder === "none") return papers.filter((p) => !p.nodeId);
    return papers.filter((p) => p.nodeId === folder);
  }, [papers, folder]);

  const paper = visiblePapers.find((p) => p.id === selectedId) ?? null;
  useEffect(() => {
    let cancelled = false;
    setPaperTags([]); setTagName(""); setMd(null); setPdfBytes(null);
    void Promise.all([lit.listTags(), paper ? lit.listPaperTags(paper.id) : Promise.resolve([])]).then(([all, assigned]) => { if (!cancelled) { setTags(all); setPaperTags(assigned); } }).catch(() => notify("标签加载失败"));
    return () => { cancelled = true; };
  }, [paper?.id]);
  const paperFiles = files.filter((f) => f.paperId === paper?.id);
  const paperExtracts = extracts.filter((e) => e.paperId === paper?.id);

  const guarded = async (action: () => Promise<unknown>, done?: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
      await reload();
      if (done) notify(done);
    } catch (e) {
      notify(String(e instanceof Error ? e.message : e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const createFolder = () =>
    guarded(async () => {
      const node = await lit.saveNode({
        parentId: folder === "all" || folder === "none" ? null : folder,
        name: newFolder,
      });
      setNewFolder("");
      setFolder(node.id);
    }, "文件夹已创建");

  const deleteFolder = () => {
    if (folder === "all" || folder === "none") return;
    const node = nodes.find((n) => n.id === folder);
    void confirmThen({
      title: `删除文件夹「${node?.name ?? ""}」？`,
      message: "子文件夹会一并删除；里面的文献会移到「未分类」。",
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        await guarded(async () => {
          await lit.deleteNode(folder);
          setFolder("all");
        }, "文件夹已删除");
      },
    });
  };

  const createPaper = () =>
    guarded(async () => {
      const year = newYear.trim() ? Number(newYear.trim()) : null;
      const created = await lit.savePaper({
        nodeId: folder === "all" || folder === "none" ? null : folder,
        kind: newKind,
        title: newTitle,
        year,
        venue: newVenue.trim() || null,
      });
      setNewTitle("");
      setNewYear("");
      setNewVenue("");
      setSelectedId(created.id);
    }, "文献已添加");

  const savePaperField = (patch: Partial<Paper>) => {
    if (!paper) return;
    void guarded(async () => {
      await lit.savePaper({
        id: paper.id,
        nodeId: "nodeId" in patch ? patch.nodeId! : paper.nodeId,
        kind: (patch.kind ?? paper.kind) as PaperKind,
        title: patch.title ?? paper.title,
        authors: patch.authors ?? paper.authors,
        year: "year" in patch ? patch.year : paper.year,
        venue: patch.venue ?? paper.venue,
        doi: patch.doi ?? paper.doi,
        url: patch.url ?? paper.url,
        note: patch.note ?? paper.note,
        status: (patch.status ?? paper.status) as PaperStatus,
      });
    });
  };

  const deletePaper = () => {
    if (!paper) return;
    void confirmThen({
      title: `删除「${paper.title}」？`,
      message: "附件的索引与提取记录会一起删除，无法恢复。",
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        await guarded(async () => {
          await lit.deletePaper(paper.id);
          setSelectedId(null);
          setMd(null);
        }, "文献已删除");
      },
    });
  };

  const importFile = () =>
    guarded(async () => {
      if (!paper) return;
      await lit.importFile({ paperId: paper.id, srcPath: importPath });
      setImportPath("");
    }, "附件已入库");

  const openFile = (file: PaperFile) =>
    guarded(async () => {
      if (/\.(docx|pptx)$/i.test(file.relPath)) {
        const result = await lit.extract(file.paperId, "markitdown", file.id);
        if (result.status !== "done") throw new Error(result.error || "转换失败");
        const content = await lit.readExtract(result.id);
        if (selectedRef.current !== file.paperId) return;
        setPdfBytes(null); setMd(content); return;
      }
      const bytes = await lit.readFile(file.id);
      if (selectedRef.current !== file.paperId) return;
      setPdfBytes(new Uint8Array(bytes));
      setMd(null);
    });

  const runExtract = (engine: "fast" | "glm", allowFallback = false) =>
    guarded(async () => {
      if (!paper) return;
      const file = paperFiles.find(f => /\.pdf$/i.test(f.relPath)) ?? paperFiles[0];
      const actualEngine = /\.(docx|pptx)$/i.test(file.relPath) ? "markitdown" : engine;
      let result = await lit.extract(paper.id, actualEngine, file.id);
      if (result.status === "failed" && allowFallback && actualEngine === "glm") {
        notify("云提取失败，正在改用本地快线");
        result = await lit.extract(paper.id, "fast", file.id);
      }
      if (result.status === "failed") { notify(`提取失败：${result.error ?? "未知原因"}`); return; }
      notify(`提取完成（${result.engine}）：${result.pages ?? "?"} 页 / ${result.chars ?? "?"} 字符`);
    });

  const cloudExtract = async (allowFallback = false) => {
    const settings = await api.allSettings();
    if (settings.some(([key, value]) => key === "literature.cloudConsent.glm" && value === "true")) {
      await runExtract("glm", allowFallback); return;
    }
    void confirmThen({ title: "允许云端提取？", message: "将把论文页面图像上传到智谱 GLM 服务，用于提取正文与建议元数据，并产生 API 费用。允许后会记住此服务的选择。", confirmLabel: "允许并提取", onConfirm: async () => { await api.setSetting("literature.cloudConsent.glm", "true"); await runExtract("glm", allowFallback); } });
  };
  const defaultExtract = async () => {
    try { if (await lit.cloudReady()) await cloudExtract(true); else await runExtract("fast"); }
    catch (error) { notify(`提取无法开始：${String(error)}`); }
  };

  const openExtract = (extract: PaperExtract) =>
    guarded(async () => {
      const content = await lit.readExtract(extract.id);
      if (selectedRef.current !== extract.paperId) return;
      setPdfBytes(null);
      setMd(content);
    });

  const adopt = (extract: PaperExtract) => {
    const s = suggestedOf(extract);
    if (!paper || (!s.title && !s.venue)) return;
    void guarded(async () => {
      await lit.savePaper({
        id: paper.id,
        nodeId: paper.nodeId,
        kind: paper.kind,
        title: s.title || paper.title,
        authors: s.authors || paper.authors,
        year: s.year ? Number(s.year) : paper.year,
        venue: s.venue || paper.venue,
        doi: s.doi || paper.doi,
        status: paper.status,
      });
    }, "已采纳建议元数据");
  };

  const attachTag = (tag: Tag, attached: boolean) => guarded(async () => {
    if (!paper) return;
    await lit.setPaperTag(paper.id, tag.id, attached);
    setPaperTags(await lit.listPaperTags(paper.id));
  });
  const addTag = () => guarded(async () => {
    if (!paper || !tagName.trim()) return;
    const tag = await lit.ensureTag(tagName);
    await lit.setPaperTag(paper.id, tag.id, true);
    setTags(await lit.listTags()); setPaperTags(await lit.listPaperTags(paper.id)); setTagName("");
  });

  const latest = paperExtracts.find((e) => e.status === "done") ?? null;
  const suggested = suggestedOf(latest);

  return (
    <div className="lit-page">
      <aside className="lit-tree">
        <div className="lit-tree-head">
          <FolderTree size={15} />
          <span>资料库</span>
        </div>
        <button
          className={`lit-node ${folder === "all" ? "is-on" : ""}`}
          onClick={() => setFolder("all")}
        >
          全部文献（{papers.length}）
        </button>
        <button
          className={`lit-node ${folder === "none" ? "is-on" : ""}`}
          onClick={() => setFolder("none")}
        >
          未分类（{papers.filter((p) => !p.nodeId).length}）
        </button>
        {visibleNodes.map((node) => (
          <button
            key={node.id}
            className={`lit-node ${folder === node.id ? "is-on" : ""}`}
            style={{ paddingLeft: 12 + depthOf(node) * 14 }}
            onClick={() => setFolder(node.id)}
          >
            {node.name}（{papers.filter((p) => p.nodeId === node.id).length}）
          </button>
        ))}
        <div className="lit-tree-foot">
          <input
            className="field lit-newfolder-input"
            placeholder="新建文件夹…"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
          />
          <button className="btn btn-outline btn-sm" onClick={createFolder} disabled={busy}>
            <FolderPlus size={13} />
            新建
          </button>
          {folder !== "all" && folder !== "none" ? (
            <button className="btn btn-outline btn-sm" onClick={deleteFolder} disabled={busy}>
              <Trash2 size={13} />
              删除
            </button>
          ) : null}
        </div>
      </aside>

      <section className="lit-list">
        <div className="lit-form">
          <input
            className="field lit-new-title"
            placeholder="标题…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <div className="lit-form-row">
<div className="lit-kind" role="group" aria-label="文献类别">{PAPER_KINDS.map(k => <button key={k.key} className={`chip ${newKind === k.key ? "is-on" : ""}`} onClick={() => setNewKind(k.key)}>{k.label}</button>)}</div>
            <input
              className="field lit-new-year"
              placeholder="年份"
              value={newYear}
              onChange={(e) => setNewYear(e.target.value)}
            />
            <input
              className="field lit-new-venue"
              placeholder="期刊 / 会议"
              value={newVenue}
              onChange={(e) => setNewVenue(e.target.value)}
            />
          </div>
          <button className="btn btn-sm" onClick={createPaper} disabled={busy || !newTitle.trim()}>
            添加文献
          </button>
        </div>

        <div className="lit-items">
          {visiblePapers.length === 0 ? (
            <p className="lit-empty">这里还没有文献。先建个文件夹，或直接在上方添加。</p>
          ) : (
            visiblePapers.map((p) => (
              <button
                key={p.id}
                className={`lit-item ${p.id === selectedId ? "is-on" : ""}`}
                onClick={() => {
                  setSelectedId(p.id);
                  setMd(null);
                  setPdfBytes(null);
                }}
              >
                <span className="t">{p.title}</span>
                <span className="m">
                  {PAPER_KINDS.find((k) => k.key === p.kind)?.label}
                  {p.year ? ` · ${p.year}` : ""}
                  {p.venue ? ` · ${p.venue}` : ""}
                  <em>{PAPER_STATUSES.find((s) => s.key === p.status)?.label}</em>
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section className="lit-detail">
        {!paper ? (
          <p className="lit-empty">选一条文献看详情。</p>
        ) : (
          <>
            <h2 className="lit-title">{paper.title}</h2>
            <div className="lit-fields" key={paper.id + paper.updatedAt}>
              <label>
                标题
                <input
                  key={paper.id + paper.title}
                  className="field lit-edit-title"
                  defaultValue={paper.title}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      const next = e.currentTarget.value.trim();
                      if (next && next !== paper.title) savePaperField({ title: next });
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      e.currentTarget.value = paper.title;
                      e.currentTarget.blur();
                    }
                  }}
                  onBlur={(e) => e.target.value.trim() !== paper.title && savePaperField({ title: e.target.value })}
                />
                <span className="lit-hint">回车保存 · Esc 撤销 · 标题不能重复</span>
              </label>
              <label>
                作者
                <input
                  className="field lit-edit-authors"
                  defaultValue={paper.authors ?? ""}
                  onBlur={(e) => (e.target.value || null) !== paper.authors && savePaperField({ authors: e.target.value })}
                />
              </label>
              <label>
                期刊 / 会议
                <input
                  className="field lit-edit-venue"
                  defaultValue={paper.venue ?? ""}
                  onBlur={(e) => (e.target.value || null) !== paper.venue && savePaperField({ venue: e.target.value })}
                />
              </label>
              <label>
                年份
                <input
                  className="field lit-edit-year"
                  defaultValue={paper.year ?? ""}
                  onBlur={(e) =>
                    (e.target.value ? Number(e.target.value) : null) !== paper.year &&
                    savePaperField({ year: e.target.value ? Number(e.target.value) : null })
                  }
                />
              </label>
            </div>
            <div className="lit-status">
              {PAPER_STATUSES.map((s) => (
                <button
                  key={s.key}
                  className={`chip ${paper.status === s.key ? "is-on" : ""}`}
                  onClick={() => savePaperField({ status: s.key })}
                >
                  {s.label}
                </button>
              ))}
              <button
                className="btn btn-outline btn-sm lit-delete-paper"
                onClick={deletePaper}
                disabled={busy}
              >
                <Trash2 size={13} />
                删除
              </button>
            </div>

            <div className="lit-block lit-tags">
              <h3>标签</h3>
              <div className="lit-inline"><input className="field lit-tag-input" placeholder="添加标签…" value={tagName} onChange={e => setTagName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void addTag(); } }} /><button className="btn btn-outline btn-sm lit-tag-add" disabled={busy || !tagName.trim()} onClick={() => void addTag()}>添加标签</button></div>
              <div className="lit-tag-options">{tags.map(t => <button key={t.id} className={`chip ${paperTags.some(x => x.id === t.id) ? "is-on" : ""}`} aria-pressed={paperTags.some(x => x.id === t.id)} disabled={busy} onClick={() => void attachTag(t, !paperTags.some(x => x.id === t.id))}>{t.name}</button>)}</div>
            </div>
            <div className="lit-block">
              <h3>附件</h3>
              <div className="lit-inline">
                <input
                  className="field lit-import-path"
                  placeholder="/path/to/paper.pdf"
                  value={importPath}
                  onChange={(e) => setImportPath(e.target.value)}
                />
                <button
                  className="btn btn-outline btn-sm"
                  onClick={importFile}
                  disabled={busy || !importPath.trim()}
                >
                  导入
                </button>
              </div>
              {paperFiles.length === 0 ? (
                <p className="lit-empty">还没有附件。导入后会拷贝进数据目录并记录 sha256。</p>
              ) : (
                paperFiles.map((f) => (
                  <div key={f.id} className="lit-file">
                    <FileText size={13} />
                    <span className="n">
                      {FILE_ROLE_LABEL[f.role] ?? "附件"}
                      {f.size ? ` · ${(f.size / 1024 / 1024).toFixed(1)} MB` : ""}
                    </span>
                    {f.missing ? <em className="warn">已丢失</em> : null}
                    <button className="btn btn-outline btn-sm" onClick={() => openFile(f)} disabled={busy}>
                      阅读
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => void confirmThen({ title: "移除附件？", message: "附件和同主干提取稿将一并移除，无法恢复。", confirmLabel: "移除", danger: true, onConfirm: async () => { await guarded(async () => { await lit.deleteFile(f.id); setMd(null); setPdfBytes(null); }, "附件已删除"); } })}
                      disabled={busy}
                    >
                      移除
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="lit-block">
              <h3>提取</h3>
              <div className="lit-inline"><button className="btn btn-sm lit-extract-default" onClick={() => void defaultExtract()} disabled={busy || paperFiles.length === 0}>提取 Markdown</button>
                <button
                  className="btn btn-outline btn-sm lit-extract-fast"
                  onClick={() => runExtract("fast")}
                  disabled={busy || paperFiles.length === 0}
                >
                  <Wand2 size={13} />
                  本地快线
                </button>
                <button
                  className="btn btn-outline btn-sm lit-extract-glm"
                  onClick={() => void cloudExtract().catch(e => notify(String(e)))}
                  disabled={busy || paperFiles.length === 0}
                >
                  <RefreshCw size={13} />
                  云 OCR（GLM）
                </button>
              </div>
              {paperExtracts.length === 0 ? (
                <p className="lit-empty">还没有提取产物。本地快线走文本层，云 OCR 质量更高但需要联网与密钥。</p>
              ) : (
                paperExtracts.map((e) => (
                  <div key={e.id} className="lit-extract">
                    <span className="e">{e.engine}</span>
                    <span className={`s is-${e.status}`}>{e.status}</span>
                    <span className="m">
                      {e.pages ?? "?"} 页 · {e.chars ?? "?"} 字符
                    </span>
                    {e.status === "done" ? (
                      <button className="btn btn-outline btn-sm" onClick={() => openExtract(e)} disabled={busy}>
                        查看
                      </button>
                    ) : null}
                    {e.error ? <em className="warn">{e.error}</em> : null}
                  </div>
                ))
              )}
              {suggested.title || suggested.venue ? (
                <div className="lit-suggest">
                  <span>
                    建议元数据：{suggested.title}
                    {suggested.venue ? ` · ${suggested.venue}` : ""}
                  </span>
                  <button className="btn btn-outline btn-sm" onClick={() => adopt(latest!)} disabled={busy}>
                    采纳
                  </button>
                </div>
              ) : null}
            </div>

            {pdfBytes ? <PdfReader bytes={pdfBytes} /> : null}
            {md !== null ? <MarkdownReader text={md} /> : null}
          </>
        )}
      </section>
    </div>
  );
}
