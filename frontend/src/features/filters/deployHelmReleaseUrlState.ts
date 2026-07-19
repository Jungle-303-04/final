export interface DeployHelmReleaseIdentity {
  clusterId: string;
  namespace: string;
  releaseName: string;
}

const HELM_RELEASE_CLUSTER_PARAM = "helm.release.cluster";
const HELM_RELEASE_NAMESPACE_PARAM = "helm.release.namespace";
const HELM_RELEASE_NAME_PARAM = "helm.release.name";

export function parseDeployHelmReleaseIdentity(
  searchParams: URLSearchParams,
): DeployHelmReleaseIdentity | null {
  const clusterId = searchParams.get(HELM_RELEASE_CLUSTER_PARAM)?.trim();
  const namespace = searchParams.get(HELM_RELEASE_NAMESPACE_PARAM)?.trim();
  const releaseName = searchParams.get(HELM_RELEASE_NAME_PARAM)?.trim();
  return clusterId && namespace && releaseName
    ? { clusterId, namespace, releaseName }
    : null;
}

export function writeDeployHelmReleaseSearch(
  searchParams: URLSearchParams,
  identity: DeployHelmReleaseIdentity | null,
): string {
  const next = new URLSearchParams(searchParams);
  if (identity) {
    next.set(HELM_RELEASE_CLUSTER_PARAM, identity.clusterId);
    next.set(HELM_RELEASE_NAMESPACE_PARAM, identity.namespace);
    next.set(HELM_RELEASE_NAME_PARAM, identity.releaseName);
  } else {
    next.delete(HELM_RELEASE_CLUSTER_PARAM);
    next.delete(HELM_RELEASE_NAMESPACE_PARAM);
    next.delete(HELM_RELEASE_NAME_PARAM);
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}
