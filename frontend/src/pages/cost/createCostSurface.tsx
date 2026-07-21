import type { ComponentType } from "react";

import type { CostPort } from "../../features/cost/costContract";
import { CostPage } from "./CostPage";

export function createCostSurface(port: CostPort): ComponentType {
  function CostSurface() {
    return <CostPage port={port} />;
  }

  CostSurface.displayName = "CostSurface";
  return CostSurface;
}
