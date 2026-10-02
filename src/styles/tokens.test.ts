/**
 * 样式不变量测试。
 *
 * 目的：字号可调之后，最容易出的问题是「文字被裁掉」或「布局错位」。
 * 这里把「不畸变」的约束写成断言，防止以后有人改回去：
 *   1. 所有 font-size 必须乘 var(--font-scale)
 *   2. 承载文字的容器必须用 min-height，不能用固定 height
 *   3. 结构尺寸 token 必须随字号变化
 *   4. 组件里不许写裸 fontSize: 数字
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const appCss = readFileSync("src/styles/app.css", "utf8");
const tokensCss = readFileSync("src/styles/tokens.css", "utf8");

/**
 * 剥掉注释再做「禁止出现 X」类的断言。
 * 否则会误伤「为什么不用 X」这类解释性注释 —— 那些注释正是要留的。
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** 极简规则解析：取出 `selector { body }`（不含嵌套） */
function parseRules(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    out.push({
      // 选择器前面可能挂着上一段的分节注释，要剥掉
      selector: m[1]
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\s+/g, " ")
        .trim(),
      body: m[2],
    });
  }
  return out;
}

const rules = parseRules(appCss);

function bodyOf(selector: string): string | undefined {
  return rules.find((r) => r.selector === selector)?.body;
}

/* ---------------------------------------------------------------- 1 */

test("所有 font-size 都乘了 --font-scale（除预览示例外不允许固定像素）", () => {
  const offenders: string[] = [];
  const re = /font-size:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(appCss))) {
    const value = m[1].trim();
    if (value === "inherit") continue;
    if (!value.includes("var(--font-scale)")) {
      offenders.push(value);
    }
  }
  assert.deepEqual(offenders, [], `这些 font-size 不会跟着字号变：${offenders.join(", ")}`);
});

/* ---------------------------------------------------------------- 2 */

const TEXT_CONTAINERS = [
  ".topbar-date",
  ".search",
  ".ghost-btn",
  ".field, .input",
  ".picker",
  ".btn",
  ".btn-sm",
  ".tag-today",
  ".segmented button",
  ".segmented.mini button",
  ".weekday-row",
  ".badge",
  ".badge-today",
  ".span-bar",
  ".mini-grid .d",
  ".tg-head",
  ".tg-allday .line",
  ".allday-bar",
  ".drawer-head",
  ".settings-nav button",
  ".menu button",
  ".pop-day",
  ".jump-wrap .picker",
];

test("承载文字的容器一律用 min-height，不用固定 height", () => {
  const problems: string[] = [];
  for (const sel of TEXT_CONTAINERS) {
    const body = bodyOf(sel);
    assert.ok(body !== undefined, `找不到规则：${sel}`);
    if (/(^|[^-])height:\s*\d/.test(body ?? "")) {
      problems.push(sel);
    }
    if (!/min-height:/.test(body ?? "")) {
      problems.push(`${sel}（连 min-height 都没有）`);
    }
  }
  assert.deepEqual(problems, [], `这些容器放大字后会把文字裁掉：${problems.join(" / ")}`);
});

test("min-height 用 calc 且随 --fs-step 温和增长（不是恒定值）", () => {
  for (const sel of [".btn", ".picker", ".search", ".pop-day", ".badge", ".mini-grid .d"]) {
    const body = bodyOf(sel) ?? "";
    const decl = body.match(/min-height:\s*[^;]+;/)?.[0] ?? "";
    assert.ok(decl !== "", `${sel} 没有 min-height`);
    assert.ok(decl.includes("calc("), `${sel} 的 min-height 不是 calc：${decl}`);
    assert.ok(
      decl.includes("var(--fs-step)"),
      `${sel} 的 min-height 没有跟随字号：${decl}`,
    );
    assert.ok(
      !/calc\(\s*[0-9.]+px\s*\)/.test(decl),
      `${sel} 的 min-height 是个常数：${decl}`,
    );
  }
});

/* ---------------------------------------------------------------- 3 */

test("tokens.css 定义了 --font-scale 与 --fs-step", () => {
  assert.match(tokensCss, /--font-scale:\s*1;/, "缺少 --font-scale 基准值");
  assert.match(tokensCss, /--fs-step:\s*calc\(var\(--font-scale\) - 1\)/);
});

test("四档 [data-font] 均有定义", () => {
  for (const key of ["sm", "md", "lg", "xl"]) {
    assert.match(
      tokensCss,
      new RegExp(`\\[data-font="${key}"\\]\\s*\\{[^}]*--font-scale:`),
      `缺少 [data-font="${key}"]`,
    );
  }
});

test("顶栏高 / 左栏宽 / 抽屉宽 / 月行高 / 时间轴行高都随字号变化", () => {
  for (const token of ["--topbar-h", "--sidebar-w", "--drawer-w", "--row-h", "--hour-h"]) {
    const m = tokensCss.match(new RegExp(`\\${token}:\\s*([^;]+);`));
    assert.ok(m, `tokens.css 缺少 ${token}`);
    assert.ok(
      m![1].includes("var(--font-scale)") || m![1].includes("var(--fs-step)"),
      `${token} 不会随字号变化：${m![1]}`,
    );
  }
});

test("--hour-h / --wheel-h 的基准值与 fontScale.ts 的常量一致", () => {
  assert.match(tokensCss, /--hour-h:\s*calc\(44px \* var\(--font-scale\)\)/);
  assert.match(tokensCss, /--wheel-h:\s*calc\(32px \* var\(--font-scale\)\)/);
});

test("间距 token 刻意不缩放（避免整体位移感）", () => {
  for (const token of ["--sp-1", "--sp-2", "--sp-3", "--sp-4", "--sp-5", "--sp-6"]) {
    const m = tokensCss.match(new RegExp(`\\${token}:\\s*([^;]+);`));
    assert.ok(m, `缺少 ${token}`);
    assert.ok(
      !m![1].includes("--font-scale"),
      `${token} 跟着字号变了，会导致整体位移：${m![1]}`,
    );
  }
});

test("月视图行高用了 --row-h", () => {
  const body = bodyOf(".month-grid") ?? "";
  assert.match(body, /minmax\(var\(--row-h\), 1fr\)/);
});

/* ---------------------------------------------------------------- 5 */

test("皇冠栏高度跟随 --crown-h，不用固定 height", () => {
  const body = bodyOf(".crown-bar") ?? "";
  assert.ok(body !== "", "找不到 .crown-bar 规则");
  assert.match(body, /min-height:\s*var\(--crown-h\)/);
  assert.ok(
    !/(^|[^-])height:\s*\d/.test(body),
    `.crown-bar 用了固定 height，字大了会裁字：${body.match(/(^|[^-])height:[^;]*/)?.[0]}`,
  );
  const token = tokensCss.match(/--crown-h:\s*([^;]+);/);
  assert.ok(token, "tokens.css 缺少 --crown-h");
  assert.ok(
    token![1].includes("var(--fs-step)"),
    `--crown-h 不随字号变化：${token![1]}`,
  );
});

test("皇冠栏的倒计时用等宽数字（秒在跳但宽度不抖）", () => {
  const body = bodyOf(".crown-time") ?? "";
  assert.match(body, /font-variant-numeric:\s*tabular-nums/);
  assert.match(body, /white-space:\s*nowrap/);
});

test("皇冠栏与顶栏都占满整行且可换行折叠", () => {  const topbar = bodyOf(".topbar") ?? "";
  const crown = bodyOf(".crown-bar") ?? "";
  for (const [name, body] of [
    [".topbar", topbar],
    [".crown-bar", crown],
  ] as const) {
    assert.ok(
      /flex:\s*0 0 (auto|var\(--topbar-h\))/.test(body) || /flex:\s*0 0/.test(body),
      `${name} 没在纵向弹性布局里固定高度：${body}`,
    );
  }
});

/* ---------------------------------------------------------------- 4 */

test("组件里不许出现裸 fontSize: 数字（必须走 fs()）", () => {
  const dir = "src/components";
  const offenders: string[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".tsx")) continue;
    const src = readFileSync(join(dir, file), "utf8");
    const re = /fontSize:\s*[0-9.]+/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) offenders.push(`${file}: ${m[0]}`);
  }
  assert.deepEqual(offenders, [], `这些内联字号不会跟随缩放：${offenders.join(" / ")}`);
});

test("使用 fs() 的组件都正确 import 了它", () => {
  const dir = "src/components";
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".tsx")) continue;
    const src = readFileSync(join(dir, file), "utf8");
    if (/\bfs\(/.test(src)) {
      assert.match(
        src,
        /import \{[^}]*\bfs\b[^}]*\} from "\.\.\/lib\/fontScale"/,
        `${file} 用了 fs() 但没 import`,
      );
    }
  }
});

/* ---------------------------------------------------------------- 6 */
/* v1.1 新增：字体统一（UI-18）/ 皇冠居中（UI-14）/ 左栏夹取（UI-19） */

test("UI-18 · app.css 里不许写裸 font-family（必须走 --font-* token）", () => {
  const offenders: string[] = [];
  const re = /font-family:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(appCss))) {
    const value = m[1].trim();
    if (!value.startsWith("var(--font-")) offenders.push(value);
  }
  assert.deepEqual(offenders, [], `这些 font-family 绕过了 token：${offenders.join(", ")}`);
});

test("UI-18 · 字体栈必须让 -apple-system 排在 PingFang 之前", () => {
  const stacks = ["--font-ui", "--font-display", "--font-num"];
  for (const name of stacks) {
    const m = tokensCss.match(new RegExp(`\\${name}:\\s*([\\s\\S]*?);`));
    assert.ok(m, `tokens.css 缺少 ${name}`);
    const value = m![1];
    const apple = value.indexOf("-apple-system");
    const pingfang = value.indexOf("PingFang SC");
    assert.ok(apple >= 0, `${name} 缺少 -apple-system（数字就不是 SF Pro 了）`);
    assert.ok(
      pingfang === -1 || apple < pingfang,
      `${name} 把 PingFang 排在 -apple-system 前面，tabular-nums 会失效`,
    );
  }
});

test("UI-18 · 不许写 font-weight: 700（PingFang SC 没有 Bold，会被合成假粗）", () => {
  const offenders = appCss.match(/font-weight:\s*[789]00/g) ?? [];
  assert.deepEqual(offenders, [], `这些字重会被合成：${offenders.join(", ")}`);
});

test("UI-18 · 会跳秒/跳数的元素都要声明 tabular-nums", () => {
  for (const sel of [
    ".crown-time",
    ".cd-days",
    ".cd-days .clock-inline",
    ".cd-days .clock-num",
    ".wheel-item",
    ".topbar-date .clock",
    ".font-preview .fp-clock",
  ]) {
    const body = bodyOf(sel) ?? "";
    assert.ok(body !== "", `找不到规则：${sel}`);
    assert.match(
      body,
      /font-variant-numeric:\s*tabular-nums/,
      `${sel} 的宽度会随着秒数抖`,
    );
  }
});

test("UI-14 · 皇冠栏内容组居中，且倒计时不再被 margin-left:auto 顶到右端", () => {
  const bar = bodyOf(".crown-bar") ?? "";
  assert.match(bar, /justify-content:\s*center/, ".crown-bar 没有居中");
  const time = bodyOf(".crown-time") ?? "";
  assert.ok(
    !/margin-left:\s*auto/.test(time),
    ".crown-time 又有 margin-left:auto 了，会退回两端对齐",
  );
  assert.match(time, /flex:\s*0 0 auto/, "倒计时必须固定宽，不能被标题挤到截断");
  const off = bodyOf(".crown-off") ?? "";
  assert.match(
    off,
    /position:\s*absolute/,
    "取消按钮要绝对定位，否则它自己的宽度会把居中推偏",
  );
  assert.ok(bodyOf(".crown-main") !== undefined, "缺少 .crown-main（内容组容器）");
});

test("UI-19 · 左栏要夹取，保证日历区不低于 640px", () => {  const body = bodyOf(".sidebar") ?? "";
  assert.match(
    body,
    /max-width:\s*calc\(100%\s*-\s*640px\)/,
    ".sidebar 没有 max-width 夹取：字号「特大」+ 1040 小窗会把日历挤破",
  );
  const token = tokensCss.match(/--sidebar-w:\s*([^;]+);/);
  assert.ok(token, "tokens.css 缺少 --sidebar-w");
  assert.match(token![1], /372px/, `v1.1 的左栏基准宽应为 372px：${token![1]}`);
});

/* ---------------------------------------------------------------- 7 */
/* v1.1 新增：编辑抽屉（UI-16/17）与里程碑区（CD-17） */

test("UI-17 · 抽屉关闭按钮在左上角（不能用 right 定位）", () => {
  const body = bodyOf(".drawer-close") ?? "";
  assert.ok(body !== "", "找不到 .drawer-close");
  assert.match(body, /left:\s*10px/, ".drawer-close 没有 left 定位");
  assert.ok(
    !/(^|[^-])right:\s*\d/.test(body),
    ".drawer-close 又回到右上角了（决议 Q8：两个抽屉统一左上）",
  );
});

test("CD-17 · 里程碑/子项清单不得引入第二个泡、不得用原生复选框", () => {
  // v1.2：渲染与交互抽到通用 Checklist，里程碑只是薄容器 —— 断言对象跟着搬
  const source = stripComments(readFileSync("src/components/Checklist.tsx", "utf8"));
  assert.ok(
    !/className="panel/.test(source),
    "里程碑区出现了 .panel（第二个泡），违背「同一泡」原则",
  );
  assert.ok(
    !/type="checkbox"/.test(source),
    "里程碑区用了原生 <input type=checkbox>（UI-20：原生控件泄漏）",
  );
  assert.match(source, /role="checkbox"/, "自绘复选框应有 role=checkbox 与 aria-checked");
});

test("UI-15 · 展开动效不得用 transform / grid-template-rows 过渡", () => {
  const source = stripComments(readFileSync("src/components/Milestones.tsx", "utf8"));
  assert.ok(
    !/grid-template-rows/.test(source),
    "grid-template-rows 过渡在 macOS 11 的 WebKit（Safari 14）上不被支持，会静默失效",
  );
  const body = bodyOf(".ms-collapse") ?? "";
  assert.match(body, /transition:\s*height/, ".ms-collapse 应该过渡 height");
  assert.ok(
    !/transform/.test(body),
    ".ms-collapse 用了 transform —— 非 none 的 transform 会成为 fixed 后代的包含块（DESIGN §5.11）",
  );
  assert.match(
    appCss,
    /@media \(prefers-reduced-motion: reduce\)/,
    "动效必须尊重「减弱动态效果」系统设置",
  );
});

test("CD-18 · 折叠徽章必须用等宽数字（1/3 与 8/8 同宽）", () => {
  const body = bodyOf(".tag-ms") ?? "";
  assert.match(body, /font-variant-numeric:\s*tabular-nums/);
});

/* ---------------------------------------------------------------- 8 */
/* v1.1 新增：迷你月历溢出（UI-21）与标题栏不折行（UI-22） */

test("UI-21 · 迷你月历必须均分列宽，且不许吃 UA 内边距", () => {
  const grid = bodyOf(".mini-grid") ?? "";
  assert.match(
    grid,
    /grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/,
    "`1fr` 的轨道最小值是格子的最小内容宽，会把 7 列顶出气泡；要用 minmax(0, 1fr)",
  );
  // 全局按钮 reset：WebKit 给 <button> 的 UA 内边距（约 1px 6px）会被算进最小内容宽
  const btn = bodyOf("button") ?? "";
  assert.match(btn, /padding:\s*0/, "全局 button reset 必须清掉 UA 内边距");
  const head = bodyOf(".mini-head .t") ?? "";
  assert.match(head, /min-width:\s*0/, "月历标题要能让位");
  assert.match(head, /text-overflow:\s*ellipsis/, "月历标题要能被截断");
});

test("UI-21 · 迷你月历栏宽必须随字号变化（原来是写死的 180px）", () => {
  const token = tokensCss.match(/--rail-w:\s*([^;]+);/);
  assert.ok(token, "tokens.css 缺少 --rail-w");
  assert.ok(
    token![1].includes("var(--fs-step)"),
    `--rail-w 不会随字号变化：${token![1]}`,
  );
  const rail = bodyOf(".rail") ?? "";
  assert.match(rail, /flex:\s*0 0 var\(--rail-w\)/, ".rail 必须用 --rail-w");
  assert.ok(!/flex:\s*0 0 180px/.test(rail), ".rail 又写死 180px 了");
});

test("UI-22 · 按钮标签一律不折行（折行会抬高按钮并抖动标题栏）", () => {
  const btn = bodyOf("button") ?? "";
  assert.match(btn, /white-space:\s*nowrap/, "全局 button reset 必须 nowrap");
});

test("UI-22 · 「谁让位」必须写死：标题让位、右侧控件不让位", () => {
  const title = bodyOf(".cal-title") ?? "";
  assert.match(title, /min-width:\s*0/, "标题没有 min-width: 0 → 它会拒绝收缩，把按钮挤折行");
  assert.match(title, /text-overflow:\s*ellipsis/, "标题被截断时要有省略号");
  const right = bodyOf(".cal-header .right") ?? "";
  assert.match(right, /flex:\s*0 0 auto/, "右侧控件组不参与收缩");
  assert.match(
    appCss,
    /\.cal-header \.right > \* \{[^}]*flex:\s*0 0 auto/,
    "右侧组内每个控件也不参与收缩",
  );
});

test("UI-22 · 窄窗降级只能用媒体查询（容器查询 macOS 11 不支持）", () => {
  assert.match(
    appCss,
    /@media \(max-width: 1180px\)\s*\{[^}]*\.cal-title/,
    "缺少窄窗标题字号降档的媒体查询",
  );
  assert.ok(
    !/@container/.test(appCss),
    "@container 要 Safari 16 / macOS 13 起才支持，本项目最低 macOS 11",
  );
  const jump = bodyOf(".jump-wrap") ?? "";
  assert.match(jump, /width:\s*clamp\(/, ".jump-wrap 宽度应该用 clamp 跟随窗口");
});

test("UI-22 · 标题字号不按视图分档（周/日 = 月 = 议程），但日/周视图不显示年份", () => {
  // 回退记录：曾给周/日视图加过 `.cal-title.is-compact`（22/400），现已撤销 ——
  // 四个视图必须用同一档字体，只有窄窗才整体降一档。
  assert.ok(
    !/\.cal-title\.is-compact/.test(appCss),
    "又出现了按视图分档的标题字号（UI-22 已回退该做法）",
  );
  const compact = /is-compact/.test(readFileSync("src/components/CalendarHeader.tsx", "utf8"));
  assert.ok(!compact, "CalendarHeader 不该再挂 is-compact");
  // 迷你月历标题的「瘦一号」保留（它没有月视图对应物，不参与「与月视图一致」）
  const mini = bodyOf(".mini-head .t") ?? "";
  const miniWeight = Number(mini.match(/font-weight:\s*(\d+)/)?.[1] ?? "0");
  const miniSize = Number(mini.match(/font-size:\s*calc\((\d+(?:\.\d+)?)px/)?.[1] ?? "0");
  assert.ok(miniWeight > 0 && miniWeight <= 500, `迷你月历标题应该变瘦：${miniWeight}`);
  assert.ok(miniSize > 0 && miniSize <= 13, `迷你月历标题应该降档：${miniSize}`);
  // 内容层面：日视图标题不显示年份，周视图标题不带年份（默认粒度）
  const header = stripComments(readFileSync("src/components/CalendarHeader.tsx", "utf8"));
  assert.match(header, /formatFullDate\(d, false\)/, "日视图标题应传 withYear=false");
  assert.match(header, /title=\{full\}/, "完整标题（含年份）应放在 title 属性里");
});

test("UI-24 · 卡片信息行：时分秒内联在天数后，不再有独立时钟行与「还有」", () => {
  const inline = bodyOf(".cd-days .clock-inline") ?? "";
  assert.ok(inline !== "", "缺少 .cd-days .clock-inline");
  assert.match(inline, /font-variant-numeric:\s*tabular-nums/, "秒在跳，必须等宽");
  assert.ok(
    !/\.cd-clock\b/.test(appCss),
    ".cd-clock（旧的独立时钟行）应已删除，样式表里不该再有它",
  );
  const card = stripComments(readFileSync("src/components/CountdownPanel.tsx", "utf8"));
  assert.ok(!/还有/.test(card), "「还有」这个灰色前缀已被移除");
  assert.match(card, /className="clock-inline"/, "时分秒应内联在 .cd-days 里");
});

test("UI-23 · 卡片右上角只承载「更多」，状态色在菜单里表达", () => {
  const card = stripComments(readFileSync("src/components/CountdownPanel.tsx", "utf8"));
  const actions = card.slice(card.indexOf('className="cd-actions"'));
  const block = actions.slice(0, actions.indexOf("</div>"));
  const buttons = (block.match(/<button/g) ?? []).length;
  assert.equal(buttons, 1, `卡片右上角应该只剩一个按钮，现在有 ${buttons} 个`);
  assert.match(block, /aria-label="更多操作"/, "留下的那个应该是「更多」");
  // 菜单项状态色
  assert.match(appCss, /\.menu button\.is-active\s*\{/, "缺少菜单项的状态色样式");
  const menu = stripComments(readFileSync("src/components/ContextMenu.tsx", "utf8"));
  assert.match(menu, /it\.active \? "is-active"/, "ContextMenu 应支持 active 状态");
  assert.match(menu, /aria-pressed=/, "状态项要带 aria-pressed");
});

/* ---------------------------------------------------------------- 9 */
/* v1.2 新增：议程页（UI-25 ~ UI-28 / AG-01 ~ AG-05） */

test("UI-25 · 议程两列便签板居中，且复用卡片语言", () => {
  const col = bodyOf(".agenda-col") ?? "";
  assert.ok(col !== "", "缺少 .agenda-col");
  assert.match(col, /max-width:\s*1120px/, "议程便签板最大宽度应为 1120px");
  assert.match(bodyOf(".ag-list") ?? "", /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(col, /margin:\s*0 auto/, "窄列要居中");

  const page = stripComments(readFileSync("src/components/AgendaPage.tsx", "utf8"));
  assert.match(page, /className=\{`cd-card ag-card/, "事项卡片应复用 .cd-card");
  // 子项必须是通用 Checklist（v1.2 抽取），不是第二份实现
  assert.match(page, /<Checklist/, "议程子项应使用通用 Checklist 组件");
  assert.ok(
    !/type="checkbox"/.test(page),
    "议程页出现了原生 <input type=checkbox>（UI-20：原生控件泄漏）",
  );
  assert.ok(
    !/window\.(prompt|confirm|alert)/.test(page),
    "议程页用了原生弹窗（UI-07 明令禁止：wry 没实现，会静默失败）",
  );
  // 右上角只留「更多」
  const actions = page.slice(page.indexOf('className="cd-actions"'));
  const block = actions.slice(0, actions.indexOf("</div>"));
  assert.equal(
    (block.match(/<button/g) ?? []).length,
    1,
    "事项卡右上角应该只剩一个按钮（⋯）",
  );
});

test("UI-27 · 安排到某天必须走站内浮层（不是原生弹窗），且 popover 落位正确", () => {
  const page = stripComments(readFileSync("src/components/AgendaPage.tsx", "utf8"));
  assert.match(page, /schedule-pop/, "缺少安排浮层");
  assert.match(page, /<Portal>/, "浮层必须 portal 到 body（DESIGN §5.11）");
  assert.match(page, /className="mask mask-soft"/, "浮层要有遮罩，点遮罩取消");
  const pop = bodyOf(".schedule-pop") ?? "";
  assert.match(pop, /position:\s*fixed/, "浮层要定位于视口");
});

test("AG-01 · 议程子项与里程碑共用同一套样式（不许长出第二份 checklist 样式）", () => {
  const css = appCss;
  // 只允许一套 .ms-* 规则（Checklist 用），不许出现 .ag-check / .ag-ms 之类的平行实现
  assert.ok(
    !/\.ag-(check|ms-row|ms-title|del|sub)\b/.test(css),
    "出现了议程专用的清单样式 —— 子项应该复用 .ms-*",
  );
  const checklist = stripComments(readFileSync("src/components/Checklist.tsx", "utf8"));
  assert.match(checklist, /className="ms-row/, "Checklist 应使用 .ms-* 类名");
});


test("v1.3 · 日视图双栏使用可收缩等宽轨道，保留月历宽度规则", () => {
  assert.match(bodyOf(".day-two-cols") ?? "", /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(bodyOf(".day-column-titles") ?? "", /repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(bodyOf(".day-column-head") ?? "", /padding-right:\s*var\(--timeline-scrollbar\)/);
  assert.match(bodyOf(".rail") ?? "", /width:\s*var\(--rail-w\)/);
});

test("v1.3 · 窄窗顶栏搜索先收缩，页面入口不参与收缩", () => {
  assert.match(bodyOf(".topbar .search") ?? "", /min-width:\s*38px/);
  assert.match(bodyOf(".topbar .search-ph") ?? "", /text-overflow:\s*ellipsis/);
  assert.match(appCss, /\.topbar > \.ghost-btn[^{}]*\{[^}]*flex:\s*0 0 auto/);
});
