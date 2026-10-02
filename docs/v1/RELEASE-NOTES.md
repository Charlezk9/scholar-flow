# RunningDO v1.0.0 发布说明

> 发布日期：2026-10-01 · 基线版本：0.1.0 · 平台：macOS（Apple Silicon / arm64）
>
> 一句话：**给"最重要那件事"一个固定位置，并且整个界面能按你眼睛舒服的大小来。**

---

## 1. 版本概览

| 项 | 值 |
| --- | --- |
| 版本号 | `1.0.0`（`package.json` / `tauri.conf.json` / `Cargo.toml` 三处同步） |
| 基线 | `0.1.0` |
| 需求增量 | `CD-15` 皇冠倒计时（P0）、`SET-12` 皇冠栏开关（P0）、`UI-13` 字号可调（P0） |
| 数据迁移 | 自动、幂等、无损（见 §5） |
| 测试 | 111 → **207** 项，全绿 |
| 破坏性变更 | **无**。老库直接升级，无需手工操作 |
| 为什么算 1.0 | 日常自用所需的功能已闭环：倒计时、日历四视图、农历/节气/节假日、皇冠、字号、菜单栏常驻。剩余的都是锦上添花（见 §9） |

---

## 2. 新增：皇冠倒计时（`CD-15`）

### 2.1 解决什么

`0.1.0` 里"置顶"只影响左栏列表顺序 —— 但如果你同时盯着 10 条倒计时，
**真正那件最重要的事**还是要在一列卡片里翻。置顶不够，因为它和别的卡片长得一样。

皇冠 = **全局唯一**的"最重要"，并且有一块**专属的位置** —— 标题栏正下方一整行，
不管你当前在月视图、周视图还是设置页，它都在。

### 2.2 长什么样

```
▎👑  期末考试                              剩余 12 天 05:32:11   ⊙
```

- 左侧 `3px` 朱砂竖线，像一枚书签
- **只有两样东西：标题 + 倒计时。**没有日期、没有进度条、没有备注、没有颜色点 —— 那些是卡片上的细节，皇冠栏不做
- 时间用 `font-variant-numeric: tabular-nums` + `white-space: nowrap`：
  **秒在跳，但整行宽度不抖**（普通数字 `1` 比 `8` 窄，不做等宽的话倒计时会左右抽动）

### 2.3 文案三态

| 情况 | 显示 |
| --- | --- |
| 还有多天 | `剩余 12 天 05:32:11` |
| 不足一天 | `剩余 05:32:11`（不显示「0 天」） |
| 已过期 | `已过去 3 天 02:11:05`，整行降到 60% 对比 |

### 2.4 取色与状态

| 状态 | 表现 |
| --- | --- |
| 默认 | 底 `--paper-panel`，时间 `--cinnabar-deep` |
| 目标日就是今天（`.is-today`） | 底色转 `--cinnabar-tint`（朱砂淡调） |
| 已过期（`.is-past`） | 整行 `opacity: .6`，时间转 `--ink-3` |

### 2.5 四条入口，全部可见

严格遵守 PRD「指针优先、不要求记忆快捷键」的约束，三条路径都能戴冠/摘冠：

| # | 入口 | 说明 |
| --- | --- | --- |
| 1 | **卡片上的皇冠按钮** | 和置顶按钮并排，戴冠时加 `.crown-on` 朱砂高亮。一次点击切换 |
| 2 | **卡片右键 / ⋯ 菜单** | 「设为皇冠 / 取消皇冠」，文案随状态切换 |
| 3 | **皇冠栏自身** | 点标题直接进入这条的编辑；右侧按钮取消皇冠 |
| 4 | **设置 → 显示 → 皇冠栏** | 开关 + 「当前皇冠：xxx」+ 取消按钮 |

### 2.6 什么时候整行消失

三种情况下**完全不渲染**（不留空白、不占高度）：

1. 还没设皇冠
2. 戴冠那条被**归档**了
3. 设置里关掉了 `SET-12`（「显示皇冠栏」）

### 2.7 唯一性

全库最多一行为 `crowned = 1`，两道保险：

- `set_crown(id)` 在**一个事务里**先 `UPDATE ... SET crowned = 0` 再设新的，中途失败自动回滚
- `save_countdown` 如果入参带了 `crowned: true`，写完也会清掉其他行

### 2.8 一个必须说明的设计取舍

`CountdownInput.crowned` 的类型是 **`Option<bool>`**，不是 `bool`。

原因：`0.1.0` 里「切换置顶」和「归档/恢复」都是走 `save_countdown` 把整条记录**整体覆写**的。
如果 `crowned` 是 `bool` 且带 `#[serde(default)]`，那么：

```ts
// 用户只是想置顶一下……
api.saveCountdown({ ...c, pinned: true })   // ← 没带 crowned
// → crowned 被默认成 false，皇冠莫名其妙没了
```

改成 `Option<bool>` 后语义是：

| 入参 | 行为 |
| --- | --- |
| `crowned: true` / `false` | 显式设置 |
| **省略（`None`）** | **保持原状，不动** |

所以"点一下置顶"、"归档"、"复制一份"都不会碰到皇冠。这条有专门的回归测试
（`crown_survives_partial_saves`），因为它属于"改的时候完全看不出来、上线后才被用户发现"的那类 bug。

---

## 3. 新增：界面字号可调（`UI-13`）

### 3.1 四档

| 档位 | `--font-scale` | 适用 |
| --- | --- | --- |
| 小 | 0.90 | 想在一屏里塞更多信息 |
| **标准** | **1.00** | 默认 |
| 大 | 1.15 | 更易读 |
| 特大 | 1.30 | 低视力友好 |

路径：**设置 → 显示 → 字号**。切换即时生效（整个应用就是预览），另附一块
`.font-preview` 局部预览（倒计时大字 / 标题 / 元信息 / 事件行四种典型字号）。
旁边有「恢复默认」，非默认档位时才可点。

### 3.2 核心难题：字号一变，页面就畸变

`0.1.0` 的样式里散落着 **84 处硬编码 `font-size: Npx`**，以及 **22 处"承载文字的固定高度"**，
比如 `.btn { height: 36px }`、`.weekday-row { height: 36px }`。

只要把字号调大 30%，`36px` 的按钮里塞 `13px × 1.3 = 16.9px` 的文字 —— 结果是
**文字被裁掉、行与行错位、栅格线和标签对不上**。这是"加个字号功能"真正的成本所在。

v1.0.0 用三条不变式解决（已写成自动化断言，见 §6）：

#### 不变式一：所有 `font-size` 必须乘 `--font-scale`

```css
/* ✗ 之前 */
.btn { font-size: 13px }
/* ✓ 现在 */
.btn { font-size: calc(13px * var(--font-scale)) }
```

组件里也不许写裸 `fontSize: 13`，统一走 `src/lib/fontScale.ts` 的 `fs()`：

```tsx
<span style={{ fontSize: fs(13) }}>   // → calc(13px * var(--font-scale))
```

`src/styles/tokens.test.ts` 会扫描 `app.css` 全部 `font-size` 与
`src/components/*.tsx` 全部 `fontSize:`，发现漏网的直接测试失败。

#### 不变式二：承载文字的容器只许 `min-height`，不许固定 `height`

```css
/* ✗ 文字变大了，容器还是 36px → 裁掉 */
.btn { height: 36px }
/* ✓ 容器跟着长，但不会缩到装不下 */
.btn { min-height: calc(36px + var(--fs-step) * 14px) }
```

`--fs-step: calc(var(--font-scale) - 1)`（标准档时恰好为 0，所以默认状态下像素与 0.1.0 完全一致）。
增量刻意取基础值的 **~40%** 而不是等比例 —— 按钮不需要跟字号一样长，否则大字号下界面会横向失控。

被改造的 23 处：`.topbar-date` `.search` `.ghost-btn` `.field/.input` `.picker` `.btn` `.btn-sm`
`.tag-today` `.segmented button` `.segmented.mini button` `.weekday-row` `.badge` `.badge-today`
`.span-bar` `.mini-grid .d` `.tg-head` `.tg-allday .line` `.allday-bar` `.drawer-head`
`.settings-nav button` `.menu button` `.pop-day` `.jump-wrap .picker`

#### 不变式三：CSS 与 JS 必须用**同一个取整后的像素值**

时间轴（周/日视图）和滚轮选择器的高度是 **JS 算出来的**，同时又由 CSS 控制布局。
两边各自算一遍 `44 * 1.15 = 50.6` 会得到不同的结果，累积 24 行就是几十像素的错位 ——
表现是**栅格线和事件块对不上**、**滚轮滚着滚着选中的值偏了**。

做法：JS 是唯一事实源，算完写回 CSS 变量。

```ts
// src/lib/fontScale.ts
export const hourHeight = (k: FontSizeKey) => Math.round(44 * fontScaleOf(k));
export const wheelHeight = (k: FontSizeKey) => Math.round(32 * fontScaleOf(k));

// src/store/useStore.ts · applyTheme()
root.style.setProperty("--hour-h", `${hourHeight(s.fontSize)}px`);
```

`WeekView.tsx` 和 `pickers.tsx` 都从同一个函数取值，且返回值保证是整数。
`fontScale.test.ts` 断言「行高始终是整数」「随档位单调递增」「与 CSS 基准值 44 / 32 同源」。

### 3.3 哪些尺寸跟着字号变，哪些刻意不变

**跟着变**（容器需要给文字让位）：

| Token | 公式 | 特大档 |
| --- | --- | --- |
| `--topbar-h` | `52px + step × 22px` | 58.6px |
| `--sidebar-w` | `340px + step × 110px` | 373px |
| `--drawer-w` | `480px + step × 150px` | 525px |
| `--settings-nav-w` | `200px + step × 60px` | 218px |
| `--row-h`（月视图行高） | `94px + step × 30px` | 103px |
| `--crown-h` | `38px + step × 16px` | 42.8px |
| `--hour-h` / `--wheel-h` | JS 写入 | 57px / 42px |
| 图标按钮容器、`.swatch`、`.box`、`.confirm-ic` 等 | `+ step × 40%` | — |

**刻意不变**（变了会造成整体位移感，反而不舒服）：

- 全部间距 token `--sp-1` … `--sp-6`
- `--gutter`（16px）
- 所有圆角 `--r-sm/md/lg`
- 装饰性伪元素、滚动条、`.dot` / `.bar` / `.switch` 等纯几何元素
- **lucide 图标的字形尺寸**（`<Crown size={14} />` 的 14），但图标**按钮的命中区域**会跟着放大

### 3.4 月视图：字大了就少显示几行，而不是硬裁

月视图格子高度有限。字号变大后如果还坚持显示 3 行事件，第 3 行必然被切掉一半。

```ts
// src/components/MonthView.tsx
function maxContentRows(fontSize: FontSizeKey): number {
  return fontScaleOf(fontSize) <= 1.05 ? 3 : 2;
}
```

lg / xl 档每格最多 2 行内容（节日名与跨日横条各占一行额度），不足的用 `+N` 提示 ——
**宁可少显示，也不显示半行被裁掉的字**。

### 3.5 滚轮选择器：切档后不会"选偏"

`pickers.tsx` 的 `Wheel` 有两个依赖字号的地方：
格高 `ITEM_H = wheelHeight(fontSize)`，以及挂载后定位到当前值 `el.scrollTop = i * ITEM_H`。

字号在浮层打开期间变化时，格高会变 —— 如果不重新定位，滚动位置对应的值就错了。
所以定位逻辑的 `useLayoutEffect` 依赖 `[ITEM_H]`，字号一变就按**新的格高**重新对齐到同一个值。
`font.smoke.tsx` 断言：「切到特大档后格高跟着变大」「切档后仍停在同一个值（9 点），没有选中错位」
「切档不会改变已选值」。

---

## 4. 修复与加固

| 项 | 说明 |
| --- | --- |
| `ContextMenu` 新增 `hidden` 支持 | 菜单项可以按条件隐藏（归档项不出现皇冠入口）。渲染时先 `filter`，避免出现空的分隔线 |
| `CD_COLS` / `cd_from_row` 抽取 | `db.rs` 里 countdowns 的列顺序原本在两个地方各写一遍、下标各数一遍。加一列就要同步改 6 个地方。现在抽成**唯一的列清单常量 + 唯一的行映射函数**，下标只有一处 |
| 月视图 `minmax(94px, 1fr)` → `minmax(var(--row-h), 1fr)` | 行高最小值的魔法数字进 token |
| 12 处内联 `fontSize` 全部改走 `fs()` | 内联样式不受 CSS 审计覆盖，是最容易漏的一类 |

---

## 5. 数据与兼容性

### 5.1 Schema 变更

`countdowns` 表新增一列：

```sql
crowned  INTEGER NOT NULL DEFAULT 0
```

### 5.2 老库自动升级

走既有的 `ensure_column`（`PRAGMA table_info` 检查列是否存在，缺了才 `ALTER TABLE ADD COLUMN`），
**幂等**，重复启动不会报错。

在真实机器上实测过：

```
升级前：id title target_date target_time start_date note color pinned
        show_on_calendar repeat_rule archived remind_days created_at updated_at
升级后：…… crowned          ← 追加在末尾，旧数据行数/内容不变
```

`cargo test` 里有一条专门的回归测试 `migrates_old_db_without_crowned_column`：
手工搓一个**不含 `crowned` 列的 v0.1 初版表结构**、写入数据、用新代码打开，
断言「旧数据没丢」「旧的 `pinned` 状态保留」「补的列默认为 0」「补的列能正常使用」。

### 5.3 备份与导出

`export_json` 读的是 `list_countdowns()`，因此 **JSON 备份自动包含皇冠状态**，
无需改动备份格式。

### 5.4 设置项

新增持久化 key：

| key | 类型 | 默认 |
| --- | --- | --- |
| `showCrownBar` | `"true"` / `"false"` | `true` |
| `fontSize` | `"sm"` / `"md"` / `"lg"` / `"xl"` | `"md"` |

两者都不存在时按默认值走，老库升级后行为与 0.1.0 一致（皇冠栏因为没人戴冠而不显示，字号为标准档）。

### 5.5 Tauri 命令

新增一个：

```
set_crown(id: Option<String>) -> Result<(), String>
```

传 `null` / 空串 = 取消。指定的 id 不存在时返回错误，且**事务回滚不留下半截状态**
（测试 `set_crown_unknown_id_errors`）。

---

## 6. 测试

从 **111 → 207** 项，全部通过。

| 层 | 命令 | 条数 | 本版新增覆盖 |
| --- | --- | --- | --- |
| 类型检查 | `pnpm typecheck` | — | — |
| 倒计时计算 | `pnpm test` | 11 | — |
| 字号档位 | `pnpm test` | 10 | 四档单调递增、行高必须为整数、与 CSS 基准值 44/32 同源、非法值安全回退 |
| **样式不变量** | `pnpm test` | 14 | 全部 `font-size` 都乘 `--font-scale`；23 个文字容器只用 `min-height`；间距 token 不缩放；组件里不许出现裸 `fontSize: 数字`；皇冠栏高度走 `--crown-h` 且非固定；倒计时用 `tabular-nums` |
| 选择器交互 | `pnpm smoke` | 44 | — |
| 删除链路 | `pnpm smoke` | 26 | — |
| 抽屉浮层 | `pnpm smoke` | 24 | — |
| 字号缩放 | `pnpm smoke` | 25 | 切档后滚轮格高与定位同步、设置页四档即时生效、预览四要素、恢复默认、持久化 |
| **皇冠栏** | `pnpm smoke` | 40 | 唯一性、三种显隐条件、文案三态、点/菜单/设置三条入口、归档让位、`hidden` 菜单项、持久化 |
| 数据层 | `cargo test` | 13 | 皇冠全局唯一、排序置顶、partial save 不丢冠、save 带冠也互斥、未知 id 报错、重开后仍在、**老库无 `crowned` 列升级** |
| **合计** | `pnpm check` | **207** | |

### 值得单独说的三条断言

1. **样式不变量测试会读源码**。它用正则解析 `app.css` 的规则块 + 扫描
   `src/components/*.tsx`，而不是渲染后断言 —— 因为"某个字号没跟着缩放"
   只有在**逐条列出全文件**时才能发现，靠人工 review 必漏。
2. **`fs()` 的 import 也测**。用了 `fs()` 但忘了 import 会直接编译失败，
   但改了 import 源（比如从 `../lib/date` 拿）不会 —— 断言统一从 `../lib/fontScale` 引入。
3. **皇冠的文案函数是纯函数**。`crownText(r)` 独立于组件，
   所以三态文案能用普通的单元测试覆盖，不需要起 DOM。

---

## 7. 升级方式

自用场景，直接重新构建即可，数据库原地升级：

```bash
pnpm check                                          # 207 项，应全绿
pnpm tauri build --debug                            # 打包
open src-tauri/target/debug/bundle/macos/RunningDO.app
```

首次打开 v1.0.0 时，`ensure_column` 会给现有 `runningdo.db` 补上 `crowned` 列。
如果担心，先备份：

```bash
# 应用内：设置 → 数据 → 立即备份（写 runningdo-backup-YYYYMMDD-HHMMSS.json）
# 或手工：
cp ~/Library/Application\ Support/com.charlezk9.runningdo/runningdo.db ~/Desktop/
```

**回滚**：v1.0.0 的 DB 对 0.1.0 是向后兼容的（多一列，0.1.0 的
`SELECT` 会忽略它），直接换回旧的可执行文件即可。

---

## 8. 新增文件

```
src/lib/fontScale.ts              字号档位、hourHeight/wheelHeight、fs() helper
src/lib/fontScale.test.ts         10 条档位与取整测试
src/styles/tokens.test.ts         14 条样式不变量审计
src/components/CrownBar.tsx       皇冠栏 + crownText() + useCrown()
src/__smoke__/font.smoke.tsx      25 条字号 DOM 行为测试
src/__smoke__/crown.smoke.tsx     40 条皇冠 DOM 行为测试
docs/v1/RELEASE-NOTES.md          本文件
```

## 9. 已知限制与后续

### 本版明确不做

- 皇冠栏**不支持多条**（就是"唯一"这个设计本身）
- 皇冠栏**不显示细节**（日期/进度/备注），这是需求决定的，不是没做完
- 皇冠栏**不做拖拽排序**（只有一条，无意义）

### 后续版本

| 版本 | 内容 |
| --- | --- |
| v0.2 待办 | 系统通知与提醒触发（`NT-01~04`，`remind_minutes` 已落库但不触发）、开机自启（`MAC-05`，`SMAppService`）、拖拽改期 UI（`CAL-14/15`，数据层 `move_event` 已就绪）、事件重复规则（`EV-09`） |
| v0.3 待办 | 从 JSON 恢复（`DATA-04`）、搜索（`CD-13` / `EV-11`）、菜单栏显示倒计时文字（`SET-10`） |
| 远期 | 农历重复倒计时（`LN-09`）、置顶小窗（`CD-14`） |

### 永久不做

对外分发、公证、自动更新、`.ics`、多语言、Windows / Linux / 移动端。

---

## 10. 相关文档

| 文档 | 位置 |
| --- | --- |
| 产品需求（含本版 `CD-15` / `SET-12`） | [`docs/v0/PRD.md`](../v0/PRD.md) |
| 设计规范（含本版 §5.1b 皇冠栏组件规格） | [`docs/v0/DESIGN.md`](../v0/DESIGN.md) |
| 设计参考图 | `docs/ref-img/` |
| 运行与测试说明 | [`README.md`](../../README.md) |
