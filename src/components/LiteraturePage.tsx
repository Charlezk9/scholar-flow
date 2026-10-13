import {reportError,showDiagnostics} from "../lib/diagnostics";
/**
 * v1.4 · 文献页（`LIT-01` ~ `LIT-11`）
 *
 * 资源管理器资料库｜阅读器｜可收起的详情。
 * 与既有页面的约定保持一致：整页布局、站内确认弹窗、破坏性操作都过确认。
 */
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FilePlus2, LocateFixed, Folder, FileText, FolderPlus, FolderTree, RefreshCw, Trash2, Wand2 } from "lucide-react";
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
import LiteratureTaskProgress, {type LiteratureTaskView} from "./LiteratureTaskProgress";
import MarkdownReader from "./MarkdownReader";
import TranslationReader, {translationPairs, translationSourceMatches, type TranslationPair} from "./TranslationReader";
import { confirmThen, useStore } from "../store/useStore";

const BROWSE_KEY = "runningdo.literature.browse.v1";
function readBrowse(): {folder:string;selectedId:string|null;collapsed:string[];scroll:number} {
  try {const v = JSON.parse(localStorage.getItem(BROWSE_KEY) ?? "{}");return {folder:typeof v.folder === "string" ? v.folder : "all",selectedId:typeof v.selectedId === "string" ? v.selectedId : null,collapsed:Array.isArray(v.collapsed) ? v.collapsed.filter((id: unknown)=>typeof id === "string") : [],scroll:typeof v.scroll === "number" && Number.isFinite(v.scroll) ? Math.max(0,v.scroll) : 0};}catch{return {folder:"all",selectedId:null,collapsed:[],scroll:0};}
}
type FolderKey = "all" | "none" | string;

export default function LiteraturePage() {
  const [remembered] = useState(readBrowse);
  const treeContent = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const scrollPosition = useRef(remembered.scroll);
  const [loaded, setLoaded] = useState(false);
  const [locating, setLocating] = useState<string | null>(null);
  const locateFrame = useRef<number | null>(null);
  const locateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rename, setRename] = useState<{id:string;kind:"paper"|"folder";value:string} | null>(null);
  const [moveCollapsed, setMoveCollapsed] = useState<Set<string>>(new Set());
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useStore((s) => s.notify);

  const [nodes, setNodes] = useState<LibraryNode[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [files, setFiles] = useState<PaperFile[]>([]);
  const [extracts, setExtracts] = useState<PaperExtract[]>([]);
  const [folder, setFolder] = useState<FolderKey>(remembered.folder);
  const [selectedId, setSelectedId] = useState<string | null>(remembered.selectedId);
  const activePaperId = useRef(selectedId);
  activePaperId.current = selectedId;

  const readerHeader = useRef<HTMLElement>(null);
  const workspace = useRef<HTMLElement>(null);
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const [detailRect, setDetailRect] = useState({top: 0, right: 0, height: 600, width: 320});
  const [context, setContext] = useState<{id: string; x: number; y: number; kind?: "paper"} | null>(null);
  const draggedPaper = useRef<string | null>(null);
  const [moveCard, setMoveCard] = useState<{paperId:string;target:string;kind?:"folder"} | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(remembered.collapsed));
  const [newFolder, setNewFolder] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<PaperKind>("paper");
  const [newSource, setNewSource] = useState("");
  const [newDestination, setNewDestination] = useState("none");
  const [createError, setCreateError] = useState("");
  const [choosingSource, setChoosingSource] = useState(false);
  const choosingSourceRef = useRef(false);
  const createCard = useRef<HTMLElement>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [paperTags, setPaperTags] = useState<Tag[]>([]);
  const [tagName, setTagName] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [readerView, setReaderView] = useState<"pdf" | "md" | "zh" | "parallel">("pdf");
  const [progress, setProgress] = useState<{ paperId: string; status: "running" | "organizing" | "done" | "failed" } | null>(null);
  const [extractRun, setExtractRun] = useState<{paperId: string; fileId: string; engine: string; startedAt: number} | null>(null);
  const [extractCount, setExtractCount] = useState<import("../lib/literature").ExtractionProgress | null>(null);
  useEffect(() => {
    if (!extractRun) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const value = await lit.extractionProgress(extractRun.paperId, extractRun.fileId, extractRun.engine);
        if (!cancelled && value && value.updatedAt >= extractRun.startedAt) setExtractCount(value);
      } catch { /* 查询失败不影响转换。 */ }
    };
    void poll();
    const timer = setInterval(() => void poll(), 750);
    return () => { cancelled = true; clearInterval(timer); };
  }, [extractRun]);
  const titleInput = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const [readerFont, setReaderFont] = useState(16);
  const [mdExtractId, setMdExtractId] = useState<string>();
  const [mdError, setMdError] = useState("");
  const [pairs, setPairs] = useState<TranslationPair[]>([]);
  const [translationText, setTranslationText] = useState<string | null>(null);
  const [translationError, setTranslationError] = useState("");
  const [translationCount, setTranslationCount] = useState<import("../lib/literature").TranslationProgress | null>(null);
  const [translationRunError, setTranslationRunError] = useState<{paperId:string;message:string}|null>(null);
  const translationFileId = useRef<string | undefined>(undefined);
  const translationStarted = useRef(0);
  const [translating, setTranslating] = useState<string | null>(null);
  const [md, setMd] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState("");
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
    if (!restored.current) {
      restored.current=true;
      setSelectedId(p.some(item=>item.id===remembered.selectedId) ? remembered.selectedId : null);
      setFolder(["all","none",...n.map(item=>item.id)].includes(remembered.folder) ? remembered.folder : "all");
      setCollapsed(new Set(remembered.collapsed.filter(id=>id === "none" || n.some(item=>item.id===id))));
      setLoaded(true);
    }
  };

  useEffect(() => {
    void reload().catch(() => notify("文献加载失败，请重新进入文献页"));
  }, []);

  const browseSnapshot = useRef({loaded,folder,selectedId,collapsed});
  browseSnapshot.current = {loaded,folder,selectedId,collapsed};
  const browseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistBrowse = () => {
    const state = browseSnapshot.current;
    if (!state.loaded) return;
    try {localStorage.setItem(BROWSE_KEY,JSON.stringify({folder:state.folder,selectedId:state.selectedId,collapsed:[...state.collapsed],scroll:scrollPosition.current}));}catch{/* 存储不可用时仍可浏览。 */}
  };
  const scheduleBrowse = () => {
    if (browseTimer.current) clearTimeout(browseTimer.current);
    browseTimer.current = setTimeout(persistBrowse, 200);
  };
  useEffect(scheduleBrowse,[loaded,folder,selectedId,collapsed]);
  useEffect(() => () => {if (browseTimer.current) clearTimeout(browseTimer.current);persistBrowse();}, []);
  useEffect(()=>{if(loaded && treeContent.current) treeContent.current.scrollTop=remembered.scroll;},[loaded]);
  useEffect(()=>()=>{if(locateTimer.current) clearTimeout(locateTimer.current);if(locateFrame.current !== null) window.cancelAnimationFrame(locateFrame.current);if(hoverTimer.current) clearTimeout(hoverTimer.current);},[]);
  const visibleNodes = useMemo(
    () => [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [nodes],
  );

  const treeIndex = useMemo(() => {
    const children = new Map<string | null, LibraryNode[]>();
    const entries = new Map<string, Paper[]>();
    for (const node of visibleNodes) {const list=children.get(node.parentId) ?? [];list.push(node);children.set(node.parentId,list);}
    for (const item of papers) {const id=item.nodeId ?? "none";const list=entries.get(id) ?? [];list.push(item);entries.set(id,list);}
    return {children,entries};
  }, [visibleNodes,papers]);

  const paper = papers.find((p) => p.id === selectedId) ?? null;
  const folderCounts = useMemo(() => {
    const parents = new Map(nodes.map(node => [node.id, node.parentId]));
    const counts = new Map<string, number>();
    for (const item of papers) {
      let id = item.nodeId;
      const visited = new Set<string>();
      while (id && parents.has(id) && !visited.has(id)) {
        visited.add(id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
        id = parents.get(id) ?? null;
      }
    }
    return counts;
  }, [nodes, papers]);
  useEffect(() => {
    let cancelled = false;
    setPaperTags([]); setTagName(""); setMd(null); setPdfBytes(null);
    void Promise.all([lit.listTags(), paper ? lit.listPaperTags(paper.id) : Promise.resolve([])]).then(([all, assigned]) => { if (!cancelled) { setTags(all); setPaperTags(assigned); } }).catch(() => notify("标签加载失败"));
    return () => { cancelled = true; };
  }, [paper?.id]);
  const paperFiles = files.filter((f) => f.paperId === paper?.id);
  const paperExtracts = extracts.filter((e) => e.paperId === paper?.id);

  const guarded = async (action: () => Promise<unknown>, done?: string, refresh = true) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
      if (refresh) await reload();
      if (done) notify(done);
    } catch (e) {
      reportError(e,"literature",undefined,{paperId:paper?.id});
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
      setNodes(previous => [...previous, node]);
      setNewFolder("");
      setCreatingFolder(false);
      setFolder(node.id);
      setCollapsed(previous => {const next = new Set(previous); next.delete(folder); return next;});
    }, "文件夹已创建", false);

  const deleteFolder = (target = folder) => {
    if (target === "all" || target === "none") return;
    const node = nodes.find((n) => n.id === target);
    void confirmThen({
      title: `删除文件夹「${node?.name ?? ""}」？`,
      message: "子文件夹会一并删除；里面的文献会移到「未分类」。",
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        await guarded(async () => {
          await lit.deleteNode(target);
          const [nextNodes,nextPapers] = await Promise.all([lit.listNodes(),lit.listPapers()]);
          setNodes(nextNodes);setPapers(nextPapers);
          setFolder("all");
        }, "文件夹已删除", false);
      },
    });
  };

  const openCreate = (destination = folder) => {
    setNewDestination(destination === "all" ? "none" : destination);
    setNewTitle("");setNewSource("");setCreateError("");setCreating(true);setCreatingFolder(false);
  };
  const chooseNewSource = async () => {
    if (choosingSourceRef.current || busyRef.current) return;
    choosingSourceRef.current=true;setChoosingSource(true);setCreateError("");
    try {
      const path = await lit.chooseNewSource();
      if (path) {
        const titleOf = (value: string) => (value.split(/[\\/]/).pop() ?? "").replace(/\.[^.]+$/, "");
        setNewTitle(previous => !previous.trim() || previous === titleOf(newSource) ? titleOf(path) : previous);
        setNewSource(path);
      }
    } catch(error) {setCreateError(error instanceof Error ? error.message : String(error));}
    finally {choosingSourceRef.current=false;setChoosingSource(false);}
  };
  const closeCreate = () => {if (!busyRef.current && !choosingSourceRef.current) setCreating(false);};
  const createPaper = async () => {
    if (busyRef.current || choosingSourceRef.current) return;
    if (!newSource || !newTitle.trim()) {setCreateError("请选择附件并填写文献标题");return;}
    busyRef.current=true;setBusy(true);setCreateError("");
    try {
      const [created,file] = await lit.createWithFile({nodeId:newDestination === "none" ? null : newDestination,kind:newKind,title:newTitle},newSource);
      setPapers(previous=>[...previous,created]);setFiles(previous=>[...previous,file]);
      setSelectedId(created.id);setFolder(newDestination);expandDestination(newDestination);setCreating(false);
      notify("文献及附件已添加");
    } catch(error) {setCreateError(error instanceof Error ? error.message : String(error));}
    finally {busyRef.current=false;setBusy(false);}
  };

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

  const deletePaper = (target = paper) => {
    if (!target) return;
    void confirmThen({
      title: `删除「${target.title}」？`,
      message: "附件的索引与提取记录会一起删除，无法恢复。",
      confirmLabel: "删除",
      danger: true,
      onConfirm: async () => {
        await guarded(async () => {
          await lit.deletePaper(target.id);
          if(selectedRef.current === target.id) {setSelectedId(null);setMd(null);}
        }, "文献已删除");
      },
    });
  };

  const importFile = () =>
    guarded(async () => {
      if (!paper) return;
      const file = await lit.chooseFile(paper.id);
      if (file) notify("附件已入库");
    });

  const openFile = (file: PaperFile) => {
    if (/\.(docx|pptx)$/i.test(file.relPath)) return runExtract("fast", false, file);
    return guarded(async () => {
      const bytes = await lit.readFile(file.id);
      if (selectedRef.current !== file.paperId) return;
      setPdfBytes(new Uint8Array(bytes));
      setReaderView("pdf");
    });
  };

  const runExtract = (engine: "fast" | "glm", allowFallback = false, requestedFile?: PaperFile) =>
    guarded(async () => {
      if (!paper) return;
      if (await lit.cloudReady()) {
        const settings = await api.allSettings();
        if (!settings.some(([key, value]) => key === "literature.cloudConsent.glm" && value === "true")) {
          void confirmThen({title: "允许自动云整理？", message: "转换时会把原稿与来源页面发给智谱 GLM 检查排版，并产生 API 费用。原始数据仅内部保存。", confirmLabel: "允许并开始", onConfirm: async () => { await api.setSetting("literature.cloudConsent.glm", "true"); await runExtract(engine, allowFallback, requestedFile); }});
          return;
        }
      }
      const file = requestedFile ?? paperFiles.find(f => /\.pdf$/i.test(f.relPath)) ?? paperFiles[0];
      if (!file) throw new Error("请先导入附件");
      setTranslationRunError(null);
      setProgress({ paperId: paper.id, status: "running" });
      try {
        const actualEngine = /\.(docx|pptx)$/i.test(file.relPath) ? "markitdown" : engine;
        const extract = (nextEngine: typeof actualEngine | "layout") => {
          setExtractCount(null);
          setExtractRun({paperId: paper.id, fileId: file.id, engine: nextEngine, startedAt: Date.now()});
          return lit.extract(paper.id, nextEngine, file.id);
        };
        let result = await extract(actualEngine);
        if (result.status === "failed" && allowFallback && actualEngine === "glm") {
          notify("云提取失败，正在改用本地快线");
          result = await extract("fast");
        }
        if (result.status !== "done") throw new Error(result.error || "未生成提取稿");
        // 原始产物只供内部整理使用，必须完成排版才开放 MD 阅读。
        await reload();
        if (!await lit.cloudReady()) throw new Error("尚未配置自动排版服务，请配置后重试");
        setProgress({ paperId: paper.id, status: "organizing" });
        const organized = await extract("layout");
        if (organized.status !== "done") throw new Error(organized.error || "自动排版失败");
        if (requestedFile && selectedRef.current === paper.id) {
          const content = await lit.readExtract(organized.id);
          if (selectedRef.current === paper.id) {
            setMd(content); setMdExtractId(organized.id); setReaderView("md");
          }
        }
        setProgress({ paperId: paper.id, status: "done" });
        notify(`「${paper.title}」Markdown 已完成排版：${organized.pages ?? "?"} 页 / ${organized.chars ?? "?"} 字符`);
      } catch (error) {
        setProgress({ paperId: paper.id, status: "failed" });
        await reload();
        throw error;
      } finally {
        setExtractRun(null);
        setExtractCount(null);
      }
    });

  const cloudExtract = async (allowFallback = false) => {
    const settings = await api.allSettings();
    if (settings.some(([key, value]) => key === "literature.cloudConsent.glm" && value === "true")) {
      await runExtract("glm", allowFallback); return;
    }
    void confirmThen({ title: "允许云端提取？", message: "将把论文页面图像上传到智谱 GLM 服务，用于提取正文、建议元数据及自动整理排版，并产生 API 费用。允许后会记住此服务的选择。", confirmLabel: "允许并提取", onConfirm: async () => { await api.setSetting("literature.cloudConsent.glm", "true"); await runExtract("glm", allowFallback); } });
  };
  const defaultExtract = async () => {
    try { if (await lit.cloudReady()) await cloudExtract(true); else await runExtract("fast"); }
    catch (error) { notify(`提取无法开始：${String(error)}`); }
  };

  const openExtract = (extract: PaperExtract) =>
    guarded(async () => {
      const content = await lit.readExtract(extract.id);
      if (selectedRef.current !== extract.paperId) return;
      setMd(content); setMdExtractId(extract.id); setReaderView("md");
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

  const latest = paperExtracts.find(e => e.status === "done" && e.engine === "layout") ?? null;
  const translation = paperExtracts.find(e => e.engine === "translation" && e.status === "done" && translationSourceMatches(e, latest?.id)) ?? null;


  useEffect(() => {
    let cancelled = false;
    setTranslationText(null); setTranslationError(""); setPairs([]);
    if (translation) void Promise.all([lit.readExtract(translation.id), lit.readTranslation(translation.id)]).then(([value, blocks]) => {
      const matched = translationPairs({...translation,meta:JSON.stringify({...JSON.parse(translation.meta ?? "{}"),blocks})}, latest?.id);
      if (!matched.length) throw new Error("段落映射无效");
      if (!cancelled) {setTranslationText(value); setPairs(matched);}
    }).catch(() => {if (!cancelled) setTranslationError("中文译稿读取失败，请检查译稿及段落映射文件。");});
    return () => {cancelled = true;};
  }, [paper?.id, translation?.id]);
  useEffect(() => {
    if (!translating) {setTranslationCount(null); return;}
    let cancelled=false;
    const poll=async()=>{
      try {const value=await lit.translationProgress(translating,translationFileId.current);if(!cancelled && value && value.updatedAt>=translationStarted.current) setTranslationCount(value);} catch {/* 进度查询失败不终止实际翻译。 */}
    };
    void poll();const timer=setInterval(()=>void poll(),1500);
    return()=>{cancelled=true;clearInterval(timer);};
  },[translating]);
  const translatePaper = () => guarded(async () => {
    if (!paper || !latest) return;
    translationFileId.current=latest.fileId ?? undefined;translationStarted.current=Date.now();
    setTranslationRunError(null);setTranslating(paper.id);
    try {
      if (!await lit.cloudReady()) throw new Error("尚未配置翻译服务，请先配置云服务。");
      const result = await lit.extract(paper.id, "translation", latest.fileId ?? undefined);
      if (result.status !== "done") throw new Error(result.error || "翻译失败，请重试");
      if (!translationSourceMatches(result, latest.id)) throw new Error("翻译来源无效，请重试");
      const blocks = await lit.readTranslation(result.id);
      if (!translationPairs({...result,meta:JSON.stringify({...JSON.parse(result.meta ?? "{}"),blocks})}, latest.id).length) throw new Error("翻译段落映射无效，请重试");
      if (activePaperId.current === paper.id) setReaderView("zh");
    } catch(e) {setTranslationRunError({paperId:paper.id,message:String(e)});throw e;} finally {setTranslating(null);}
  }, paper ? `「${paper.title}」中文翻译完成` : undefined);
  const suggested = suggestedOf(latest);
  const pdfFile = paperFiles.find(f => /\.pdf$/i.test(f.relPath) && !f.missing);
  useEffect(() => {
    let cancelled = false;
    setReaderView("pdf"); setPdfBytes(null); setPdfError("");
    if (pdfFile) void lit.readFile(pdfFile.id).then(bytes => {
      if (!cancelled) setPdfBytes(new Uint8Array(bytes));
    }).catch(() => { if (!cancelled) {setPdfError("PDF 读取失败，请在文献详情检查源附件。");notify("PDF 读取失败，请在文献详情检查附件");} });
    return () => { cancelled = true; };
  }, [paper?.id, pdfFile?.id]);
  useEffect(() => {
    let cancelled = false;
    setMd(null); setMdExtractId(undefined); setMdError("");
    if (latest) void lit.readExtract(latest.id).then(content => {
      if (!cancelled) { setMd(content); setMdExtractId(latest.id); }
    }).catch(() => { if (!cancelled) {setMdError("Markdown 读取失败，请在文献详情检查或重新生成。");notify("MD 读取失败，请在文献详情检查提取稿");} });
    return () => { cancelled = true; };
  }, [paper?.id, latest?.id]);
  useEffect(() => {
    if (!creating) return;
    const previous = document.activeElement as HTMLElement | null;
    titleInput.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {event.preventDefault();closeCreate();}
      if (event.key === "Tab") {
        const controls = [...(createCard.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? [])];
        if (!controls.length) {event.preventDefault();return;}
        const first=controls[0],last=controls[controls.length-1];
        if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
        else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener("keydown",key);
    return () => {document.removeEventListener("keydown",key);previous?.focus();};
  }, [creating]);


  const toggleDetails = () => {
    if (!detailsOpen) {setDetailsOpen(true);return;}
    const panel = document.getElementById("lit-details");
    if (panel?.animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      void panel.animate([{transform:"none",opacity:1},{transform:"translateX(24px)",opacity:0}],{duration:160,easing:"ease-in"}).finished.catch(()=>{}).then(()=>setDetailsOpen(false));
    } else setDetailsOpen(false);
  };
  const toggleFolder = (id: string) => {
    setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  useEffect(() => {
    if (!detailsOpen || !workspace.current) return;
    const measure = () => {const r = workspace.current!.getBoundingClientRect();const top = readerHeader.current?.getBoundingClientRect().bottom ?? r.top+48;setDetailRect({top,right:window.innerWidth-r.right,height:Math.max(100,r.bottom-top),width:Math.min(320,r.width)});};
    measure(); window.addEventListener("resize",measure);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(workspace.current);
    if (readerHeader.current) observer?.observe(readerHeader.current);
    return () => {window.removeEventListener("resize",measure);observer?.disconnect();};
  },[detailsOpen, paper?.id]);
  useEffect(() => {
    if (!context) return;
    const close = () => setContext(null);
    const key = (event: KeyboardEvent) => {if(event.key === "Escape") close();};
    document.addEventListener("pointerdown",close);document.addEventListener("keydown",key);
    return () => {document.removeEventListener("pointerdown",close);document.removeEventListener("keydown",key);};
  },[context]);
  const directoryPath = (id: string) => {
    const names: string[] = [];const seen = new Set<string>();let current = nodes.find(n=>n.id === id);
    while(current && !seen.has(current.id)){seen.add(current.id);names.unshift(current.name);current=nodes.find(n=>n.id === current!.parentId);}
    return names.join(" / ");
  };
  useEffect(()=>{if(moveCard) document.querySelector<HTMLButtonElement>(".lit-move-card button")?.focus();},[moveCard?.paperId]);
  const reveal = (id = selectedId) => {
    const item = papers.find(p=>p.id === id);if(!item) return;
    const ancestors = new Set<string>();let cursor = item.nodeId;
    while(cursor && !ancestors.has(cursor)){ancestors.add(cursor);cursor=nodes.find(n=>n.id===cursor)?.parentId ?? null;}
    if(!item.nodeId) ancestors.add("none");
    setCollapsed(previous=>new Set([...previous].filter(key=>!ancestors.has(key))));
    setFolder(item.nodeId ?? "none");setLocating(null);
    if(locateFrame.current !== null) window.cancelAnimationFrame(locateFrame.current);
    locateFrame.current=window.requestAnimationFrame(()=>{const row=[...(treeContent.current?.querySelectorAll<HTMLElement>("[data-paper-id]") ?? [])].find(e=>e.dataset.paperId === id);row?.scrollIntoView?.({block:"nearest"});setLocating(id);});
    if(locateTimer.current) clearTimeout(locateTimer.current);
    locateTimer.current=setTimeout(()=>setLocating(null),1400);
  };
  const invalidDestination = (id:string) => {
    if(moveCard?.kind !== "folder") return false;
    const visited=new Set<string>();let current: string|null=id;
    while(current && !visited.has(current)){if(current===moveCard.paperId) return true;visited.add(current);current=nodes.find(n=>n.id===current)?.parentId ?? null;}
    return false;
  };
  const expandDestination = (id:string) => {
    const ids=new Set<string>();let cursor:string|null=id;
    while(cursor && !ids.has(cursor)){ids.add(cursor);cursor=nodes.find(n=>n.id===cursor)?.parentId ?? null;}
    setCollapsed(previous=>new Set([...previous].filter(key=>!ids.has(key))));
  };
  const relocate = (paperId: string, id: string, kind?: "folder") => {
    if(kind === "folder") {
      const node=nodes.find(n=>n.id === paperId);if(!node || invalidDestination(id)) return;
      void guarded(async()=>{const updated=await lit.saveNode({...node,parentId:id === "none" ? null : id});setNodes(previous=>previous.map(n=>n.id===updated.id ? updated : n));setMoveCard(null);expandDestination(id);},"文件夹已移动",false);return;
    }
    const moved = papers.find(p=>p.id === paperId);if (!moved) return;
    void guarded(async()=>{const updated=await lit.savePaper({...moved,nodeId:id === "none" ? null : id});setPapers(previous=>previous.map(p=>p.id===updated.id ? updated : p));setMoveCard(null);expandDestination(id);},"文献已移动",false);
  };
  const movePaper = (event: React.DragEvent, id: string) => {
    event.preventDefault();event.stopPropagation();setDropTarget(null);
    if(hoverTimer.current) clearTimeout(hoverTimer.current);
    const source=draggedPaper.current || event.dataTransfer.getData("application/x-runningdo-paper") || event.dataTransfer.getData("text/plain");
    const moved=papers.find(p=>p.id===source);if(!moved || moved.nodeId === (id === "none" ? null : id)) return;
    relocate(moved.id,id);
  };
  const dragOver = (event:React.DragEvent,id:string) => {
    if(!draggedPaper.current && !event.dataTransfer.types.includes("application/x-runningdo-paper")) return;
    event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect="move";
    if(dropTarget !== id){setDropTarget(id);if(hoverTimer.current) clearTimeout(hoverTimer.current);hoverTimer.current=setTimeout(()=>setCollapsed(previous=>{const next=new Set(previous);next.delete(id);return next;}),450);}
  };
  const menuAction = (action:string) => {
    if(!context) return;const {id,kind}=context;setContext(null);
    const node=nodes.find(n=>n.id===id),item=papers.find(p=>p.id===id);
    if(action === "read" && item){setSelectedId(id);reveal(id);return;}
    if(action === "rename"){setRename({id,kind:kind === "paper" ? "paper" : "folder",value:kind === "paper" ? item?.title ?? "" : node?.name ?? ""});return;}
    if(action === "move"){setMoveCollapsed(new Set());setMoveCard({paperId:id,target:kind === "paper" ? item?.nodeId ?? "none" : node?.parentId ?? "none",kind:kind === "paper" ? undefined : "folder"});return;}
    if(action === "delete"){if(kind === "paper") {if(item) deletePaper(item);}else deleteFolder(id);return;}
    setFolder(id);if(action === "paper") openCreate(id);else {setCreating(false);setCreatingFolder(action === "folder");}
  };
  const saveRename = () => {
    if(!rename?.value.trim()) return;
    void guarded(async()=>{
      if(rename.kind === "paper") {const item=papers.find(p=>p.id===rename.id);if(item) {const updated=await lit.savePaper({...item,title:rename.value.trim()});setPapers(previous=>previous.map(p=>p.id===updated.id ? updated : p));}}
      else {const node=nodes.find(n=>n.id===rename.id);if(node) {const updated=await lit.saveNode({...node,name:rename.value.trim()});setNodes(previous=>previous.map(n=>n.id===updated.id ? updated : n));}}
      setRename(null);
    },"名称已更新",false);
  };
  const taskTitle = (id: string) => papers.find(item => item.id === id)?.title ?? "文献";
  const taskView: LiteratureTaskView | null = translating
    ? {paperId:translating,title:taskTitle(translating),phase:"translating",count:translationCount}
    : translationRunError
      ? {paperId:translationRunError.paperId,title:taskTitle(translationRunError.paperId),phase:"failed",error:translationRunError.message}
      : progress && progress.status !== "done"
        ? {paperId:progress.paperId,title:taskTitle(progress.paperId),phase:progress.status,count:extractCount}
        : null;
  const returnToTask = (id: string) => {
    setSelectedId(id);reveal(id);
    if (taskView?.phase === "failed") setDetailsOpen(true);
  };
  const destinationTree = (parent:string|null,depth=0): React.ReactNode => (treeIndex.children.get(parent) ?? []).map(node=><div key={node.id}><div className="lit-destination-row" style={{paddingLeft:depth*14}}><button className="lit-folder-chevron" aria-label={`${moveCollapsed.has(node.id) ? "展开" : "折叠"}${node.name}`} onClick={()=>setMoveCollapsed(previous=>{const next=new Set(previous);if(next.has(node.id)) next.delete(node.id);else next.add(node.id);return next;})}>{moveCollapsed.has(node.id) ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}</button><button className={`lit-node ${moveCard?.target===node.id ? "is-on" : ""}`} disabled={invalidDestination(node.id)} title={directoryPath(node.id)} onClick={()=>moveCard && setMoveCard({...moveCard,target:node.id})}><Folder size={14}/>{node.name}</button></div>{!moveCollapsed.has(node.id) && destinationTree(node.id,depth+1)}</div>);
  const renderFolder = (id: string, name: string, depth: number) => {
    const children = id === "none" ? [] : treeIndex.children.get(id) ?? [];
    const entries = treeIndex.entries.get(id) ?? [];
    const closed = collapsed.has(id);
    return <div key={id} className="lit-branch">
      <div className={`lit-folder-row ${dropTarget === id ? "is-drop-target" : ""}`} onDragOver={e=>dragOver(e,id)} onDragLeave={e=>{if(!(e.relatedTarget instanceof window.Node) || !e.currentTarget.contains(e.relatedTarget)){setDropTarget(null);if(hoverTimer.current) clearTimeout(hoverTimer.current);}}} onDrop={e=>movePaper(e,id)} style={{paddingLeft:6+depth*14}}>
        <button className="lit-folder-chevron" aria-label={`${closed ? "展开" : "折叠"}${name}`} aria-expanded={!closed} disabled={!children.length && !entries.length} onClick={()=>toggleFolder(id)}>{closed ? <ChevronRight size={13}/> : <ChevronDown size={13}/>}</button>
        <button className={`lit-node ${folder === id ? "is-on" : ""}`} title={name} onClick={()=>setFolder(id)} onContextMenu={e=>{if(id === "none") return;e.preventDefault();setContext({id,x:e.clientX,y:e.clientY});}}><Folder size={14}/><span className="lit-node-name">{name}</span><span className="lit-node-count">（{id === "none" ? entries.length : folderCounts.get(id) ?? 0}）</span></button>
      </div>
      {!closed && <div className="lit-items">
        {id !== "none" && children.map(node => renderFolder(node.id, node.name, depth + 1))}
        {entries.map(p => <button key={p.id} data-paper-id={p.id} draggable={!busy} onContextMenu={e=>{e.preventDefault();setContext({id:p.id,x:e.clientX,y:e.clientY,kind:"paper"});}} onDragStart={e=>{draggedPaper.current=p.id;e.dataTransfer.setData("text/plain",p.id);e.dataTransfer.setData("application/x-runningdo-paper",p.id);e.dataTransfer.effectAllowed="move";}} onDragEnd={()=>{draggedPaper.current=null;setDropTarget(null);}} className={`lit-item ${p.id === selectedId ? "is-on" : ""} ${locating === p.id ? "is-locating" : ""}`}  style={{paddingLeft: 34 + depth * 14}} title={`${p.title} · 拖动到文件夹以移动`} onClick={() => {setFolder(id);setSelectedId(p.id);}}><FileText size={14}/><span className="t">{p.title}</span></button>)}
      </div>}
    </div>;
  };

  return (
    <div className="lit-page">
      <aside className="lit-tree">
        <div className="lit-tree-head">
          <FolderTree size={15}/><span>资料库</span>
          <div className="lit-tree-actions">
            <button className="lit-tree-action lit-new-paper" title="新建文献项目" aria-label="新建文献项目" aria-expanded={creating} onClick={() => openCreate()}><FilePlus2 size={15}/></button>
            <button className="lit-tree-action lit-new-folder" title="新建文件夹" aria-label="新建文件夹" aria-expanded={creatingFolder} onClick={() => {setCreatingFolder(!creatingFolder);setCreating(false);}}><FolderPlus size={15}/></button>
            <button className="lit-tree-action lit-reveal-current" title="定位当前文献" aria-label="定位当前文献" disabled={!paper} onClick={()=>reveal()}><LocateFixed size={15}/></button>
            <button className="lit-tree-action" title="删除选中文件夹" aria-label="删除选中文件夹" disabled={busy || folder === "all" || folder === "none"} onClick={()=>deleteFolder()}><Trash2 size={14}/></button>
          </div>
        </div>
        {creatingFolder && <div className="lit-tree-foot"><input autoFocus className="field lit-newfolder-input" placeholder="新建文件夹…" value={newFolder} onChange={e=>setNewFolder(e.target.value)} onKeyDown={e=>{if(e.key === "Enter") void createFolder();if(e.key === "Escape") setCreatingFolder(false);}}/><button className="btn btn-outline btn-sm" onClick={createFolder} disabled={busy}>新建</button></div>}
        <div className="lit-tree-content" ref={treeContent} onScroll={e=>{scrollPosition.current=e.currentTarget.scrollTop;scheduleBrowse();}}>
          <button className={`lit-node ${folder === "all" ? "is-on" : ""}`} onClick={() => {setFolder("all");setCollapsed(new Set());}}><FolderTree size={14}/><span className="lit-node-name">全部文献（{papers.length}）</span></button>
          {renderFolder("none", "未分类", 0)}
          {(treeIndex.children.get(null) ?? []).map(node=>renderFolder(node.id,node.name,0))}
          {papers.length === 0 && <p className="lit-empty">这里还没有文献，点击顶部「新建文献项目」开始。</p>}
        </div>
        <p className="lit-tree-help">拖动文献归档 · 右键新建子文件夹</p>
      </aside>

      {creating && createPortal(<div className="lit-move-backdrop" onClick={closeCreate}>
        <section ref={createCard} className="lit-move-card lit-create-card" role="dialog" aria-modal="true" aria-label="新建文献" aria-busy={busy || choosingSource} onClick={e=>e.stopPropagation()}>
          <h3>新建文献</h3>
          <label>文献标题<input ref={titleInput} className="field lit-new-title" value={newTitle} maxLength={200} disabled={busy} placeholder="选择附件后自动填写，可修改" onChange={e=>setNewTitle(e.target.value)}/></label>
          <div className="lit-kind" role="group" aria-label="文献类别">{PAPER_KINDS.map(k=><button key={k.key} disabled={busy} className={`chip ${newKind===k.key ? "is-on" : ""}`} onClick={()=>setNewKind(k.key)}>{k.label}</button>)}</div>
          <div className="lit-create-source"><span>附件（必选）</span><button className="btn btn-outline btn-sm lit-create-choose" disabled={busy || choosingSource} onClick={()=>void chooseNewSource()}>{choosingSource ? "选择中…" : newSource ? "更换附件…" : "选择附件…"}</button><span className="lit-source-name" title={newSource.split(/[\\/]/).pop()}>{newSource.split(/[\\/]/).pop() || "尚未选择附件"}</span></div>
          <div><p className="lit-hint">存储文件夹</p><div className="lit-create-destinations" role="group" aria-label="存储文件夹">
            <button className={`lit-node ${newDestination==="none" ? "is-on" : ""}`} disabled={busy} aria-pressed={newDestination==="none"} onClick={()=>setNewDestination("none")}><Folder size={14}/>未分类</button>
            {visibleNodes.map(node=><button key={node.id} className={`lit-node ${newDestination===node.id ? "is-on" : ""}`} disabled={busy} aria-pressed={newDestination===node.id} title={directoryPath(node.id)} onClick={()=>setNewDestination(node.id)}><Folder size={14}/>{directoryPath(node.id)}</button>)}
          </div></div>
          {createError && <p className="lit-create-error" role="alert">{createError}</p>}
          <div className="lit-inline"><button className="btn btn-outline btn-sm" disabled={busy || choosingSource} onClick={closeCreate}>取消</button><button className="btn btn-sm lit-create-submit" disabled={busy || choosingSource || !newSource || !newTitle.trim()} onClick={()=>void createPaper()}>{busy ? "正在导入…" : "添加文献"}</button></div>
        </section>
      </div>,document.body)}
      {context && createPortal(<div className="lit-context-menu" role="menu" onPointerDown={e=>e.stopPropagation()} style={{position:"fixed",left:Math.max(8,Math.min(context.x,window.innerWidth-200)),top:Math.max(8,Math.min(context.y,window.innerHeight-220))}}>{(context.kind === "paper" ? [["read","阅读"],["rename","重命名"],["move","移动到目录"],["delete","删除文献"]] : [["folder","新建子文件夹"],["paper","新建文献"],["rename","重命名"],["move","移动文件夹"],["delete","删除文件夹"]]).map(([action,label])=><button role="menuitem" key={action} disabled={busy} onClick={()=>menuAction(action)}>{label}</button>)}</div>,document.body)}
      {moveCard && createPortal(<div className="lit-move-backdrop" onClick={()=>setMoveCard(null)}><section className="lit-move-card" role="dialog" aria-modal="true" aria-label="移动到目录" onClick={e=>e.stopPropagation()} onKeyDown={e=>{if(e.key === "Escape") setMoveCard(null);}}><h3>移动到目录</h3><div className="lit-move-targets"><button className={`lit-node ${moveCard.target==="none" ? "is-on" : ""}`} onClick={()=>setMoveCard({...moveCard,target:"none"})}><Folder size={14}/>{moveCard.kind === "folder" ? "资料库根目录" : "未分类"}</button>{destinationTree(null)}</div><div className="lit-inline"><button className="btn btn-outline btn-sm" onClick={()=>setMoveCard(null)}>取消</button><button className="btn btn-sm lit-move-confirm" disabled={busy || invalidDestination(moveCard.target)} onClick={()=>relocate(moveCard.paperId,moveCard.target,moveCard.kind)}>移动</button></div></section></div>,document.body)}
      {rename && createPortal(<div className="lit-move-backdrop" onClick={()=>setRename(null)}><section className="lit-move-card" role="dialog" aria-modal="true" aria-label="重命名" onClick={e=>e.stopPropagation()}><h3>重命名</h3><input autoFocus className="field lit-rename-input" aria-label="新名称" value={rename.value} onChange={e=>setRename({...rename,value:e.target.value})} onKeyDown={e=>{if(e.key === "Enter" && !e.nativeEvent.isComposing) saveRename();if(e.key === "Escape") setRename(null);}}/><div className="lit-inline"><button className="btn btn-outline btn-sm" onClick={()=>setRename(null)}>取消</button><button className="btn btn-sm lit-rename-save" disabled={busy || !rename.value.trim()} onClick={saveRename}>保存</button></div></section></div>,document.body)}
      <main ref={workspace} className="lit-workspace">
        <section className="lit-editor" aria-label="文献阅读器">
          <header ref={readerHeader} className="lit-editor-head">
            <h2 className="lit-reader-title">{paper?.title ?? "文献阅读器"}</h2>
            <div className="lit-reader-tabs" role="group" aria-label="阅读文件类型">
              <button className={`chip lit-tab-pdf ${readerView === "pdf" ? "is-on" : ""}`} aria-pressed={readerView === "pdf"} disabled={!pdfFile} onClick={() => setReaderView("pdf")}>PDF</button>
              <button className={`chip lit-tab-md ${readerView === "md" ? "is-on" : ""}`} aria-pressed={readerView === "md"} disabled={!latest} title={latest ? "阅读排版后的 Markdown" : "完成转换与排版后可阅读 MD"} onClick={() => setReaderView("md")}>MD</button>
              <button className={`chip lit-tab-zh ${readerView === "zh" ? "is-on" : ""}`} aria-pressed={readerView === "zh"} disabled={!translation} onClick={()=>setReaderView("zh")}>中文</button>
              <button className={`chip lit-tab-parallel ${readerView === "parallel" ? "is-on" : ""}`} aria-pressed={readerView === "parallel"} disabled={!translation} onClick={()=>setReaderView("parallel")}>对照</button>
            </div>
            <div className="lit-header-pdf-tools" ref={setToolbar}/>
            {readerView !== "pdf" && <div className="lit-reader-font" role="group" aria-label="MD 阅读字号"><button className="btn btn-outline btn-sm" aria-label="减小阅读字号" disabled={readerFont <= 12} onClick={() => setReaderFont(Math.max(12, readerFont-2))}>−</button><button className="btn btn-outline btn-sm" aria-label="恢复阅读字号" onClick={() => setReaderFont(16)}>{readerFont}</button><button className="btn btn-outline btn-sm" aria-label="增大阅读字号" disabled={readerFont >= 28} onClick={() => setReaderFont(Math.min(28, readerFont+2))}>＋</button></div>}
            <button className="btn btn-outline btn-sm lit-details-toggle" aria-expanded={detailsOpen && !!paper} aria-controls="lit-details" disabled={!paper} title={detailsOpen ? "关闭文献详情" : "展开文献详情"} aria-label="文献详情" onClick={toggleDetails}>{detailsOpen ? ">" : "<"}</button>
          </header>
          <LiteratureTaskProgress task={taskView} selectedId={selectedId} onReturn={returnToTask}/>
          <div className={`lit-editor-body ${readerView === "pdf" ? "is-pdf" : ""}`}>
            {!paper ? <p className="lit-empty">从左侧选择文献，或点击「新建文献项目」。</p> : readerView === "pdf" ? pdfBytes ? <PdfReader bytes={pdfBytes} toolbar={toolbar} /> : <p className="lit-empty">{pdfError || (pdfFile ? "正在读取 PDF…" : "还没有 PDF，打开右侧「文献详情」导入附件。")}</p> : readerView === "zh" || readerView === "parallel" ? translationText !== null ? readerView === "parallel" ? <TranslationReader pairs={pairs} fontSize={readerFont} extractId={mdExtractId}/> : <MarkdownReader text={translationText} fontSize={readerFont} extractId={mdExtractId}/> : <p className="lit-empty">{translationError || (translation ? "正在读取中文译稿…" : "中文译稿尚未生成，请点击翻译。")}</p> : md !== null ? <MarkdownReader text={md} fontSize={readerFont} extractId={mdExtractId} /> : <p className="lit-empty">{mdError || (latest ? "正在读取 Markdown…" : "Markdown 尚未完成排版，请在文献详情重试。")}</p>}
          </div>
        </section>
        {detailsOpen && paper && createPortal(<section style={{position:"fixed",top:detailRect.top,right:detailRect.right,width:detailRect.width,maxHeight:detailRect.height}} className="lit-detail lit-detail-overlay" id="lit-details" aria-label="文献详情">
        {!paper ? (
          <p className="lit-empty">选一条文献看详情。</p>
        ) : (
          <>
            <div className="lit-detail-section"><h3>元数据</h3>
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
                  title={paper.venue ?? ""}
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
                onClick={()=>deletePaper()}
                disabled={busy}
              >
                <Trash2 size={13} />
                删除文献
              </button>
            </div>

            <div className="lit-block lit-tags">
              <h3>标签</h3>
              <div className="lit-inline"><input className="field lit-tag-input" placeholder="添加标签…" value={tagName} onChange={e => setTagName(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); void addTag(); } }} /><button className="btn btn-outline btn-sm lit-tag-add" disabled={busy || !tagName.trim()} onClick={() => void addTag()}>添加标签</button></div>
              {tags.length > 0 && <div className="lit-tag-options">{tags.map(t => <button key={t.id} className={`chip ${paperTags.some(x => x.id === t.id) ? "is-on" : ""}`} aria-pressed={paperTags.some(x => x.id === t.id)} disabled={busy} onClick={() => void attachTag(t, !paperTags.some(x => x.id === t.id))}>{t.name}</button>)}</div>}
            </div>
            </div>
            <div className="lit-block lit-detail-section">
              <h3>附件</h3>
              {!pdfFile && <div className="lit-inline"><button className="btn btn-outline btn-sm lit-choose-file" onClick={importFile} disabled={busy}>选择 PDF 源…</button></div>}
              {paperFiles.length === 0 ? (
                <p className="lit-empty">还没有附件。导入后会拷贝进数据目录并记录 sha256。</p>
              ) : (
                paperFiles.map((f) => (
                  <div key={f.id} className="lit-file">
                    <FileText size={13} />
                    <button className="lit-attachment-name n" title={(f.originalPath ?? f.relPath).split(/[\\/]/).pop()} onClick={()=>openFile(f)} disabled={busy}>{(f.originalPath ?? f.relPath).split(/[\\/]/).pop()}</button>
                    {f.missing ? <em className="warn">已丢失</em> : null}
                    <button
                      className="btn btn-outline btn-sm lit-attachment-delete" aria-label="移除源附件" title="清空 PDF 源"
                      onClick={() => void confirmThen({ title: /\.pdf$/i.test(f.relPath) ? "清空 PDF 源？" : "移除附件？", message: "附件和同主干提取稿将一并移除，无法恢复。", confirmLabel: /\.pdf$/i.test(f.relPath) ? "清空" : "移除", danger: true, onConfirm: async () => { await guarded(async () => { await lit.deleteFile(f.id); setMd(null); setPdfBytes(null); setReaderView("pdf"); }, "附件已删除"); } })}
                      disabled={busy}
                    >
                      ×
                    </button>
                  </div>
                ))
              )}

              {latest ? (
                <div className="lit-extract lit-md-attachment">
                  <FileText size={13}/><button className="lit-attachment-name e" title={`${paper.title}.md`} onClick={()=>openExtract(latest)} disabled={busy}>{paper.title}.md</button>
                  <span className="s is-done">可阅读</span>

                  <button className="btn btn-outline btn-sm lit-reload-md" aria-label="重新生成 MD" title="重新生成 MD" onClick={()=>void defaultExtract()} disabled={busy}><RefreshCw size={13}/></button>
                  <button className="btn btn-outline btn-sm lit-delete-md" aria-label="删除 MD" title="删除 MD" disabled={busy} onClick={()=>void confirmThen({title:"删除 Markdown？",message:"删除最终排版文件及配图，PDF 源保留。",confirmLabel:"删除",danger:true,onConfirm:async()=>{await guarded(async()=>{await lit.deleteExtract(latest.id);setReaderView("pdf");},"Markdown 已删除");}})}>×</button>
                </div>
              ) : paperExtracts.length ? (
                <div className="lit-extract">
                  <span className="e">Markdown</span>
                  <span className={`s ${paperExtracts[0].status === "failed" ? "is-failed" : ""}`}>{paperExtracts[0].status === "failed" ? "转换失败" : "排版尚未完成"}</span>
                  {paperExtracts.find(e => e.error)?.error && <em className="warn">{paperExtracts.find(e => e.error)!.error}</em>}
                </div>
              ) : <p className="lit-empty">转换后自动排版，完成后即可阅读 Markdown。</p>}
              <div className="lit-inline">{!latest && <button className="btn btn-sm lit-extract-default" onClick={() => void defaultExtract()} disabled={busy || paperFiles.length === 0}>生成 Markdown</button>}
                <details className="lit-extract-options"><summary>转换选项</summary><div className="lit-inline">
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
                  云 OCR
                </button>
                </div></details>
              </div>
              <div className="lit-translation-action">
                {translationRunError?.paperId === paper.id && <p className="warn" role="status">{translationRunError.message} <button className="btn btn-outline" onClick={showDiagnostics}>查看诊断</button></p>}
              {(!translation || translationError) && <button className="btn btn-outline btn-sm lit-translate" disabled={!latest || busy} title="将整理后的MD交给云模型生成中文学术译稿" onClick={()=>void translatePaper()}>{translating === paper.id ? "翻译中…" : translationError ? "重新翻译" : "翻译"}</button>}
              </div>
            </div>
            <div className="lit-detail-section"><h3>建议元数据</h3>
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
              ) : <p className="lit-empty">暂无建议元数据。</p>}
            </div>


          </>
        )}
      </section>, document.body)}
      </main>
    </div>
  );
}
