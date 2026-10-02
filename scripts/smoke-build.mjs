// 用 vite SSR build 把 TSX 冒烟测试编译成 node 可直接执行的 JS
import { build } from "vite";
import react from "@vitejs/plugin-react";

await build({
  configFile: false,
  plugins: [react()],
  logLevel: "warn",
  build: {
    ssr: true,
    outDir: "node_modules/.smoke",
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: {
        pickers: "src/__smoke__/pickers.smoke.tsx",
        delete: "src/__smoke__/delete.smoke.tsx",
        drawer: "src/__smoke__/drawer.smoke.tsx",
        font: "src/__smoke__/font.smoke.tsx",
        crown: "src/__smoke__/crown.smoke.tsx",
        milestones: "src/__smoke__/milestones.smoke.tsx",
        "drawer-countdown": "src/__smoke__/drawer-countdown.smoke.tsx",
        "calendar-header": "src/__smoke__/calendar-header.smoke.tsx",
        card: "src/__smoke__/card.smoke.tsx",
        agenda: "src/__smoke__/agenda.smoke.tsx",
        v13: "src/__smoke__/v13.smoke.tsx",
      },
      output: { entryFileNames: "[name].mjs", format: "esm" },
    },
  },
});
console.log("smoke build ok");
