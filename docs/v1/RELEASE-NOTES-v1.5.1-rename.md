# ScholarFlow · v1.5.1 更名记录

2026-10-13：RunningDO 更名为 ScholarFlow，项目目录、应用标题、菜单和构建名称同步更新，版本号保持 v1.5.1。

保留原 bundle identifier `com.charlezk9.runningdo`、数据库名称、配置路径和存储键，延续已有数据。历史发布文档保留当时名称。

验证通过：`pnpm check`、`pnpm build`、`cargo test --manifest-path src-tauri/Cargo.toml`。尚未重新打包安装 macOS 应用。

2026-10-14 补充：重新通过 `pnpm check`、Rust 测试（52 项）与 `pnpm tauri build`，生成 release 包 `src-tauri/target/release/bundle/macos/ScholarFlow.app`。包内名称和可执行文件均为 ScholarFlow，应用标识保持不变，ad-hoc 签名校验通过。本次构建未安装到 `/Applications`，使用时需打开新包。

远程仓库配置为 `git@github.com:Charlezk9/scholar-flow.git`。采用 `main` 稳定分支与 `develop` 开发分支，具体操作遵循根目录 AGENTS.md。此次仅配置远程及本地开发分支，未提交、推送或安装应用。
