# ScholarFlow · 开发约定

## 1. 红线：PRD 内容不得超出用户输入

- **只写用户明确要求或明确确认过的内容**：需求、验收标准、字段、范围，都不能超出用户说过的范围。
- **禁止画蛇添足**：不要推断「用户大概还想要 X」就写成需求；不要为了文档完整而补路线图、待办池、可能性清单、优先级臆断；不要把「可以做的事」写成「要做的事」。
- 需要提建议时**在对话里说**，由用户决定是否立项；未被确认的一律不写入文档。
- 用户划掉的范围**整条移除**（编号登记为作废、不复用）；**已确认**的需求可以先立项写进需求表，实现后再补进 §5.0。
- **这条优先于本文件其他一切约定。**

## 2. 需求文档纪律（先读）

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

## 3. 工程约定

- 检查命令：`pnpm check`（tsc + 纯逻辑/样式单测 + DOM 冒烟）、`cargo test --manifest-path src-tauri/Cargo.toml`。
- 环境：非交互 shell 里 `pnpm` / `cargo` 不在 PATH。需前置
  `~/Development/node/nvm/versions/node/v24.16.0/bin` 与 `~/Development/rust/cargo/bin`，并设 `RUSTUP_HOME=~/Development/rust/rustup`。
  长任务（cargo 编译、全量检查）放后台写日志再轮询，不要卡住对话。
- 原生控件零容忍：不用原生 `date/time/checkbox/select`、不用 `window.confirm/alert/prompt`（wry 未实现 JS 对话框，会静默失败）。
- 浮层必须 `createPortal` 到 `document.body`；动效不得残留 `transform`（会成为 `fixed` 后代的包含块），不用 `grid-template-rows` 过渡（基线 macOS 11 / Safari 14）。
- 文字容器只用 `min-height`，每条 `font-size` 乘 `--font-scale` —— 有源码审计断言盯着，改动必须过 `pnpm test`。
- 判定「谁让位」要写死（flex/grid 不声明收缩就会一起变形）。

## 4. Git 分支规范（main / develop）

- 远程仓库：`git@github.com:Charlezk9/scholar-flow.git`，远程名 `origin`。
- `main`：稳定分支，只接收经过验证的 `develop` 合并；不直接进行日常开发。
- `develop`：默认开发分支，功能、修复和文档修改统一在此提交；采用两条长期分支，不要求额外 feature / release 分支。
- 开始工作前检查 `git status` 和当前分支；保留已有未提交改动。远程分支存在时先 fetch，再以 `pull --ff-only` 同步；出现分叉先检查差异。
- 提交保持单一目的，建议使用 `feat:`、`fix:`、`docs:`、`refactor:`、`chore:` 前缀；只暂存本次修改，不混入无关文件、密钥和构建产物。
- 发布前在 `develop` 完成相关检查（代码改动执行 `pnpm check`、`cargo test --manifest-path src-tauri/Cargo.toml`），并按文档纪律更新规格和发布记录。
- 发布时将 `develop` 通过 PR 或本地 `git merge --no-ff develop` 合入 `main`；随后将 `main` 合回 `develop` 并回到 `develop` 继续工作。发布标签使用 `vX.Y.Z`，仅在实际发布时创建。
- 不强推、不重写共享历史、不擅自删除分支；提交、推送、合并和发布按用户授权范围执行。

更名兼容：产品与构建名为 ScholarFlow；`com.charlezk9.runningdo`、`runningdo.db`、`~/.config/runningdo/` 和已有存储键保留，用于延续现有数据。
