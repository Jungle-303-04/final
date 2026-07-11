export type ProductCapabilityId =
  | "home"
  | "resources"
  | "issues"
  | "topology"
  | "applications"
  | "timeline"
  | "gitops";

export type ProductRouteIcon =
  | "home"
  | "resources"
  | "issues"
  | "topology"
  | "applications"
  | "timeline"
  | "gitops";

export interface ProductRouteDefinition {
  id: ProductCapabilityId;
  label: string;
  path: `/product${string}`;
  icon: ProductRouteIcon;
  shortcut: `g ${string}`;
  match: "exact" | "prefix";
}

export const PRODUCT_ROUTE_CATALOG = [
  route("home", "Home", "/product", "g h", "exact"),
  route("resources", "Resources", "/product/resources", "g r"),
  route("issues", "Issues", "/product/issues", "g i"),
  route("topology", "Topology", "/product/topology", "g t"),
  route("applications", "Applications", "/product/applications", "g a"),
  route("timeline", "Timeline", "/product/timeline", "g l"),
  route("gitops", "GitOps", "/product/gitops", "g o"),
] as const satisfies readonly ProductRouteDefinition[];

export function productNavigationForCapabilities(
  capabilities: ReadonlySet<ProductCapabilityId>,
): readonly ProductRouteDefinition[] {
  return PRODUCT_ROUTE_CATALOG.filter((routeDefinition) => capabilities.has(routeDefinition.id));
}

export function productRouteForPath(pathname: string): ProductRouteDefinition | null {
  return PRODUCT_ROUTE_CATALOG.find((routeDefinition) => ownsPath(routeDefinition, pathname)) ?? null;
}

export function resolveProductRoute(pathname: string): ProductRouteDefinition {
  return productRouteForPath(pathname) ?? PRODUCT_ROUTE_CATALOG[0];
}

export function routeDefinitionForCapability(
  capability: ProductCapabilityId,
): ProductRouteDefinition {
  const routeDefinition = PRODUCT_ROUTE_CATALOG.find((candidate) => candidate.id === capability);
  if (!routeDefinition) throw new Error(`unknown product capability: ${capability}`);
  return routeDefinition;
}

function route(
  id: ProductCapabilityId,
  label: string,
  path: `/product${string}`,
  shortcut: `g ${string}`,
  match: "exact" | "prefix" = "prefix",
): ProductRouteDefinition {
  return { id, label, path, icon: id, shortcut, match };
}

function ownsPath(routeDefinition: ProductRouteDefinition, pathname: string): boolean {
  if (routeDefinition.id === "home" && pathname === "/product/home") return true;
  if (routeDefinition.match === "exact") return pathname === routeDefinition.path;
  return pathname === routeDefinition.path || pathname.startsWith(`${routeDefinition.path}/`);
}
