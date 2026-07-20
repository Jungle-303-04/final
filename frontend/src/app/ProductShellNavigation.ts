import {
  Activity,
  AlertTriangle,
  Bell,
  Clock,
  Coins,
  GitBranch,
  Home,
  Layers3,
  ListTree,
  Package,
  Rocket,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import type { MessageKey } from "../shared/i18n";
import type { ProductRouteIcon, ProductSurfaceId } from "./productRoutes";

export const routeIcons: Record<ProductRouteIcon, LucideIcon> = {
  clusters: Server,
  home: Home,
  resources: ListTree,
  deploy: Rocket,
  issues: AlertTriangle,
  timeline: Clock,
  traffic: Activity,
  helm: Package,
  checks: ShieldCheck,
  cost: Coins,
  alerts: Bell,
  ai: Sparkles,
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
  timeline: "shell.nav.timeline",
  traffic: "shell.nav.traffic",
  helm: "shell.nav.helm",
  checks: "shell.nav.checks",
  cost: "shell.nav.cost",
  alerts: "shell.nav.alerts",
  ai: "shell.nav.ai",
  resources: "shell.nav.resources",
  deploy: "shell.nav.deploy",
  settings: "shell.nav.settings",
} satisfies Record<ProductSurfaceId, MessageKey>;
