import type { ComponentType } from "react";
import {
  checkHelmReleaseUpgrades,
  deleteHelmChartSource,
  getHelmRelease,
  getArtifactHubChart,
  getHelmReleaseUpgradeInfo,
  listHelmChartSources,
  listHelmReleases,
  listHelmReleaseVersions,
  registerHelmChartSource,
  refreshHelmRepository,
  startHelmArtifactRead,
  startHelmReleaseUpgrade,
  startHelmReleaseRollback,
  startHelmReleaseUninstall,
  searchArtifactHubCharts,
} from "../../../api";
import { createHelmAdapter } from "../../../features/helm/createHelmAdapter";
import { createHelmSurface } from "../../../pages/helm/createHelmSurface";

export function loadHelmSurface(): ComponentType {
  return createHelmSurface(createHelmAdapter({
    checkHelmReleaseUpgrades,
    deleteHelmChartSource,
    getHelmRelease,
    getArtifactHubChart,
    getHelmReleaseUpgradeInfo,
    listHelmChartSources,
    listHelmReleases,
    listHelmReleaseVersions,
    registerHelmChartSource,
    refreshHelmRepository,
    startHelmArtifactRead,
    startHelmReleaseUpgrade,
    startHelmReleaseRollback,
    startHelmReleaseUninstall,
    searchArtifactHubCharts,
  }));
}
