import {useEffect,useState,useSyncExternalStore} from "react";
import Portal from "./Portal";
import {useDialogFocus} from "../lib/dialogFocus";
import {getDiagnostics,subscribeDiagnostics,readDiagnosticLog,openDiagnosticDirectory} from "../lib/diagnostics";
export default function DiagnosticPanel(){
 const records=useSyncExternalStore(subscribeDiagnostics,getDiagnostics);
 const [open,setOpen]=useState(false);const [log,setLog]=useState("");const [status,setStatus]=useState("");const [dismissed,setDismissed]=useState<string|null>(null);
 const ref=useDialogFocus(open);const latest=records.filter(r=>!r.resolved).at(-1);
 useEffect(()=>{const show=()=>setOpen(true);window.addEventListener("runningdo-diagnostics-open",show);return()=>window.removeEventListener("runningdo-diagnostics-open",show);},[]);
 useEffect(()=>{if(!open)return;let active=true;void readDiagnosticLog().then(value=>{if(active)setLog(value);}).catch(()=>{if(active)setStatus("日志暂不可读，当前诊断仍可复制。");});const key=(e:KeyboardEvent)=>{if(e.key==="Escape"){e.stopPropagation();setOpen(false);}};window.addEventListener("keydown",key,true);return()=>{active=false;window.removeEventListener("keydown",key,true);};},[open,records]);
 const text=log||records.map(r=>JSON.stringify(r)).join("\n");
 const details=text.split("\n").flatMap(line=>{try{return [JSON.parse(line) as {event:string;stage:string;operationId:string;attributes:Record<string,unknown>}];}catch{return [];}}).filter(r=>r.operationId===latest?.operationId&&typeof r.attributes?.blockId==="number").at(-1);

 return <>
 {latest&&dismissed!==latest.operationId&&<aside className="diagnostic-notice" role="status"><span>{latest.message}</span><button className="btn btn-outline" onClick={()=>setOpen(true)}>查看诊断</button><button className="btn btn-ghost" aria-label="收起错误提示" onClick={()=>setDismissed(latest.operationId)}>×</button></aside>}
 {open&&<Portal><div className="mask mask-soft diagnostic-mask" onClick={()=>setOpen(false)}/><section className="diagnostic-dialog" role="dialog" aria-modal="true" aria-label="诊断日志" ref={ref}><header><h3>诊断日志</h3><button className="btn btn-ghost" aria-label="关闭诊断日志" onClick={()=>setOpen(false)}>×</button></header><p>本地诊断记录包含操作编号和失败阶段，不包含文献正文或密钥。</p>{latest&&<p>{latest.message}<br/>错误码：{latest.event} · 阶段：{latest.stage}<br/>操作编号：{latest.operationId}{details&&<><br/>失败段落：{Number(details.attributes.blockId)+1} · 规则：{String(details.attributes.rule??details.event)}</>}</p>}<pre tabIndex={0}>{text||"暂无诊断记录"}</pre><footer><button className="btn btn-outline" onClick={()=>void navigator.clipboard.writeText(text).then(()=>setStatus("诊断信息已复制")).catch(()=>setStatus("复制失败，可选中上方日志手动复制。"))}>复制诊断信息</button><button className="btn btn-outline" onClick={()=>void openDiagnosticDirectory().catch(()=>setStatus("无法打开日志目录，请在桌面应用中重试。"))}>打开日志目录</button></footer><p role="status">{status}</p></section></Portal>}
 </>;
}
