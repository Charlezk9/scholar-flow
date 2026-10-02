/**
 * 议程纯逻辑单测（v1.2 · AG-01 ~ AG-05）。
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { agendaProgress, sortAgendaItems, subitemsOf, undoneTitles } from "./agenda.ts";
import type { AgendaItem, AgendaSubitem } from "../lib/api";

const item = (o: Partial<AgendaItem> & { id: string }): AgendaItem => ({
  title: o.id,
  note: null,
  pinned: false,
  archived: false,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00",
  updatedAt: "2026-01-01T00:00:00",
  ...o,
});

const sub = (o: Partial<AgendaSubitem> & { id: string; itemId: string }): AgendaSubitem => ({
  title: o.id,
  done: false,
  doneAt: null,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00",
  updatedAt: "2026-01-01T00:00:00",
  ...o,
});

test("排序：置顶优先，其次手动顺序", () => {
  const list = [
    item({ id: "b", sortOrder: 1 }),
    item({ id: "c", sortOrder: 2, pinned: true }),
    item({ id: "a", sortOrder: 0 }),
  ];
  assert.deepEqual(sortAgendaItems(list).map((i) => i.id), ["c", "a", "b"]);
});

test("排序：sortOrder 相同再看创建时间，且不改动入参", () => {
  const list = [
    item({ id: "later", createdAt: "2026-02-01T00:00:00" }),
    item({ id: "earlier", createdAt: "2026-01-01T00:00:00" }),
  ];
  const before = list.map((i) => i.id);
  assert.deepEqual(sortAgendaItems(list).map((i) => i.id), ["earlier", "later"]);
  assert.deepEqual(list.map((i) => i.id), before, "不能就地排序（会污染 store）");
});

test("子项：只取自己的，按 sortOrder 排", () => {
  const subs = [
    sub({ id: "s2", itemId: "A", sortOrder: 1 }),
    sub({ id: "s1", itemId: "A", sortOrder: 0 }),
    sub({ id: "x", itemId: "B", sortOrder: 0 }),
  ];
  assert.deepEqual(subitemsOf(subs, "A").map((s) => s.id), ["s1", "s2"]);
  assert.deepEqual(subitemsOf(subs, "B").map((s) => s.id), ["x"]);
  assert.deepEqual(subitemsOf(subs, "C"), []);
});

test("完成度：事项没有 done，完全由子项决定", () => {
  const subs = [
    sub({ id: "a", itemId: "A", done: true }),
    sub({ id: "b", itemId: "A" }),
  ];
  const p = agendaProgress(subs);
  assert.equal(p.total, 2);
  assert.equal(p.done, 1);
  assert.equal(p.allDone, false);
  assert.equal(p.badge, "☑ 1/2");
  assert.equal(p.label, "已完成 1/2");
});

test("完成度：全部完成 / 没有子项", () => {
  const all = [
    sub({ id: "a", itemId: "A", done: true }),
    sub({ id: "b", itemId: "A", done: true }),
  ];
  const p = agendaProgress(all);
  assert.equal(p.allDone, true);
  assert.equal(p.badge, "✓ 2/2");
  assert.equal(p.label, "✓ 全部完成 2/2");

  const none = agendaProgress([]);
  assert.equal(none.total, 0);
  assert.equal(none.allDone, false, "没有子项时不算「全部完成」");
  assert.equal(none.badge, "", "没有子项就不显示徽章");
});

test("安排到某天：只有未完成的子项进事件备注", () => {
  const subs = [
    sub({ id: "a", itemId: "A", title: "已做完的", done: true }),
    sub({ id: "b", itemId: "A", title: "还没做的" }),
  ];
  assert.deepEqual(undoneTitles(subs), ["还没做的"]);
});
