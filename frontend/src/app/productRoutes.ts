export type ProductSurfaceId =
  | "home"
  | "clusters"
  | "resources"
  | "issues"
  | "alerts"
  | "applications"
  | "gitops"
  | "settings";

export type ProductRouteIcon =
  | "home"
  | "clusters"
  | "resources"
  | "issues"
  | "alerts"
  | "applications"
  | "gitops"
  | "settings";

export interface ProductRouteDefinition {
  id: ProductSurfaceId;
  label: string;
  path: `/${string}`;
  icon: ProductRouteIcon;
  shortcut: `g ${string}`;
  match: "exact" | "prefix";
}

export const PRODUCT_ROUTE_CATALOG = [
  route("home", "Home", "/home", "g h", "exact"),
  route("clusters", "Clusters", "/clusters", "g k"),
  route("resources", "Resources", "/resources", "g r"),
  route("issues", "Incidents", "/issues", "g i"),
  route("alerts", "Alerts", "/alerts", "g l"),
  route("applications", "Applications", "/applications", "g a"),
  route("gitops", "GitOps", "/gitops", "g o"),
  route("settings", "Settings", "/settings", "g s"),
] as const satisfies readonly ProductRouteDefinition[];

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
  if (routeDefinition.match === "exact") return pathname === routeDefinition.path;
  return pathname === routeDefinition.path || pathname.startsWith(`${routeDefinition.path}/`);
}
