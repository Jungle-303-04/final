import type { ComponentType } from "react";

import type { HelmPort } from "../../features/helm/helmContract";
import { HelmPage } from "./HelmPage";

export function createHelmSurface(port: HelmPort): ComponentType {
  function HelmSurface() {
    return <HelmPage port={port} />;
  }

  HelmSurface.displayName = "HelmSurface";
  return HelmSurface;
}
