import React from "react";
import ReactDOM from "react-dom/client";
import ProductApp from "./ProductApp";

const deployedSourceSha = import.meta.env.VITE_SOURCE_SHA;
if (/^[0-9a-f]{40}$/.test(deployedSourceSha ?? "")) {
  document.documentElement.dataset.sourceSha = deployedSourceSha;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProductApp />
  </React.StrictMode>,
);
