import {setupDom,ok,report,section,q,text} from './harness';
setupDom();
async function main() {
 const React=await import('react'); const {createRoot}=await import('react-dom/client');
 const {default:MarkdownReader}=await import('../components/MarkdownReader');
 const root=createRoot(document.getElementById('root')!);
 await React.act(async()=>{root.render(React.createElement(MarkdownReader,{text:'# 论文\n\n能量 $E=mc^2$\n\n$$\n\\frac{1}{2}\n$$\n\n| 项 | 值 |\n| --- | --- |\n| A | B |\n\n<script>alert(1)</script>\n\n![图示](https://example.com/track.png)'}));});
 section('Markdown 与 KaTeX 安全阅读');
 ok('标题渲染为语义标题',text(q('.lit-md h1'))==='论文');
 ok('行内公式本地渲染',!!q('.lit-md .katex'));
 ok('独立公式渲染',!!q('.lit-md .katex-display'));
 ok('论文表格可读',text(q('.lit-md td'))==='A');
 ok('不执行原始 HTML',!q('.lit-md script'));
 ok('图占位不向外发请求',!q('.lit-md img')&&text(q('.lit-figure')).includes('图示'));
 report();
}
void main();
