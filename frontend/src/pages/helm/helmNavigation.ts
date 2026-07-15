export interface HelmReleaseRouteIdentity {
  clusterId: string;
  namespace: string;
  releaseName: string;
}

export const HELM_RELEASE_DETAIL_MATCH = "/helm/detail/:clusterId/:namespace/:releaseName" as const;

export function helmReleaseDetailHref(identity: HelmReleaseRouteIdentity): string {
  return `/helm/detail/${encodeURIComponent(identity.clusterId)}/${encodeURIComponent(identity.namespace)}/${encodeURIComponent(identity.releaseName)}`;
}
