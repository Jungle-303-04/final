import type { ComponentType } from "react";
import {
  deleteHelmChartSource,
  getHelmRelease,
  listHelmChartSources,
  listHelmReleases,
  registerHelmChartSource,
  startHelmArtifactRead,
  startHelmReleaseUpgrade,
} from "../../../api";
import { createHelmAdapter } from "../../../features/helm/createHelmAdapter";
import { createHelmSurface } from "../../../pages/helm/createHelmSurface";

export function loadHelmSurface(): ComponentType {
  return createHelmSurface(createHelmAdapter({
    deleteHelmChartSource,
    getHelmRelease,
    listHelmChartSources,
    listHelmReleases,
    registerHelmChartSource,
    startHelmArtifactRead,
    startHelmReleaseUpgrade,
  }));
}
