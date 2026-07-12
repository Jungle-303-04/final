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

export interface ResourceCategoryPresentation {
  id: string;
  label: string;
  icon: LucideIcon;
  order: number;
}

export interface ResourceTypePresentation {
  label: string;
  category: ResourceCategoryPresentation;
}

const CATEGORIES = {
  workloads: category("workloads", "Workloads", Boxes, 10),
  cluster: category("cluster", "Cluster", Server, 20),
  networking: category("networking", "Networking", Network, 30),
  configuration: category("configuration", "Configuration", Settings2, 40),
  storage: category("storage", "Storage", Database, 50),
  activity: category("activity", "Activity", Activity, 60),
  other: category("other", "Other", Package, 90),
} as const;

const PRESENTATIONS: Record<string, { label: string; category: keyof typeof CATEGORIES }> = {
  pod: { label: "Pods", category: "workloads" },
  workload: { label: "Workloads", category: "workloads" },
  job: { label: "Jobs", category: "workloads" },
  cronjob: { label: "CronJobs", category: "workloads" },
  node: { label: "Nodes", category: "cluster" },
  namespace: { label: "Namespaces", category: "cluster" },
  service: { label: "Services", category: "networking" },
  endpoint: { label: "EndpointSlices", category: "networking" },
  ingress: { label: "Ingresses", category: "networking" },
  configmap: { label: "ConfigMaps", category: "configuration" },
  secret: { label: "Secrets", category: "configuration" },
  pvc: { label: "PersistentVolumeClaims", category: "storage" },
  persistentvolume: { label: "PersistentVolumes", category: "storage" },
  event: { label: "Events", category: "activity" },
  health: { label: "Cluster Health", category: "activity" },
  usage: { label: "Cluster Usage", category: "activity" },
};

export function resourceTypePresentation(resourceType: string): ResourceTypePresentation {
  const known = PRESENTATIONS[resourceType];
  return known
    ? { label: known.label, category: CATEGORIES[known.category] }
    : { label: resourceType, category: CATEGORIES.other };
}

function category(
  id: string,
  label: string,
  icon: LucideIcon,
  order: number,
): ResourceCategoryPresentation {
  return { id, label, icon, order };
}
