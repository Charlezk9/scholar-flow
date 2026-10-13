import type { ExtractionProgress, TranslationProgress } from "../lib/literature";

export type LiteratureTaskView = {
  paperId: string;
  title: string;
  phase: "running" | "organizing" | "translating" | "failed";
  count?: ExtractionProgress | TranslationProgress | null;
  error?: string;
};

/** Task identity belongs to the operation, independently of the selected reader. */
export default function LiteratureTaskProgress({task, selectedId, onReturn}: {
  task: LiteratureTaskView | null;
  selectedId: string | null;
  onReturn: (id: string) => void;
}) {
  if (!task) return null;
  const {count, phase} = task;
  const translation = phase === "translating";
  const message = phase === "failed" ? task.error || "转换未完成，请在文献详情重试"
    : translation ? count
      ? `${"stage" in count && count.stage === "retrying" ? "正在重试当前批次，" : "正在翻译，"}已完成 ${count.completed}/${count.total} 段`
      : "正在连接翻译服务…"
    : `${phase === "organizing" ? "正在自动整理排版" : "正在提取"}${count ? `，已完成 ${count.completed}/${count.total} 页（${Math.floor(count.completed / count.total * 100)}%）` : "，请稍候…"}`;
  return <div className={`lit-progress is-${phase}`} role="status" data-task-paper-id={task.paperId}>
    <span className="lit-task-title" title={task.title}>任务文献：{task.title}</span>
    <div className="lit-task-status">
      {phase !== "failed" && <progress aria-label={translation ? "论文中文翻译进度" : "PDF 转 MD 进度"} max={count?.total ?? 100} value={count?.completed}/>}
      <span>{message}</span>
      {selectedId !== task.paperId && <button className="btn btn-outline btn-sm lit-task-return" onClick={()=>onReturn(task.paperId)}>返回任务文献</button>}
    </div>
  </div>;
}
