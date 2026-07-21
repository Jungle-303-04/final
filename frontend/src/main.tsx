import ReactDOM from "react-dom/client";
import { UnifiedApp } from "./devpreview-unified";

const deployedSourceSha = import.meta.env.VITE_SOURCE_SHA;
if (/^[0-9a-f]{40}$/.test(deployedSourceSha ?? "")) {
  document.documentElement.dataset.sourceSha = deployedSourceSha;
}

// UI-PHASE2-001 §5.1: the unified shell is the single root product app. It is
// mounted here from the normal root entry (no StrictMode double-invoke, matching
// the shell's timer/animation visual contract). The superseded Phase-1 legacy
// root graph has been removed (§5.5); this is the only production root.
ReactDOM.createRoot(document.getElementById("root")!).render(<UnifiedApp />);
