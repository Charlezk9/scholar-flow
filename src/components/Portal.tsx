import { type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * 把浮层渲染到 document.body。
 *
 * 为什么必须这样做：`position: fixed` 的元素，如果祖先链上存在
 * **非 none 的 transform / filter / will-change**，它的包含块就不再是视口，
 * 而是那个祖先。典型受害者是 `.drawer`（滑入动画用了 transform，
 * 且 `animation-fill-mode: both` 让 transform 在动画结束后依然保留），
 * 结果抽屉里的选择浮层会被推到屏幕外，表现为「点了没反应」。
 *
 * 走 portal 之后，浮层脱离任何 transformed 祖先，定位始终以视口为准。
 */
export default function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
