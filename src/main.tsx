import {installDiagnostics} from "./lib/diagnostics";
import React from "react";
import ReactDOM from "react-dom/client";
import DiagnosticBoundary from "./components/DiagnosticBoundary";
import App from "./App";
import "./styles/tokens.css";
import "./styles/app.css";

installDiagnostics();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <DiagnosticBoundary><App /></DiagnosticBoundary>
  </React.StrictMode>,
);
