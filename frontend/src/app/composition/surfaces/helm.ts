import type { ComponentType } from "react";
import {
  checkHelmReleaseUpgrades,
  deleteHelmChartSource,
  getHelmChartDetail,
  getHelmRelease,
  getArtifactHubChart,
  getHelmReleaseUpgradeInfo,
  listHelmChartSources,
  listHelmReleases,
  listHelmReleaseVersions,
  listHelmInstallTargets,
  registerHelmChartSource,
  refreshHelmRepository,
  startHelmArtifactRead,
  startHelmReleaseUpgrade,
  startHelmReleaseValuesPreview,
  startHelmReleaseRollback,
  startHelmReleaseUninstall,
  startHelmReleaseInstall,
  searchArtifactHubCharts,
  searchHelmCharts,
} from "../../../api";
import { createHelmAdapter } from "../../../features/helm/createHelmAdapter";
import { createHelmSurface } from "../../../pages/helm/createHelmSurface";

export function loadHelmSurface(): ComponentType {
  return createHelmSurface(createHelmAdapter({
    checkHelmReleaseUpgrades,
    deleteHelmChartSource,
    getHelmChartDetail,
    getHelmRelease,
    getArtifactHubChart,
    getHelmReleaseUpgradeInfo,
    listHelmChartSources,
    listHelmReleases,
    listHelmReleaseVersions,
    listHelmInstallTargets,
    registerHelmChartSource,
    refreshHelmRepository,
    startHelmArtifactRead,
    startHelmReleaseUpgrade,
    startHelmReleaseValuesPreview,
    startHelmReleaseRollback,
    startHelmReleaseUninstall,
    startHelmReleaseInstall,
    searchArtifactHubCharts,
    searchHelmCharts,
  }));
}
