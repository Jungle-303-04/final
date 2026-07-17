import type { ComponentType } from "react";
import {
  checkHelmReleaseUpgrades,
  deleteHelmChartSource,
  getHelmRelease,
  getHelmReleaseUpgradeInfo,
  listHelmChartSources,
  listHelmReleases,
  listHelmReleaseVersions,
  registerHelmChartSource,
  startHelmArtifactRead,
  startHelmReleaseUpgrade,
} from "../../../api";
import { createHelmAdapter } from "../../../features/helm/createHelmAdapter";
import { createHelmSurface } from "../../../pages/helm/createHelmSurface";

export function loadHelmSurface(): ComponentType {
  return createHelmSurface(createHelmAdapter({
    checkHelmReleaseUpgrades,
    deleteHelmChartSource,
    getHelmRelease,
    getHelmReleaseUpgradeInfo,
    listHelmChartSources,
    listHelmReleases,
    listHelmReleaseVersions,
    registerHelmChartSource,
    startHelmArtifactRead,
    startHelmReleaseUpgrade,
  }));
}
