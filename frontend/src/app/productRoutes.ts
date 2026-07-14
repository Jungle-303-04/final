export type ProductSurfaceId =
  | "clusters"
  | "home"
  | "resources"
  | "issues"
  | "metrics"
  | "applications"
  | "gitops"
  | "catalog";

export type ProductRouteIcon =
  | "clusters"
  | "home"
  | "resources"
  | "issues"
  | "metrics"
  | "applications"
  | "gitops"
  | "catalog";

export type ProductLaneId = "rca" | "metrics" | "workloads-gitops" | "ai-catalog";

export interface ProductRouteDefinition {
  id: ProductSurfaceId;
  label: string;
  path: `/${string}`;
  icon: ProductRouteIcon;
  shortcut: `g ${string}`;
  match: "exact" | "prefix";
}

export const PRODUCT_ROUTE_CATALOG = [
  route("clusters", "Clusters", "/clusters", "g k"),
  route("home", "Home", "/", "g h", "exact"),
  route("resources", "Resources", "/resources", "g r"),
  route("issues", "Issues", "/issues", "g i"),
  route("metrics", "Metrics", "/metrics", "g m"),
  route("applications", "Applications", "/applications", "g a"),
  route("gitops", "Workflows", "/gitops", "g o"),
  route("catalog", "Catalog", "/catalog", "g c"),
] as const satisfies readonly ProductRouteDefinition[];

export const PRODUCT_LANE_ROUTE_STUBS = {
  rca: ["issues"],
  metrics: ["metrics"],
  "workloads-gitops": ["applications", "gitops"],
  "ai-catalog": ["catalog"],
} as const satisfies Record<ProductLaneId, readonly ProductSurfaceId[]>;

export function productNavigationForReleasedSurfaces(
  releasedSurfaceIds: ReadonlySet<ProductSurfaceId>,
): readonly ProductRouteDefinition[] {
  return PRODUCT_ROUTE_CATALOG.filter((routeDefinition) => releasedSurfaceIds.has(routeDefinition.id));
}

export function productRouteForPath(pathname: string): ProductRouteDefinition | null {
  return PRODUCT_ROUTE_CATALOG.find((routeDefinition) => ownsPath(routeDefinition, pathname)) ?? null;
}

export function resolveProductRoute(pathname: string): ProductRouteDefinition {
  return productRouteForPath(pathname) ?? PRODUCT_ROUTE_CATALOG[0];
}

export function routeDefinitionForSurface(
  surfaceId: ProductSurfaceId,
): ProductRouteDefinition {
  const routeDefinition = PRODUCT_ROUTE_CATALOG.find((candidate) => candidate.id === surfaceId);
  if (!routeDefinition) throw new Error(`unknown product surface: ${surfaceId}`);
  return routeDefinition;
}

function route(
  id: ProductSurfaceId,
  label: string,
  path: `/${string}`,
  shortcut: `g ${string}`,
  match: "exact" | "prefix" = "prefix",
): ProductRouteDefinition {
  return { id, label, path, icon: id, shortcut, match };
}

function ownsPath(routeDefinition: ProductRouteDefinition, pathname: string): boolean {
  if (routeDefinition.id === "home" && pathname === "/home") return true;
  if (routeDefinition.match === "exact") return pathname === routeDefinition.path;
  return pathname === routeDefinition.path || pathname.startsWith(`${routeDefinition.path}/`);
}
