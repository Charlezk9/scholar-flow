import {setupDom,ok,report,section,q,text} from './harness';
setupDom();
async function main(){
 const React=await import('react');const {createRoot}=await import('react-dom/client');const {default:DiagnosticPanel}=await import('../components/DiagnosticPanel');
 const {recordDiagnostic,showDiagnostics,safeAttributes,installDiagnostics,diagnosticInvoke,getDiagnostics}=await import('../lib/diagnostics');
 const root=createRoot(document.getElementById('root')!);
 await React.act(async()=>{root.render(React.createElement(DiagnosticPanel));});
 section('本地诊断反馈');
 ok('正常使用无报错浮条',!q('.diagnostic-notice'));
 ok('正文及密钥排除',JSON.stringify(safeAttributes({body:'secret text',apiKey:'key',blockId:60,rule:'extra_number'}))==='{"blockId":60,"rule":"extra_number"}');
 await React.act(async()=>{await recordDiagnostic('TRANSLATION_NUMERIC_MISMATCH','validate','operation-test',{blockId:60});});
 ok('失败保留明确提示',text(q('.diagnostic-notice')).includes('数值校验'));
 await React.act(async()=>{(q('.diagnostic-notice button') as HTMLButtonElement).click();});
 ok('诊断弹层使用portal',!!document.body.querySelector('.diagnostic-dialog')&&!document.getElementById('root')!.querySelector('.diagnostic-dialog'));
 ok('详情关联操作及段落',text(q('.diagnostic-dialog')).includes('operation-test')&&text(q('pre')).includes('"blockId":60'));
 ok('提供复制和打开目录',text(q('footer')).includes('复制诊断信息')&&text(q('footer')).includes('打开日志目录'));
 await React.act(async()=>{window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});
 ok('Escape关闭详情保留错误',!q('.diagnostic-dialog')&&!!q('.diagnostic-notice'));
 await React.act(async()=>{showDiagnostics();});ok('设置可再次打开历史',!!q('.diagnostic-dialog'));
 const off=installDiagnostics();await React.act(async()=>{window.dispatchEvent(new window.ErrorEvent('error',{message:'secret paper text',error:new Error('API key secret')}));});
 ok('全局异常不记录原始文本',!text(q('pre')).includes('API key secret')&&!text(q('pre')).includes('secret paper text'));off();
 let fail=true;let forwarded='';const logs:unknown[]=[];
 Object.defineProperty(window,'__TAURI_INTERNALS__',{configurable:true,value:{invoke:async(command:string,args:Record<string,unknown>)=>{if(command==='record_diagnostic'){logs.push(args.record);return;}if(command==='read_diagnostics')return logs.map(r=>JSON.stringify(r)).join('\n');forwarded=String(args.operationId);return fail?{status:'failed',error:'翻译失败：extra_number'}:{status:'done'};}}});
 const before=getDiagnostics().length;
 await React.act(async()=>{try{await diagnosticInvoke('extract_paper_markdown',{paperId:'test-paper'});}catch{/* expected */}});
 ok('同一失败只记录一次并关联操作编号',getDiagnostics().length===before+1&&getDiagnostics().at(-1)?.operationId===forwarded);
 fail=false;await React.act(async()=>{await diagnosticInvoke('extract_paper_markdown',{paperId:'test-paper'});});
 ok('重试成功后标记当前错误已解决',getDiagnostics().at(-1)?.resolved===true);
 Reflect.deleteProperty(window,'__TAURI_INTERNALS__');
 const {default:DiagnosticBoundary}=await import('../components/DiagnosticBoundary');
 function Broken():never{throw new Error('private rendered body');}
 const previousError=console.error;console.error=()=>{};
 try{await React.act(async()=>{root.render(React.createElement(DiagnosticBoundary,null,React.createElement(Broken)));});}finally{console.error=previousError;}
 ok('渲染异常仍保留诊断入口',!!q('.diagnostic-fallback')&&text(q('.diagnostic-fallback')).includes('查看诊断'));
 ok('渲染异常记录不含正文',getDiagnostics().at(-1)?.stage==='render'&&!JSON.stringify(getDiagnostics()).includes('private rendered body'));
 await React.act(async()=>{root.unmount();});report();
}
main().catch(e=>{console.error(e);process.exit(1);});
