/**
 * v1.4 · 文献模块前端 API（LIT-02 ~ LIT-11）
 *
 * 为什么不塞进 `api.ts`：那份 900 行的 Backend 接口 + 预览后端是 v0.1 就定下的形状，
 * 文献模块自成一组命令；单独一个模块更容易演进，也避免动到既有回归。
 *
 * 两种后端：Tauri（真库）与 localStorage（浏览器预览 / 冒烟测试）。
 */
import { inTauri } from "./api";

export interface LibraryNode {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Paper {
  id: string;
  nodeId: string | null;
  kind: PaperKind;
  title: string;
  authors: string | null;
  year: number | null;
  venue: string | null;
  doi: string | null;
  url: string | null;
  status: PaperStatus;
  note: string | null;
  extra: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PaperKind = "paper" | "textbook" | "magazine" | "other";
export type PaperStatus = "unread" | "reading" | "read";

export const PAPER_KINDS: { key: PaperKind; label: string }[] = [
  { key: "paper", label: "论文" },
  { key: "textbook", label: "教材" },
  { key: "magazine", label: "杂志" },
  { key: "other", label: "其他" },
];

export const PAPER_STATUSES: { key: PaperStatus; label: string }[] = [
  { key: "unread", label: "未读" },
  { key: "reading", label: "在读" },
  { key: "read", label: "已读" },
];

export interface PaperFile {
  id: string;
  paperId: string;
  role: string;
  originalPath: string | null;
  relPath: string;
  size: number | null;
  sha256: string | null;
  missing: boolean;
  createdAt: string;
  updatedAt: string;
}

export type TranslationProgress = {completed: number; total: number; stage: "translating" | "retrying" | "failed" | "done"; updatedAt: number};

export type TranslationPair = {id: number; source: string; translation: string};

export interface PaperExtract {
  id: string;
  paperId: string;
  fileId: string | null;
  engine: string;
  engineVersion: string | null;
  sourceSha256: string | null;
  relPath: string | null;
  status: "queued" | "running" | "done" | "failed";
  pages: number | null;
  chars: number | null;
  quality: string | null;
  meta: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaperInput {
  id?: string;
  nodeId: string | null;
  kind: PaperKind;
  title: string;
  authors?: string | null;
  year?: number | null;
  venue?: string | null;
  doi?: string | null;
  url?: string | null;
  status?: PaperStatus;
  note?: string | null;
  extra?: string | null;
}

export interface Tag {
  id: string;
  name: string;
  color: string | null;
  createdAt: string;
}

/** 提取产物里由云模型返回的建议元数据（Q10 附加要求：必须含 title 与 venue） */
export function suggestedOf(extract: PaperExtract | null): Record<string, string> {
  if (!extract?.meta) return {};
  try {
    const meta = JSON.parse(extract.meta) as { suggested?: Record<string, string> };
    return meta.suggested ?? {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- Tauri 后端

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

const tauriLit = {
  cloudReady: () => call<boolean>("literature_cloud_ready"),
  chooseFile: (paperId: string) => call<PaperFile | null>("choose_paper_file", { paperId }),
  listNodes: () => call<LibraryNode[]>("list_library_nodes"),
  saveNode: (input: { id?: string; parentId: string | null; name: string; sortOrder?: number }) =>
    call<LibraryNode>("save_library_node", { input }),
  deleteNode: (id: string) => call<void>("delete_library_node", { id }),

  listPapers: () => call<Paper[]>("list_papers"),
  savePaper: (input: PaperInput) => call<Paper>("save_paper", { input }),
  deletePaper: (id: string) => call<void>("delete_paper", { id }),

  listFiles: () => call<PaperFile[]>("list_paper_files"),
  importFile: (input: { paperId: string; srcPath: string; role?: string }) =>
    call<PaperFile>("import_paper_file", { input }),
  deleteFile: (id: string) => call<void>("delete_paper_file", { id }),
  readFile: (id: string) => call<number[]>("read_paper_file", { id }),

  listExtracts: (paperId?: string) => call<PaperExtract[]>("list_paper_extracts", { paperId }),
  extract: (paperId: string, engine: string, fileId?: string) =>
    call<PaperExtract>("extract_paper_markdown", { paperId, engine, fileId }),
  deleteExtract: (id: string) => call<void>("delete_paper_extract", { id }),
  readExtract: (id: string) => call<string>("read_paper_extract", { id }),
  translationProgress: (paperId: string, fileId?: string) => call<TranslationProgress | null>("translation_progress", {paperId,fileId}),
  readTranslation: (id: string) => call<TranslationPair[]>("read_translation_blocks", { id }),
  readAsset: (id: string, asset: string) => call<number[]>("read_paper_asset", { id, asset }),

  listTags: () => call<Tag[]>("list_tags"),
  listPaperTags: (paperId: string) => call<Tag[]>("list_paper_tags", { paperId }),
  setPaperTag: (paperId: string, tagId: string, attached: boolean) => call<void>("set_paper_tag", { paperId, tagId, attached }),
  ensureTag: (name: string) => call<Tag>("ensure_tag", { name }),
};

// ---------------------------------------------------------------- 预览后端

const LS_KEY = "runningdo.literature.v1";

interface PreviewStore {
  nodes?: LibraryNode[];
  papers?: Paper[];
  files?: PaperFile[];
  extracts?: PaperExtract[];
  tags?: Tag[];
  paperTags?: {paperId: string; tagId: string}[];
}

const uid = (p: string) =>
  `${p}-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
const now = () => new Date().toISOString().slice(0, 19);

function previewLit() {
  const read = (): PreviewStore => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}") as PreviewStore;
    } catch {
      return {};
    }
  };
  const write = (data: PreviewStore) => localStorage.setItem(LS_KEY, JSON.stringify(data));

  return {
    translationProgress: async (_paperId: string, _fileId?: string): Promise<TranslationProgress | null> => null,
    readTranslation: async (_id: string): Promise<TranslationPair[]> => {throw new Error("预览没有翻译映射文件");},
    readAsset: async (_id: string, _asset: string): Promise<number[]> => { throw new Error("预览没有图片资产"); },
    cloudReady: async () => false,
    listNodes: async () => read().nodes ?? [],
    saveNode: async (input: { id?: string; parentId: string | null; name: string; sortOrder?: number }) => {
      const d = read();
      const nodes = d.nodes ?? [];
      const name = input.name.trim();
      if (!name || name.length > 60) throw new Error("文件夹名须为 1–60 个字符");
      if (input.parentId && input.parentId === input.id) throw new Error("不能把自己作为上级文件夹");
      if (input.id) {
        const node = nodes.find((n) => n.id === input.id);
        if (!node) throw new Error("文件夹不存在");
        node.name = name;
        node.parentId = input.parentId;
        node.updatedAt = now();
        write({ ...d, nodes });
        return node;
      }
      const node: LibraryNode = {
        id: uid("node"),
        parentId: input.parentId,
        name,
        sortOrder: nodes.length,
        createdAt: now(),
        updatedAt: now(),
      };
      write({ ...d, nodes: [...nodes, node] });
      return node;
    },
    deleteNode: async (id: string) => {
      const d = read();
      const drop = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const n of d.nodes ?? []) {
          if (n.parentId && drop.has(n.parentId) && !drop.has(n.id)) {
            drop.add(n.id);
            changed = true;
          }
        }
      }
      write({
        ...d,
        nodes: (d.nodes ?? []).filter((n) => !drop.has(n.id)),
        papers: (d.papers ?? []).map((p) =>
          p.nodeId && drop.has(p.nodeId) ? { ...p, nodeId: null } : p,
        ),
      });
    },

    listPapers: async () => read().papers ?? [],
    savePaper: async (input: PaperInput) => {
      const d = read();
      const papers = d.papers ?? [];
      const title = input.title.trim();
      if (!title || title.length > 200) throw new Error("标题须为 1–200 个字符");
      const norm = title.toLowerCase();
      const clash = papers.find((p) => p.title.trim().toLowerCase() === norm && p.id !== input.id);
      if (clash) throw new Error("已有一篇同名文献，标题不能重复");
      if (input.id) {
        const paper = papers.find((p) => p.id === input.id);
        if (!paper) throw new Error("文献不存在");
        Object.assign(paper, {
          nodeId: input.nodeId,
          kind: input.kind,
          title,
          authors: input.authors ?? null,
          year: input.year ?? null,
          venue: input.venue ?? null,
          doi: input.doi ?? null,
          url: input.url ?? null,
          note: input.note ?? null,
          ...(input.status ? { status: input.status } : {}),
          updatedAt: now(),
        });
        write({ ...d, papers });
        return paper;
      }
      const paper: Paper = {
        id: uid("paper"),
        nodeId: input.nodeId,
        kind: input.kind,
        title,
        authors: input.authors ?? null,
        year: input.year ?? null,
        venue: input.venue ?? null,
        doi: input.doi ?? null,
        url: input.url ?? null,
        status: input.status ?? "unread",
        note: input.note ?? null,
        extra: null,
        createdAt: now(),
        updatedAt: now(),
      };
      write({ ...d, papers: [...papers, paper] });
      return paper;
    },
    deletePaper: async (id: string) => {
      const d = read();
      write({
        ...d,
        papers: (d.papers ?? []).filter((p) => p.id !== id),
        files: (d.files ?? []).filter((f) => f.paperId !== id),
        extracts: (d.extracts ?? []).filter((e) => e.paperId !== id),
      });
    },

    chooseFile: async (_paperId: string): Promise<PaperFile | null> => { throw new Error("请在桌面应用中选择附件"); },
    listFiles: async () => read().files ?? [],
    importFile: async (input: { paperId: string; srcPath: string; role?: string }) => {
      const d = read();
      const files = d.files ?? [];
      if (!input.srcPath.trim()) throw new Error("文件路径不能为空");
      const sha = `preview-${input.srcPath.trim().length}-${input.srcPath.trim().slice(-12)}`;
      const existing = files.find((f) => f.paperId === input.paperId && f.sha256 === sha);
      if (existing) return existing;
      if (/\.pdf$/i.test(input.srcPath) && files.some(f=>f.paperId === input.paperId && /\.pdf$/i.test(f.relPath))) throw new Error("每条文献只能有一个 PDF 源，请先清空现有 PDF 源");
      const file: PaperFile = {
        id: uid("file"),
        paperId: input.paperId,
        role: input.role ?? "main",
        originalPath: input.srcPath.trim(),
        relPath: `files/papers/${input.paperId}/${input.srcPath.trim().split("/").pop() ?? "file"}`,
        size: null,
        sha256: sha,
        missing: false,
        createdAt: now(),
        updatedAt: now(),
      };
      write({ ...d, files: [...files, file] });
      return file;
    },
    deleteFile: async (id: string) => {
      const d = read();
      write({ ...d, files: (d.files ?? []).filter((f) => f.id !== id), extracts:(d.extracts ?? []).filter(e=>e.fileId !== id) });
    },
    readFile: async () => {
      throw new Error("浏览器预览模式不提供 PDF 渲染，请在应用内使用");
    },

    listExtracts: async (paperId?: string) =>
      (read().extracts ?? []).filter((e) => !paperId || e.paperId === paperId),
    extract: async (paperId: string, engine: string, _fileId?: string) => {
      const d = read();
      const extracts = d.extracts ?? [];
      const existing = extracts.find(
        (e) => e.paperId === paperId && e.engine === engine && e.status === "done",
      );
      if (existing) return existing;
      if (!(d.files ?? []).some((f) => f.paperId === paperId)) {
        throw new Error("这篇文献还没有附件");
      }
      const extract: PaperExtract = {
        id: uid("extract"),
        paperId,
        fileId: (d.files ?? []).find((f) => f.paperId === paperId)?.id ?? null,
        engine,
        engineVersion: "preview",
        sourceSha256: null,
        relPath: null,
        status: "failed",
        pages: null,
        chars: null,
        quality: null,
        meta: null,
        error: "浏览器预览模式不执行提取，请在应用内使用（`fast` / `glm`）",
        createdAt: now(),
        updatedAt: now(),
      };
      write({ ...d, extracts: [...extracts, extract] });
      return extract;
    },
    deleteExtract: async (id: string) => {
      const d = read();
      write({ ...d, extracts: (d.extracts ?? []).filter((e) => e.id !== id) });
    },
    readExtract: async (id: string) => {
      const extract = (read().extracts ?? []).find((e) => e.id === id);
      return extract ? `# 预览模式\n\n（${extract.engine}）这里会显示提取后的 Markdown。` : "";
    },

    listPaperTags: async (paperId: string) => {
      const d = read(); const ids = new Set((d.paperTags ?? []).filter(x => x.paperId === paperId).map(x => x.tagId));
      return (d.tags ?? []).filter(t => ids.has(t.id));
    },
    setPaperTag: async (paperId: string, tagId: string, attached: boolean) => {
      const d = read(); const links = (d.paperTags ?? []).filter(x => !(x.paperId === paperId && x.tagId === tagId));
      if (attached) links.push({paperId, tagId});
      write({...d, paperTags: links});
    },
    listTags: async () => read().tags ?? [],
    ensureTag: async (name: string) => {
      const d = read();
      const tags = d.tags ?? [];
      const trimmed = name.trim();
      if (!trimmed || Array.from(trimmed).length > 24) throw new Error("标签须为 1–24 个字符");
      const found = tags.find((t) => t.name === trimmed);
      if (found) return found;
      const tag: Tag = { id: uid("tag"), name: trimmed, color: null, createdAt: now() };
      write({ ...d, tags: [...tags, tag] });
      return tag;
    },
  };
}

export const lit = inTauri() ? tauriLit : previewLit();

export function resetPreviewLiterature(): void {
  localStorage.removeItem(LS_KEY);
}
