# PLAN v1.4 · 文献模块（资料库 + PDF/Markdown 阅读 + 论文提取管线）

> 版本：v1.4 施工图 · 编写日期 2026-10-04 · 基线 v1.3.0
> 前置：[PRD §5.2c](../../v0/PRD.md) 的 `LIT-01`（顶栏第四页「文献」）已立项
> 状态：**§3 的 12 项决议已拍板；实现状态唯一来源为 PRD §5.0**

---

## 0. 这份文档是什么

- **是**：v1.4 的施工图 —— 现状证据、决策清单、数据模型、命令清单、实施顺序、验收标准。
- **不是**：PRD 的替代。v1.4 新增需求沿用 PRD 的 ID 体系；**拍板后先回写 PRD（新增 `LIT-*` 需求 + 验收标准 + §5.0 登记），再动代码**（规则见 PRD §0.2、`AGENTS.md` §1/§2）。
- 本文档里的「推荐」都只是推荐，不代表已确认；未经用户确认的内容不写入 PRD。

---

## 1. 范围

### 1.1 用户已确认（原话）

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

### 1.2 明确不做（v1.4，待你确认）

- 内置 PDF 标注 / 高亮 / 批注 / 手写签名；PDF 编辑与合并
- 在线文献同步、多设备、协作、分享
- 翻译功能本体（只保证 Markdown 产物可直接喂给翻译；见 §3 Q9）
- 元数据联网检索（DOI / Crossref / Google Scholar 抓取；见 §3 Q10）

---

## 2. 现状证据（改动前先记档）

### 2.1 RunningDO 现状

| 项 | 证据 |
| --- | --- |
| 页面容器 | `src/components/TopBar.tsx:66-82` 三个页面按钮；`src/App.tsx:107-115` 三元分支；store 的 `page: "calendar"｜"agenda"｜"settings"`（`src/store/useStore.ts:161`） |
| 布局约定 | 日历页 = 左栏 372px + 日历区；议程页 / 设置页 = 整页（`src/App.tsx`） |
| 数据层 | SQLite 7 张表；`src-tauri/src/db.rs` 负责建表 / 迁移 / CRUD / 备份；备份 `version: 4` |
| 迁移纪律 | 迁移前自动落 JSON 兜底备份，失败即停止升级（`db.rs:229-258`） |
| 文件系统 | **当前无任何文件访问**：`src-tauri/capabilities/default.json` 只开 `core:default`；`Cargo.toml` 无 dialog / fs / opener 插件 |
| 网络 | **当前无任何网络请求**（离线是既有原则，见 PRD §2「本地优先」） |
| 测试基线 | `pnpm check` 76 + 365 全绿；`cargo test` 32 全绿（2026-10-04 实跑，见 §8） |

### 2.2 参照物：ScholarFlow（`~/Projects/MyOSPs/ScholarFlow`）

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

### 2.3 本机环境与测试素材

| 项 | 状态 |
| --- | --- |
| conda | Miniforge3 在 `~/Development/conda/miniforge3`，`.condarc` 用清华镜像；非交互 shell 需 `export CONDARC=~/Development/conda/.condarc` |
| **v1.4 专用环境** | **`/Users/charlezk9/Projects/MyOSPs/RunningDO/.conda/lit`（conda，Python 3.12.14，按用户要求放在本目录）**；已装 `httpx / python-dotenv / rich / tenacity / pymupdf / pypdf / pypdfium2 / pdfplumber / markitdown[pdf,docx,pptx] / openai / pillow`；已登记进 `~/Development/manifest/inventory.json` |
| 未安装 | `mineru` / `marker` / `docling` / `ollama` / `pdftotext`（都要另装，命令见 §8.3） |
| 测试论文 | `docs/test/attention-is-all-you-need.pdf`（2.2 MB / 15 页 / 39,498 字符 / `(cid:)` 残留 0）——英文双栏 + 公式密集，是合格试金石 |
| 待补样本 | 中文论文、扫描件（无文本层）、docx / pptx 各一份（需你提供，或由我在 M0 用公开材料补齐） |

### 2.4 引擎候选与今日核实的计价（2026-10-04 检索）

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

## 3. 待拍板决议（12 项）——**已全部拍板（2026-10-04），全部取推荐方案 A**

> 用户裁定：`Q1A; Q2A; Q3A; Q4A; Q5A; Q6A; Q7A; Q8A; Q9A; Q10A; Q11A; Q12A`。
> **Q10 附加要求：联网（云引擎）环境下，要求模型在提取时一并返回标题与期刊/会议信息** —— 即建议元数据里必须包含 `title` 与 `venue`（并顺带 authors / year / doi）。
> 以下表格里的「推荐」列即已生效的决议；「备选」列仅作历史保留。

### Q1 分类模型：单亲树 vs 多集合

| 方案 | 说明 | 影响 |
| --- | --- | --- |
| **A 单亲树（推荐）** | 一条文献只属于一个文件夹；跨类需求交给标签 | 语义直白、移动唯一；ScholarFlow 已验证 |
| B Zotero 式多集合 | 一条可同时属于多个集合 | 需要「加入 / 移除」与「移动」两套语义，UI 与测试复杂度翻倍 |

### Q2 是否引入标签

| 方案 | 说明 |
| --- | --- |
| **A 引入（推荐）** | 与文件夹正交：文件夹管「位置」，标签管「主题 / 状态 / 方法」；成本 = 一张 `tags` + 一张关联表 |
| B 不引入 | 只靠文件夹，检索手段单一 |

### Q3 PDF 显示方案

| 方案 | 代价 | 能力 |
| --- | --- | --- |
| **A PDF.js canvas + 文本层，原生 `<iframe>` 兜底（推荐）** | 前端 +`pdfjs-dist`（约 1–2 MB） | 可控（跳页、缩放、选中复制、未来标注）；ScholarFlow 已跑通 |
| B 只用原生 `<iframe>`（WebKit 内置查看器） | 几乎零成本 | 无控制力，谈不上将来做标注 |
| C macOS PDFKit 原生嵌入 | 需 objc 绑定 | 最「原生」，但与纸张风格协调成本高 |

### Q4 提取引擎的默认路线

| 方案 | 说明 |
| --- | --- |
| **A 云优先 + 本地降级（推荐）** | 默认用云 OCR（GLM-OCR / Mistral OCR）出高质量 Markdown；无网或未配密钥时退到内建快线（秒级、离线、质量一般） |
| B 只做内建快线 | 零成本、零依赖，但公式 / 表格 / 双栏质量不足以支撑「读提取稿」 |
| C 只做云 | 简单，但没有离线路径，且断网即不可用 |


**本轮落实与验收**：主入口先判断是否已配密钥；已配时云优先，首次询问页面上传至智谱并记住同意；未配或云失败时使用本地快线，明确提示降级。另保留手选两条路线。单页真实结果见 §2.4，当前云脚本仍为逐页串行，逐页并发／失败页续传未通过本轮验收，不宣称 Q5 已实现。公式／表格页及整篇云耗时尚无真实测量。

### Q5 整篇一次转换 vs 逐页并发

| 方案 | 说明 |
| --- | --- |
| **A 逐页并发（推荐）** | 页面 → 图片（200 DPI）→ 并发请求 → 按页码合并；单页失败可重试、可对齐页码、成本可控、可中断续传 |
| B 整篇一次（GLM-5.3-Flash 的 File 输入 + 1M 上下文） | 跨页结构（长表格、参考文献）更连贯、请求数最少；但单次失败代价高、超长文档可能超限 |
| C 两者都做（A 默认，B 作为「论文模式」可选） | 工作量最大，但按你的「论文是重点」定位，值得留接口 |

### Q6 云引擎与密钥管理

| 项 | 推荐 |
| --- | --- |
| 是否允许联网 | **允许**（用户已表态；这是 PRD §2「本地优先」的**显式例外**，需在 PRD 里写清） |
| 上传前提示 | 必须：首次云端提取时明确告知「会把页面图像上传到 X 服务」，并记住选择 |
| 密钥位置 | `~/.config/runningdo/secrets.env`（chmod 600）+ 环境变量覆盖；**绝不进入仓库、绝不下发前端**（`AGENTS.md` 已有「No secrets in frontend」同源规矩） |
| 成本记录 | 每次提取记录引擎、页数、token 用量与估算费用，写进 `paper_extracts.meta`，设置页可看累计 |
| 引擎切换 | 转换器配置化（命令模板 / HTTP 端点 / 内置），换引擎不需要改代码 |

### Q7 文件策略

| 方案 | 说明 |
| --- | --- |
| **A 拷贝进数据目录（推荐）** | `files/papers/<id>/<原名>.pdf`；原路径与 sha256 记档，缺失可检测；ScholarFlow 已验证 |
| B 只引用原路径 | 省磁盘，但文件一移动就废；个人文献库最怕这个 |

### Q8 docx / pptx 支持路径

| 方案 | 说明 |
| --- | --- |
| **A 转 Markdown 后阅读（推荐）** | 用 `markitdown`（已装，本地、轻）或 docling；**不做原生渲染** |
| B 原生渲染 | macOS 需要 Office 预览插件，成本高、收益低 |
| C 不做 | 与「能兼容更好」的期望不符，但最省事 |

### Q9 翻译（后续功能的前置设计）

| 方案 | 说明 |
| --- | --- |
| **A v1.4 不做，但产物按可翻译分块输出（推荐）** | Markdown 按标题分块 + 公式/引用保护标记 + 段落 id；将来接翻译只做「读块 → 写块」 |
| B 顺手在提取时翻译 | 一次请求两件事，省事但难以校对；且翻译质量与提取质量耦合，出错不好定位 |

### Q10 元数据获取（已拍板：A + 附加要求）

| 方案 | 说明 |
| --- | --- |
| **A 不做联网检索（已拍板）**，但从提取结果里**顺带抽取**标题 / 作者 / 年份 / DOI 作为「建议值」，用户一键采纳（零额外请求） | **附加要求：云引擎提取时必须返回 `title` 与 `venue`（期刊/会议）** —— 写进提示词与 `paper_extracts.meta.suggested`，前端展示为可一键采纳的建议值 |
| B 接 Crossref / DOI 抓取 | 仍不做（需要额外联网 + 去重逻辑） |

### Q11 `libpdfium.dylib` 的获取方式（若采用内建快线）

| 方案 | 说明 |
| --- | --- |
| **A 随包 vendor（推荐）** | 把 `libpdfium.dylib`（约 15 MB）放进 `src-tauri/resources/`，随 `.app` 分发；用户零配置 |
| B 用户自备 + 环境变量（ScholarFlow 做法） | 零仓库体积，但要手动下载，换机器容易忘 |
| C 不用 PDFium | 改用 **PyMuPDF / pypdfium2（已在 `.conda/lit` 里）** 或 macOS PDFKit；把「快线」整体放到 Python 侧执行 |

> 注：`pypdfium2` 已经在 v1.4 环境里了 —— 如果快线走 Python 侧，**这条依赖问题可以整体绕开**（代价是多一次进程调用）。

### Q12 测试素材是否入库

| 方案 | 说明 |
| --- | --- |
| **A 入库（推荐）** | `docs/test/` 目前未纳入 git（`?? docs/test/`）；2.2 MB，作为提取质量的固定基准值得留下 |
| B 不入库 | 仓库更干净，但每次验证都要另找样本 |

---

## 4. 技术方案（拍板后细化）

### 4.1 数据模型（草案，迁移 → 备份 `version: 5`）

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

### 4.2 命令清单（Rust 侧，草案）

| 分组 | 命令 |
| --- | --- |
| 树 | `list_library_nodes` / `create_library_node` / `rename_library_node` / `move_library_node` / `delete_library_node`（级联或提示） |
| 条目 | `list_papers(node_id?, query?)` / `save_paper` / `delete_paper` / `duplicate_paper`? |
| 文件 | `import_paper_file(paper_id, src_path)`（拷贝 + sha256 + 去重）/ `read_paper_file(file_id)`（返回字节，供前端渲染）/ `reveal_paper_file`（在访达中显示）/ `scan_missing_files` |
| 提取 | `extract_markdown(file_id, engine, opts)` / `list_extracts(paper_id)` / `read_extract(extract_id)` / `delete_extract` / `get_extract_quality` |
| 标签 | `list_tags` / `save_tag` / set_paper_tags` |
| 元数据 | `suggest_metadata(file_id)`（从提取结果抽取，离线）/ `export_bibtex(papers)` |

**文件访问纪律**：一律通过 Rust 命令（沿用现有架构），不新增 `fs` 插件；选文件用 `tauri-plugin-dialog`，外部打开用 `tauri-plugin-opener`。

### 4.3 提取管线（两条轨）

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

### 4.4 界面（草案）

| 区域 | 内容 |
| --- | --- |
| 顶栏 | 第四个页面入口「文献」（`LIT-01`）；验收含「1040×700 + 特大字号下四个入口可见可点」 |
| 库树（左） | 文件夹树（新建 / 重命名 / 删除 / 移动）；根节点「全部文献 / 未分类」 |
| 列表（中） | 标题 + 作者 + 年份 + 类别角标 + 状态点；排序与筛选（文件夹 / 标签 / 类别 / 状态 / 关键词） |
| 详情（右） | 元数据区 + 笔记 + 文件清单 + **阅读区**：`原文 PDF｜提取稿 Markdown` 双模式切换（并排留给宽窗） |
| 提取态 | 未提取 / 提取中（进度）/ 已完成（引擎、页数、耗时、费用）/ 失败（原因 + 重试） |
| 设置 | 新增「文献」分组：默认引擎、并发数、密钥状态、附件目录、累计费用 |

**阅读稿渲染**：Markdown 需要数学与表格 → `react-markdown + remark-gfm + remark-math + rehype-katex + katex`；图片走本地文件协议或 Rust 命令返回。

### 4.5 与既有模块的关系（v1.4 只做最少的桥，待 Q 拍板）

| 桥 | 形态 | 说明 |
| --- | --- | --- |
| 文献 → 议程 | 「读《X》」生成一条议程事项 | 复用 `AG-05` 的浮层与单向出口模式 |
| 文献 → 日历 / 倒计时 | 「安排到某天」/「设为 deadline」 | 与 `AG-05`、`CD-01` 同源 |
| 反向关联 | 不做 | 避免双向同步的复杂度（v1.2 的教训） |

---

## 5. 实施顺序（拍板后按此推进）

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

## 6. 验收与测试计划

| 层 | 内容 |
| --- | --- |
| 数据层（`cargo test`） | 树 CRUD / 移动 / 级联删除；条目 CRUD；文件导入幂等（同 sha256 去重）；缺失检测；提取记录与状态流转；备份 v5 与迁移幂等（含「兜底备份失败即中止」） |
| DOM 冒烟（新套件 `literature.smoke.tsx`） | 页面切换、树操作、条目表单校验（空标题 / IME）、列表筛选、阅读模式切换、提取状态渲染、删除确认文案 |
| 样式不变量 | 沿用 `tokens.test.ts` 三条：`font-size` 必须乘 `--font-scale`、文字容器只用 `min-height`、禁止原生控件 |
| 提取质量（人工核对清单） | 用 `docs/test/` 样本比较 标题层级 / 段落完整性 / 公式数量 / 表格结构 / 参考文献，逐项打勾并记录在案 |
| 性能 | 1000 条文献列表与树操作；单篇 15 页：快线 ≤ 5 s、云线 ≤ 60 s；提取过程不阻塞 UI |
| 隐私 | 默认不联网；首次云端提取必须显式确认；密钥不出主进程 |

---

## 7. 风险

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

## 8. 已落地的环境与依赖（本次）

### 8.1 v1.4 专用 conda 环境（用户指定：放本目录）

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

### 8.2 若采用本地重引擎（M0 里按需装，命令示例）

```bash
# docling（PDF + DOCX/PPTX/XLSX → Markdown，CPU 可跑）
./.conda/lit/bin/python -m pip install docling
# MinerU（中文 + 公式；Apple Silicon 走 MPS/MLX）
conda run -p "$PWD/.conda/lit" python -m pip install -U "mineru[core]"
```

### 8.3 待新增的工程依赖（实现阶段）

| 端 | 依赖 | 用途 |
| --- | --- | --- |
| Rust | `tauri-plugin-dialog`、`tauri-plugin-opener` | 选文件 / 在访达中显示 / 外部打开 |
| Rust | `sha2` | 文件指纹（与 ScholarFlow 一致） |
| Rust（可选） | `pdfium-render` + `libpdfium.dylib` | 内建快线（若走 Rust 侧） |
| 前端 | `pdfjs-dist` | PDF 渲染（Q3-A） |
| 前端 | `react-markdown` `remark-gfm` `remark-math` `rehype-katex` `katex` | Markdown + 数学渲染 |

### 8.4 本轮实跑记录（2026-10-04）

- `pnpm check` → 76/76（纯逻辑与样式）+ 365/365（DOM 冒烟 11 套件）
- `cargo test` → 32/32
- 环境可用性：`pymupdf` 成功解析 `docs/test/attention-is-all-you-need.pdf`（15 页 / 39,498 字符 / 无乱码残留）
- 清单刷新：`~/Development/scripts/refresh-inventory.sh` 已执行，`inventory.json` 已包含 `lit` 环境

---

## 9. 相关文档

| 文档 | 关系 |
| --- | --- |
| [PRD](../../v0/PRD.md) | 唯一活规格；拍板后新增 `LIT-*` 需求与验收标准 |
| [DESIGN](../../v0/DESIGN.md) | 视觉与组件规格；文献页需新增章节 |
| [ScholarFlow](../../../../MyOSPs/ScholarFlow) | 参照实现（数据模型、pdf2md 管线、PDF.js 两级显示） |
| [v1.3 发布说明](./RELEASE-NOTES-v1.3.md) | 基线版本（同库数据、迁移与备份纪律） |
