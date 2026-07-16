import type { ComponentType } from "react";
import {
  getHelmRelease,
  listHelmChartSources,
  listHelmReleases,
  registerHelmChartSource,
  startHelmArtifactRead,
} from "../../../api";
import { createHelmAdapter } from "../../../features/helm/createHelmAdapter";
import { createHelmSurface } from "../../../pages/helm/createHelmSurface";

export function loadHelmSurface(): ComponentType {
  return createHelmSurface(createHelmAdapter({
    getHelmRelease,
    listHelmChartSources,
    listHelmReleases,
    registerHelmChartSource,
    startHelmArtifactRead,
  }));
}
