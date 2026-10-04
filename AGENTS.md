# RunningDO · 开发约定

## 1. 需求文档纪律（最重要，先读）

**`docs/v0/PRD.md` 是唯一活规格**，完整规则见其 §0。四份文档分工：

| 文档 | 职责 |
| --- | --- |
| `docs/v0/PRD.md` | 需求：要什么 + 验收标准 + **§5.0 状态总览（唯一状态源）** |
| `docs/v0/DESIGN.md` | 视觉与组件规格 |
| `docs/v1/PLAN-v1.x.md` | 施工图：现状证据 + 实施 + 待拍板项（完成后只作历史，不再改） |
| `docs/v1/RELEASE-NOTES*.md` / `docs/DEVLOG.md` | 版本视角 / 过程视角 |

**硬性顺序：**

1. **先改 PRD** —— 新需求拿新 ID（模块前缀 + 序号，不与既有 ID 冲突）+ 写清需求与验收标准 + 登记 §5.0。**没有进 PRD 的需求不开工。**
2. 再写 `docs/v1/PLAN-v1.x.md` 施工图（现状证据用「文件:行」，列清待拍板项与其推荐值）。
3. 实现完成后**回写 PRD**：§5.0 状态改为「已实现 vX.Y」、更新文首「最后核对」（版本 + 日期），并同步 `DESIGN.md`。
4. 最后才写 `RELEASE-NOTES-vX.Y.md` 与 `DEVLOG.md`。

**不要**在 README / 发布说明 / 计划里另写一套「已完成 / 未完成」清单 —— 状态只在 PRD §5.0 维护，其他文档引用即可。
**不要**新建第二份 PRD（`docs/v2/PRD.md` 之类）；历史时点信息交给 PLAN 与 RELEASE-NOTES。
**不要**把需求绑到版本号上做规划（v0.2 / v0.3 就是这么废掉的，见 PRD §9）。

## 2. 工程约定

- 检查命令：`pnpm check`（tsc + 纯逻辑/样式单测 + DOM 冒烟）、`cargo test --manifest-path src-tauri/Cargo.toml`。
- 环境：非交互 shell 里 `pnpm` / `cargo` 不在 PATH。需前置
  `~/Development/node/nvm/versions/node/v24.16.0/bin` 与 `~/Development/rust/cargo/bin`，并设 `RUSTUP_HOME=~/Development/rust/rustup`。
  长任务（cargo 编译、全量检查）放后台写日志再轮询，不要卡住对话。
- 原生控件零容忍：不用原生 `date/time/checkbox/select`、不用 `window.confirm/alert/prompt`（wry 未实现 JS 对话框，会静默失败）。
- 浮层必须 `createPortal` 到 `document.body`；动效不得残留 `transform`（会成为 `fixed` 后代的包含块），不用 `grid-template-rows` 过渡（基线 macOS 11 / Safari 14）。
- 文字容器只用 `min-height`，每条 `font-size` 乘 `--font-scale` —— 有源码审计断言盯着，改动必须过 `pnpm test`。
- 判定「谁让位」要写死（flex/grid 不声明收缩就会一起变形）。
