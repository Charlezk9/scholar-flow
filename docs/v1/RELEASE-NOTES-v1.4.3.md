# v1.4.3

## 文献转换性能

针对 `docs/test/attention-is-all-you-need.pdf`（15 页）完成两阶段性能对比：

| 阶段 | 配置 | 总耗时 | 结果 |
| --- | --- | ---: | --- |
| PDF → Markdown 基线 | 云端逐页串行 | 162.9 s | 15 页，质量检查通过 |
| PDF → Markdown 优化 | `GLM_CONCURRENCY=4` | 44.4 s | 15 页，质量检查通过 |
| 中文翻译基线 | 批次串行 | 228.5 s | 179 段，校验通过 |
| 中文翻译优化 | `GLM_TRANSLATE_CONCURRENCY=3` | 92.7 s | 179 段，校验通过 |

OCR 耗时下降约 72.8%，翻译耗时下降约 59.4%。OCR 并发不改变页序或费用；翻译并发按批次合并结果，失败波次自动回退到原有串行重试路径。默认翻译并发保持 1，以兼容既有重试测试；部署时可设置 `GLM_TRANSLATE_CONCURRENCY=2` 或 `3`。本地 PyMuPDF 快线在测试 PDF 上为 0.06～0.15 秒，仍应优先用于文本层完整的文献。

验证：`python -m unittest discover -s scripts -p 'test_*markdown.py'`（29 项通过）。
