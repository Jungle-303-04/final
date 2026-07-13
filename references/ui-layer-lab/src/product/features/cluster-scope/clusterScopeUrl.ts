const CLUSTER_QUERY_KEY = "cluster";

export interface ProductClusterQuery {
  present: boolean;
  value: string | null;
}

export function readProductClusterQuery(search: string): ProductClusterQuery {
  const params = new URLSearchParams(search);
  return params.has(CLUSTER_QUERY_KEY)
    ? { present: true, value: params.get(CLUSTER_QUERY_KEY) ?? "" }
    : { present: false, value: null };
}

export function productNavigationHref(
  path: `/product${string}`,
  currentSearch: string,
): string {
  const cluster = readProductClusterQuery(currentSearch);
  if (!cluster.present) return path;
  const query = new URLSearchParams([[CLUSTER_QUERY_KEY, cluster.value ?? ""]]);
  return `${path}?${query.toString()}`;
}

export function productClusterChangeHref(pathname: string, clusterId: string): string {
  const normalized = clusterId.trim();
  if (!normalized) throw new TypeError("clusterId must not be empty");
  const query = new URLSearchParams([[CLUSTER_QUERY_KEY, normalized]]);
  return `${pathname}?${query.toString()}`;
}
