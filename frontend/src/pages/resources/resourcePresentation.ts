import {
  Activity,
  Anchor,
  ArrowRightLeft,
  BookOpen,
  Box,
  Boxes,
  Clock,
  Clock3,
  Container,
  Copy,
  Cpu,
  Cylinder,
  Database,
  DatabaseZap,
  DoorOpen,
  FileSearch,
  FileSliders,
  FolderGit2,
  FolderOpen,
  FolderTree,
  Gauge,
  GitBranch,
  Globe,
  HardDrive,
  HeartPulse,
  KeyRound,
  Layers,
  Link,
  Lock,
  Network,
  Package,
  Play,
  Plug,
  PlugZap,
  Puzzle,
  Radio,
  Rocket,
  Rows3,
  Route,
  Scaling,
  Server,
  Settings,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Split,
  Timer,
  UserCog,
  Zap,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import { createElement, type ReactElement } from "react";
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

/**
 * One product-owned icon registry for every topology and resource catalog.
 * Unknown CRDs intentionally use the same neutral fallback instead of growing
 * a second surface-local map or a CSS selector per source kind.
 */
const RESOURCE_KIND_ICON_GROUPS = [
  [Box, ["pod"]],
  [Rocket, ["deployment", "rollout"]],
  [Rows3, ["daemonset"]],
  [DatabaseZap, ["statefulset"]],
  [Copy, ["replicaset"]],
  [Play, ["job"]],
  [Timer, ["cronjob"]],
  [Plug, ["service"]],
  [DoorOpen, ["ingress", "gateway"]],
  [
    ShieldCheck,
    [
      "networkpolicy",
      "ciliumnetworkpolicy",
      "ciliumclusterwidenetworkpolicy",
      "clusternetworkpolicy",
      "role",
      "clusterrole",
      "rolebinding",
      "clusterrolebinding",
      "certificate",
      "certificaterequest",
      "clusterissuer",
      "poddisruptionbudget",
      "configauditreport",
    ],
  ],
  [
    Radio,
    [
      "endpoint",
      "endpoints",
      "endpointslice",
      "servicemonitor",
      "podmonitor",
      "broker",
      "channel",
    ],
  ],
  [
    Globe,
    [
      "httproute",
      "grpcroute",
      "tcproute",
      "tlsroute",
      "ingressroute",
      "ingressroutetcp",
      "ingressrouteudp",
      "httpproxy",
      "internet",
    ],
  ],
  [FileSliders, ["configmap"]],
  [KeyRound, ["secret", "sealedsecret", "triggerauthentication", "clustertriggerauthentication"]],
  [HardDrive, ["persistentvolumeclaim", "pvc"]],
  [Cylinder, ["persistentvolume"]],
  [Database, ["storageclass"]],
  [
    Cpu,
    [
      "node",
      "machine",
      "awsmachine",
      "awsmachinetemplate",
      "gcpmachine",
      "gcpmachinetemplate",
      "azuremachine",
      "azuremachinetemplate",
    ],
  ],
  [FolderOpen, ["namespace"]],
  [UserCog, ["serviceaccount"]],
  [Activity, ["event", "workflow", "cronworkflow", "workflowtemplate", "clusterworkflowtemplate"]],
  [Scaling, ["horizontalpodautoscaler", "hpa", "scaledobject", "scaledjob"]],
  [GitBranch, ["application", "applicationset", "knativerevision"]],
  [
    Layers,
    [
      "kustomization",
      "knativeservice",
      "machinedeployment",
      "machineset",
      "machinepool",
      "awsmanagedmachinepool",
      "gcpmanagedmachinepool",
      "azuremanagedmachinepool",
    ],
  ],
  [Anchor, ["helmrelease", "helmrepository"]],
  [FolderGit2, ["gitrepository", "ocirepository"]],
  [
    Server,
    [
      "nodepool",
      "nodeclaim",
      "ec2nodeclass",
      "aksnodeclass",
      "gcenodeclass",
      "capicluster",
      "awsmanagedcluster",
      "gcpmanagedcluster",
      "azuremanagedcluster",
      "apiserversource",
    ],
  ],
  [ShieldAlert, ["prometheusrule", "alertmanager", "exposedsecretreport"]],
  [Settings, ["knativeconfiguration"]],
  [Route, ["knativeroute"]],
  [Zap, ["trigger"]],
  [Clock, ["pingsource"]],
  [Container, ["containersource"]],
  [Link, ["sinkbinding"]],
  [SlidersHorizontal, ["middleware", "middlewaretcp"]],
  [Split, ["traefikservice"]],
  [ArrowRightLeft, ["serverstransport", "serverstransporttcp"]],
  [Lock, ["tlsoption", "tlsstore"]],
  [
    Shield,
    [
      "kubeadmcontrolplane",
      "awsmanagedcontrolplane",
      "gcpmanagedcontrolplane",
      "azuremanagedcontrolplane",
      "vulnerabilityreport",
    ],
  ],
  [BookOpen, ["clusterclass"]],
  [HeartPulse, ["machinehealthcheck"]],
  [FileSearch, ["sbomreport"]],
  [Boxes, ["podgroup"]],
] as const satisfies ReadonlyArray<readonly [LucideIcon, readonly string[]]>;

const TOPOLOGY_KIND_ICONS = buildResourceKindIconMap(RESOURCE_KIND_ICON_GROUPS);

export function resourceTypePresentation(resourceType: string): ResourceTypePresentation {
  const known = PRESENTATIONS[resourceType.toLowerCase()];
  return known
    ? {
      fallbackLabel: resourceType,
      labelKey: known.labelKey,
      category: CATEGORIES[known.category],
      icon: resourceKindIcon(resourceType),
      order: known.order,
    }
    : {
        fallbackLabel: resourceType,
        labelKey: null,
        category: CATEGORIES.other,
        icon: resourceKindIcon(resourceType),
        order: 999,
      };
}

export function resourceKindIcon(kind: string): LucideIcon {
  const normalized = normalizeResourceKind(kind);
  return TOPOLOGY_KIND_ICONS[normalized] ?? PRESENTATIONS[normalized]?.icon ?? Puzzle;
}

export function renderResourceKindIcon(kind: string, props: LucideProps): ReactElement {
  return createElement(resourceKindIcon(kind), props);
}

export function normalizeResourceKind(kind: string): string {
  return kind.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildResourceKindIconMap(
  groups: ReadonlyArray<readonly [LucideIcon, readonly string[]]>,
): Readonly<Record<string, LucideIcon>> {
  const result: Record<string, LucideIcon> = {};
  for (const [icon, kinds] of groups) {
    for (const kind of kinds) {
      if (result[kind]) throw new Error(`Duplicate resource icon registration: ${kind}`);
      result[kind] = icon;
    }
  }
  return Object.freeze(result);
}

function category(
  id: string,
  labelKey: MessageKey,
  icon: LucideIcon,
  order: number,
): ResourceCategoryPresentation {
  return { id, labelKey, icon, order };
}
