import type { ComponentType } from "react";

import { DeployPage } from "./DeployPage";

export function createDeploySurface(surfaces: {
  Applications: ComponentType;
  GitOps: ComponentType;
  Helm: ComponentType;
}): ComponentType {
  function DeploySurface() {
    return <DeployPage {...surfaces} />;
  }
  DeploySurface.displayName = "DeploySurface";
  return DeploySurface;
}
