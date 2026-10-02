/**
 * 倒计时卡片里的里程碑区（v1.1 · CD-17）。
 *
 * v1.2：渲染与交互搬到通用 `Checklist`，这里只做「接 store」的薄容器绑定 ——
 * 议程页的子项用同一个 Checklist，接的是另一套 store 动作。
 */
import { useStore } from "../store/useStore";
import Checklist from "./Checklist";

export default function Milestones({ countdownId }: { countdownId: string }) {
  const all = useStore((s) => s.milestones);
  const add = useStore((s) => s.saveMilestone);
  const toggle = useStore((s) => s.toggleMilestone);
  const rename = useStore((s) => s.renameMilestone);
  const del = useStore((s) => s.deleteMilestone);

  const entries = all
    .filter((m) => m.countdownId === countdownId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt))
    .map((m) => ({ id: m.id, title: m.title, done: m.done }));

  return (
    <Checklist
      entries={entries}
      placeholder="添加里程碑，回车即可"
      emptyText="还没有里程碑"
      onAdd={(title) => void add({ countdownId, title })}
      onToggle={(e) => {
        const m = all.find((x) => x.id === e.id);
        if (m) void toggle(m);
      }}
      onRename={(e, title) => {
        const m = all.find((x) => x.id === e.id);
        if (m) void rename(m, title);
      }}
      onDelete={(e) => void del(e.id)}
    />
  );
}
