import type { ComponentType } from "react";
import { getHelmRelease, listHelmReleases, startHelmArtifactRead } from "../../../api";
import { createHelmAdapter } from "../../../features/helm/createHelmAdapter";
import { createHelmSurface } from "../../../pages/helm/createHelmSurface";

export function loadHelmSurface(): ComponentType {
  return createHelmSurface(createHelmAdapter({
    getHelmRelease,
    listHelmReleases,
    startHelmArtifactRead,
  }));
}
