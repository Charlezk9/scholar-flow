import MarkdownReader from "./MarkdownReader";
import type { PaperExtract, TranslationPair } from "../lib/literature";

export type { TranslationPair } from "../lib/literature";
export function translationSourceMatches(extract: PaperExtract, sourceId?: string): boolean {
  try {return !!sourceId && JSON.parse(extract.meta ?? "{}").sourceExtractId === sourceId;} catch {return false;}
}
export function translationPairs(extract: PaperExtract | null, sourceId?: string): TranslationPair[] {
  try {
    const meta = JSON.parse(extract?.meta ?? "{}");
    if (!sourceId || meta.sourceExtractId !== sourceId || !Array.isArray(meta.blocks)) return [];
    const pairs = meta.blocks as TranslationPair[];
    if (!pairs.length || pairs.some((p, i) => p.id !== i || typeof p.source !== "string" || typeof p.translation !== "string" || !p.source.trim() || !p.translation.trim())) return [];
    return pairs;
  } catch { return []; }
}

/** 同一网格行由较长段落撑开：不测量固定高度，字号、配图加载和窗口变化时段首仍对齐。 */
export default function TranslationReader({pairs, fontSize, extractId}: {pairs: TranslationPair[]; fontSize: number; extractId?: string}) {
  return <div className="lit-translation-grid" aria-label="英文与中文对照阅读">
    <div className="lit-translation-label">英文原稿</div><div className="lit-translation-label">中文译稿</div>
    {pairs.map(pair => <div className="lit-translation-pair" key={pair.id} data-translation-block={pair.id}>
      <div className="lit-translation-cell" lang="en"><MarkdownReader text={pair.source} fontSize={fontSize} extractId={extractId}/></div>
      <div className="lit-translation-cell" lang="zh-CN"><MarkdownReader text={pair.translation} fontSize={fontSize} extractId={extractId}/></div>
    </div>)}
  </div>;
}
