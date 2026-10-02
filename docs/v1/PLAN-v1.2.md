# RunningDO v1.2 开发计划 · 议程页重定义为「待办池」

> 版本线：`v1.1.0` → `v1.2.0` · 文档状态：**已定稿并实施**（2026-10-02）
> 本轮由使用者提出并当场拍板：Q1–Q10 全部按推荐值执行。
> 相关文档：[`PRD`](../v0/PRD.md) · [`DESIGN`](../v0/DESIGN.md) · [`v1.1 计划`](PLAN-v1.1.md) · [`v1.0 发布说明`](RELEASE-NOTES.md)

---

## 0. 一句话

**把「议程」从「未来 120 天的时间轴列表」重定义为「没有日期的待办池」**：
一件要做但还没决定哪天做的事 = 一个标题 + 若干子项（类似 TODO），
它唯一的出口是「安排到某天」，从而流进日历。

### 0.1 拍板结果（Q1–Q10）

| # | 决议 | 落地位置 |
| --- | --- | --- |
| Q1 | 「议程事项 = 没有日期、还没决定哪天做的待办」 | 术语表 + 空态引导文案 |
| Q2 | 升为**顶栏第三页面**（日历 / 议程 / 设置），不再是日历的第四档视图 | `TopBar` / `App` / `store.page` |
| Q3 | 页面名改为**「议程」保留**（使用者惯用），但文档里定义为「待办池」 | PRD 术语 + 本文件 |
| Q4 | 事项**不设完成状态**，完成度只由子项表达 | `agenda_items` 无 `done` 列 |
| Q5 | 子项全完成**不自动**搬走，只显示 `✓ 全部完成` | 卡片规格 |
| Q6 | 保留「接下来 7 天」只读区块（可折叠，设置里可关） | `SET-13` |
| Q7 | 「安排到某天」后事项**移入已完成区**（单向出口） | `schedule_agenda_item` |
| Q8 | 反向「事件 → 待办」**不做** | §8 不做清单 |
| Q9 | 单列 `max-width: 720px` 居中 | CSS 规格 |
| Q10 | 不做「计划日 / 本周想做」等软日期 | §8 不做清单 |

---

## 1. 现状盘点（改动前记档）

| 位置 | 现状 | 说明 |
| --- | --- | --- |
| `src/components/AgendaView.tsx` | 逐日列出未来 120 天的「倒计时目标日 + 事件」 | 本次被替换为待办页 |
| `src/domain/calendar.ts:145` `agendaEntries()` | 生成上面那份分组数据 | **保留**，供「接下来 7 天」区块使用 |
| `src/components/CalendarHeader.tsx:20` | `VIEWS` 四档 `月/周/日/议程` | 改为三档 |
| `src/store/useStore.ts:116` | `page: "calendar" \| "settings"` | 加 `"agenda"` |
| `src/components/SettingsPage.tsx:199` | 「默认视图」四档含议程 | 改「默认视图」三档 + 新增「默认页面」 |
| `src-tauri/src/db.rs` | 三张表 + `milestones`（v1.1） | 新增两张表，`export_json` 升 version 3 |
| `PRD` `CAL-04` | 「议程视图：按时间顺序列出未来事件」 | 标注为**已重定义**为 `AG-*` |

---

## 2. 术语与边界

| 对象 | 触发物 | 时间性 | 落点 | 需求段 |
| --- | --- | --- | --- | --- |
| 倒计时 | 一个不可移动的目标时刻 | 秒级倒数 | 左栏 + 皇冠栏 | `CD-*` |
| 日历事件 | 一个时间安排 | 有日期（可含时刻） | 日历格 | `CAL-*` / `EV-*` |
| **议程事项** | 一件要推进的事 | **没有日期** | 议程页 | `AG-*` |

> 规则：**「什么时候做」已经定了 → 日历事件；「有件事要做」但还没定 → 议程事项。**

---

## 3. 数据模型（`AG-01` / `AG-02`）

```sql
CREATE TABLE IF NOT EXISTS agenda_items (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    note       TEXT,
    pinned     INTEGER NOT NULL DEFAULT 0,
    archived   INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agenda_subitems (
    id         TEXT PRIMARY KEY,
    item_id    TEXT NOT NULL REFERENCES agenda_items(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    done       INTEGER NOT NULL DEFAULT 0,
    done_at    TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agenda_sub ON agenda_subitems(item_id, sort_order);
```

- 与 `milestones` **同形**（`title + done + done_at + sort_order`）→ 子项交互与动效全复用。
- `notes`：事项备注（可选），不影响完成度。
- `archived`：完成 / 已安排 / 不想做了，统一进「已完成」折叠区（与倒计时归档区同一交互）。
- **不设 `done` 列**（Q4）：避免「父已完成、子项未完成」的矛盾态。
- 迁移：只新增表 + `CREATE TABLE IF NOT EXISTS`，幂等；沿用 v1.1 的「首次加表前自动落一份 JSON 兜底」机制。

**字段语义沿用既有教训**：`sortOrder: Option<i64>` —— `None` = 已有记录**保持原顺序**（不是追加到末尾），新建时追加到该事项末尾。

---

## 4. 命令层与 API（`AG-03` / `AG-04`）

| 命令 | 说明 |
| --- | --- |
| `list_agenda_items` | 一次全量（含已归档，前端分区） |
| `save_agenda_item` | 新建 / 更新 / 归档（单一入口，与 `save_countdown` 同风格） |
| `delete_agenda_item` | 删事项（子项由外键级联删除） |
| `list_agenda_subitems` | 一次全量，前端按 `itemId` 归集（与里程碑同一策略） |
| `save_agenda_subitem` | 新建 / 改名 / 勾选（整条覆写） |
| `delete_agenda_subitem` | 删子项 |
| **`schedule_agenda_item`** | **桥**：一个事务里「创建全天事件 + 归档事项 + 把未完成子项写进事件备注」，返回新事件 |

- `src/lib/api.ts` 的 `Backend` 类型与**两个后端**（Tauri invoke / 浏览器 localStorage 预览）都要实现，否则 `pnpm dev` 预览与冒烟测试直接崩。
- 预览后端的 `deleteAgendaItem` 要手动级联删子项（与 Rust 侧外键行为对齐），种子数据给一条带 2 个子项的事项。

**备份（`DATA-07`）**：`export_json` 升 `version: 3`，新增 `agendaItems` / `agendaSubitems`；老备份（v2）缺这两个字段视为空，语义无损。

---

## 5. 页面规格（`UI-25` ~ `UI-28`）

### 5.1 布局

```
┌ 顶栏：RunningDO · 2026-10-02 周五 18:16:23 · [搜索] · [日历] [议程] [设置] ─┐
├ 皇冠栏 ──────────────────────────────────────────────────────────────────┤
│                                                                          │
│   议程                      未完成 7 · 已完成 3                          │
│   ┌────────────────────────────────────────────────────────────────┐     │
│   │ 记一件要做的事，回车即可…                                     ↵ │     │
│   └────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│   ▾ 接下来 7 天                                          ← `SET-13` 可关   │
│     10/5 周一  ● 交材料 · ● 家庭聚餐                                      │
│     10/7 周三  ● 期末考试（倒）                                           │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────┐          │
│   │ 准备 WWW 投稿                                          ⋯ │          │
│   │ ☑ 2/5 · 更新于 10-02                                     │          │
│   │ ──────────────────────────────────────────────────────   │  ← 同一泡 │
│   │  ☑ 写摘要                                           ✕   │          │
│   │  ☐ 全文初稿                                         ✕   │          │
│   │  [ 添加子项，回车即可… ]                                 │          │
│   │  已完成 1/2                                              │          │
│   └──────────────────────────────────────────────────────────┘          │
│                                                                          │
│   ▸ 已完成 (3)                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.2 硬性规格

| 项 | 规格 |
| --- | --- |
| 列宽 | `.agenda-col { max-width: 720px; margin: 0 auto }` —— 待办是「读 + 勾」场景，不横跨整窗（Q9） |
| 卡片 | **复用** `.cd-card` 的底/描边/圆角/阴影与 `.cd-title` 字号档位，不引入第二套样式体系 |
| 右上角 | 只有 `⋯`（`UI-23` 规矩）；菜单 **6 项**：编辑标题 / 置顶 / 安排到某天… / 复制一份 / 标记为已完成 / 删除（危险项用分隔线隔开） |
| 子项区 | **在卡片内部**（同一泡），复用 `Collapse` + 分隔线在折叠区内部；复选框自绘；双击改名；hover 出 `✕`；`Enter` 连续录入；`isComposing` 防误提交；行内交互全部 `stopPropagation` |
| 折叠徽章 | `☑ 2/5`，全部完成时 `✓ 5/5` 并转灰（复用 `CD-18` 的规则） |
| 事项标题 | 双击就地改名（与子项一致的手感） |
| 空态 | 手写体「还没有待办」+「在上方写一件要做的事，回车即可」 |
| 已完成区 | 折叠区，展示 `标题 · 完成于 xx｜已安排到 xx`；可恢复（取消归档）或删除 |
| 快速添加 | 顶部常驻输入行，`Enter` 提交并**保持焦点**（连续录入） |
| 指针优先 | 不引入任何必需快捷键（`Esc` 关闭浮层属于「可选顺手操作」） |

### 5.3 「安排到某天」浮层（`AG-05`）

菜单项「安排到某天…」→ 打开纸张风格浮层（portal + mask，复用 `.pop` / `.confirm` 的视觉语言），
内含 `DatePicker`（复用 `pickers.tsx`）+「取消 / 安排」。
确认后调用 `schedule_agenda_item(id, date)`：

```
一个事务里：
  ① INSERT INTO events (…, all_day = 1)
     note = 「<事项备注>\n· 未完成子项 1\n· 未完成子项 2」（无前缀，纯文本行）
  ② UPDATE agenda_items SET archived = 1
→ Toast：「已安排到 10 月 12 日 · 事项移入已完成」
```

**没有双向同步**：事项出池后不再与事件保持关联，因此不存在「删了事件但徽章还在」这类 bug（Q7）。

---

## 6. 影响面

| 项 | 变化 |
| --- | --- |
| `CAL-05` 视图切换 | 四档 → **三档**（`月 / 周 / 日`） |
| `SET-02` | 「默认视图」三档；新增 `SET-14`「默认页面：日历 / 议程」；新增 `SET-13`「议程页显示『接下来 7 天』」 |
| `store.page` | `"calendar" \| "agenda" \| "settings"`；`init` 时按 `defaultPage` 决定初始页面 |
| 老设置兼容 | 若库里 `defaultView === "agenda"`（v1.1 及以前存的），初始化时**归一到 `month`**，避免渲染空日历区 |
| `CAL-04` | PRD 标注为**已重定义**为 `AG-*`，保留原文并加一句迁移说明（不悄悄删） |
| 菜单栏 | 「nav」动作仍作用于日历周期；新增的议程页不参与（避免语义混乱） |
| 备份 | `version: 3`（`DATA-07`） |
| 版本号 | `package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` → `1.2.0` |

---

## 7. 测试计划

| 层 | 内容 | 数量 |
| --- | --- | --- |
| Rust | 事项 CRUD + 归档；`sortOrder: None` 保持原顺序；子项 CRUD + 勾选时间只写一次；**级联删除**；`schedule_agenda_item` 建事件 + 归档 + 备注含子项 + 未知 id 报错；备份 v3 含两张表；v1.1 老库升级幂等 | 7（实交付，另 19 项为既有） |
| 纯逻辑 | 排序（pinned → sort_order）、完成度、已完成区过滤 | ~5 |
| DOM `agenda.smoke.tsx`（实交付 68 项） | 页面切换、快速添加、空态、展开/收起、子项增删改勾、折叠徽章、`stopPropagation`、`isComposing`、双击改名（事项与子项）、置顶、已完成区恢复/删除、`⋯` 菜单六项、安排到某天（浮层 + 落库 + 归档 + Toast + 备注内容）、两处删除文案一致、后端拒绝空标题/孤儿子项、「接下来 7 天」区块 | 59（实交付） |
| 样式不变量 | 单列 `max-width`、`⋯` 单入口、复用 `.cd-card` 而非新样式体系、子项区不得出现第二个泡 / 原生 checkbox | ~5 |
| 回归 | 里程碑 38 项（组件抽取为 `Checklist` 后必须全绿）、日历标题栏（分段变三档） | 重跑 |

---

## 8. 明确不做

优先级、标签、截止日、提醒、重复规则、子项再嵌套、拖拽排序、附件、搜索、协作、
**「计划日 / 本周想做」等软日期**（会把边界重新弄糊）、反向「事件 → 待办」。

---

## 9. 交付顺序

| 阶段 | 内容 | 出口 |
| --- | --- | --- |
| **M1 数据层** | 两张表 + 7 个命令 + 两个后端 + `store` 状态与动作 + 备份 v3 + Rust 测试 | `cargo test` 全绿；老库升级无损 |
| **M2 页面** | `Milestones` 抽取为 `Checklist` + `AgendaPage` + 顶栏第三页面 + 设置三项调整 + 分段三档 | 既有 38 项里程碑测试 + 新增议程测试全绿 |
| **M3 收口** | 「安排到某天」浮层 + 文档回写（PRD/DESIGN/README/release notes）+ 版本号 `1.2.0` + 独立 subagent 验证 + 按验证结论修缺陷 | 独立验证「有条件通过」→ 6 条发现已逐条修复（见下）；`pnpm check` / `cargo test` / `pnpm build` 全绿 |

---

## 10. 风险

| 风险 | 缓解 |
| --- | --- |
| 概念边界糊掉（该进日历的事扔进待办池） | 术语表 + 空态文案引导 + 卡片上给「安排到某天」当出口 |
| 抽取 `Checklist` 时碰坏里程碑（38 项测试覆盖） | 先抽取 → 跑绿 → 再接议程页 |
| 老设置里 `defaultView: "agenda"` 导致空日历 | `init` 时归一为 `month`，并在设置页把选项收敛为三档 |
| 页面变多导致「默认」死设置 | `SET-02` / `SET-14` 两个键都必须在设置页可见可改 |
| 备份格式再升一版 | version 3 向后兼容（缺字段视为空），导出文件名不变 |


---

## 11. 独立验证与整改（2026-10-02）

由**独立 subagent**（fresh context、只读仓库、只在 `/tmp` 写脚本）验证，结论 **有条件通过**。它独立跑通了 `pnpm check`(71+328) / `cargo test`(26) / `pnpm build`，
并用 `sqlite3` 直查确认 `agenda_subitems.item_id` 的 `ON DELETE CASCADE` 真实存在、`agenda_items` 确实没有 `done` 列；
把 `domain/agenda.ts` 复制到 `/tmp` 自写用例复算了排序与完成度；逐条比对了预览后端与 Rust 后端。

| # | 发现 | 级别 | 整改 |
| --- | --- | --- | --- |
| 1 | **已完成区的删除确认文案不提子项**（活跃卡片提、已完成区不提，而级联会真删） | P2 | 两处合并为同一个 `confirmDelete(item)`，统一写明子项数量；新增冒烟断言锁死 |
| 2 | 预览后端不校验空标题 / 孤儿子项，Rust 侧校验（两端防御不一致） | P3 | 预览后端补齐两条校验；新增两条断言（前后端行为一致） |
| 3 | PLAN 文档过时：菜单写 4 项（实际 6 项）、note 前缀「来自议程：」不存在、测试计数口径 | P3 | 文档同步为本文件当前内容 |
| 4 | 老设置 `defaultView: "agenda"` 会让设置页三段都不高亮 | P4 | 设置页按归一后的值高亮（与 `init` 的归一一致） |
| 5 | `agenda.smoke` 里「当前停在议程页」用 `\|\|` 几乎恒真（弱断言） | P4 | 改成先显式置为日历页再点议程，断言真实转移 |
| 6 | `ViewMode` 仍含 `"agenda"`、若干 legacy 分支 | P4 | 保留但加注释写明它是 legacy 哨兵（不渲染）；不做激进类型重构 |

### 11.2 第二轮独立验证（后台模式，2026-10-02）

第一轮之后又跑了一轮，这次是**后台**模式（验证通道修复见 §11.1）。结论同样 **有条件通过**，
但它用了更有说服力的手段：**变异测试** —— 把实现故意改坏，确认断言真的会红。

- 复核第一轮 6 条：**5 条确认修好**（其中删文案、预览后端校验、弱断言三条用变异测试证明断言非假绿），
  1 条只剩计数口径未同步。
- 抽查 4 处新增断言做变异：全部为真断言，**无假绿**。
- 独立复核了三条套件的精确通过数：71 / 321（当时）/ 26，与文档一致。

**第二轮新发现的 4 条（已全部整改）**

| # | 发现 | 级别 | 整改 |
| --- | --- | --- | --- |
| 1 | **改名会把事项 `note` 静默清空** —— `saveAgendaItem` 是整条覆写，改名只传 `{id,title}` → `note` 写成 NULL（两端一致地有损） | P3（真 bug） | 新增 `renameAgendaItem(item, title)` 单一入口，整体转发 `note / pinned / archived`；补回归断言「改名不会把 note 清空」 |
| 2 | **文档覆盖度虚报** —— 宣称覆盖「⋯ 菜单六项」与「接下来 7 天」区块，实际无对应断言 | P3 | 补真断言（菜单六项逐个、区块显隐 + `SET-13` 开关），文档数字同步为实交付 |
| 3 | `db.rs` 注释写「正常导出传 2」，实际传 3 | P4 | 改正 |
| 4 | 测试计数陈旧（59 vs 61） | P4 | 计数改为实交付（补断言后 68） |

> 第 1 条与 v1.0 的 `crowned: Option<bool>`、v1.1 的 `sortOrder: Option<i64>` 是**同一个教训的第三次复现**：
> 整条覆写的接口必须区分「省略 = 保持原状」。已在 `docs/DEVLOG.md` 的「工程习惯」里固化。

### 11.1 验证通道本身踩的坑（本机环境，2026-10-02 修复）

第一轮验证被迫用**前台**模式（父进程阻塞）跑，因为**后台**模式在这台机器上起不来：

| 现象 | 根因 | 修复 |
| --- | --- | --- |
| `Failed to start async run: … neither is available` | `~/.pi/agent/npm` 缺 `@earendil-works/pi-coding-agent`（pi-subagents 的 peer 依赖） | `npm i @earendil-works/pi-coding-agent@0.99.2` |
| `async runner did not produce a pid`（`reason: runner-candidate-missing`、stderr 空、exit -2） | 后台 runner 是**独立进程**：`resolveNodeExecutable()` 在 Electron 宿主下拿不到 node，会退回裸命令 `"node"`；而 Dock 启动的 GUI 应用 PATH 只有 `/usr/bin:/bin:/usr/sbin:/sbin`（`/usr/bin`、`/bin` 受 SIP 保护写不进去，`launchctl setenv PATH` 也传不进 Dock 拉起的新 App） | ① `~/.local/bin/node` shim（跟随 nvm 版本）＋ `launchctl setenv` ＋ LaunchAgent；② **关键**：给 pi-subagents 打两处本地补丁 —— `resolveNodeExecutable()` 增加 `PI_SUBAGENT_NODE_BIN` → `~/.local/bin/node` 两级回退；runner 的 env 前置常用工具目录到 PATH（否则后台子会话的 `node`/`pnpm`/`cargo` 都找不到） |

补丁与回退方法记录在 `~/.pi/agent/npm/PATCHES.md`（改动的文件旁保留了 `.orig` 备份）。
`pi-subagents` 升级会覆盖补丁，照该文件重打即可。修好后后台自检通过：子会话可直接解析
`node v24.16.0` / `pnpm` / `cargo` 并在仓库内跑测试。

**验证者的诚实边界**（照抄其报告）：Rust 侧「未知 id 不留半个事件」它无法另写 harness 亲测（`db`/`commands` 模块非 `pub`），只能靠读代码 + 既有断言；真实库迁移与 GUI 视觉也未端到端跑（当时真实库仍是 v1.1 schema）。
