/**
 * 冒烟测试共享环境：jsdom + 断言 + 事件派发。
 * 必须在 import 任何组件之前调用 setupDom()（组件模块顶层会读 document）。
 */
import { JSDOM } from "jsdom";

let dom: JSDOM | null = null;

export function setupDom(): JSDOM {
  if (dom) return dom;
  const d = new JSDOM(
    `<!doctype html><html><body><div id="root"></div></body></html>`,
    { pretendToBeVisual: true, url: "http://localhost/" },
  );

  dom = d;

  const def = (key: string, value: unknown) =>
    Object.defineProperty(globalThis, key, {
      value,
      writable: true,
      configurable: true,
    });

  def("window", d.window);
  def("document", d.window.document);
  def("navigator", d.window.navigator); // Node 24 的 navigator 是只读 getter
  def("HTMLElement", d.window.HTMLElement);
  def("HTMLButtonElement", d.window.HTMLButtonElement);
  def("HTMLInputElement", d.window.HTMLInputElement);
  def("DOMRect", d.window.DOMRect);
  def("MouseEvent", d.window.MouseEvent);
  def("PointerEvent", d.window.MouseEvent);
  def("KeyboardEvent", d.window.KeyboardEvent);
  def("Event", d.window.Event);
  def("getComputedStyle", d.window.getComputedStyle.bind(d.window));
  // 预览后端用 localStorage 存数据，必须挂到全局
  def("localStorage", d.window.localStorage);
  def("sessionStorage", d.window.sessionStorage);
  def("IS_REACT_ACT_ENVIRONMENT", true);

  // jsdom 没有布局引擎，scrollTop / scrollTo 需要打桩，否则滚轮测不了
  Object.defineProperty(d.window.Element.prototype, "scrollTop", {
    get(this: { __st?: number }) {
      return this.__st ?? 0;
    },
    set(this: { __st?: number }, v: number) {
      this.__st = Math.max(0, v);
    },
    configurable: true,
  });
  type ScrollArg = { top?: number } | number;
  (d.window.Element.prototype as unknown as Record<string, unknown>).scrollTo =
    function (
      this: { __st?: number; dispatchEvent: (e: unknown) => void },
      a: ScrollArg,
      b?: number,
    ) {
      this.__st = Math.max(0, typeof a === "object" ? (a.top ?? 0) : (b ?? 0));
      this.dispatchEvent(new d.window.Event("scroll"));
    };

  return d;
}

/* ============================================================ 断言 */

export const tally = { pass: 0, fail: 0, failures: [] as string[] };

export function section(name: string) {
  console.log(`\n【${name}】`);
}

export function ok(name: string, cond: boolean, extra = "") {
  if (cond) {
    tally.pass += 1;
    console.log(`  ✔ ${name}`);
  } else {
    tally.fail += 1;
    tally.failures.push(name);
    console.log(`  ✖ ${name}${extra ? "  → " + extra : ""}`);
  }
}

/** 打印结果并结束进程（必须显式退出：秒级心跳持有定时器） */
export function report(): void {
  console.log(`\n${"─".repeat(48)}`);
  if (tally.fail === 0) {
    console.log(`✅ 全部通过：${tally.pass} 项`);
    process.exit(0);
  }
  console.log(`❌ ${tally.fail} 项失败 / 共 ${tally.pass + tally.fail} 项`);
  tally.failures.forEach((f) => console.log(`   - ${f}`));
  process.exit(1);
}

/* ============================================================ DOM 查询 */

export const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;
export const qa = (sel: string) =>
  Array.from(document.querySelectorAll(sel)) as HTMLElement[];
export const text = (el: HTMLElement | null) => (el?.textContent ?? "").trim();
export const byText = (sel: string, t: string) =>
  qa(sel).find((el) => text(el) === t) ?? null;

/* ============================================================ 事件派发 */

export function click(el: HTMLElement | null, name = "元素") {
  if (!el) throw new Error(`找不到可点击元素：${name}`);
  el.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true }),
  );
}

export function mouseDown(el: HTMLElement) {
  el.dispatchEvent(
    new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }),
  );
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 双击（里程碑改名用） */
export function doubleClick(el: HTMLElement | null, name = "元素") {
  if (!el) throw new Error(`找不到可双击元素：${name}`);
  el.dispatchEvent(
    new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }),
  );
}

/**
 * 往受控输入框里打字。
 * 不能直接 `el.value = v` —— React 用自身的 value tracker 判断「变没变」，
 * 直接赋值会让它认为值没动、不触发 onChange。必须走原型上的原生 setter。
 */
export function typeInto(el: HTMLElement | null, value: string, name = "输入框") {
  if (!el) throw new Error(`找不到${name}`);
  const input = el as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
}

/** 敲一个键（Enter / Escape） */
export function pressKey(
  el: HTMLElement | null,
  key: string,
  init: { composing?: boolean } = {},
) {
  if (!el) throw new Error(`找不到按键目标：${key}`);
  const ev = new window.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  if (init.composing) {
    Object.defineProperty(ev, "isComposing", { value: true });
  }
  el.dispatchEvent(ev);
}
