import {
  Activity,
  Boxes,
  BellRing,
  Clock,
  DollarSign,
  GitBranch,
  Home,
  Layers3,
  Network,
  Package,
  Server,
  Settings,
  ShieldCheck,
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
  topology: Network,
  timeline: Clock,
  traffic: Activity,
  helm: Package,
  checks: ShieldCheck,
  cost: DollarSign,
  alerts: BellRing,
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
  topology: "shell.nav.topology",
  timeline: "shell.nav.timeline",
  traffic: "shell.nav.traffic",
  helm: "shell.nav.helm",
  checks: "shell.nav.checks",
  cost: "shell.nav.cost",
  alerts: "settings.section.alerts",
  resources: "shell.nav.resources",
  settings: "shell.nav.settings",
} satisfies Record<ProductSurfaceId, MessageKey>;
