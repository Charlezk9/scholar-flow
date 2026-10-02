/**
 * 全局秒级心跳。
 *
 * 只让调用 `useNow()` 的组件重渲染，避免每秒刷新整棵组件树。
 * 窗口从后台切回前台时立即刷新一次，保证休眠唤醒后数字不滞后。
 */
import { useSyncExternalStore } from "react";

let current = Date.now();
const listeners = new Set<() => void>();
let timer: number | undefined;

function tick() {
  current = Date.now();
  for (const l of listeners) l();
}

function start() {
  if (timer !== undefined) return;
  current = Date.now();
  timer = window.setInterval(tick, 1000);
}

function stop() {
  if (timer === undefined) return;
  window.clearInterval(timer);
  timer = undefined;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0) stop();
  };
}

function snapshot() {
  return current;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") start();
  });
  window.addEventListener("focus", () => {
    if (listeners.size > 0) tick();
  });
}

/** 每秒刷新一次的「当前时间戳（ms）」。 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
