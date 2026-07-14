import {
  Boxes,
  GitBranch,
  Home,
  Layers3,
  Server,
  Settings,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import type { MessageKey } from "../shared/i18n";
import type { ProductRouteIcon, ProductSurfaceId } from "./productRoutes";

export const routeIcons: Record<ProductRouteIcon, LucideIcon> = {
  clusters: Server,
  home: Home,
  resources: Boxes,
  issues: TriangleAlert,
  applications: Layers3,
  gitops: GitBranch,
  settings: Settings,
};

export const navLabelKeys = {
  clusters: "shell.nav.clusters",
  applications: "shell.nav.applications",
  gitops: "shell.nav.gitops",
  home: "shell.nav.home",
  issues: "shell.nav.issues",
  resources: "shell.nav.resources",
  settings: "shell.nav.settings",
} satisfies Record<ProductSurfaceId, MessageKey>;
