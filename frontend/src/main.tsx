import React from "react";
import ReactDOM from "react-dom/client";
import { installChunkLoadRecovery } from "./app/chunkLoadRecovery";
import ProductApp from "./ProductApp";

const deployedSourceSha = import.meta.env.VITE_SOURCE_SHA;
installChunkLoadRecovery({ sourceSha: deployedSourceSha });
if (/^[0-9a-f]{40}$/.test(deployedSourceSha ?? "")) {
  document.documentElement.dataset.sourceSha = deployedSourceSha;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProductApp />
  </React.StrictMode>,
);
