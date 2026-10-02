import { useEffect, useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useStore } from "../store/useStore";
import Portal from "./Portal";

/**
 * 纸张风格确认弹窗。
 *
 * 为什么不用 `window.confirm`：Tauri 用的 wry 在 macOS 上**没有实现**
 * `webView:runJavaScriptConfirmPanelWithMessage:initiatedByFrame:completionHandler:`，
 * 按 WebKit 规范此时 `window.confirm()` 不弹窗、直接返回 `false`，
 * 于是「if (confirm(...)) doDelete()` 里的删除永远不执行 —— 看起来就是功能没实现。
 */
export default function ConfirmDialog() {
  const dialog = useStore((s) => s.dialog);
  const dismiss = useStore((s) => s.dismissDialog);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!dialog) return;
    setBusy(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dialog, dismiss]);

  if (!dialog) return null;

  const {
    title,
    message,
    confirmLabel = "确定",
    cancelLabel = "取消",
    danger = true,
  } = dialog;

  const run = async () => {
    setBusy(true);
    try {
      await dialog.onConfirm();
    } finally {
      useStore.getState().dismissDialog();
    }
  };

  return (
    <Portal>
      <div className="mask mask-soft" onClick={dismiss} />
      <div className="confirm" role="alertdialog" aria-label={title}>
        <div className="confirm-head">
          <span className={`confirm-ic ${danger ? "is-danger" : ""}`}>
            {danger ? <Trash2 size={16} /> : <AlertTriangle size={16} />}
          </span>
          <h3>{title}</h3>
        </div>

        {message ? <p className="confirm-msg">{message}</p> : null}

        <div className="confirm-foot">
          <button className="btn btn-outline" onClick={dismiss} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => void run()}
            disabled={busy}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Portal>
  );
}
