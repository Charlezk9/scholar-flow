# PDF 转 Markdown 进度施工图

需求：PRD LIT-30。
现状：src/components/LiteraturePage.tsx:604 仅显示不定量进度；scripts/extract_markdown.py:176 在主线程收集完成页；scripts/layout_markdown.py:81 按三页整理；src-tauri/src/library.rs:831 已有翻译侧文件轮询机制。
实施：复用侧文件轮询方式，分别上报提取和整理的完成页数；按附件、引擎和启动时间隔离，完成收起、失败提示。进度写入失败不影响转换。
待拍板项：无；显示阶段进度，不将页数比例冒充剩余时间。
