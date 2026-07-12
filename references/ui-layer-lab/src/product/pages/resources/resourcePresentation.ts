import {
  Activity,
  Boxes,
  Database,
  Network,
  Package,
  Server,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import type { MessageKey } from "../../shared/i18n";

export interface ResourceCategoryPresentation {
  id: string;
  labelKey: MessageKey;
  icon: LucideIcon;
  order: number;
}

export interface ResourceTypePresentation {
  fallbackLabel: string;
  labelKey: MessageKey | null;
  category: ResourceCategoryPresentation;
}

const CATEGORIES = {
  workloads: category("workloads", "resources.category.workloads", Boxes, 10),
  cluster: category("cluster", "resources.category.cluster", Server, 20),
  networking: category("networking", "resources.category.networking", Network, 30),
  configuration: category("configuration", "resources.category.configuration", Settings2, 40),
  storage: category("storage", "resources.category.storage", Database, 50),
  activity: category("activity", "resources.category.activity", Activity, 60),
  other: category("other", "resources.category.other", Package, 90),
} as const;

const PRESENTATIONS: Record<string, { labelKey: MessageKey; category: keyof typeof CATEGORIES }> = {
  pod: { labelKey: "resources.type.pod", category: "workloads" },
  workload: { labelKey: "resources.type.workload", category: "workloads" },
  job: { labelKey: "resources.type.job", category: "workloads" },
  cronjob: { labelKey: "resources.type.cronjob", category: "workloads" },
  node: { labelKey: "resources.type.node", category: "cluster" },
  namespace: { labelKey: "resources.type.namespace", category: "cluster" },
  service: { labelKey: "resources.type.service", category: "networking" },
  endpoint: { labelKey: "resources.type.endpoint", category: "networking" },
  ingress: { labelKey: "resources.type.ingress", category: "networking" },
  configmap: { labelKey: "resources.type.configmap", category: "configuration" },
  secret: { labelKey: "resources.type.secret", category: "configuration" },
  pvc: { labelKey: "resources.type.pvc", category: "storage" },
  persistentvolume: { labelKey: "resources.type.persistentvolume", category: "storage" },
  event: { labelKey: "resources.type.event", category: "activity" },
  health: { labelKey: "resources.type.health", category: "activity" },
  usage: { labelKey: "resources.type.usage", category: "activity" },
};

export function resourceTypePresentation(resourceType: string): ResourceTypePresentation {
  const known = PRESENTATIONS[resourceType];
  return known
    ? { fallbackLabel: resourceType, labelKey: known.labelKey, category: CATEGORIES[known.category] }
    : { fallbackLabel: resourceType, labelKey: null, category: CATEGORIES.other };
}

function category(
  id: string,
  labelKey: MessageKey,
  icon: LucideIcon,
  order: number,
): ResourceCategoryPresentation {
  return { id, labelKey, icon, order };
}
