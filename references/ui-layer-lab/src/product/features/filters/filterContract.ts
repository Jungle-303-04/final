export type FilterAxisOperator = "and" | "or";

export interface NamespaceFilterRef {
  clusterId: string;
  namespace: string;
}

export interface KubernetesLabelFilter {
  key: string;
  value: string;
}

export type ResourceView = "graph" | "table";

export interface UnifiedFilterState {
  common: {
    clusters: readonly string[];
    namespaces: readonly NamespaceFilterRef[];
    applications: readonly string[];
    labels: readonly KubernetesLabelFilter[];
  };
  resources: {
    types: readonly string[];
    health: readonly string[];
    includeDeleted: boolean;
    query: string;
    view: ResourceView;
  };
  issues: {
    severity: readonly string[];
    status: readonly string[];
    environment: readonly string[];
    query: string;
  };
  applicationSurface: {
    environment: readonly string[];
    status: readonly string[];
    pendingPromotion: boolean;
    query: string;
  };
  gitops: {
    environment: readonly string[];
    approval: readonly string[];
    changeType: readonly string[];
    query: string;
  };
  checks: {
    severity: readonly string[];
    category: readonly string[];
    query: string;
  };
}

export const COMMON_FILTER_AXIS_OPERATORS = {
  clusters: "or",
  namespaces: "or",
  applications: "or",
  labels: "and",
} as const satisfies Record<keyof UnifiedFilterState["common"], FilterAxisOperator>;

export interface ProductDetailQuery {
  resource: string | null;
  resourceKind: string | null;
  tab: string | null;
  full: boolean;
  node: string | null;
}

export interface InvalidFilterValues {
  clusters: readonly string[];
  namespaces: readonly string[];
  applications: readonly string[];
  labels: readonly string[];
  resourcesTypes: readonly string[];
  resourcesHealth: readonly string[];
  resourcesIncludeDeleted: readonly string[];
  resourcesView: readonly string[];
  issuesSeverity: readonly string[];
  issuesStatus: readonly string[];
  issuesEnvironment: readonly string[];
  applicationsEnvironment: readonly string[];
  applicationsStatus: readonly string[];
  applicationsPendingPromotion: readonly string[];
  gitopsEnvironment: readonly string[];
  gitopsApproval: readonly string[];
  gitopsChangeType: readonly string[];
  checksSeverity: readonly string[];
  checksCategory: readonly string[];
  detailFull: readonly string[];
}

export interface FilterUrlParseResult {
  state: UnifiedFilterState;
  detail: ProductDetailQuery;
  invalidValues: InvalidFilterValues;
  needsCanonicalWrite: boolean;
}

export type FilterMutationIntent =
  | "canonicalize"
  | "chip-add"
  | "chip-remove"
  | "clear-labels"
  | "clear-filters"
  | "legacy-migration"
  | "typing";

export type FilterHistoryMode = "push" | "replace";

export type UnifiedFilterUpdater =
  | UnifiedFilterState
  | ((current: UnifiedFilterState) => UnifiedFilterState);

export interface UnifiedFilterController extends FilterUrlParseResult {
  canonicalize(): void;
  navigationHref(path: `/product${string}`): string;
  updateFilters(update: UnifiedFilterUpdater, intent: FilterMutationIntent): void;
}

export function createEmptyUnifiedFilterState(): UnifiedFilterState {
  return {
    common: {
      clusters: [],
      namespaces: [],
      applications: [],
      labels: [],
    },
    resources: {
      types: [],
      health: [],
      includeDeleted: false,
      query: "",
      view: "table",
    },
    issues: {
      severity: [],
      status: [],
      environment: [],
      query: "",
    },
    applicationSurface: {
      environment: [],
      status: [],
      pendingPromotion: false,
      query: "",
    },
    gitops: {
      environment: [],
      approval: [],
      changeType: [],
      query: "",
    },
    checks: {
      severity: [],
      category: [],
      query: "",
    },
  };
}

export function createEmptyProductDetailQuery(): ProductDetailQuery {
  return {
    resource: null,
    resourceKind: null,
    tab: null,
    full: false,
    node: null,
  };
}
