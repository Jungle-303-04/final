import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createDemoTopologyGateway } from "./composition/demoComposition";
import { ProductRoot } from "./ProductRoot";

const container = document.getElementById("root");

if (container === null) {
  throw new Error("Missing #root container");
}

createRoot(container).render(
  <StrictMode>
    <ProductRoot gateway={createDemoTopologyGateway()} />
  </StrictMode>,
);
