import { useEffect, useRef } from "react";

/** 站内对话框：焦点限制在弹层中，关闭后归还给触发按钮。 */
export function useDialogFocus(open: boolean) {
  const ref = useRef<HTMLElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) returnFocus.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;
  useEffect(() => {
    if (!open) return;
    const previous = returnFocus.current;
    const dialog = ref.current;
    if (!dialog) return;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
    // 已有 autoFocus 输入保持焦点，否则聚焦第一个控件。
    if (!dialog.contains(document.activeElement)) focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusable();
      const first = els[0], last = els[els.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (!dialog.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", trap);
    return () => { window.removeEventListener("keydown", trap); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  return ref;
}
