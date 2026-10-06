# PLAN v1.4 · 文献模块开发与修订记录（v1.4.0–v1.4.2）

> 合并日期：2026-10-05。按用户要求将 v1.4 系列 15 份施工图合并；原决议、现状证据和验证记录保留。
> 需求与当前实现状态唯一来源：[PRD §5.0 / §5.2c](../v0/PRD.md)。各章中的推荐、范围和文件行号属于记录时点；后续用户确认的修订覆盖早期方案。
> 章节内保留原来的 § 编号，引用以所属章为范围。初始章“不做翻译”等早期边界已被后续明确需求修订，不作为当前限制。

## 目录

- [A. 初始文献模块与立项决议](#initial)
- [B. 阅读工作台布局](#reader)
- [C. 原生附件选择](#file-picker)
- [D. 阅读、公式与自动整理修订](#reading-revision)
- [E. 单一 Markdown 入口](#single-markdown)
- [F. 资料库文字溢出修复](#sidebar-overflow)
- [G. 资源管理器布局](#explorer)
- [H. 阅读控件与详情交互](#interactions)
- [I. 附件文件行与移动卡](#move)
- [J. 详情间距及读取反馈](#spacing)
- [K. 资料库管理、定位与浏览记忆](#library)
- [L. 父目录累计计数](#folder-count)
- [M. 中文翻译与对照阅读](#translation)
- [N. 翻译入口位置调整](#translation-button)
- [O. 翻译超时与断点续译](#translation-timeout)

---

<a id="initial"></a>
## A. 初始文献模块与立项决议

> 版本：v1.4 施工图 · 编写日期 2026-10-04 · 基线 v1.3.0
> 前置：[PRD §5.2c](../v0/PRD.md) 的 `LIT-01`（顶栏第四页「文献」）已立项
> 状态：**§3 的 12 项决议已拍板；实现状态唯一来源为 PRD §5.0**

---

<a id="initial-0-这份文档是什么"></a>
### 0. 这份文档是什么

- **是**：v1.4 的施工图 —— 现状证据、决策清单、数据模型、命令清单、实施顺序、验收标准。
- **不是**：PRD 的替代。v1.4 新增需求沿用 PRD 的 ID 体系；**拍板后先回写 PRD（新增 `LIT-*` 需求 + 验收标准 + §5.0 登记），再动代码**（规则见 PRD §0.2、`AGENTS.md` §1/§2）。
- 本文档里的「推荐」都只是推荐，不代表已确认；未经用户确认的内容不写入 PRD。

---

<a id="initial-1-范围"></a>
### 1. 范围

<a id="initial-11-用户已确认原话"></a>
#### 1.1 用户已确认（原话）

| # | 确认内容 |
| --- | --- |
| 1 | 顶栏加第四页「文献」（PRD `LIT-01` 已登记） |
| 2 | 能分层次管理文献：新建文件夹与子文件夹 |
| 3 | 文献分类别：论文、教材、杂志等 |
| 4 | PDF 提供最简单的显示即可；能兼容 docx / pptx 更好（不强求） |
| 5 | **论文是重点**：实现 PDF → Markdown 提取；既可读原文，也可读提取后的 Markdown；Markdown 也为后续翻译铺路 |
| 6 | 不实现复杂的 PDF 功能 |
| 7 | 允许调用**付费云模型**（例：GLM-5.3-Flash 等）——「能花钱解决的问题就不是问题」 |
| 8 | 应用定位扩展为「覆盖科研学习需求的多内容应用」，应用名保留 RunningDO |

<a id="initial-12-明确不做v14待你确认"></a>
#### 1.2 明确不做（v1.4，待你确认）

- 内置 PDF 标注 / 高亮 / 批注 / 手写签名；PDF 编辑与合并
- 在线文献同步、多设备、协作、分享
- 翻译功能本体（只保证 Markdown 产物可直接喂给翻译；见 §3 Q9）
- 元数据联网检索（DOI / Crossref / Google Scholar 抓取；见 §3 Q10）

---

<a id="initial-2-现状证据改动前先记档"></a>
### 2. 现状证据（改动前先记档）

<a id="initial-21-runningdo-现状"></a>
#### 2.1 RunningDO 现状

| 项 | 证据 |
| --- | --- |
| 页面容器 | `src/components/TopBar.tsx:66-82` 三个页面按钮；`src/App.tsx:107-115` 三元分支；store 的 `page: "calendar"｜"agenda"｜"settings"`（`src/store/useStore.ts:161`） |
| 布局约定 | 日历页 = 左栏 372px + 日历区；议程页 / 设置页 = 整页（`src/App.tsx`） |
| 数据层 | SQLite 7 张表；`src-tauri/src/db.rs` 负责建表 / 迁移 / CRUD / 备份；备份 `version: 4` |
| 迁移纪律 | 迁移前自动落 JSON 兜底备份，失败即停止升级（`db.rs:229-258`） |
| 文件系统 | **当前无任何文件访问**：`src-tauri/capabilities/default.json` 只开 `core:default`；`Cargo.toml` 无 dialog / fs / opener 插件 |
| 网络 | **当前无任何网络请求**（离线是既有原则，见 PRD §2「本地优先」） |
| 测试基线 | `pnpm check` 76 + 365 全绿；`cargo test` 32 全绿（2026-10-04 实跑，见 §8） |

<a id="initial-22-参照物scholarflowprojectsmyospsscholarflow"></a>
#### 2.2 参照物：ScholarFlow（`~/Projects/MyOSPs/ScholarFlow`）

| 项 | 他们的做法 | 可借鉴点 |
| --- | --- | --- |
| 文献表 | `papers(id, title, file_path UNIQUE, file_name, page_count, reading_status, file_size, checksum, original_file_path, missing_status, category_key)` | 文件指纹 + 丢失检测 + 原始路径留档 |
| 分类 | `library_categories(key PK, title, parent_key 自引用, sort_order)` + `papers.category_key` | **单亲树（一对一位置）**，外键 `ON DELETE CASCADE` |
| 文件策略 | 拷贝进数据目录：`store/admin/files/papers/<id>/1706.03762v7.pdf` | 拷贝入库，不依赖原路径 |
| 提取管线 | `src-tauri/src/pdf2md/`：`extractor`（PDFium 文本 + 坐标）→ `layout`（Span→Line→Paragraph→Block 四层 + 标题分类 + 阅读顺序）→ `ir`（中间表示）→ `renderer`（Markdown）→ `cache`（sha256 键）；约 2.1k 行 Rust | **可整段移植**，是「本地快线」的现成实现 |
| PDF 显示 | 前端 `pdfjs-dist@5.4.394`（canvas + text layer，已定义标注类型）+ 原生 `<iframe>` 兜底（`PaperReaderView.vue:1083`） | **两级策略**：可控渲染 + 最低成本降级 |
| 暴露命令 | `list_papers / get_paper / read_paper_pdf / import_pdf / list_categories / create_category / rename_category / update_paper_category / parse_pdf_to_ir / export_pdf_to_markdown / get_cached_parsed_document / get_pdf2md_cache_stats` | 命令划分可直接参考 |
| 依赖代价 | `pdfium-render 0.9.2`，运行需要 `libpdfium.dylib`（环境变量 `SCHOLARFLOW_PDFIUM_PATH` 或项目内 `pdfium/`） | **本机目前没有该 dylib**（2026-10-04 探查），是 v1.4 必须先解决的前置 |
| 实测样本 | 只跑过 1 篇（`1706.03762` Attention） | 样本不足，v1.4 要补中文 / 扫描件 / 公式密集样本 |

<a id="initial-23-本机环境与测试素材"></a>
#### 2.3 本机环境与测试素材

| 项 | 状态 |
| --- | --- |
| conda | Miniforge3 在 `~/Development/conda/miniforge3`，`.condarc` 用清华镜像；非交互 shell 需 `export CONDARC=~/Development/conda/.condarc` |
| **v1.4 专用环境** | **`/Users/charlezk9/Projects/MyOSPs/RunningDO/.conda/lit`（conda，Python 3.12.14，按用户要求放在本目录）**；已装 `httpx / python-dotenv / rich / tenacity / pymupdf / pypdf / pypdfium2 / pdfplumber / markitdown[pdf,docx,pptx] / openai / pillow`；已登记进 `~/Development/manifest/inventory.json` |
| 未安装 | `mineru` / `marker` / `docling` / `ollama` / `pdftotext`（都要另装，命令见 §8.3） |
| 测试论文 | `docs/test/attention-is-all-you-need.pdf`（2.2 MB / 15 页 / 39,498 字符 / `(cid:)` 残留 0）——英文双栏 + 公式密集，是合格试金石 |
| 待补样本 | 中文论文、扫描件（无文本层）、docx / pptx 各一份（需你提供，或由我在 M0 用公开材料补齐） |

<a id="initial-24-引擎候选与今日核实的计价2026-10-04-检索"></a>
#### 2.4 引擎候选与今日核实的计价（2026-10-04 检索）

| 引擎 | 类型 | 计价 | 15 页论文成本 | 强项 | 风险 |
| --- | --- | --- | --- | --- | --- |
| **GLM-OCR**（0.9B, MIT 权重） | 云 + 可本地 | **$0.03 / M tokens（输入输出同价）** | ≈ $0.001–0.01 | 版面 / 表格 / 公式 / 印章；单图 ≤10 MB | 需本地部署时另装运行时 |
| **GLM-5.3-Flash** | 云（原生多模态，1M 上下文，支持 File 输入） | $0.15 / M 输入，$0.50 / M 输出，缓存输入 $0.03 | ≈ $0.01–0.05 | **可整篇一次转换**（跨页表格 / 参考文献友好）；同一模型还能做翻译与整理 | 输出较慢于专用 OCR |
| **Mistral OCR 4.x** | 云 | **$4 / 千页**（批量 $2） | ≈ $0.06 | 170 语言、块级 bbox + 置信度 | 中文非强项 |
| **Mathpix** | 云 | $0.005 / 页（量大有 $0.0035） | ≈ $0.075 | **公式最强**，PDF/DOCX/PPTX → Markdown/LaTeX；Files API 批量 | 最贵的一档（但仍便宜） |
| MinerU | 本地 | 免费（算力自付） | 电费 | 中文 + 公式开源第一梯队；Apple Silicon 有 MPS 与 MLX 后端（最低 6 GB） | macOS 上有已报的 MLX 崩溃 bug |
| docling（IBM, MIT） | 本地 | 免费 | 电费 | PDF **+ DOCX/PPTX/XLSX** 统一转 Markdown；CPU 可跑 | 复杂公式 / 扫描件弱于 MinerU |
| **内建快线**（PDFium / PyMuPDF 文本层 + 版面启发式） | 内置 | 0 | 0 | 秒级、完全离线 | 公式 / 表格 / 双栏弱；扫描件无解 |

**结论**：对个人文献库（假设 1000 篇 × 15 页）来说，云侧总成本在 **$1–$80** 区间 —— 属于「可以忽略」。因此**质量优先、云为默认、本地为降级**是合理路线（见 §3 Q4）。


**2026-10-04 真实云验收（一页起步）**：样本 `docs/test/attention-is-all-you-need.pdf` 第 1 页，200 DPI，`glm-5.3-flash`，智谱中国端点。输出 2,735 字符，API 等待 11.719 s、端到端 11.912 s，输入 4,981 tokens、输出 695 tokens。当前中国端点官方价目为输入 ¥0.8/M、输出 ¥2.8/M（[官方原文](https://docs.bigmodel.cn/cn/guide/start/pricing.md)），无缓存优惠估算 **¥0.0059308**；这是 token 估算，未读取账户实际账单。上表美元价来自国际端点，不能直接作为本次人民币账单。

质量核对：标题与 Abstract 层级正确，摘要完整，作者及机构、脚注和会议行保留；无 `(cid:)` 残留。页边的许可提示与 arXiv 标记未保留，不能据此宣称逐字无损。第一页无公式／表格／参考文献，这三项记为「未覆盖」，未把单页结果外推为整篇质量。返回的建议元数据含准确标题及 NIPS 2017 会议信息，DOI 不确定时为空。原始结果与用量留档于 `docs/test/v1.4/glm-page1.*`。

首次请求因模型不允许关闭思考返回 400；修正为 `thinking.type=enabled`、`reasoning_effort=low` 后成功。密钥只从环境变量或 `~/.config/runningdo/secrets.env` 读取，不下发前端。原仓库 `.env` 未入 Git。

---

<a id="initial-3-待拍板决议12-项已全部拍板2026-10-04全部取推荐方案-a"></a>
### 3. 待拍板决议（12 项）——**已全部拍板（2026-10-04），全部取推荐方案 A**

> 用户裁定：`Q1A; Q2A; Q3A; Q4A; Q5A; Q6A; Q7A; Q8A; Q9A; Q10A; Q11A; Q12A`。
> **Q10 附加要求：联网（云引擎）环境下，要求模型在提取时一并返回标题与期刊/会议信息** —— 即建议元数据里必须包含 `title` 与 `venue`（并顺带 authors / year / doi）。
> 以下表格里的「推荐」列即已生效的决议；「备选」列仅作历史保留。

<a id="initial-q1-分类模型单亲树-vs-多集合"></a>
#### Q1 分类模型：单亲树 vs 多集合

| 方案 | 说明 | 影响 |
| --- | --- | --- |
| **A 单亲树（推荐）** | 一条文献只属于一个文件夹；跨类需求交给标签 | 语义直白、移动唯一；ScholarFlow 已验证 |
| B Zotero 式多集合 | 一条可同时属于多个集合 | 需要「加入 / 移除」与「移动」两套语义，UI 与测试复杂度翻倍 |

<a id="initial-q2-是否引入标签"></a>
#### Q2 是否引入标签

| 方案 | 说明 |
| --- | --- |
| **A 引入（推荐）** | 与文件夹正交：文件夹管「位置」，标签管「主题 / 状态 / 方法」；成本 = 一张 `tags` + 一张关联表 |
| B 不引入 | 只靠文件夹，检索手段单一 |

<a id="initial-q3-pdf-显示方案"></a>
#### Q3 PDF 显示方案

| 方案 | 代价 | 能力 |
| --- | --- | --- |
| **A PDF.js canvas + 文本层，原生 `<iframe>` 兜底（推荐）** | 前端 +`pdfjs-dist`（约 1–2 MB） | 可控（跳页、缩放、选中复制、未来标注）；ScholarFlow 已跑通 |
| B 只用原生 `<iframe>`（WebKit 内置查看器） | 几乎零成本 | 无控制力，谈不上将来做标注 |
| C macOS PDFKit 原生嵌入 | 需 objc 绑定 | 最「原生」，但与纸张风格协调成本高 |

<a id="initial-q4-提取引擎的默认路线"></a>
#### Q4 提取引擎的默认路线

| 方案 | 说明 |
| --- | --- |
| **A 云优先 + 本地降级（推荐）** | 默认用云 OCR（GLM-OCR / Mistral OCR）出高质量 Markdown；无网或未配密钥时退到内建快线（秒级、离线、质量一般） |
| B 只做内建快线 | 零成本、零依赖，但公式 / 表格 / 双栏质量不足以支撑「读提取稿」 |
| C 只做云 | 简单，但没有离线路径，且断网即不可用 |


**本轮落实与验收**：主入口先判断是否已配密钥；已配时云优先，首次询问页面上传至智谱并记住同意；未配或云失败时使用本地快线，明确提示降级。另保留手选两条路线。单页真实结果见 §2.4，当前云脚本仍为逐页串行，逐页并发／失败页续传未通过本轮验收，不宣称 Q5 已实现。公式／表格页及整篇云耗时尚无真实测量。

<a id="initial-q5-整篇一次转换-vs-逐页并发"></a>
#### Q5 整篇一次转换 vs 逐页并发

| 方案 | 说明 |
| --- | --- |
| **A 逐页并发（推荐）** | 页面 → 图片（200 DPI）→ 并发请求 → 按页码合并；单页失败可重试、可对齐页码、成本可控、可中断续传 |
| B 整篇一次（GLM-5.3-Flash 的 File 输入 + 1M 上下文） | 跨页结构（长表格、参考文献）更连贯、请求数最少；但单次失败代价高、超长文档可能超限 |
| C 两者都做（A 默认，B 作为「论文模式」可选） | 工作量最大，但按你的「论文是重点」定位，值得留接口 |

<a id="initial-q6-云引擎与密钥管理"></a>
#### Q6 云引擎与密钥管理

| 项 | 推荐 |
| --- | --- |
| 是否允许联网 | **允许**（用户已表态；这是 PRD §2「本地优先」的**显式例外**，需在 PRD 里写清） |
| 上传前提示 | 必须：首次云端提取时明确告知「会把页面图像上传到 X 服务」，并记住选择 |
| 密钥位置 | `~/.config/runningdo/secrets.env`（chmod 600）+ 环境变量覆盖；**绝不进入仓库、绝不下发前端**（`AGENTS.md` 已有「No secrets in frontend」同源规矩） |
| 成本记录 | 每次提取记录引擎、页数、token 用量与估算费用，写进 `paper_extracts.meta`，设置页可看累计 |
| 引擎切换 | 转换器配置化（命令模板 / HTTP 端点 / 内置），换引擎不需要改代码 |

<a id="initial-q7-文件策略"></a>
#### Q7 文件策略

| 方案 | 说明 |
| --- | --- |
| **A 拷贝进数据目录（推荐）** | `files/papers/<id>/<原名>.pdf`；原路径与 sha256 记档，缺失可检测；ScholarFlow 已验证 |
| B 只引用原路径 | 省磁盘，但文件一移动就废；个人文献库最怕这个 |

<a id="initial-q8-docx--pptx-支持路径"></a>
#### Q8 docx / pptx 支持路径

| 方案 | 说明 |
| --- | --- |
| **A 转 Markdown 后阅读（推荐）** | 用 `markitdown`（已装，本地、轻）或 docling；**不做原生渲染** |
| B 原生渲染 | macOS 需要 Office 预览插件，成本高、收益低 |
| C 不做 | 与「能兼容更好」的期望不符，但最省事 |

<a id="initial-q9-翻译后续功能的前置设计"></a>
#### Q9 翻译（后续功能的前置设计）

| 方案 | 说明 |
| --- | --- |
| **A v1.4 不做，但产物按可翻译分块输出（推荐）** | Markdown 按标题分块 + 公式/引用保护标记 + 段落 id；将来接翻译只做「读块 → 写块」 |
| B 顺手在提取时翻译 | 一次请求两件事，省事但难以校对；且翻译质量与提取质量耦合，出错不好定位 |

<a id="initial-q10-元数据获取已拍板a--附加要求"></a>
#### Q10 元数据获取（已拍板：A + 附加要求）

| 方案 | 说明 |
| --- | --- |
| **A 不做联网检索（已拍板）**，但从提取结果里**顺带抽取**标题 / 作者 / 年份 / DOI 作为「建议值」，用户一键采纳（零额外请求） | **附加要求：云引擎提取时必须返回 `title` 与 `venue`（期刊/会议）** —— 写进提示词与 `paper_extracts.meta.suggested`，前端展示为可一键采纳的建议值 |
| B 接 Crossref / DOI 抓取 | 仍不做（需要额外联网 + 去重逻辑） |

<a id="initial-q11-libpdfiumdylib-的获取方式若采用内建快线"></a>
#### Q11 `libpdfium.dylib` 的获取方式（若采用内建快线）

| 方案 | 说明 |
| --- | --- |
| **A 随包 vendor（推荐）** | 把 `libpdfium.dylib`（约 15 MB）放进 `src-tauri/resources/`，随 `.app` 分发；用户零配置 |
| B 用户自备 + 环境变量（ScholarFlow 做法） | 零仓库体积，但要手动下载，换机器容易忘 |
| C 不用 PDFium | 改用 **PyMuPDF / pypdfium2（已在 `.conda/lit` 里）** 或 macOS PDFKit；把「快线」整体放到 Python 侧执行 |

> 注：`pypdfium2` 已经在 v1.4 环境里了 —— 如果快线走 Python 侧，**这条依赖问题可以整体绕开**（代价是多一次进程调用）。

<a id="initial-q12-测试素材是否入库"></a>
#### Q12 测试素材是否入库

| 方案 | 说明 |
| --- | --- |
| **A 入库（推荐）** | `docs/test/` 目前未纳入 git（`?? docs/test/`）；2.2 MB，作为提取质量的固定基准值得留下 |
| B 不入库 | 仓库更干净，但每次验证都要另找样本 |

---

<a id="initial-4-技术方案拍板后细化"></a>
### 4. 技术方案（拍板后细化）

<a id="initial-41-数据模型草案迁移--备份-version-5"></a>
#### 4.1 数据模型（草案，迁移 → 备份 `version: 5`）

```sql
-- 资料库：文件夹树（单亲 + 排序）
library_nodes(
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES library_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- 文献条目
papers(
  id TEXT PRIMARY KEY,
  node_id TEXT REFERENCES library_nodes(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,              -- paper | textbook | magazine | other
  title TEXT NOT NULL,
  authors TEXT, year INTEGER, venue TEXT,
  doi TEXT, url TEXT,
  status TEXT NOT NULL DEFAULT 'unread',   -- unread | reading | read
  note TEXT,                        -- 用户笔记（纯文本，沿用议程正文的克制风格）
  extra TEXT,                       -- JSON：类型专属字段（ISBN / 版次 / 期号 / 摘要 …）
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);

-- 文件（一篇可多份：正文 / 补充材料 / 幻灯片）
paper_files(
  id TEXT PRIMARY KEY,
  paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  role TEXT NOT NULL,               -- main | supplement | slides | other
  original_path TEXT,               -- 导入前的原路径（留档）
  rel_path TEXT NOT NULL,           -- files/papers/<paper_id>/xxx.pdf
  size INTEGER, sha256 TEXT, missing INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- 提取产物（多引擎、多版本并存，永不覆盖）
paper_extracts(
  id TEXT PRIMARY KEY,
  paper_id TEXT REFERENCES papers(id) ON DELETE CASCADE,
  file_id TEXT REFERENCES paper_files(id) ON DELETE CASCADE,
  engine TEXT NOT NULL,             -- builtin-fast | glm-ocr | glm-5.3-flash | mistral-ocr | markitdown | ...
  engine_version TEXT,
  source_sha256 TEXT,
  rel_path TEXT NOT NULL,           -- files/papers/<id>/extract/<engine>.md
  status TEXT NOT NULL,             -- queued | running | done | failed
  pages INTEGER, chars INTEGER,
  quality TEXT,                     -- JSON：质量检测指标
  meta TEXT,                        -- JSON：耗时 / token / 费用估算
  created_at TEXT NOT NULL
);

-- 标签（可选，Q2 决定）
tags(id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT);
paper_tags(paper_id, tag_id, PRIMARY KEY(paper_id, tag_id));
```

**备份策略（DATA-08）**：JSON 备份升 `version: 5`，包含上述全部**元数据**；**不含二进制**（PDF / 图片 / Markdown 产物），并在设置页写清「附件目录需另行拷贝」。迁移前兜底备份沿用 `db.rs` 既有机制。

<a id="initial-42-命令清单rust-侧草案"></a>
#### 4.2 命令清单（Rust 侧，草案）

| 分组 | 命令 |
| --- | --- |
| 树 | `list_library_nodes` / `create_library_node` / `rename_library_node` / `move_library_node` / `delete_library_node`（级联或提示） |
| 条目 | `list_papers(node_id?, query?)` / `save_paper` / `delete_paper` / `duplicate_paper`? |
| 文件 | `import_paper_file(paper_id, src_path)`（拷贝 + sha256 + 去重）/ `read_paper_file(file_id)`（返回字节，供前端渲染）/ `reveal_paper_file`（在访达中显示）/ `scan_missing_files` |
| 提取 | `extract_markdown(file_id, engine, opts)` / `list_extracts(paper_id)` / `read_extract(extract_id)` / `delete_extract` / `get_extract_quality` |
| 标签 | `list_tags` / `save_tag` / set_paper_tags` |
| 元数据 | `suggest_metadata(file_id)`（从提取结果抽取，离线）/ `export_bibtex(papers)` |

**文件访问纪律**：一律通过 Rust 命令（沿用现有架构），不新增 `fs` 插件；选文件用 `tauri-plugin-dialog`，外部打开用 `tauri-plugin-opener`。

<a id="initial-43-提取管线两条轨"></a>
#### 4.3 提取管线（两条轨）

```
论文 PDF
 ├─ 轨道 A｜内建快线（离线、秒级）
 │    PDFium/PyMuPDF 取文本 + 坐标 → 版面四层（移植 ScholarFlow layout/ir/renderer）
 │    → Markdown（带页码锚点）→ 质量检测
 └─ 轨道 B｜云提取（默认高质量）
      页面 → 200 DPI PNG（≤10 MB/页）→ 并发请求（GLM-OCR / Mistral OCR）
      → 按页码合并 → Markdown + 图片资源 → 质量检测 → 记录 token 与费用
```

- **质量检测指标**（决定是否提示「建议用高质量引擎」）：每页字符数、CJK 占比、乱码率、`(cid:)` 残留、公式块数量、是否扫描件（文本层近乎为空）、图表数量。
- **缓存**：键 = `sha256(源文件) + engine + engine_version + 参数指纹`（沿用 ScholarFlow 的 sha256 缓存思路），重复提取直接复用。
- **并发与中断**：逐页并发上限可配（默认 4）；任务可取消；失败页可单独重试。
- **产物落盘（用户硬要求）**：**与 PDF 同目录、同主干名** —— `files/papers/<paperId>/<pdf 主干>.<engine>.md`（元数据 `<pdf 主干>.<engine>.meta.json`，图片放 `<pdf 主干>.assets/`）。PDF 与提取稿共同构成该文献项的「补充内容」；**只增不改**，出问题可回退到旧引擎产物；删附件时连带清理同主干产物。

<a id="initial-44-界面草案"></a>
#### 4.4 界面（草案）

| 区域 | 内容 |
| --- | --- |
| 顶栏 | 第四个页面入口「文献」（`LIT-01`）；验收含「1040×700 + 特大字号下四个入口可见可点」 |
| 库树（左） | 文件夹树（新建 / 重命名 / 删除 / 移动）；根节点「全部文献 / 未分类」 |
| 列表（中） | 标题 + 作者 + 年份 + 类别角标 + 状态点；排序与筛选（文件夹 / 标签 / 类别 / 状态 / 关键词） |
| 详情（右） | 元数据区 + 笔记 + 文件清单 + **阅读区**：`原文 PDF｜提取稿 Markdown` 双模式切换（并排留给宽窗） |
| 提取态 | 未提取 / 提取中（进度）/ 已完成（引擎、页数、耗时、费用）/ 失败（原因 + 重试） |
| 设置 | 新增「文献」分组：默认引擎、并发数、密钥状态、附件目录、累计费用 |

**阅读稿渲染**：Markdown 需要数学与表格 → `react-markdown + remark-gfm + remark-math + rehype-katex + katex`；图片走本地文件协议或 Rust 命令返回。

<a id="initial-45-与既有模块的关系v14-只做最少的桥待-q-拍板"></a>
#### 4.5 与既有模块的关系（v1.4 只做最少的桥，待 Q 拍板）

| 桥 | 形态 | 说明 |
| --- | --- | --- |
| 文献 → 议程 | 「读《X》」生成一条议程事项 | 复用 `AG-05` 的浮层与单向出口模式 |
| 文献 → 日历 / 倒计时 | 「安排到某天」/「设为 deadline」 | 与 `AG-05`、`CD-01` 同源 |
| 反向关联 | 不做 | 避免双向同步的复杂度（v1.2 的教训） |

---

<a id="initial-5-实施顺序拍板后按此推进"></a>
### 5. 实施顺序（拍板后按此推进）

| 阶段 | 工作 | 完成门槛 |
| --- | --- | --- |
| **M0 前置** | ① S1：PDF.js 在 RunningDO 里渲染（含纸张风格、四档字号、窄窗）② S2：内建快线可行性（走 Python 侧 or Rust 侧，定 `libpdfium` 方案）③ S3：云引擎对比实测（GLM-OCR / GLM-5.3-Flash / Mistral OCR，用 `docs/test/` 三篇样本，记录质量 / 耗时 / 费用） | 三个结论落纸：显示方案、快线实现位置、云引擎默认档 |
| M1 数据层 | `library_nodes` / `papers` / `paper_files` / `paper_extracts` / `tags` + CRUD 命令 + 迁移 + 备份 v5 | `cargo test` 覆盖树级联、文件去重、提取记录；迁移幂等 |
| M2 页面骨架 | 顶栏第四页 + 三栏布局 + 条目录入/编辑表单（复用自绘选择器与抽屉） | 空态可读；窄窗 + 特大字号不塌 |
| M3 组织能力 | 树 CRUD 与移动、类别、标签、筛选与关键词、排序 | 1000 条文献下列表流畅；树开合不卡 |
| M4 文件与阅读 | 导入（拷贝 + sha256 + 缺失检测）、PDF.js 阅读、docx/pptx → Markdown 阅读 | 导入幂等；文件被删后能提示重新定位 |
| M5 提取管线 | 轨道 A + 轨道 B + 质量检测 + 缓存 + 费用记录 + 任务队列与重试 | 15 页论文：快线 ≤ 5 s、云线 ≤ 60 s；产物可复现 |
| M6 桥与导出 | 文献 → 议程 / 日历 / 倒计时；BibTeX 导出；元数据建议值 | 单向出口，事务失败不留半条数据 |

---

<a id="initial-6-验收与测试计划"></a>
### 6. 验收与测试计划

| 层 | 内容 |
| --- | --- |
| 数据层（`cargo test`） | 树 CRUD / 移动 / 级联删除；条目 CRUD；文件导入幂等（同 sha256 去重）；缺失检测；提取记录与状态流转；备份 v5 与迁移幂等（含「兜底备份失败即中止」） |
| DOM 冒烟（新套件 `literature.smoke.tsx`） | 页面切换、树操作、条目表单校验（空标题 / IME）、列表筛选、阅读模式切换、提取状态渲染、删除确认文案 |
| 样式不变量 | 沿用 `tokens.test.ts` 三条：`font-size` 必须乘 `--font-scale`、文字容器只用 `min-height`、禁止原生控件 |
| 提取质量（人工核对清单） | 用 `docs/test/` 样本比较 标题层级 / 段落完整性 / 公式数量 / 表格结构 / 参考文献，逐项打勾并记录在案 |
| 性能 | 1000 条文献列表与树操作；单篇 15 页：快线 ≤ 5 s、云线 ≤ 60 s；提取过程不阻塞 UI |
| 隐私 | 默认不联网；首次云端提取必须显式确认；密钥不出主进程 |

---

<a id="initial-7-风险"></a>
### 7. 风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| LLM 提取悄悄改错数字 / 公式 | 研究场景致命 | 原文并排常驻；产物只增不改；记录引擎与版本；关键结论以原文为准 |
| 云成本失控（批量提取） | 花费超预期 | 每次记录 token 与费用；并发与批量上限；先出预估再执行 |
| `libpdfium.dylib` 分发 | 构建链路复杂化 | Q11 三选一；优先考虑把快线放 Python 侧（`pypdfium2` 已在环境里） |
| 扫描件 / 老论文无文本层 | 快线不可用 | 质量检测自动识别 → 强制走云 OCR |
| 中文期刊公式与双栏 | 版面启发式失效 | 默认云引擎；`docs/test/` 增加中文样本 |
| 附件与备份不同步 | 换机器后正文与提取稿一起丢失 | 备份 JSON 明确标注「不含附件与提取稿」；设置页提供「附件目录」入口与说明 |
| 文献页信息密度过高 | 违背「克制的信息」 | 详情区一条主视觉主线；标签与徽章限量 |

---

<a id="initial-8-已落地的环境与依赖本次"></a>
### 8. 已落地的环境与依赖（本次）

<a id="initial-81-v14-专用-conda-环境用户指定放本目录"></a>
#### 8.1 v1.4 专用 conda 环境（用户指定：放本目录）

```bash
# 位置与解释器
/Users/charlezk9/Projects/MyOSPs/RunningDO/.conda/lit/bin/python   # Python 3.12.14
# 调用方式（非交互 shell 必须显式 prefix）
export CONDARC="$HOME/Development/conda/.condarc"
"$HOME/Development/conda/miniforge3/bin/conda" run -p "$PWD/.conda/lit" python <script.py>
# 直接调用（等价，规则允许：路径显式）
./.conda/lit/bin/python <script.py>
```

已装：`httpx` `python-dotenv` `rich` `tenacity` `pymupdf` `pypdf` `pypdfium2` `pdfplumber` `markitdown[pdf,docx,pptx]` `openai` `pillow`（`pymupdf` 实测：15 页 / 39,498 字符 / `(cid:)` 残留 0）。
已登记进 `~/Development/manifest/inventory.json`（`generated_at` 已刷新）。
`.gitignore` 已加 `.conda/`（环境不进仓库）。

<a id="initial-82-若采用本地重引擎m0-里按需装命令示例"></a>
#### 8.2 若采用本地重引擎（M0 里按需装，命令示例）

```bash
# docling（PDF + DOCX/PPTX/XLSX → Markdown，CPU 可跑）
./.conda/lit/bin/python -m pip install docling
# MinerU（中文 + 公式；Apple Silicon 走 MPS/MLX）
conda run -p "$PWD/.conda/lit" python -m pip install -U "mineru[core]"
```

<a id="initial-83-待新增的工程依赖实现阶段"></a>
#### 8.3 待新增的工程依赖（实现阶段）

| 端 | 依赖 | 用途 |
| --- | --- | --- |
| Rust | `tauri-plugin-dialog`、`tauri-plugin-opener` | 选文件 / 在访达中显示 / 外部打开 |
| Rust | `sha2` | 文件指纹（与 ScholarFlow 一致） |
| Rust（可选） | `pdfium-render` + `libpdfium.dylib` | 内建快线（若走 Rust 侧） |
| 前端 | `pdfjs-dist` | PDF 渲染（Q3-A） |
| 前端 | `react-markdown` `remark-gfm` `remark-math` `rehype-katex` `katex` | Markdown + 数学渲染 |

<a id="initial-84-本轮实跑记录2026-10-04"></a>
#### 8.4 本轮实跑记录（2026-10-04）

- `pnpm check` → 76/76（纯逻辑与样式）+ 365/365（DOM 冒烟 11 套件）
- `cargo test` → 32/32
- 环境可用性：`pymupdf` 成功解析 `docs/test/attention-is-all-you-need.pdf`（15 页 / 39,498 字符 / 无乱码残留）
- 清单刷新：`~/Development/scripts/refresh-inventory.sh` 已执行，`inventory.json` 已包含 `lit` 环境

---

<a id="initial-9-相关文档"></a>
### 9. 相关文档

| 文档 | 关系 |
| --- | --- |
| [PRD](../v0/PRD.md) | 唯一活规格；拍板后新增 `LIT-*` 需求与验收标准 |
| [DESIGN](../v0/DESIGN.md) | 视觉与组件规格；文献页需新增章节 |
| [ScholarFlow](../../../../MyOSPs/ScholarFlow) | 参照实现（数据模型、pdf2md 管线、PDF.js 两级显示） |
| [v1.3 发布说明](./RELEASE-NOTES-v1.3.md) | 基线版本（同库数据、迁移与备份纪律） |

---

<a id="reader"></a>
## B. 阅读工作台布局

> 2026-10-04 · 基线 05b6246 · 对应 PRD LIT-14～LIT-16；状态以 PRD §5.0 为准。

现状：`src/components/LiteraturePage.tsx:344` 录入表单在独立中栏，`:400` 详情始终占右栏，阅读器在详情底部；`:365` 空标题禁用按钮但无必填解释。`src/styles/app.css:3215` 固定三栏，窄窗详情落到下一行。提取 API 返回整次执行结果，暂无逐页进度事件。

实施：左栏放显式「新建文献项目」入口、展开录入表单与列表；主区标题工具栏提供 PDF/MD、提取与右侧详情入口；默认收起详情，选中文献自动读取 PDF，已有成功产物使 MD 可用。保留既有附件、标签、状态和元数据功能。提取期间显示不定量进度条及处理中提示，收到执行结果才展示完成或失败，不伪造百分比；异步切换文献阻止迟到内容覆盖当前阅读器。

验证：DOM 覆盖左栏录入、默认隐藏详情、PDF/MD 可用状态、真实异步完成/失败反馈与迟到响应；浏览器检查常规和最小窗口/特大字号；运行 pnpm check、Rust 回归与前端构建。

本次三项布局和交互已由用户明确指定，无待拍板项；不修改已归档 PLAN-v1.4.md。

---

<a id="file-picker"></a>
## C. 原生附件选择

> 2026-10-05 · 对应 PRD LIT-17；状态以 PRD §5.0 为准。

现状：`src/components/LiteraturePage.tsx:52` 保存 importPath，`:218` 根据手输路径入库，`:540` 显示路径框。用户明确要求选择附件，不输入路径，并优先使用 Finder。

实施：用「选择附件」按钮替换路径表单；Rust 调用 Tauri 官方 dialog 插件的 macOS 原生文件选择窗口，选定后复用现有导入、sha256 去重与刷新逻辑。取消返回空结果，不显示成功提示；错误保留详情并提示。仅增加 Rust 依赖，不给前端开放额外文件系统权限。验证点击、取消、失败与原生选文件/幂等导入，运行既有检查并重建原生包。无待拍板项。

---

<a id="reading-revision"></a>
## D. 阅读、公式与自动整理修订

> 编写日期：2026-10-05 · v1.4 系列修订施工图
> 承接：[v1.4 原施工图](PLAN-v1.4.md#initial)、[阅读工作台调整](PLAN-v1.4.md#reader)、[原生附件选择](PLAN-v1.4.md#file-picker)。上述文档保留历史内容。
> 唯一需求与状态来源：[PRD §5.0 / §5.2c](../v0/PRD.md)，对应 `LIT-18~LIT-23`。
> 2026-10-05 用户确认：提取成功后自动整理，其余采用本文推荐值；按本施工图开始实施。

<a id="reading-revision-1-用户确认的修订范围"></a>
### 1. 用户确认的修订范围

2026-10-05，用户要求分析四项问题，随后追加 PDF 连续滚动，并要求将本轮讨论固化为 v1.4.2：

| 需求 | 确认内容 |
| --- | --- |
| LIT-18 | PDF/MD 阅读主体上方内容冗余，需要压缩或调整布局 |
| LIT-19 | MD 公式排版错乱，需要正确渲染 |
| LIT-20 | MD 阅读字体大小需要可调整 |
| LIT-21 | MD 配图需要真正显示 |
| LIT-22 | 提取结果需要再经模型检查、区分正文/图注/标注并重新排版；不同类型采用有区别的 MD 格式；阅读器借鉴 LaTeX 方案定制呈现，图注较小；允许 GLM-5.3-flash 或其他模型 |
| LIT-23 | 原始 PDF 改为上下连续滚动，不再要求手动翻页 |

沿用讨论中的边界：保留原始提取稿、另存整理稿；整理只调整结构，不摘要、不改写论证、不猜补缺失公式；保留来源页码关联。本文不加入翻译、PDF 标注、同步、全文检索或 LaTeX/PDF 导出需求。

<a id="reading-revision-2-现状证据与原因判断"></a>
### 2. 现状证据与原因判断

| 问题 | 当前证据 | 原因判断 |
| --- | --- | --- |
| 顶部占用三行 | `src/components/LiteraturePage.tsx:439` 标题工具栏，`:447` 提取按钮与状态，`:448` 完成进度条 | 状态重复表达，完成条无退出显示条件；属于阅读器布局问题 |
| 公式错位 | `src/components/MarkdownReader.tsx:9` 使用 remark-math/KaTeX；`src/styles/app.css:3350` 正文断词/行高，`:3379` 可任意断行；实际云稿含有效的 `$d_k$`、`\frac{1}{\sqrt{d_k}}` | 至少部分属于渲染层，具体 CSS/字体根因尚未确认；另有单行 `$$公式$$` 需要检查独立数学块解析。不能笼统归咎模型识别 |
| 阅读字号无独立控制 | `src/styles/app.css:3358` 正文仅乘全局 `--font-scale`；`MarkdownReader.tsx:8` 无阅读字号参数 | 缺阅读器专用字号入口与作用域；并非全局字号完全无效 |
| 配图不显示 | `scripts/extract_markdown.py:92` 只要求 `page-N-figure-K` 占位；`MarkdownReader.tsx:9` 将图片节点替换成文字 | 既缺真实图片资产，又主动禁止渲染图片；再次调用模型不能从占位符恢复图片字节 |
| 正文与标注混排 | `scripts/extract_markdown.py:119` 逐页独立调用，`:161` 直接拼接；实际全文样本在第 4/5 页将正文段落用脚注与分页隔开 | 缺跨页上下文和明确的语义分类；标题层级、图注、脚注未形成稳定契约 |
| PDF 手动翻页 | `src/components/PdfReader.tsx:7` 单页状态，`:46` 只渲染当前页，`:74`、`:76` 上一页/下一页按钮 | 单页阅读器结构，需要改为连续页面容器并按需渲染 |

证据来自用户两张截图、项目源码与本地实际云端全文提取稿的只读核对。公式错位根因尚待运行时计算样式、字体资源与解析节点验证；不把推测写成已确认结论。此前公式测试主要检查生成节点，不能代替真实视觉验收。

<a id="reading-revision-3-可行实现方向"></a>
### 3. 可行实现方向

<a id="reading-revision-31-阅读工具区"></a>
#### 3.1 阅读工具区

推荐合并为紧凑的一条主工具栏：标题让位，PDF/MD、阅读字号与详情入口保持可达。提取入口放在 PDF 模式工具区或右侧详情；MD 模式不重复强调 PDF→MD。处理期间保留进度，成功后收起完整进度条，以 MD 可用状态表达结果；错误仍可见。

PDF 页码/缩放仅在 PDF 模式显示，MD 字号仅在 MD 模式显示。窄窗允许必要的有序换行，不以文字裁切换取固定高度。

<a id="reading-revision-32-公式渲染"></a>
#### 3.2 公式渲染

先用原始有效 LaTeX 检查 KaTeX 样式和字体加载、样式版本、行高/断词规则的继承与覆盖。正文断词不得作用于公式内部排版结构。统一行内与独立公式的 Markdown 分隔形式；独立公式按数学块排版，长式使用对齐环境或公式区域内部横向滚动。

现有 KaTeX 为优先修复路径；是否换数学渲染引擎须由真实兼容性证据决定，不预设换库。第二轮模型可识别结构，但不能用猜改公式掩盖 CSS 问题。

<a id="reading-revision-33-阅读字号与本地配图"></a>
#### 3.3 阅读字号与本地配图

阅读字号独立作用于 MD 内容：正文、标题、图注和脚注按比例形成层级，数学字体与正文协调；操作控件沿用界面字号。

从 PDF 保存真实图像并建立 MD 引用。内嵌位图可直接提取，矢量/复合图可通过页面渲染后裁切图区域保存。引用需与来源页、图号和图注匹配；阅读器解析受控的本地资源，不用无效占位地址或模型生成图片充数。图像资产沿用附件数据目录与既有备份边界，不宣称 JSON 包含图片文件。

<a id="reading-revision-34-第二轮模型检查与语义整理"></a>
#### 3.4 第二轮模型检查与语义整理

推荐复用已经接通的 GLM-5.3-flash 进行第二轮调用；第二阶段与逐页识别承担不同任务，不要求必须更换供应商。用户允许其他模型，但本修订不指定未经验证的替代型号或费用。

输入包含提取稿、相邻页上下文、来源页码及配图关联；有歧义的段落再结合原 PDF 页面核对。输出为另存的整理稿，原始稿不覆盖。模型负责正文衔接、标题层级、图注/脚注等语义检查；本地渲染器负责视觉排版。

| 文本类型 | 推荐文档表达 | 定制呈现 |
| --- | --- | --- |
| 正文 | 普通段落 | 正常阅读字号与行距 |
| 作者/机构等元信息 | 独立语义区块 | 紧凑且弱于正文 |
| 图及图注 | 本地图片引用＋明确类型的图注区块 | 图片与图注关联，图注字号较小 |
| 脚注 | 保留原引用标记＋`:::note` 定义区块 | 编号仍与正文关联，注释较小 |
| 原文引用 | 普通引用块 | 引用样式，与图注区分 |
| 独立公式 | 数学块及必要的对齐结构 | 独立留白，不侵占邻近正文 |

用户提出 quote 等格式作为图注表达示例；普通 `>` 同时也表示原文引用，不能仅靠外观猜类别。推荐使用带类型的 Markdown 扩展区块，保留便于阅读的 MD 源文件，并映射成图注/脚注组件。采用 `:::caption`、`:::metadata`、`:::note` 类型区块，普通引用仍用 `>`。

保护公式与引用，禁止摘要化、删减论证或补写不存在的内容。不能确定的衔接保留核对标记；检查正文完整性、公式与图注关联，而不只检查输出是否为合法 Markdown。

<a id="reading-revision-35-pdf-连续滚动"></a>
#### 3.5 PDF 连续滚动

保留本地 PDF.js 与文字层，改为按原文顺序排列的多页纵向容器。可视页与邻近页按需渲染，离屏页保留尺寸占位并释放不必要的画布资源，避免全文一次性渲染。滚动更新当前页码；保留缩放，移除上一页/下一页按钮主路径。

注意页间距、缩放后的滚动位置、宽度变化、迟到渲染取消，以及当前 WKWebView 的流读取兼容处理。页面不得重叠，也不得因页面按需加载持续跳动。

<a id="reading-revision-4-验证要求"></a>
### 4. 验证要求

- 工具区：PDF/MD 两种模式、未提取/处理中/成功/失败；成功不常驻大进度条，入口可见且正文空间增加。
- 公式：用户截图对应的上下标、根号、分数、求和及独立公式，逐项对照 PDF；检查不同阅读字号与窗口宽度，原生截图验收，不能只断言有 KaTeX 节点。
- 配图：真实位图和矢量/复合图样本；图片存在、引用可解析、图注关联正确，缺失有反馈。
- 语义整理：真实全文跨页段落、图注、脚注及作者区；对照原稿/PDF确认无删减、无公式猜补，原始稿仍保留。
- 连续 PDF：自然滚动跨页、当前页码、缩放、调整窗口、文字选择及切换文献；长文献按需渲染且不重叠。
- 布局：1040×700 最小窗口与特大界面字号，加独立 MD 阅读字号变化；工具区与右侧详情不溢出。
- 工程：实施后运行 `pnpm check`、`cargo test --manifest-path src-tauri/Cargo.toml` 并验证原生构建。未经验证不得标记为已实现。

<a id="reading-revision-5-已确认的实现细节"></a>
### 5. 已确认的实现细节

2026-10-05 用户确认以下决议：

| 项目 | 推荐值 | 取舍 |
| --- | --- | --- |
| 图注等语义标记 | 带类型的 Markdown 扩展区块；普通引用仍用 `>` | 分类可靠；需定制解析器，通用 MD 工具可能只显示原始标记 |
| 整理何时触发 | 提取成功后自动触发 | 原稿保留，整理失败仍可阅读原稿并显示原因 |
| MD 字号控制 | 工具栏减小/增大/恢复默认 | 直接可用；默认 16px，12–28px，每次 2px；阅读会话内保留 |
| 配图边界来源 | 优先已有 PDF 信息，必要时模型结合页面判断 | 位图与矢量图情况不同；不能把未经核对的裁切视为正确 |

不得据此扩展额外产品功能。实现状态只回写 PRD §5.0；本文件不维护第二套完成清单。

<a id="reading-revision-6-实施与验证证据2026-10-05"></a>
### 6. 实施与验证证据（2026-10-05）

- 公式根因：`rehype-katex` 使用 0.16.47，而原顶层样式来自 0.19.0，节点类名不匹配；另有 Vite 的 `style-to-js` CommonJS 互操作导致内联样式静默丢失。统一版本并直接转换 KaTeX 生成的定位属性；不启用原始 HTML。真实原稿中的两条 `\tag` 错误随单行双美元规范化消除。
- 整理实现：`scripts/layout_markdown.py` 每批三页，模型返回区块 ID / 类型 / 段落衔接 / 图区；严格验证每个 ID 恰好出现一次，本地重组原文，不接受改写正文。配图来自 PDF 裁切，结合原 PDF 文字框修正边缘。原稿不覆盖，登记资产读取限制在对应目录内。
- 原生自动串接实测：公开论文 Attention Is All You Need，15 页 / 159 个区块 / 5 张真实配图，自动整理 41.026 秒（总计 41.759 秒），输入 41,721 / 输出 2,935 tokens，估算 ¥0.0415948；估算采用已有端点单价，并非账单实扣。逐区块核对无遗漏，来源原稿 SHA-256 未改；第 4/5 页正文衔接与脚注区分经原生阅读核验。原生测试使用独立标识与数据库，不修改正式用户库。
- 原生验证 PDF 自然滚动跨页、页码更新、图片和公式。浏览器验证 1040×700、详情展开、最大阅读字号 28px 及全局特大字号叠加为 36.4px：页面宽度仍为 1040px，工具栏按序换行无溢出，5 张图片加载且 0 个数学解析错误。后续原生窗口操作遇锁屏，未把浏览器窗口验证写成原生结果。
- 工程验证：`pnpm check`：76 纯逻辑/样式 + 436 DOM；`RUNNINGDO_E2E_EXTRACT=1 cargo test --manifest-path src-tauri/Cargo.toml`：47；Python 整理契约：6。合计 565 项通过。macOS debug app 构建成功，应用版本统一到 1.4.2。
- 留档：[云整理核对](../test/v1.4.2/layout-validation.json)、[阅读截图](screenshots/v1.4.2-reader.png)。构建与测试日志：`/tmp/rd-v142-{check,rust,python}-final.log`、`/tmp/rd-v142-production-build.log`。

已知边界：模型分类与图片区定位仍需面对不同论文版式；此次真实样本验证不保证所有文献的 OCR 内容正确。没有密钥时只能得到原稿；整理失败不阻断原稿阅读，未伪装为整理成功。附件、整理稿及图片均沿用 JSON 备份不含磁盘资产的边界。实现状态仍只登记 PRD §5.0。

---

<a id="single-markdown"></a>
## E. 单一 Markdown 入口

用户确认：每次转换后自动排版，原始数据仅内部保存。需求见 PRD LIT-08 / LIT-22。

现状证据：LiteraturePage.tsx:223 Office 阅读直接使用 markitdown；:238 转换仅在云配置可用时整理；:334 无整理稿回退原稿；:616 逐条显示引擎产物。

实施：Office 阅读走同一转换链；原始提取成功后必须自动整理，缺少配置或整理失败保留内部原稿并提示重试；MD 仅选择完成的整理稿，详情仅显示一个最终 Markdown，不显示内部引擎与状态码。已有完成稿仍可阅读。验证覆盖异步整理、原稿隐藏、失败和 Office 串接，执行 pnpm check 与 cargo test。

验证证据（2026-10-05）：pnpm check 全绿（76 逻辑/样式、442 DOM），文献冒烟 62 项覆盖原稿隐藏、单一完成稿、排版失败保留既有完成稿、Office 自动串接和缺少配置。cargo test 47 项通过；macOS debug app 构建成功。日志 /tmp/rd-md-{check2,rust,build}.log。实现状态见 PRD §5.0。

---

<a id="sidebar-overflow"></a>
## F. 资料库文字溢出修复

用户截图显示来源名称越过文献卡片边界。对应 PRD LIT-14。

现状证据：src/components/LiteraturePage.tsx:420 元信息作为 flex 匿名文本项，长内容无独立收缩规则；src/styles/app.css:3292 元信息仅配置 flex-wrap，不能拆分不可收缩文本。

实施：元信息文字使用独立 span，明确 min-width:0 和 overflow-wrap:anywhere；状态单独保留；卡片标题及元信息容器允许收缩。使用换行保留内容，执行 pnpm check 与应用构建。

浏览器实测补充：按钮继承 white-space:nowrap，显式覆盖为 normal 后，220px 侧栏与 1.3 倍字号下两条卡片 clientWidth / scrollWidth 均为 192 / 192，无横向溢出（含无空格长标题）。

---

<a id="explorer"></a>
## G. 资源管理器布局

用户要求参考 VS Code 左侧资源管理器，对应 PRD LIT-14。
现状：LiteraturePage.tsx:348–455 分离的筛选按钮、创建按钮、文献卡片及底部固定表单；app.css:3277 卡片多行元信息占用空间。
实施：顶部图标集中新建文献/文件夹/删除选中文件夹；创建表单按需展开；文件夹与文献统一为可折叠缩进树，文献仅单行标题，完整元信息保留右侧详情。选中文献独立于展开状态，折叠不打断阅读。验证创建、折叠、选择与原阅读链，运行 pnpm check 和构建。

验证（2026-10-05）：pnpm check 76 逻辑/样式 + 444 DOM 项通过。只读模拟数据验证真实组件嵌套目录、单行省略与选择；侧栏及文献行 clientWidth / scrollWidth 均为 268 / 268，无横向溢出。macOS debug app 构建成功。日志 /tmp/rd-explorer-check-final.log、/tmp/rd-explorer-build.log；状态见 PRD §5.0。

---

<a id="interactions"></a>
## H. 阅读控件与详情交互

需求依据：用户本次四项完善，PRD LIT-24。
现状：LiteraturePage.tsx 资料树无拖放或右键；详情采用分栏缩小正文；PdfReader.tsx:76 内置工具栏步长25%；library.rs:553 导入无单 PDF 限制，:773 删除 MD 仅删除记录。
实施：资料条目拖放到文件夹或未分类，右键菜单 Portal 创建子文件夹；标题栏挂载 PDF 控件，步长10%，MD控件紧凑；详情 Portal 固定定位覆盖阅读器并平移进场，三个分区；附件仅单PDF源与最终MD，转换操作归附件内；源导入后隐藏入口，清空需站内确认，单源约束进入后端，删除 MD 清理对应文件与配图。
验证：DOM 覆盖交互及控件，Rust 覆盖源唯一性与 MD 清理；pnpm check、cargo test、应用构建。

验证证据（2026-10-05）：pnpm check 76 逻辑/样式 + 459 DOM，合计535项；RUNNINGDO_E2E_EXTRACT=1 cargo test 47项通过。文献冒烟76项，阅读冒烟18项，覆盖拖放归属持久化、Portal 右键菜单、三个分区、源导入隐藏、删除 MD 确认及源保留、标题栏挂载 PDF 控件与90/100%缩放。Rust 校验第二个 PDF 被拒绝、重复源幂等及 MD/元文件/图片清理，保留原 PDF 与内部快线稿。浏览器只读模拟数据验证：详情展开前后正文均966px，90%缩放及 MD 字号均在标题栏，页面无横向溢出。未操作正式用户库。日志 /tmp/rd-interaction-final2.log、/tmp/rd-interaction-rust-final.log、/tmp/rd-interaction-build-clean.log。状态见 PRD §5.0。

---

<a id="move"></a>
## I. 附件文件行与移动卡

依据 PRD LIT-24。现状：附件 flex 换行，PDF/MD 阅读按钮横向位置不一致；拖放只接受自定义 MIME 且折叠目录无法找到子目录。实施：统一附件网格操作列；条目右键菜单进入 Portal 目录选择卡，所有目录可选；拖放增加内部源引用、text/plain 后备，悬停展开目录。pnpm check 与构建验证。

用户补充：按文件名行 + × 删除，MD 另加 reload 图标；取消长操作按钮，转换选项放在两行附件下方。

验证：pnpm check 538项通过，含右键打开目录卡、选择未分类及其他目录、移动后关闭卡片；macOS debug app 构建成功。日志 /tmp/rd-move-final2.log、/tmp/rd-move-build2.log。状态见 PRD §5.0。

---

<a id="spacing"></a>
## J. 详情间距及读取反馈

依据用户截图及 PRD LIT-24。现状：LiteraturePage.tsx MD 删除仍为文字；空导入行及空标签容器参与 gap，产生过大空白；app.css 附件网格与按钮样式多次覆盖。实施：删除统一 ×；移除空行，附件样式合并；字段、状态、标签与三区块设明确间距，图标列随字号调整，文件名让位。测试并以真实组件/长文本/大字号检查布局。

复查同时发现 PDF/MD 读取失败仅弹提示，正文仍保留加载文案。按既有阅读失败反馈要求补正文错误状态；切换文献时清空，防止迟到响应污染。

验证：pnpm check 543项全绿，新增图标内容及PDF/MD读取失败反馈断言。浏览器真实组件、长文件名及会议名、1.3倍字号检查：附件 × 对齐，MD重生成无覆盖，标签同排、分区间距正常。macOS debug app 构建成功。日志 /tmp/rd-spacing-verified.log、/tmp/rd-spacing-build-final2.log；状态见PRD §5.0。

---

<a id="library"></a>
## K. 资料库管理、定位与浏览记忆

依据 PRD LIT-25。重复的“定位当前文献”按一项实施。
现状证据：tauri.conf.json:15窗口未关闭原生drag-drop处理；LiteraturePage.tsx:343选择和折叠绑定，:369移动清空全部折叠，:448右键菜单单项，:449移动卡为平面列表，浏览状态仅useState。
实施：禁用原生外部文件drop处理以允许HTML拖放（Finder导入保持）；分离箭头与选择；完整对象菜单；层级移动树及循环目标禁用；定位仅展开祖先、滚动并闪示；独立localStorage存储左栏浏览状态，校验失效ID。
验证：DOM真实dragstart/dragover/drop链、菜单目标、目录树、记忆重挂载；cargo test及原生窗口拖放检查；应用构建。

验证证据（2026-10-05）：`pnpm check` 类型检查及76逻辑/样式、479 DOM检查通过；`cargo test --manifest-path src-tauri/Cargo.toml` 47项通过，debug app打包成功。目录树包含嵌套结构，测试覆盖自身/后代目标禁用、对象菜单、选择/折叠分离、定位、拖放事件链、浏览状态重挂载及失效ID回退。

拖放根因依据：Tauri原生拖放处理可能截获WKWebView的HTML拖放（[官方问题记录 #14373](https://github.com/tauri-apps/tauri/issues/14373)）；`src-tauri/tauri.conf.json:16`关闭该处理，同时显式允许条目原生拖动，子文字/图标不抢拖动目标。Finder文件选择不受影响。独立标识的原生测试应用已建立测试文献和目录，界面可读取及点击，但鼠标拖动调用两次均返回`noWindowsAvailable`。因此事件链通过不能替代原生拖放验收；已请用户在隔离窗口手工验证，需求状态见PRD §5.0。

---

<a id="folder-count"></a>
## L. 父目录累计计数

依据PRD LIT-26。现状：`src/components/LiteraturePage.tsx:455`仅筛选直接归属文献，`:460`用直接条目长度显示目录计数，遗漏子目录。

实施：按每篇文献的目录向上累计祖先计数；条目展示仍保持直接归属。计数随目录及文献数据更新，折叠不参与计算，未分类独立统计。验证多层嵌套、折叠和移回后的祖先计数。

验证：pnpm check（76逻辑/样式 + 482 DOM）通过，覆盖三级目录累计、折叠保持计数及通过移动卡移动后源/目标祖先更新。仅修改前端计数，无数据迁移。

---

<a id="translation"></a>
## M. 中文翻译与对照阅读

依据PRD LIT-27。现状：LiteraturePage.tsx:356选择layout完成稿，:554仅单稿阅读；MarkdownReader支持公式、配图和caption/note/metadata。library.rs:951限制现有引擎，extract_markdown.py已有云配置及产物持久化通道。

实现：增加translation产物，以最新整理稿内容哈希作为缓存依据；分段编号且保留数学/代码/链接和语义结构，模型按信达雅翻译，校验无段落遗漏或重复。译稿旁的JSON侧文件保存原文与译文映射，数据库元数据只存来源关系，不把全文带入JSON备份，原文不写标记；译稿MD注释不参与显示。阅读器提供原稿、中文、对照三种MD模式，双栏用共用网格行对齐段首，共用滚动、字号、图片安全读取。翻译由按钮触发，失败可重试，旧整理稿对应译文不用于新稿。

验证：翻译分段及受保护内容单测、模型响应校验、产物缓存与持久化、阅读切换及网格对齐；现有前端/Rust检查及应用构建。

验证证据（2026-10-05）：
- pnpm check：类型检查、76逻辑/样式及496 DOM检查通过；cargo test 48项通过；Python整理/翻译13项通过；debug app构建成功。
- GLM-5.3-flash真实小样本4区块（标题、正文、图注、公式），最终约11.198秒，408输入/445输出tokens；否定、可能性、因果限定保留，公式未变。样本为测试文本，未批量翻译用户文献。
- 浏览器双栏核验：1040px宽、1.3全局字号、16及28px阅读字号，对应四组段首坐标差均为0，阅读区scrollWidth等于clientWidth；修正单段阅读器默认min-height导致的大块空白。
- 测试覆盖原稿/中文/对照切换、译稿失败重试、映射来源匹配、数值/负号及公式保护、源稿删除后译稿清理、重开数据库后译稿可读、损坏映射拒绝；正文映射保存在侧文件，不进入JSON备份。

产物为同主干`.translation.md`及`.translation.meta.json`；后者保存段落映射。中文图片仍通过原稿登记资产读取，避免复制或放宽读取范围。模型复用现有云配置，可用GLM_TRANSLATE_MODEL独立指定；缓存依据整理稿内容SHA256及来源记录，两者匹配才复用。整理稿或源附件删除时清理关联译稿，译稿删除不清理源图。无数据库迁移。

---

<a id="translation-button"></a>
## N. 翻译入口位置调整

依据用户修订及PRD LIT-27。现状：LiteraturePage.tsx:582将翻译按钮放在标题栏，转换选项位于:716。将按钮移动到文献详情转换选项下方的独立操作行，保留现有可用条件、重试及事件处理。验证现有前端检查与应用构建。

---

<a id="translation-timeout"></a>
## O. 翻译超时与断点续译

依据现有LIT-27故障修复。真实库2026-10-05T16:44:02失败记录：APITimeoutError。整理稿150段/43806字符，保护后42133字符；原调用7000字符一批、timeout180秒、SDK自动重试一次、未设reasoning_effort。

GLM官方文档说明5.3-Flash强制思考，默认max，可指定low；不能直接关闭思考。修正为low、较小批次和流式接收，限制读取等待及单批总时长。成功批次按源稿内容/模型/规则哈希缓存到内部侧文件，可继续；纯公式/代码/图片本地原样保存。进度侧文件供前端轮询，不输出模型推理或正文日志。失败细分安全错误原因，避免只显示异常类名；失败不开放不完整译稿。

验证：模拟超时、断点恢复和源稿改变失效；真实整篇稿翻译到隔离目录；现有检查及重建应用。参考：https://docs.z.ai/guides/capabilities/thinking 。

验证证据（2026-10-05）：
- 初次整篇测试另暴露数值表达校验失败；数字也改为受保护内容，避免阿拉伯数字变中文数字造成中断，保留数值与符号原样。
- 相同整理稿150段，GLM-5.3-flash低思考/流式/1800字符批次完整成功，211.031秒，26741字符，34610输入/13295输出tokens；逐段ID及来源比对150/150一致。测试输出在/tmp，不覆盖现有文献库或原稿。
- 完整检查点重用0.172秒，不发API请求；前后译稿SHA256相同。模拟第二批两次超时，保留第一批，重试只请求剩余段落；修改原稿后旧检查点失效。
- pnpm check：76逻辑/样式+497 DOM，共573通过；Rust48及Python15项通过，debug app重新构建。前端核验段落进度与重试状态，后端核验进度读取的文献/附件边界及清理侧文件。
- 进度和断点分别保存`.translation.progress.json`和`.translation.checkpoint.json`，不进入JSON备份；最终稿仍仅在全部段落校验通过后保存。新应用需重启后使用新进度命令。


<a id="diagnostics"></a>
## P. 翻译数值校验与本地诊断（2026-10-06）

用户确认：修复同类数值误判并添加应用报错日志反馈。需求见 PRD LIT-28 / LOG-01。

现状证据：`scripts/translate_markdown.py:86` 恢复后重新扫描数字，`level-13` 被识别为负数；真实 ijgi-13-00138 整理稿第60号段触发同类误判，断点62/149。`src-tauri/src/library.rs:1120` 仅截取stderr末尾600字符；`src/components/LiteraturePage.tsx:168` 多数操作仅toast。

实施：统一原文数值保护与译文标记校验；明确校验版本并迁移有效断点；结构化校验错误、失败批次拆分；Python输出受控事件，Rust统一写入本地JSONL，前端共享诊断入口和全局异常监听。采用现有依赖实现，日志上限5×5MB、14天；不存正文、密钥、原始异常或模型响应。界面保留错误并支持详情、复制、打开日志目录。

验证：离线回归连字符/负数/科学计数/范围/编号/标记增删/断点升级；日志脱敏、轮转、写失败隔离；前端反馈与全量检查；真实论文在临时目录复制断点续译，不覆盖用户数据。

<a id="diagnostics-validation"></a>
### P.1 修复与验证记录（2026-10-06）

`translate_markdown.py` v6 将连字符、负号、范围、科学计数、英文数词、月份和 ISBN 标识分别处理；原文保护标记按段落编号命名，旧断点逐段复核，失败批次自动拆分并保留父段映射。验证覆盖 29 个 Python 测试；指定 `ijgi-13-00138.pdf` 的临时副本从旧断点续译，云端完成 149/149 段，复核续译耗时 0.178 秒且未再次请求云端，原 PDF SHA-256 一致；原应用断点仍保持 62 段。

`diagnostics.rs`、`diagnostics.ts` 与 `DiagnosticPanel` 提供操作编号、阶段、错误码、段落/规则、重试、耗时和进度的脱敏 JSONL 日志；日志按 5 MB×5、14 天轮转。前端错误边界、未捕获异常、Rust 命令和 Python 提取器均接入；日志不写入密钥、正文、完整提示词或模型响应，日志写入失败不阻断业务。前端冒烟 25+13 项、Rust 51 项通过；debug app 构建成功。
