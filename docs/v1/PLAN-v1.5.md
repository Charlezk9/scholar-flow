# v1.5 增量施工图

2026-10-13；范围仅 PRD LIT-32、LIT-33。

## 现状证据
- `src/components/LiteraturePage.tsx:222` 新建先保存空条目，`:568` 表单在侧栏，年份/来源占用空间。
- `src-tauri/src/commands.rs:379` 选择附件必须已有 paper_id。
- `src/components/LiteraturePage.tsx:175` guarded 每次全量 reload；`:600` 滚动同步写 localStorage；`:539` 每层目录重复扫描全部条目。
- `src-tauri/src/commands.rs:200` 目录数据库命令同步执行。

## 实施
- Portal 弹卡包含附件、可编辑标题、现有类别、文件夹选择；选择文件与保存分离，取消不落库；后台创建并导入，失败清理本次新条目。
- 目录索引缓存，名称省略、计数固定；浏览记忆延后写并在卸载时保存；目录增改移动局部更新，删除仅刷新目录与文献；数据库命令放后台线程。
- DOM 回归覆盖必选、自动标题、取消、目录选择、失败及局部更新；Rust 验证附件失败回滚；执行 pnpm check 与 cargo test。

## 待拍板项
无。附件标题取文件名（去扩展名），存储文件夹沿用资料库目录语义。

## 验证记录（2026-10-13）
- `pnpm check`：类型检查、76 项逻辑/样式、523 项 DOM 检查通过，其中资料库 120 项。新增覆盖附件必选、选择取消、自动标题/手动标题保护、文件夹选择、失败保留输入、重复标题、目录移动不重载资产、滚动延后持久化。
- `cargo test --manifest-path src-tauri/Cargo.toml`：52 项通过；新增必选附件、超限附件失败回滚、成功导入和重复标题保护。
- `pnpm tauri build --debug --bundles app`：成功，产物 `src-tauri/target/debug/bundle/macos/RunningDO.app`。
- 浏览器核验 Portal 弹卡、按钮禁用与类别样式；600px 窄视口弹卡 clientWidth/scrollWidth 均为 458，1040×700 下布局可见。截图 `/tmp/runningdo-v1.5-create.jpg`。
- 本次未操作真实资料库，未做原生文件选择到提交的完整人工验收；不宣称已有原生拖放问题完成验收，也不以回归测试代替大规模资料库流畅度实测。
