# RunningDO v1.1 开发计划

> 版本线：`v1.0.0` → `v1.1.0` · 文档状态：**已定稿，实施中**（§12 全部 14 项已拍板；M1 / M2 已完成，见 §0.1）

### 0.1 实施进度（2026-10-02）

| 阶段 | 状态 | 交付物 |
| --- | --- | --- |
| **M1 视觉底座** | ✅ 完成 | 字体统一（`UI-18`，宋体/`--font-num` 旧栈全清，`--font-ui/-display/-num` 三个新 token）；左栏 340→372 + `max-width: calc(100% - 640px)` 夹取（`UI-19`）；皇冠栏居中 `UI-14`；DESIGN §3 重写、PRD §6.1 同步 |
| **M2 里程碑** | ✅ 完成 | `milestones` 表 + 外键级联 + 迁移前自动兜底备份（`CD-16`/`DATA-06`）；`list/save/delete_milestone` 三个命令（两个后端都实现）；卡片内同泡里程碑区 + 自绘复选框 + 就地改名 + 折叠徽章（`CD-17`/`CD-18`）；高度过渡动效（`UI-15`，带 `prefers-reduced-motion` 降级） |
| **M3 编辑抽屉** | ✅ 完成 | `CountdownDrawer` 新建；`Editor` 从卡片内移除；✕ 两抽屉统一左上（`UI-16`/`UI-17`，决议 Q2/Q8） |
| **M4 收口** | ⏳ 待办 | `UI-20` 余下 P0/P1：红底 `+` 真按钮化、原生 `<select>` 换自绘、全局 `:focus-visible`、`spellcheck` 关闭、非输入区 `user-select: none`、图标按钮 `aria-label` 补齐；文档回写 + 版本号升 `1.1.0`；真机手工清单（§9.3） |
| **M7 标题分档回退** | ✅ 完成（2026-10-02） | 撤销 `UI-22` 里「周/日标题降档变瘦」的做法，四个视图共用同一档字体；保留「不显示年份」与窄窗整体降档 |
| **M6 卡片精简** | ✅ 完成（2026-10-02 追加） | `UI-23` 卡片右上角只剩 ⋯（编辑/皇冠/置顶/颜色全部收进菜单，皇冠与颜色降为只读标记）；`UI-24` 时分秒内联到「剩余 N 天」后、删除灰色「还有」与独立时钟行，菜单项用 `.is-active` 表达「已置顶 / 已戴皇冠」 |
| **M5 布局加固** | ✅ 完成（2026-10-02 补） | `UI-21` 迷你月历不再溢出气泡（`minmax(0, 1fr)` + 清 UA 按钮内边距 + `--rail-w` 随字号）；`UI-22` 标题让位、按钮不折行、窄窗短标题；顺手修掉 `formatWeekRange` 长格式漏空格（“10 月5 日”） |

**测试实数（已全绿）**：前端纯逻辑 35 → **62**（日期格式 9 + 样式不变量 8 + 字号档位等），DOM 冒烟 159 → **251**（里程碑 38 + 抽屉 21 + 标题栏 19 + 卡片 16 + 皇冠 47），Rust 13 → **19**，合计 **332**。

**实施中被测试抳出的真 bug**（已修，值得记一笔）：
里程碑输入框里按回车会**冒泡到卡片的 `onKeyDown`**，于是「新增一条里程碑」会顺手把卡片折起来 —— 卡片现在只处理 `e.target === e.currentTarget` 的按键。这条与 v1.0「顺手保存一下皇冠就没了」同一类：都是「看起来无关的操作改变了别的状态」。
> 本轮只产出计划，**未修改任何代码**（`src/`、`src-tauri/` 零改动）。
> 相关文档：[`PRD`](../v0/PRD.md) · [`DESIGN`](../v0/DESIGN.md) · [`v1.0.0 发布说明`](RELEASE-NOTES.md)

---

## 0. 这份文档是什么

- **是**：v1.1 的施工图。每个目标都写到「改哪个文件、改什么值、怎么算改完、怎么测」。
- **不是**：PRD 的替代。v1.1 新增需求沿用 PRD 的 ID 体系（`CD` / `UI` / `SET` / `DATA` …），完成后**回写** PRD 与 DESIGN，再出一份 `docs/v1/RELEASE-NOTES-v1.1.md`。
- ID 分配（与既有 ID 无冲突，PRD 现用到 `UI-08`、v1.0 用到 `UI-13`；`CD-15`/`SET-12` 已被皇冠占用）：

| 目标 | 新需求 ID |
| --- | --- |
| 1 皇冠栏居中 | `UI-14` |
| 2 里程碑 | `CD-16`（数据模型）`CD-17`（卡片展开与同泡列表）`CD-18`（折叠徽章与完成度）`UI-16`（编辑抽屉）`UI-17`（抽屉关闭按钮位置） |
| 2 动效 | `UI-15`（展开 / 收起动效） |
| 3 字体统一 | `UI-18` |
| 4 左右比例 | `UI-19` |
| 5 原生一致性 | `UI-20` |
| 6 迷你月历溢出与 rail 尺寸 | `UI-21` |
| 7 日历标题栏不折行与窄窗降级 | `UI-22` |
| 8 卡片动作收纳进「⋯」 | `UI-23` |
| 9 卡片信息行内联 + 菜单状态色 | `UI-24` |
| 数据 | `DATA-06`（备份包含里程碑） |

---

## 1. 目标总览

| # | 目标（你的原话） | 需求 ID | 影响面 | 优先级 | 预估 |
| --- | --- | --- | --- | --- | --- |
| 1 | 皇冠栏两端对齐 → 中间对齐 | `UI-14` | CSS + 1 个组件结构 | P1 | 0.5 人日 |
| 2 | 里程碑（TODO）+ 点击卡片默认展开 + 展开动画 + 同一泡；编辑倒计时移到独立位置 + 左上角 ✕ | `CD-16/17/18` `UI-15/16/17` | 数据层 + 卡片交互 + 新组件 + 备份 | **P0** | 4–5 人日 |
| 3 | 字体统一为苹方 + 对应英文字体 | `UI-18` | Tokens + 30 处声明 + DESIGN §3 改版 | **P0** | 1–1.5 人日 |
| 4 | 倒计时区加宽、日历区略收窄 | `UI-19` | 1 个 Token + 1 条夹取规则 | P1 | 0.5 人日 |
| 5 | 原生 UI 一致性审计 + 「不可点击」消歧 | `UI-20` | CSS + 若干组件 | P1 | 1.5–2 人日 |

**依赖关系**：3 必须最先做（字体一变，行高、字重、换行全变，后面所有视觉微调都要重做）。5 里的「自绘复选框 / 自绘下拉」必须在 2 之前落地，否则里程碑会先长出一个原生 checkbox 再回来改。1 与 4 互相影响（都在同一条水平轴上），一起做。

**本版明确不做**：搜索（`CD-13`/`EV-11`，v0.3）、拖拽改期（`CAL-14/15`，v0.2）、事件重复（`EV-09`）、系统通知（`NT-01~04`）、里程碑上日历、里程碑参与搜索、拖拽排序里程碑（见 Q13）。

---

## 2. 现状证据（改动前先记档）

| 位置 | 现状 | 与本计划的关系 |
| --- | --- | --- |
| `src/styles/app.css:2442` `.crown-bar` + `:2502` `.crown-time{margin-left:auto}` | 图标+标题靠左、时间被 `margin-left:auto` 顶到右端 → 两端对齐 | 目标 1 的根因 |
| `src/components/CrownBar.tsx:44-70` | 四个兄弟节点：`.crown-ic` / `.crown-title` / `.crown-time` / `.crown-off` | 目标 1 需要包一层内容组 |
| `src/components/CountdownPanel.tsx:355-460` `Card` | 点击卡片 → 行内展开 `Editor`（`CountdownPanel.tsx:166`） | 目标 2：点击语义要让给里程碑 |
| `src/styles/app.css:471` `.cd-card` | 卡片是单泡；`Editor` 是**另一个** `.panel`（`CountdownPanel.tsx:190`，还带 `marginTop:2`） | 目标 2「同一泡、不许割裂」的反面样本 |
| `src-tauri/src/db.rs:88-140` `migrate()` | 三张表 + `ensure_column` 幂等补列；`PRAGMA foreign_keys=ON`（`db.rs:72`） | 目标 2 加表，级联删除可直接用 FK |
| `src-tauri/src/commands.rs` + `lib.rs:74-87` | 12 个命令，`invoke_handler` 逐个注册 | 目标 2 要加里程碑命令 |
| `src/lib/api.ts:158-190` / `:395-520` | `Backend` 类型 + 浏览器预览后端（localStorage `runningdo.preview.v1`） | 目标 2 两个后端都要实现 |
| `src/styles/tokens.css:69-72` | `--font-serif`（宋体）/ `--font-sans`（PingFang）/ `--font-num`（宋体+Times）三套并存 | 目标 3 的根因 |
| `src/styles/app.css` 里 `var(--font-serif)` 22 处、`var(--font-num)` 8 处、显式 `--font-sans` 2 处 | 见 §5.1 审计表 | 目标 3 的工程量 |
| `src/styles/tokens.css:57-58` `--sidebar-w: calc(340px + var(--fs-step)*110px)` | 左栏固定 340px | 目标 4 |
| `src/components/TopBar.tsx:54` | `<input placeholder="搜索事件、倒计时或笔记…" disabled />` | 目标 5：像可用、其实不可用 |
| `src/components/CountdownPanel.tsx:136-138` | `<span className="mark"><Plus/></span>新建倒计时` —— 红底加号**不可点击** | 目标 5 点名的那一处 |
| `src/components/EventDrawer.tsx:192-216` | 提醒选择用了「透明 `opacity:0` 的原生 `<select>` 覆盖层」 | 目标 5：原生下拉泄漏（且这正是 v0.1「时间选择器点了没反应」的同一手法） |
| `src/styles/app.css:2538` | 全项目只有 `.crown-off` 有 `:focus-visible` | 目标 5：键盘焦点样式不成体系 |
| `src-tauri/tauri.conf.json` | `1240×840`，min `1040×700`，`titleBarStyle: Overlay` + `hiddenTitle` | 目标 4 的约束边界 |

---

## 3. 目标一：皇冠栏改为居中对齐（`UI-14`）

### 3.1 目标形态

```
改前（两端对齐）                                    改后（居中）
┌───────────────────────────────────────────────┐  ┌───────────────────────────────────────────────┐
│▎👑 期末考试                剩余 12 天 05:32:11 ⊙│  │▎        👑 期末考试  剩余 12 天 05:32:11   ⊙ │
└───────────────────────────────────────────────┘  └───────────────────────────────────────────────┘
       ↑ 左端标题                                  ↑ 右端时间        ↑ 内容组整体居中（取消按钮绝对定位在右端）
```

### 3.2 实现规格

1. `CrownBar.tsx`：把 `.crown-ic` / `.crown-title` / `.crown-time` 包进 `<span className="crown-main">`；`.crown-off` 留在外面。
2. `.crown-bar`：`justify-content: center`；`position: relative`（已有）。
3. `.crown-time`：**删掉** `margin-left: auto`。
4. `.crown-off`：`position: absolute; right: 12px; top: 50%; transform: translateY(-50%)` —— 必须脱离文档流，否则它的宽度（约 26px）会把整组往左推、看起来「没居中」。
5. `.crown-main { display:flex; align-items:center; gap: var(--sp-2); min-width:0 }`。
6. `.crown-title { max-width: min(34%, 320px); min-width: 0 }`（居中后左右都要留白，46% 会顶到取消按钮）。
7. 保留：左侧 3px 朱砂书签线（`::before`，绝对定位，不影响居中）、`.is-today` 底色、`.is-past` 降对比、`SET-12` 关掉整行不渲染。

### 3.3 边界条件（必须逐条验）

| 场景 | 期望 |
| --- | --- |
| 标题 60 字（上限）+ 字号「特大」+ 窗口 1040 | 标题省略号截断；**倒计时完整可见**（`.crown-time { flex: 0 0 auto; white-space: nowrap }`） |
| 标题 1 个字 | 内容组整体居中（👑 不在最左，这是目标形态，见 Q1） |
| 已过期 | 整行 `opacity .6`，居中性不变 |
| 秒跳动 | 行宽不抖（`tabular-nums` 已有，目标 3 换字体后要重验，见 §5.4） |
| 关掉皇冠栏 | 不渲染、不占高度（回归项） |

### 3.4 验收标准

- `getComputedStyle(.crown-bar).justifyContent === "center"`；`.crown-time` 无 `margin-left:auto`（jsdom 可断言）。
- 真机几何：窗口宽 1040 / 1240 / 1600 × 字号 4 档共 12 组，`|center(.crown-main) − center(.crown-bar)| ≤ 2px`（jsdom 无布局引擎 → 列入**真机手工清单**，见 §9.3）。
- `pnpm smoke` 皇冠套件 40 项全绿 + 新增 2 项声明断言。

### 3.5 影响文件

`src/components/CrownBar.tsx` · `src/styles/app.css`（`.crown-*` 段） · `src/__smoke__/crown.smoke.tsx` · `src/styles/tokens.test.ts`（样式不变量新增 1 条） · `docs/v0/DESIGN.md` §5.1b

---

## 4. 目标二：里程碑 + 点击展开 + 编辑抽屉

### 4.1 交互模型（先定语义，再定实现）

| 动作 | 改前 | 改后 |
| --- | --- | --- |
| 单击卡片 | 行内展开编辑表单 | **展开 / 收起里程碑区**（`CD-17`） |
| ⋯ 菜单「编辑」 / 新增的铅笔按钮 | 行内编辑 | **打开右侧抽屉**（`UI-16`） |
| 皇冠栏标题点击 | 行内编辑 | 打开右侧抽屉（文案改为「编辑这条倒计时」→ 行为一致） |
| 菜单栏「新建倒计时」 | 行内编辑（空草稿） | 打开抽屉（新建态） |
| 左栏顶部快速创建表单 | 保留 | **保留**（最常用路径，不动） |

> **为什么把编辑搬走**：卡片点击已经被「看里程碑」占用；编辑是低频、9 个字段的表单，塞在 340→372px 的窄栏里本来就挤，事件编辑已经证明抽屉更合适（`EventDrawer`）。搬走之后卡片回归「一眼看清倒计时 + 一件件划掉里程碑」。

**状态**（`useStore`）

```ts
expandedId: string | null      // 会话内，不落库；默认单选展开（Q4）
milestones: Record<string, Milestone[]>   // 按 countdownId 归集（Q3）
toggleExpanded: (id: string) => void
addMilestone / toggleMilestone / renameMilestone / deleteMilestone
```

### 4.2 数据模型（`CD-16`）

```sql
CREATE TABLE IF NOT EXISTS milestones (
    id           TEXT PRIMARY KEY,
    countdown_id TEXT NOT NULL REFERENCES countdowns(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    done         INTEGER NOT NULL DEFAULT 0,
    done_at      TEXT,
    sort_order   INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_milestones_cd ON milestones(countdown_id, sort_order);
```

- 迁移方式：`CREATE TABLE IF NOT EXISTS`（幂等），老库直接升级，**无需** `ensure_column`。
- 级联删除：`PRAGMA foreign_keys=ON` 已在 `Db::open`（`db.rs:72`）启用 → 删倒计时自动删里程碑。Rust 测试要专门覆盖它（v1.0 就是靠「手搓老表结构 + 升级」抓过迁移问题，这里照旧）。
- 排序：插入时 `sort_order = COALESCE(MAX(sort_order)+1, 0)`（同一条倒计时内）；重排（P2）在一个事务里整表写回。
- 规模上限：单条倒计时建议 ≤100 个里程碑（前端输入行禁用 + `title` 提示），DB 不设约束。
- **不做**：里程碑带日期/提醒/优先级/附件（保持「勾掉就完」的轻量语义）。

### 4.3 命令层（Rust）

| 命令 | 签名 | 说明 |
| --- | --- | --- |
| `list_milestones` | `() -> Vec<Milestone>` | 一次全量（Q3 推荐），自带 `countdownId` 字段，前端按 id 归集 |
| `save_milestone` | `(input: MilestoneInput) -> Milestone` | `id` 为空即新建；勾选/改名都走它（upsert） |
| `delete_milestone` | `(id: String) -> ()` | — |

- `MilestoneInput { id: Option<String>, countdown_id: String, title: String, done: bool, sort_order: i64 }`。
- 勾选用 `save_milestone` 整条覆写即可（单用户本地库，无并发写风险）；**不**引入只有一半字段的 `toggle` 命令，避免 v1.0 `crowned` 那类「部分覆写抹掉字段」的坑重演。
- 命令数：12 → 15，`lib.rs` 的 `invoke_handler` 同步注册。

### 4.4 前端 API 层

- `src/lib/api.ts`：`Backend` 类型加 3 个方法；`tauriBackend()` 与 `previewBackend()`（localStorage）**都要实现**，否则 `pnpm dev` 预览和 smoke 测试直接崩。
- 预览后端要把里程碑写进 `runningdo.preview.v1`，并更新种子数据（至少一条倒计时带 3 个里程碑），方便肉眼验收动画。

### 4.5 卡片内里程碑区（`CD-17`，同泡原则）

```
┌─ .cd-card（同一个背景 / 圆角 / 阴影，泡从顶到底不破）────────────┐
│  剩余 12 天                      👑  📌  ●  ⋯                    │
│  还有 05:32:11                                                   │
│  期末考试                                                        │
│  📅 2026-06-07 周日 · 09:00                         [今天]        │
│  ▓▓▓▓▓▓░░░░░░ 42%                                                │
│  ─────────────────────────────────────────────   ← 卡内 1px 细线 │
│  ☑ 开题报告提纲                                            ✕      │
│  ☐ 实验数据回收                                            ✕      │
│  ☐ 初稿                                                    ✕      │
│  [ 添加里程碑，回车即可…                              ]  ↵        │
│  已完成 1/3                                                      │
└──────────────────────────────────────────────────────────────────┘
```

**硬性规则**

1. 里程碑区**必须在 `.cd-card` 内部**，不得新建 `.panel` / 第二个泡 / `margin-top` 缝隙；分隔只用一条 `1px var(--line-soft)`，左右与卡片内边距对齐（这就是你要求的「中间不应该有割裂」）。
2. 复选框**自绘**（方框 + 朱砂勾），**禁止原生 `<input type="checkbox">`** —— 与 `UI-01/02`（不用原生 date/time）同一条原则，原生控件在纸感里一眼就出戏。此条同时计入目标 5。
3. 完成态：文字删除线 + `--ink-3`；行高不变（防抖）；勾选有 180ms 画勾动画，`prefers-reduced-motion: reduce` 时直接切换。
4. 添加行常驻在里程碑区底部：`Enter` 提交并**保持焦点**（连续录入）；`Esc` 清空；空串提交无副作用；IME 组合态必须判 `isComposing`（`EventDrawer.tsx:110` 已有先例）。
5. 重命名：双击行文字 → 就地变输入框（`Enter` 提交 / `Esc` 取消 / 失焦提交）。
6. 删除行：hover 显示 `✕`；立即删除不弹确认（Q12），Toast 提示「已删除「xxx」」。
7. 行内所有交互必须 `stopPropagation`，否则点复选框会顺手把卡片折叠起来。
8. 字号：行文字 13px×`--font-scale`；行高用 `min-height: calc(28px + var(--fs-step) * 8px)`（遵守既有不变量：文字容器只用 `min-height`）。
9. 计数：展开时底部显示 `已完成 1/3`；**不再加第二条进度条** —— 卡片上已有「日期进度条」（`pct`，需 `startDate`），两条进度条语义会打架，统一用文字表达里程碑完成度。

### 4.6 展开 / 收起动效（`UI-15`）

- 实现：JS 量高。展开 `height: 0 → scrollHeight` → 过渡结束置 `height:auto`；收起先固定当前高度，下一帧置 0。`transition: height .22s cubic-bezier(.2,.7,.3,1)`。
- **禁用 `grid-template-rows: 0fr→1fr`**：本项目最低系统 macOS 11（`minimumSystemVersion: "11.0"`）→ Safari 14，不支持该属性动画，会静默失效。
- **禁用 `transform: scaleY` / `transform` 包裹**：DESIGN §5.11 已规定「非 `none` 的 transform 会成为 `position:fixed` 后代的包含块」，本项目为此刻过坑（时间选择器被推到屏幕外）。内层淡入若用 `translateY`，`to` 帧必须写 `transform: none`（照抄 `.drawer` 的 `slide-in` 写法）。
- 内层内容 `opacity 0 → 1`，时长与高度同步。
- `prefers-reduced-motion: reduce` → 直接显隐，不做高度过渡。
- 展开后若卡片下沿超出滚动区，`scrollIntoView({ block: "nearest" })`（P2，可后置）。

### 4.7 折叠态徽章（`CD-18`，建议做）

折叠时在卡片标题行右侧显示 `☑ 1/3` 小徽章（有里程碑才显示；全部完成时转 `--ink-3` 并用 `✓ 3/3`）。理由：折叠是默认态，没有徽章就看不出这条有里程碑、更看不出做到哪了。

### 4.8 编辑抽屉（`UI-16` / `UI-17`）

- 新组件 `src/components/CountdownDrawer.tsx`，**复用** `.drawer` / `.drawer-head` / `.drawer-body` / `.mask` / `.form-row` / `.form-2` / `.field` / `.picker` / `.swatch`（不新增视觉语言）。
- 字段与现 `Editor`（`CountdownPanel.tsx:166-352`）一一对应：标题、目标日期、目标时间、起始日期（进度条用）、颜色标签、置顶、在日历中显示、备注、删除、保存。
- 关闭按钮：**左上角** `✕`（`UI-17`）。`.drawer-head` 现在居中标题 + 右侧关闭（`app.css:1548-1580`）→ 改为 `✕` 绝对定位在左，标题仍居中。Q8：是否把 `EventDrawer` 一起改成左上（推荐一起改，否则两个抽屉同一位置两种习惯）。
- 关闭方式：点遮罩 / `✕` / `Esc`（`App.tsx:23-38` 已处理 `countdownDraft`，不需新逻辑）。
- 打开行为：新建时 `autoFocus` 标题；编辑时预填且 `autoFocus` 标题。
- 抽屉内**不**做里程碑管理（避免两处双写；里程碑只在中栏卡片里管）。
- 组件复用 `countdownDraft`（`useStore.ts:125`）状态，`Editor` 从 `CountdownPanel.tsx` 移除，卡片内不再渲染表单。

### 4.9 交叉影响矩阵（改一处必须回头验这些）

| 现有功能 | 影响 | 处置 |
| --- | --- | --- |
| 卡片点击 / `Enter` / `Space` | 语义从「编辑」改为「展开」 | 已有 `role="button"` + 键盘处理复用；`aria-expanded` 要跟着加 |
| 卡片内按钮（皇冠 / 置顶 / ⋯） | 已 `stopPropagation` | 回归测试要覆盖「点皇冠不会展开卡片」 |
| 皇冠栏标题 | 原来行内编辑 | 改开抽屉 |
| 右键菜单「编辑」 | 不变 | 指向抽屉 |
| 删除确认 | 文案 | 改为「…？其下 N 个里程碑会一并删除」 |
| 复制（⋯ 菜单） | 是否复制里程碑 | 见 Q7（推荐复制且 `done` 重置为 false） |
| 归档 | 里程碑随记录保留 | 归档区卡片**不允许展开**（只允许编辑/恢复） |
| 日历 | 里程碑不上日历 | 明确不做 |
| 字号档位（`UI-13`） | 里程碑行高、输入行、抽屉 | 遵守三条不变量（见 §9.2） |
| 备份 JSON | 结构变化 | 见 §8 |
| 搜索（v0.3） | 不索引里程碑 | 记入 v0.3 范围说明 |

### 4.10 测试计划（目标二）

| 层 | 用例 |
| --- | --- |
| Rust（`cargo test`） | 新建/改名/勾选/删除；`sort_order` 递增；**删倒计时级联删里程碑**；`export_json` 含 `milestones`；老库（无该表）升级幂等 |
| 纯逻辑（`pnpm test`） | 完成度计算（`1/3`、全完成、空集合） |
| DOM 冒烟（新增 `milestones.smoke.tsx`，~20 项） | 点击卡片展开/收起；同一时刻只展开一张；添加（含 IME 组合态不误提交）；勾选；双击改名；`Esc` 取消改名；删除；`stopPropagation`（点复选框不折叠）；空态文案；计数文案；折叠徽章；归档卡不可展开；字号档位下行高 `min-height` 生效 |
| DOM 冒烟（新增 `drawer-countdown.smoke.tsx`，~8 项） | ⋯ → 编辑 → 抽屉出现；✕ 在**左上**（`getComputedStyle().left` 存在 / `right: auto`）；遮罩关闭；`Esc` 关闭；保存后列表更新；删除走确认弹窗；新建态标题 autofocus |
| 样式不变量 | 里程碑区必须位于 `.cd-card` 内（源码断言：`CountdownPanel.tsx` 中 `milestones` 渲染块不得出现 `className="panel"`）；禁止 `input[type=checkbox]` |

### 4.11 风险

| 风险 | 说明 | 缓解 |
| --- | --- | --- |
| 展开动画在 macOS 11 WKWebView 上的表现 | 高度过渡要实测；`scrollHeight` 在字体未加载时偏小 | 在真机 bundle 上验 4 档字号；必要时改用 `ResizeObserver` 跟随内容高 |
| 左栏变宽后卡片更胖 | 与目标 4 联动 | 一起调，见 §6 |
| 数据迁移把老库写坏 | 新增表 + 级联外键 | 迁移前自动备份一次（见 §8.3）；Rust 测老库升级路径 |
| 里程碑把左栏撑得很长 | 单条 100 个上限 + 卡片展开是单选 | 见 Q4/Q5 |

---

## 5. 目标三：字体统一为苹方 + 对应英文字体（`UI-18`）

### 5.1 现状审计（`src/styles/app.css`，共 32 处声明）

| 字体 token | 处数 | 用在哪 | 问题 |
| --- | --- | --- | --- |
| `--font-serif`（Songti SC） | 22 | 应用名、面板标题、卡片大数字、卡片标题、视图标题、日号、抽屉标题、设置标题、弹层标题、圆角日期、皇冠标题/时间… | 宋体字重不全（见 §5.2），`500/600` 实际落到 Regular/Bold 两档，视觉忽粗忽细 |
| `--font-num`（Songti + Times New Roman） | 8 | 时钟行、月格日号、周视图列头、议程日期、滚轮数字、顶栏时钟 | 数字走 **Times** 的拉丁字形，与中文宋体不是一套设计，混排明显 |
| 显式 `--font-sans` | 2 | `body`、`.cd-clock .sep` | 同一行时钟里 `.sep`(无衬线) 与 `.unit`(衬线) 混用 |

### 5.2 实测字重（本机 `NSFontManager`，2026-10-02）

| 字体族 | 实际可用字重 | 关键结论 |
| --- | --- | --- |
| `Songti SC` | Light / **Regular** / **Bold** / Black | **没有 Medium(500)** → 现在 5 处 `font-weight:500` 都回落到 Regular，另外 10 处 `600` 直接跳到 Bold，中间档全丢 |
| `PingFang SC` | Ultralight / Thin / Light / Regular / **Medium** / **Semibold** | **没有 Bold(700)** → 写 `700` 会被合成假粗（笔画发糊） |
| `SF Pro`（系统） | 由 `-apple-system` 解析，含光学尺寸（≤19px 用 Text、大字用 Display）+ 支持 `tabular-nums` | 英文与数字的主字体，且是等宽数字的唯一靠得住的来源 |
| `Hiragino Sans GB` | W3 / W6 | 仅作老系统兜底 |

### 5.3 目标字体栈（顺序不能反）

```css
/* 语义重命名：--font-serif → 退役；保留一个别名以免一次改不干净 */
--font-ui:      -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", Arial, sans-serif;
--font-display: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", Arial, sans-serif;
--font-num:     -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Helvetica Neue", Arial, sans-serif;
```

- **`-apple-system` 必须排第一**：拉丁字母与数字由 SF Pro 出，中文落到 `PingFang SC`。反过来写（`"PingFang SC"` 在前）数字会改用苹方自带的拉丁字形，`tabular-nums` 可能失效 → 秒跳时整行抖。
- 三个 token 值相同、语义不同（正文 / 大字号展示 / 数字），便于后续只调字重与字距而不改栈。
- `--font-serif` 保留为 `--font-ui` 的别名一版（便于分批改 + 回滚），v1.2 删除。
- `--font-num` 只用于「会跳秒/跳数」的位置，且必须配 `font-variant-numeric: tabular-nums`。

### 5.4 字重与数字规则（换字体后重新定档）

| 角色 | 字重 | 附加 |
| --- | --- | --- |
| 大数字（`剩余 12 天`、日号、顶栏时钟） | **600**（Semibold，真实存在） | `font-variant-numeric: tabular-nums`；拉丁与数字负字距 `-0.01em`，中文标题不加 |
| 标题类（卡片标题、面板标题、皇冠标题、视图标题） | 600 | — |
| 次级强调（`.cd-title` 之类原 500） | **500**（Medium，真实存在） | — |
| 正文 / 表单 | 400 | — |
| **禁止 `font-weight: 700`** | — | PingFang 无 Bold，写了就是假粗 |

### 5.5 必须一并处理的连带项

1. 换字体后中英文行高会变 → 逐个核对 DESIGN §3 的字号/行高表，必要时 ±1~2px；月视图 `-webkit-line-clamp` 行数（大字号 2 行规则）要重验。
2. `.cd-clock .sep`（显式无衬线）与 `.unit`（衬线）混排 → 统一到 `--font-num`。
3. `-webkit-font-smoothing: antialiased` 保留（与 macOS 现代 app 一致），但换字体后要重看字重观感，必要时把 600 降回 500。
4. 样式不变量审计（`src/styles/tokens.test.ts`）新增 3 条：**① app.css 内不得出现字面量 `font-family:`**（必须走 token）；**② 不得出现 `font-weight: 700`**；**③ 所有会跳秒的元素（`.clock` / `.cd-days .num` / `.cd-clock` / `.crown-time` / `.wheel-item`）必须声明 `font-variant-numeric: tabular-nums`**。
5. 等宽数字的真机验证：分别渲染 `111111` 与 `888888`，`offsetWidth` 必须相等（jsdom 无字体度量 → 真机手工清单）。
6. **决策点 Q9**：宋体是否完全清退？推荐**完全清退**（一致性优先，且宋体在 macOS 上缺档、回退也最不稳）。若保留，只允许两处装饰：`.brand`（应用名）与 `.cd-empty .hand`（水墨手写空态），并在 DESIGN §3 明确写「装饰例外，不承载信息」。
7. DESIGN §3 需要改版：现在写着「日号、倒计时数字、视图标题、事件标题均为衬线……**这是本设计最强的识别特征，不可混用**」——本目标是**主动推翻**该决定，必须显式改写（新识别特征 = 等宽数字 + 600 字重的 SF/PingFang 层级对比 + 纸张质感），不能留矛盾文档。

### 5.6 验收标准

- `app.css` 中 `var(--font-serif)` / `var(--font-num)` 归零（或仅剩 §5.5.6 的例外，若 Q9 选保留）。
- 4 档字号 × 关键 8 处文本（轮盘、卡片大字、皇冠、顶栏时钟、月格、抽屉、设置、Toast）无裁切、无错行。
- 真机：`111111` 与 `888888` 同宽；`font-weight: 500` 与 `600` 在同一处能看出差异（证明真实字重生效，不是合成）。

### 5.7 影响文件

`src/styles/tokens.css` · `src/styles/app.css`（约 30 处） · `src/styles/tokens.test.ts` · `docs/v0/DESIGN.md` §3 / §5 各组件字体行 · `README.md`（技术栈「字体」如需说明）

---

## 6. 目标四：加宽倒计时区、收窄日历区（`UI-19`）

### 6.1 现状与目标数值

| 项 | 现值 | 目标 | 变化 |
| --- | --- | --- | --- |
| `--sidebar-w` 基准 | `340px` | **`372px`** | +32px（+9.4%） |
| 字号斜率 | `+110px × --fs-step` | 不变（大字仍需更多横向空间） | — |
| 夹取规则 | 无 | 新增 `.sidebar { max-width: calc(100% - 640px) }` | 保日历 ≥640px（PRD §6.1） |

### 6.2 宽度矩阵（含字号档位；日历可用宽 = 窗口 − 左栏 − 1px 主分隔线，月格宽 =（日历可用宽 − 24px 右内边距）/ 7）

| 窗口宽 | 字号 | 左栏 | 日历可用宽 | 月格宽 | 改前月格宽 | 差 |
| --- | --- | --- | --- | --- | --- | --- |
| 1040（最小） | 标准 | 372 | 667 | 91.9 | 96.4 | −4.5 |
| 1040（最小） | 特大 | **399**（被夹取，原始 405） | 640 | 88.0 | 96.4 | −8.4 |
| 1240（默认） | 标准 | 372 | 867 | 120.4 | 125.0 | −4.6 |
| 1240（默认） | 特大 | 405 | 834 | 115.7 | 118.9 | −3.2 |
| 1440 | 标准 | 372 | 1067 | 149.0 | 153.6 | −4.6 |
| 1600 | 标准 | 372 | 1227 | 171.9 | 176.4 | −4.5 |

结论：月视图每格少 4–5px（仍 ≥88px，PRD 要求的最小格内两行文字不受影响），左栏从 340 → 372 给里程碑行（标题 + ✕）腾出实质空间。「稍微」的幅度即 ±32px，如需更激进见 Q。

### 6.3 连带验收

1. 1040 最小窗口 × 4 档字号：日历区不得低于 640px（`max-width` 夹取生效），且**不出现横向滚动条**。
2. 周 / 日视图：迷你月历（`MiniCalendar`）与时间网格在收窄后的宽度下不挤压列头（该视图无固定宽度 token，需真机核对）。
3. 设置页：`--settings-nav-w`（200px）不受影响；但设置在**整窗**里渲染（`App.tsx:88`），字号特大时内容区仍要放得下 1fr/1fr 两列表单。
4. 抽屉不受影响（`--drawer-w` 独立，480px）。
5. 月视图 `--row-h`、大字号 2 行规则、`+N` 截断行为不变。
6. 全屏（2560+）：左栏不应被拉宽（固定宽 + `max-width` 不影响大窗口，OK）。

### 6.4 影响文件

`src/styles/tokens.css`（`--sidebar-w`） · `src/styles/app.css`（`.sidebar`） · `src/styles/tokens.test.ts`（新增夹取规则断言） · `docs/v0/DESIGN.md` §4.3 / PRD §6.1 的 ASCII 图与「固定 340px」表述

---

## 7. 目标五：原生 UI 一致性审计 + 「不可点击」消歧（`UI-20`）
### 7.1 判定口径（先立规矩，避免「看着像原生就改」）

| 类别 | 含义 | 处置 |
| --- | --- | --- |
| **A 真原生（保留）** | 系统该负责的：窗口红绿灯、菜单栏图标与菜单、系统通知、窗口拖拽、输入框的原生复制/粘贴菜单、系统滚动条回弹 | 保留，并在文档里明确「这是系统行为」 |
| **B 原生泄漏（要处理）** | 原生控件出现在了自绘语言里，肉眼能看出两套设计 | 换成自绘或明确降级 |
| **C 伪原生（要处理）** | 看起来能点 / 看着像按钮，实际不可交互（比 B 更糟：它骗人） | 要么让它真能点，要么去掉按钮感 |

### 7.2 审计清单

| # | 位置 | 现象 | 类别 | 处置 | 优先级 |
| --- | --- | --- | --- | --- | --- |
| 1 | `CountdownPanel.tsx:136` `.panel-title .mark`（红底 `+`） | 明确像「新建」按钮，点击无反应 | C | 改成真按钮：点击 → 聚焦标题输入框（保住视觉与语义）；若不做则必须去掉方块底 | **P0** |
| 2 | `TopBar.tsx:54` 搜索框（`disabled`） | 长得像可用输入框，永远点不动 | C | 保留外形 + 点击给 Toast「搜索将在 v0.3 提供」；`cursor: not-allowed`；占位文案改「搜索（开发中）」（Q11） | P1 |
| 3 | `SettingsPage.tsx:565/579` 主题卡（`disabled`，标题「接口已预留」） | 有 hover 抬升，像能点 | C | 加「即将支持」角标 + 去掉 hover 反馈 + 降低对比 | P1 |
| 4 | `EventDrawer.tsx:192-216` 提醒下拉 | 透明覆盖的原生 `<select>`：点开是系统菜单 | B | 换成自绘选择浮层（复用 `.pop` + `UI-03/04` 的互斥与避让） | **P0**（与目标 2 并行） |
| 5 | 里程碑复选框（新增） | 若用原生 checkbox 会立刻出戏 | B | 自绘方框 + 朱砂勾（见 §4.5.2） | **P0**（目标 2 内） |
| 6 | 全项目焦点样式 | 只有 `.crown-off` 有 `:focus-visible`（`app.css:2538`），其余按钮焦点环随浏览器默认 | B | 加全局 `:focus-visible { outline: 2px solid var(--cinnabar-soft); outline-offset: 1px }`，并按 `--r-md` 圆角 | P1 |
| 7 | 所有输入框 | 未关 `spellcheck` / 自动更正 → 中文输入可能带红色波浪线、自动替换 | B | 统一 `spellCheck={false} autoCorrect="off" autoCapitalize="off"`（全项目搜一遍 `<input` / `<textarea>`） | P1 |
| 8 | `.cd-card`（`role="button"`） | 没有 `cursor: pointer`（`body` 是 `default`），hover 只有 1px 抬升 | C | 卡片改 `cursor: pointer`（Q10 推荐），或保留箭头但把 hover 反馈加强；二选一，不能含糊 | P1 |
| 9 | 卡片文字 / 标签 | 可被选中拖拽（正文区域 `user-select` 未管），桌面上像网页 | B | 非输入区域 `user-select: none`（顶栏已这么做），输入框保持可选 | P1 |
| 10 | 图标按钮（卡片皇冠/置顶/⋯、抽屉关闭） | 只有 `title`，无 `aria-label` | B | 补 `aria-label`（同时解决键盘与读屏）；`title` 保留（原生 tooltip 是正确行为） | P1 |
| 11 | 滚动条 | 已用 `::-webkit-scrollbar` 自绘；系统设置为「始终显示滚动条」时会出现系统轨道 | B | 文档化差异，不加开关（Q14 推荐） | P2 |
| 12 | 原生右键菜单 | 卡片区域已自绘；输入框/文本区域保留系统菜单（复制/粘贴） | A | 保留（正确用法）；仅确认发布构建关闭 devtools 入口 | — |
| 13 | 红绿灯安全区 | `.topbar` 左侧预留 78px（`--traffic-safe`），`titleBarStyle: Overlay` | A | 保留；4 档字号下复验不重叠 | — |
| 14 | 菜单栏常驻 | 原生 `NSStatusItem` + `icon_as_template(true)`（`lib.rs:42`） | A | 保留；复验深浅色下模板图标正常 | — |
| 15 | 关闭窗口 = 隐藏 | `lib.rs:67-72` | A | 保留；复验隐藏后重开位置与滚动位置 | — |
| 16 | `.drawer` 滑入动画 | 已有 `transform: none` 收尾（DESIGN §5.11） | A | 保留；里程碑展开动画不得破坏该约束（§4.6） | — |
| 17 | 全屏（绿灯） | 无 `:fullscreen` 相关样式 | C（潜在） | 验全屏下左栏不拉伸、月格不过宽；必要时加全屏下 `--sp-5` 自适应 | P2 |
| 18 | 缩放（`Cmd +/-`） | 无处理；WebKit 缩放会破坏「像素级排版」假设 | C（潜在） | 在 Tauri 侧禁用缩放快捷键或加提示；至少列入验收（`Cmd +` 后布局不崩） | P2 |

### 7.3 验收标准
- 清单中所有 P0/P1 项关闭；每项在 PR 描述里附「改前/改后」判定依据（CSS 声明 / 组件结构 / 真机截图）。
- 新增不变量审计：**不得出现 `<input type="checkbox">`**、**不得出现 `opacity: 0` 覆盖层包原生表单控件**（这条正是 v0.1 那次「点了没反应」的根因，值得写成规则）。
- 「可点击」一致性：所有 `role="button"` 或 `<button>` 元素在 hover 时必须有可见变化（背景/描边/位移三选一），非交互装饰元素不得有按钮外观。

---

## 7A. 目标六：迷你月历溢出与 rail 尺寸（`UI-21`）

> 2026-10-02 由使用者实测发现的 bug：「周视图 / 日视图时，左侧的日历和包裹气泡大小不匹配，日历超出范围、显示不全。」

### 7A.1 根因（三层，缺一层都不溢）

| # | 位置 | 问题 |
| --- | --- | --- |
| 1 | `app.css` `.rail { flex: 0 0 180px }` | 写死 180px —— 全项目唯一没随字号缩放的尺寸。内容宽 = 180 − 2 − 22(气泡内边距+边框) = **156px** |
| 2 | `app.css` `.mini-grid { grid-template-columns: repeat(7, 1fr) }` | `1fr` = `minmax(auto, 1fr)`，轨道最小值 = 格子的**最小内容宽**，不是「平均分」 |
| 3 | `app.css` 全局 `button` reset | 只清了 `border / background / cursor`，**没清 padding**。WebKit 给 `<button>` 的 UA 内边距约 `1px 6px` → 每个日格最小宽 ≈ 25~30px → 7 列 ≈ **181~216px > 156px** |

结果：轨道总宽超过容器 → 格子画到气泡外面（气泡背景/圆角盖不住）→ 外层 `.cal-body { overflow: hidden }` 再裁一刀 = 「超出范围、显示不全」。**次因**：`.mini-head .t`（「2026 年 10 月」+ 两个翻月按钮）在特大字号下约 160px，同样超线。

### 7A.2 修复（已实施）

```css
/* tokens.css */
--rail-w: calc(180px + var(--fs-step) * 44px);
/* app.css */
.rail        { flex: 0 0 var(--rail-w); width: var(--rail-w); overflow-x: hidden; }
.mini-grid   { grid-template-columns: repeat(7, minmax(0, 1fr)); }
.mini-head .t{ min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button       { padding: 0; }   /* 全局 reset 补上，已审计：所有文字按钮都自带 padding */
```

### 7A.3 验收

- 1040 / 1240 / 1600 × 4 档字号：周/日视图下迷你月历**不出泡**、`.rail` 无横向滚动。
- 不变量审计新增 2 条：`.mini-grid` 必须 `minmax(0, 1fr)`；全局 `button` 必须 `padding: 0`；`--rail-w` 必须随 `--fs-step` 变化。

---

## 7B. 目标七：日历标题栏不折行与窄窗降级（`UI-22`）

> 同一时间发现：「标题太长导致今天/议程/新建事件按钮文字变 2 行、按钮大小变化，缩放窗口时也出现。」

### 7B.1 根因（同样是三层）

1. `.cal-title` 有 `white-space: nowrap` 但**没有 `min-width: 0`** → flex 项的 `min-width: auto` = min-content = **整串标题宽**（周视图长格式 28px×scale，特大字号约 600px）→ 标题拒绝收缩。
2. 于是 flex 只能压缩右侧控件；`.cal-header .right`、`.btn`、`.segmented button` 都是默认 `flex-shrink: 1`，而 `.btn` **没有 `white-space: nowrap`** → 中文任意断行 → 按钮被压到一个字宽、标签折成 2 行。
3. `.btn` 用的是 `min-height`（v1.0 的字号不变量要求）→ 折行后内容变高 → 按钮变高 → 整条 header 高度跳 → 缩放窗口时反复发生。

算术（1240 窗口、特大字号）：日历区 867px，header 固有宽 ≈ 48 + 72 + 36 + **600(标题)** + **580(右侧)** ≈ **1384px**，超出约 520px 全靠右侧控件折行吸收。

### 7B.2 修复（已实施）

规则一句话：**标题让位，操作不让位。**

```css
.cal-title        { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.cal-header .right      { flex: 0 0 auto; }
.cal-header .right > *  { flex: 0 0 auto; }
button, .btn, .segmented button { white-space: nowrap; }
.jump-wrap        { width: clamp(112px, 15vw, 176px); }
@media (max-width: 1180px) { .cal-title { font-size: calc(22px * var(--font-scale)); } }
```

外加 **窄窗短标题**：`formatWeekRange(days, "short")` → `10/5 – 10/11`（跨年补年份），由新 hook `src/lib/viewport.ts` 的 `useNarrow(1180)` 切换；标题带 `title` 属性，被截断后 hover 可看全。

> ⚠️ **禁用容器查询**（`@container`）：需 Safari 16 / macOS 13 起支持，本项目最低 macOS 11。降级只能用媒体查询或 JS 测量 —— 这条已写成不变量审计。

### 7B.3 标题降档与「不显示年份」（2026-10-02 追加）

规则：**周 / 日视图的标题去掉年份**（**字号与字重与月视图完全一致** —— 曾试过「周/日降一档 + 变瘦」
，2026-10-02 回退，见 §7B.3.1）。

| 位置 | 改前 | 改后 |
| --- | --- | --- |
| `.cal-title`（全部视图） | `28px / 500` | **不变**：周/日/月/议程同一档字体，只有窄窗（≤1180）整体降到 `22px` |
| 迷你月历标题 `.mini-head .t` | `14px / 600`，「2026 年 10 月」 | **`13px / 400`**，「10 月」（翻到别的年份时才补年份）—— 它没有月视图对应物，不参与「与月视图一致」 |
| 日视图标题 | `2026 年 10 月 2 日 星期五` | `10 月 2 日 星期五`（`formatFullDate(d, false)`） |
| 周视图标题 | `2026 年 10 月 5 日 – 10 月 11 日` | `10 月 5 日 – 11 日`（跨年时自动补年份） |

#### 7B.3.1 回退记录（2026-10-02）

先是提了「缩小周/日视图标题字号或用瘦字体」，实现为 `.cal-title.is-compact`（`22px / 400`）+
窄窗再降到 `19px`。同日使用者要求「周视图和日视图的字体回退到和月视图相同」→ **已撤销该分档**：
删除 `.is-compact` 的两处规则与组件里的类名，四个视图重新共用同一档字体。
不变量审计也随之改写为「**不许**再出现按视图分档的标题字号」。
**保留**的部分：不显示年份（内容而非字体）、迷你月历标题的 `13/400`。

**完整信息不丢**：两个标题都带 `title` 属性，hover 可看到含年份的完整写法（周视图用新增的 `formatWeekRange(days, "full")`）。

**跨年特例**：`12 月 28 日 – 1 月 3 日` 会被误读成同一年的同一周，所以跨年时年份**必须**写出来 —— 这一条有单测锁住。

三种粒度构成标题的「**三级刹车**」：`short`（数字式，窄窗）< `long`（默认，无年份）< `full`（title 提示），依次变短。

### 7B.3 顺手修掉的真 bug

`formatWeekRange` 三个分支都漏了空格：渲染成 **「2026 年 10 月5 日」**（同文件的 `formatFullDate` 是「10 月 5 日」）。已修正并加单测。

### 7B.4 验收

- 1040 / 1240 / 1600 × 4 档字号：「今天 / 跳转 / 视图切换 / 新建事件」高度恒定、标签单行；标题被截断时出现省略号。
- 不变量审计新增 5 条：全局 `button` 必须 `nowrap`；`.cal-title` 必须 `min-width: 0` + ellipsis；`.cal-header .right`（及其子项）必须 `flex: 0 0 auto`；窄窗降级必须是媒体查询；`app.css` 不得出现 `@container`。

---

## 7C. 目标八：卡片动作收纳（`UI-23`）与信息行内联（`UI-24`）

> 2026-10-02 使用者要求：「取消右上角的常驻常用功能，都收进 '...'；'...' 展开后，置顶和取消置顶有颜色变化；
> 把具体的时分秒放在剩余天数的后面，删除灰色的『还有』。」

### 7C.1 `UI-23` 右上角只留「⋯」

| 改前 | 改后 |
| --- | --- |
| `.cd-actions` 里常驻 5 个元素：编辑铅笔 · 皇冠 · 置顶/取消置顶 · 颜色点 · ⋯ | **只剩 ⋯ 一个按钮**；`.cd-actions { opacity: 1 }`（唯一入口不该靠 hover 才亮） |
| 皇冠 / 置顶状态靠按钮高亮（`.crown-on` / `.pin-on`） | 状态改由**菜单项颜色**表达（见 7C.2）；卡片上皇冠降为**只读标记** `.tag-crown` |
| 颜色点在最右上角 | 移入 meta 行（与日期同行），仍为只读 `.dot` |

**决策（可推翻）**：皇冠与颜色是「**状态**」而不是「动作」，所以没有一并塞进菜单 —— 塞进去会导致
「不打开菜单就不知道哪条戴了皇冠」。它们改成**只读标记**：`<span>`、无 hover、无 `role`，
明确不是按钮（避免 `UI-20` 的「看着能点其实不能点」）。若希望连标记也去掉，说一声即可。

### 7C.2 `UI-24` 菜单项的状态色

`ContextMenu` 的 `MenuItem` 新增 `active?: boolean`：

```tsx
{ label: c.pinned ? "取消置顶" : "置顶", active: c.pinned, ... }
{ label: c.crowned ? "取消皇冠" : "设为皇冠", active: c.crowned, ... }
```

渲染为 `.menu button.is-active`（朱砂字 `--cinnabar-deep` + `--cinnabar-tint` 底）并带
`aria-pressed="true"`。文案本身已经会切成「取消…」，颜色再确认一次「当前就是这个状态」。

### 7C.3 `UI-24` 信息行内联

| 情形 | 改前 | 改后 |
| --- | --- | --- |
| 天级 + 有具体时间 | 两行：`剩余 12 天` + 胶囊行 `还有 05:23:41` | **一行：`剩余 12 天 05:23:41`** |
| 天级 + 全天 | `剩余 12 天` | 不变 |
| 不足一天 | 大字 `剩余 05:23:41` | 不变 |
| 已过期 | `已过去 3 天` + `已过 02:11:05` | `已过去 3 天 02:11:05` |

- 内联时钟 `.cd-days .clock-inline`：`--font-num` + `tabular-nums` + `tnum`，`15px × --font-scale`，
  `--cinnabar-deep`，`margin-left: 6px`；`.cd-days` 是 `align-items: baseline`，所以与天数**共用基线**。
- 删掉的死代码：`.cd-clock` 及其 `.sep / .unit / .colon / .tick` 规则、`ClockLine` 组件、
  `CountdownPanel` 里的 `clockLine` 变量。
- 卡片因此**少一行**，垂直空间更紧凑（这也是诉求本身）。

### 7C.4 验收

- 不变量审计新增 2 条：`.cd-clock` 不得再出现在样式表里；「还有」不得再出现在卡片组件的（非注释）源码里；
  `.cd-days .clock-inline` 必须 `tabular-nums`；`cd-actions` 块内 `<button>` 必须只有 1 个；
  `.menu button.is-active` 与 `ContextMenu` 的 `active`/`aria-pressed` 必须存在。
- 新增 DOM 套件 `card.smoke.tsx`（16 项）：四种情形的信息行文案、无「还有」、无独立时钟行、
  「剩余」只出现一次、右上角单入口、内联时钟的 `title` 带完整信息。
- `crown.smoke.tsx` 相应改造为「走 ⋯ 菜单设冠/置顶」并断言 `is-active` 状态色。

---

## 8. 数据、迁移与备份（`DATA-06`）

### 8.1 Schema 变更

- 新增 `milestones` 表（§4.2）。**不改动** `countdowns` / `events` / `settings` 的任何列 → 无破坏性变更，可回滚到 v1.0.0 运行（旧版会忽略多出来的表）。

### 8.2 备份 / 导出 JSON

```json
{
  "version": 2,
  "exportedAt": "2026-10-02T12:00:00",
  "countdowns": [ ... ],
  "milestones": [ ... ],     // 新增
  "events": [ ... ],
  "settings": [ ... ]
}
```

- `version: 1 → 2`；老备份（version 1，无 `milestones`）仍可读，等价于「无里程碑」。
- 文件名与位置不变（`runningdo-backup-YYYYMMDD-HHMMSS.json`），`export_json` 里补一次 `list_milestones`。
- 恢复（`DATA-04`）本版不做，但**格式先定死**，v0.3 实现时不返工。

### 8.3 迁移安全

- v1.1 首次启动时（检测到 `milestones` 表不存在 → 即将建表），**自动导出一次备份**再建表。理由：这是本项目第一次「新增表 + 外键」，一旦迁移写到一半被强杀（本机昨天就发生过强杀留 WAL 的情况），有个 JSON 兜底。
- 迁移是幂等的：重复执行 `CREATE TABLE IF NOT EXISTS` 无副作用。

---

## 9. 测试计划与不变量

### 9.1 测试总量预估

| 层 | 现有 | v1.1 新增 | 合计 |
| --- | --- | --- | --- |
| 纯逻辑（`pnpm test`） | 35 | +6（完成度计算 3、字体/居中/夹取不变量 3） | 41 |
| DOM 冒烟（`pnpm smoke`） | 159 | +30（里程碑 20、倒计时抽屉 8、皇冠居中 2） | 189 |
| 数据层（`cargo test`） | 13 | +8（里程碑 CRUD 5、级联删除 1、备份含里程碑 1、老库升级 1） | 21 |
| **合计** | **207** | **+44** | **251** |

### 9.2 样式不变量审计（`src/styles/tokens.test.ts`）新增条目

1. `.crown-bar` 必须 `justify-content: center`，`.crown-time` 不得有 `margin-left: auto`。
2. `app.css` 内不得出现字面量 `font-family:`（除 `--font-*` 定义处）。
3. 不得出现 `font-weight: 700`。
4. 跳秒元素必须声明 `font-variant-numeric: tabular-nums`。
5. `.sidebar` 必须有 `calc(100% - 640px)` 的 `max-width` 夹取。
6. 不得出现 `<input type="checkbox">`。
7. 不得用 `opacity: 0` 覆盖层包原生表单控件（防止「点了没反应」复发）。
8. 里程碑渲染块不得引入第二个 `.panel` 泡（同泡原则的机器化约束）。

### 9.3 真机手工验收清单（jsdom 无法覆盖，必须在 debug bundle 里逐条过）

| # | 项 | 判定 |
| --- | --- | --- |
| 1 | 皇冠栏居中 | 窗口 1040/1240/1600 × 字号 4 档，内容组中心与栏中心偏差 ≤2px |
| 2 | 等宽数字 | `111111` 与 `888888` 渲染宽度相等（顶栏时钟、卡片大字、皇冠、滚轮） |
| 3 | 真实字重 | 500 与 600 在同处肉眼可辨（证明未合成） |
| 4 | 展开动画 | 22 帧内不抖、不裁切；4 档字号下高度都正确；`reduce` 模式下无动画 |
| 5 | 1040 最小窗口 | 无横向滚动；日历 ≥640px；里程碑行不换行错位 |
| 6 | 全屏 | 布局不拉稀；左栏不拉伸 |
| 7 | `Cmd +/-` | 布局不崩（或已禁用并提示） |
| 8 | 深浅色 / 托盘 | 模板图标正常 |
| 9 | 里程碑持久化 | 新增/勾选/删除后重启 App，状态与顺序一致 |
| 10 | 备份 | 导出 JSON 含 `milestones` 且 `version: 2` |

---

## 10. 交付顺序（建议）

| 阶段 | 内容 | 出口标准 |
| --- | --- | --- |
| **M1 · 视觉底座**（0.5–1 天） | 目标 3 字体统一 → 目标 4 比例 → 目标 1 皇冠居中 | 视觉基准稳定；不变量审计全绿；截图存档作为后续比对基线 |
| **M2 · 里程碑**（2–3 天） | `UI-20` 的自绘复选框/自绘下拉（先做）→ `CD-16` 数据层 + Rust 测试 → `CD-17/18` 卡片与里程碑 → `UI-15` 动效 | 里程碑全链路可用（增/勾/改/删/持久化/级联删除）；`pnpm check` 与 `cargo test` 全绿 |
| **M3 · 编辑抽屉**（1 天） | `UI-16/17` 新组件 + `Editor` 移除 + 交叉影响矩阵逐条回归 | 编辑入口全部指向抽屉；卡片点击只做展开；交叉矩阵每行有结论 |
| **M4 · 收口**（0.5–1 天） | `UI-20` 余下 P1/P2 项 → 备份版本 2 → 文档回写 → 真机手工清单 | §9.3 十项全过；`docs/v1/RELEASE-NOTES-v1.1.md` 成稿；版本号三处同步到 `1.1.0` |

---

## 11. 整体 DoD（v1.1 发布标准）

1. `pnpm check` + `cargo test` 全绿，测试数 ≥ **251**。
2. §9.3 真机清单 10 项逐条通过（含 4 档字号 × 3 种窗口宽）。
3. 老库自动升级无损：v1.0.0 的库直接打开，倒计时/事件/设置/皇冠全在，且自动生成一份迁移前备份。
4. `docs/v0/PRD.md`（新增 `CD-16/17/18`、`UI-14~20`、`DATA-06`）、`docs/v0/DESIGN.md`（字体 §3 改版、皇冠栏 §5.1b、卡片 §5.3、布局 §4.3）、`README.md`（功能清单 + 测试分布）、`docs/v1/RELEASE-NOTES-v1.1.md` 四份文档同步。
5. 版本号三处一致：`package.json` / `src-tauri/tauri.conf.json` / `src-tauri/Cargo.toml` = `1.1.0`。
6. 无新增「看起来能点但点不动」的元素（`UI-20` 口径）。

---

## 12. 决议（2026-10-02 已拍板：全部按推荐执行）

> 下表即为 **定稿决议**，不再变更。实施时以「决议」列为准；"理由"供后续回溯。

| # | 决议 | 理由 / 连带影响 |
| --- | --- | --- |
| Q1 | 皇冠栏：图标 + 标题 + 倒计时**整体居中**；「取消皇冠」绝对定位右端不参与居中 | ✅ M1 已实现（`.crown-main` + `justify-content:center` + `.crown-off{position:absolute}`） |
| Q2 | 保留 ⋯菜单「编辑」，**再加**一个铅笔图标按钮 | 两个入口都指向抽屉；铅笔按钮提升发现性 |
| Q3 | 里程碑**一次全量拉取**（`list_milestones()` 无参） | 自用规模小；折叠徽章 `CD-18` 才能实现 |
| Q4 | 展开**单选**（同一时刻只展开一张） | 左栏不会被多张展开的卡片撑爆 |
| Q5 | 展开态**不落库**，重启后全部折叠 | 不新增设置项（原计划的 `SET-13` 取消） |
| Q6 | 折叠态显示 `☑ 1/3` 徽章 | 否则看不出这条有里程碑；实现入 `CD-18` |
| Q7 | 复制倒计时**携带里程碑**，`done` 重置为 false | 便于把一条当成模板；需在 `duplicate` 分支里显式处理 |
| Q8 | **两个抽屉**（倒计时 + 事件）关闭按钮统一移到**左上角** | 同一位置只有一种习惯；`EventDrawer` 一并改 |
| Q9 | 宋体**完全清退**；`--font-serif` 保留为 `--font-ui` 别名一版，v1.2 删除 | ✅ M1 已实现；DESIGN §3 已重写 |
| Q10 | 卡片 `cursor: pointer` | 与 `role="button"` 语义一致；随 `UI-20` 一起改 |
| Q11 | 顶栏搜索框**保留外形**，点击给 Toast「搜索将在 v0.3 提供」 | 不新增未完功能；`disabled` → `readOnly` + 捕获点击 |
| Q12 | 里程碑删除**不弹确认**，Toast 提示 | 勾错可重加，确认弹窗反而碍事；撤销留 v1.2 |
| Q13 | 里程碑**拖拽排序 v1.1 不做** | 从 P2 移入「v1.2 候选」，本版只按创建顺序 |
| Q14 | **不做**「使用系统滚动条」设置项，只文档化差异 | 避免为一个系统偏好维护两套样式 |

### 12.1 由决议派生的确定项（写代码时直接照此办）

- 不新增 `SET-13`（展开态不落库，Q5）。
- `duplicate` 倒计时分支：拉取源条里程碑 → 逐条复制并 `done=false`、（Q7）`sort_order` 保留。
- `EventDrawer` 关闭按钮从 `.drawer-close{right:10px}` 改为左上（Q8），与 `CountdownDrawer` 同步。
- 搜索框改 `readOnly`（Q11），`onClick` → `Toast`，`cursor: not-allowed`，占位文案「搜索（开发中）」。

---

## 13. 影响文件清单（供开工前 review）

| 目标 | 新增 | 修改 |
| --- | --- | --- |
| 1 皇冠居中 | — | `src/components/CrownBar.tsx`、`src/styles/app.css` |
| 2 里程碑 | `src/components/Milestones.tsx`、`src/components/CountdownDrawer.tsx`、`src/__smoke__/milestones.smoke.tsx`、`src/__smoke__/drawer-countdown.smoke.tsx` | `src/components/CountdownPanel.tsx`（移除 `Editor`、加展开与里程碑区）、`src/store/useStore.ts`、`src/lib/api.ts`、`src-tauri/src/{db,models,commands,lib}.rs`、`src/styles/app.css`、`scripts/smoke-build.mjs`（新增两个入口） |
| 3 字体 | — | `src/styles/tokens.css`、`src/styles/app.css`、`src/styles/tokens.test.ts` |
| 4 比例 | — | `src/styles/tokens.css`、`src/styles/app.css`、`src/styles/tokens.test.ts` |
| 5 原生一致性 | `src/components/PopSelect.tsx`（自绘下拉，替代原生 `<select>` 覆盖层） | `src/components/TopBar.tsx`、`src/components/EventDrawer.tsx`、`src/components/SettingsPage.tsx`、`src/components/CountdownPanel.tsx`、`src/styles/app.css` |
| 数据 | — | `src-tauri/src/db.rs`（建表 + 迁移前自动备份）、`src-tauri/src/commands.rs`（`export_json` 含里程碑） |
| 文档 | `docs/v1/RELEASE-NOTES-v1.1.md`（M4 产出） | `docs/v0/PRD.md`、`docs/v0/DESIGN.md`、`README.md`、`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` |

> 本文件建立在**只读代码**的基础上：所有「现状」结论都有 `文件:行` 出处，`NSFontManager` 字重数据由本机实测（2026-10-02）。开工前若代码有变动，请以此表的出处为准重新核对。
