/** 安全诊断：日志只保存规则/编号，不保存用户正文、原始异常或请求参数。 */
export type Diagnostic = {timestamp:string;level:string;event:string;stage:string;operationId:string;attributes:Record<string,unknown>;message?:string;resolved?:boolean};
const native = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const messages:Record<string,string> = {LAYOUT_VALIDATION_FAILED:"排版校验未通过，请查看失败规则及区块编号后重试。",TRANSLATION_NUMERIC_MISMATCH:"翻译数值校验未通过，已保存有效段落，可重试继续。",TRANSLATION_TOKEN_MISMATCH:"翻译保护内容校验未通过，已保存有效段落，可重试继续。",TRANSLATION_TIMEOUT:"翻译服务响应超时，已保存有效段落，可重试继续。",TRANSLATION_FAILED:"翻译失败，已保存有效段落，可重试继续。",APP_OPERATION_FAILED:"操作未完成，请查看诊断信息后重试。",FRONTEND_UNHANDLED:"界面发生异常，请查看诊断信息。"};
let records:Diagnostic[]=[];const listeners=new Set<()=>void>();const seen=new WeakSet<object>();
const fields=new Set(["blockId","batchIds","attempt","completed","total","elapsedMs","httpStatus","promptTokens","completionTokens","resumed","invalidated","rule","model","sourceHash","validatorVersion","paperId","command","exceptionType","missingTokenIds","duplicateTokenIds"]);
export function safeAttributes(input:Record<string,unknown>):Record<string,unknown> {return Object.fromEntries(Object.entries(input).filter(([k,v])=>fields.has(k) && (typeof v==="boolean" || typeof v==="number" && Number.isFinite(v) || typeof v==="string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(v) || Array.isArray(v) && v.length<=256 && v.every(n=>Number.isInteger(n)&&n>=0))));}
export const subscribeDiagnostics=(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};};
export const getDiagnostics=()=>records;
export function showDiagnostics(){window.dispatchEvent(new Event("runningdo-diagnostics-open"));}
export async function recordDiagnostic(event:string,stage:string,operationId:string,attributes:Record<string,unknown>={}) {
 const r:Diagnostic={timestamp:new Date().toISOString(),level:"ERROR",event,stage,operationId,attributes:safeAttributes(attributes),message:messages[event]??messages.APP_OPERATION_FAILED};
 records=[...records.slice(-99),r];listeners.forEach(f=>f());
 if(native()) try{const {invoke}=await import("@tauri-apps/api/core");await invoke("record_diagnostic",{record:r});}catch{/* 日志失败不影响操作。 */}
 return r;
}
export function reportError(error:unknown,stage="frontend",operationId=crypto.randomUUID(),attributes:Record<string,unknown>={}) {
 if(error && typeof error==="object") {if(seen.has(error))return;seen.add(error);}
 const text=String(error);const code=["render","runtime","promise"].includes(stage)?"FRONTEND_UNHANDLED":text.includes("LAYOUT_VALIDATION_FAILED")?"LAYOUT_VALIDATION_FAILED":text.includes("TRANSLATION_NUMERIC_MISMATCH")||text.includes("extra_number")||text.includes("added_sign")||text.includes("数值")?"TRANSLATION_NUMERIC_MISMATCH":text.includes("TRANSLATION_TOKEN_MISMATCH")||text.includes("token")?"TRANSLATION_TOKEN_MISMATCH":text.includes("超时")?"TRANSLATION_TIMEOUT":text.includes("翻译")?"TRANSLATION_FAILED":"APP_OPERATION_FAILED";
 void recordDiagnostic(code,stage,operationId,attributes);
}
export async function diagnosticInvoke<T>(command:string,args?:Record<string,unknown>):Promise<T> {
 const operationId=crypto.randomUUID();const {invoke}=await import("@tauri-apps/api/core");
 try {
  const result=await invoke<T>(command,command==="extract_paper_markdown"?{...args,operationId}:args);
  if(command==="extract_paper_markdown" && (result as {status?:string}).status==="failed") {const e=new Error((result as {error?:string}).error??"翻译失败");reportError(e,"extract",operationId,{command,paperId:args?.paperId});throw e;}
  if(records.some(r=>!r.resolved && r.attributes.command===command && r.attributes.paperId===args?.paperId)) {
   records=records.map(r=>r.attributes.command===command&&r.attributes.paperId===args?.paperId?{...r,resolved:true}:r);listeners.forEach(f=>f());
  }
  return result;
 }catch(error){const e=error instanceof Error?error:new Error(String(error));reportError(e,"command",operationId,{command,paperId:args?.paperId});throw e;}
}
export async function readDiagnosticLog():Promise<string> {if(!native())return records.map(r=>JSON.stringify(r)).join("\n");const {invoke}=await import("@tauri-apps/api/core");return invoke<string>("read_diagnostics");}
export async function openDiagnosticDirectory(){if(!native())throw new Error("浏览器预览没有本地日志目录");const {invoke}=await import("@tauri-apps/api/core");await invoke("open_diagnostics_dir");}
export function installDiagnostics(){
 const onError=(e:ErrorEvent)=>{reportError(e.error??new Error("runtime"),"runtime",undefined,{exceptionType:e.error instanceof Error?e.error.name:"Error"});};
 const onRejection=(e:PromiseRejectionEvent)=>{if(e.reason&&typeof e.reason==="object"&&seen.has(e.reason))return;reportError(e.reason,"promise",undefined,{exceptionType:e.reason instanceof Error?e.reason.name:"Error"});};
 window.addEventListener("error",onError);window.addEventListener("unhandledrejection",onRejection);
 return()=>{window.removeEventListener("error",onError);window.removeEventListener("unhandledrejection",onRejection);};
}
