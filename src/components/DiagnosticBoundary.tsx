import {Component,type ReactNode} from "react";
import DiagnosticPanel from "./DiagnosticPanel";
import {reportError,showDiagnostics} from "../lib/diagnostics";
/** 渲染失败时仍保留诊断入口，避免报错反馈随页面一起卸载。 */
export default class DiagnosticBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 componentDidCatch(error:Error){reportError(error,"render",undefined,{exceptionType:error.name});}
 render(){return this.state.failed?<><main className="diagnostic-fallback"><h2>界面发生异常</h2><p>可查看诊断信息，或重新加载界面。</p><button className="btn btn-outline" onClick={showDiagnostics}>查看诊断</button><button className="btn btn-outline" onClick={()=>window.location.reload()}>重新加载界面</button></main><DiagnosticPanel/></>:this.props.children;}
}
