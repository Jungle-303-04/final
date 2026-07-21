import {
  Activity,
  Box,
  Boxes,
  Clock3,
  Cpu,
  Cylinder,
  Database,
  FileSliders,
  FolderTree,
  Gauge,
  HardDrive,
  HeartPulse,
  KeyRound,
  Network,
  Package,
  Play,
  PlugZap,
  Puzzle,
  Radio,
  Rocket,
  Route,
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
  icon: LucideIcon;
  order: number;
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

const PRESENTATIONS: Record<string, {
  labelKey: MessageKey;
  category: keyof typeof CATEGORIES;
  icon: LucideIcon;
  order: number;
}> = {
  pod: { labelKey: "resources.type.pod", category: "workloads", icon: Box, order: 10 },
  workload: { labelKey: "resources.type.workload", category: "workloads", icon: Rocket, order: 20 },
  job: { labelKey: "resources.type.job", category: "workloads", icon: Play, order: 30 },
  cronjob: { labelKey: "resources.type.cronjob", category: "workloads", icon: Clock3, order: 40 },
  node: { labelKey: "resources.type.node", category: "cluster", icon: Cpu, order: 10 },
  namespace: { labelKey: "resources.type.namespace", category: "cluster", icon: FolderTree, order: 20 },
  service: { labelKey: "resources.type.service", category: "networking", icon: PlugZap, order: 10 },
  endpoint: { labelKey: "resources.type.endpoint", category: "networking", icon: Radio, order: 20 },
  ingress: { labelKey: "resources.type.ingress", category: "networking", icon: Route, order: 30 },
  configmap: { labelKey: "resources.type.configmap", category: "configuration", icon: FileSliders, order: 10 },
  secret: { labelKey: "resources.type.secret", category: "configuration", icon: KeyRound, order: 20 },
  pvc: { labelKey: "resources.type.pvc", category: "storage", icon: HardDrive, order: 10 },
  persistentvolume: { labelKey: "resources.type.persistentvolume", category: "storage", icon: Cylinder, order: 20 },
  event: { labelKey: "resources.type.event", category: "activity", icon: Activity, order: 10 },
  health: { labelKey: "resources.type.health", category: "activity", icon: HeartPulse, order: 20 },
  usage: { labelKey: "resources.type.usage", category: "activity", icon: Gauge, order: 30 },
};

export function resourceTypePresentation(resourceType: string): ResourceTypePresentation {
  const known = PRESENTATIONS[resourceType.toLowerCase()];
  return known
    ? {
        fallbackLabel: resourceType,
        labelKey: known.labelKey,
        category: CATEGORIES[known.category],
        icon: known.icon,
        order: known.order,
      }
    : {
        fallbackLabel: resourceType,
        labelKey: null,
        category: CATEGORIES.other,
        icon: Puzzle,
        order: 999,
      };
}

function category(
  id: string,
  labelKey: MessageKey,
  icon: LucideIcon,
  order: number,
): ResourceCategoryPresentation {
  return { id, labelKey, icon, order };
}
