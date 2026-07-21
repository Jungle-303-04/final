import ReactDOM from "react-dom/client";
import { lazy, Suspense } from "react";

// UI-PHASE2-001 P1(5): the unified shell (and its motion/animation dependency) is
// loaded as a deferred chunk so the initial JS entry stays under the bundle gate.
const UnifiedApp = lazy(() => import("./devpreview-unified").then((module) => ({ default: module.UnifiedApp })));

const deployedSourceSha = import.meta.env.VITE_SOURCE_SHA;
if (/^[0-9a-f]{40}$/.test(deployedSourceSha ?? "")) {
  document.documentElement.dataset.sourceSha = deployedSourceSha;
}

// UI-PHASE2-001 §5.1: the unified shell is the single root product app. It is
// mounted here from the normal root entry (no StrictMode double-invoke, matching
// the shell's timer/animation visual contract). The superseded Phase-1 legacy
// root graph has been removed (§5.5); this is the only production root.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <Suspense fallback={null}>
    <UnifiedApp />
  </Suspense>,
);
