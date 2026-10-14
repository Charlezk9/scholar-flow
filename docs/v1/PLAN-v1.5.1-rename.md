# ScholarFlow 更名与 Git 分支方案

日期：2026-10-13；对应既有需求 MAC-03。

## 现状
- src-tauri/tauri.conf.json:3 为产品名，:5 为影响数据位置的应用标识。
- src-tauri/Cargo.toml:2、:10、:14 为包、库及二进制名称。
- src/components/TopBar.tsx:16、:38 为窗口标题和品牌。

## 实施与验收
- 项目目录、产品名、标题、菜单、构建名称改为 ScholarFlow；Rust 包与库改为 scholarflow / scholarflow_lib。
- 保留应用标识、数据库名称、配置路径及存储键，继续使用原有数据。
- origin 配置为 git@github.com:Charlezk9/scholar-flow.git；采用 main / develop，在 AGENTS.md 记录规则。
- 执行 pnpm check、前端构建和 Rust 测试；检查 Git 差异与远程连接。
