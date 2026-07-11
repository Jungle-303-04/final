export interface ProductRouteDefinition {
  id: "home" | "metrics";
  label: string;
  path: "/product" | "/metrics";
  showInNavigation: boolean;
}

/**
 * Frontend release registry. Only routes that are backed by an implemented
 * product capability may appear in the shell navigation.
 */
export const PRODUCT_ROUTES = [
  {
    id: "home",
    label: "홈",
    path: "/product",
    showInNavigation: true,
  },
  {
    id: "metrics",
    label: "메트릭",
    path: "/metrics",
    showInNavigation: false,
  },
] as const satisfies readonly ProductRouteDefinition[];

export function productRouteForPath(pathname: string): ProductRouteDefinition | null {
  return PRODUCT_ROUTES.find((route) => pathname === route.path) ?? null;
}
