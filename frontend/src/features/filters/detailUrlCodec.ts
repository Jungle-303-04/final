import {
  createEmptyProductDetailQuery,
  type ProductDetailQuery,
} from "./filterContract";
import { parseBooleanQuery } from "./filterUrlScalars";
import {
  appendBoolean,
  appendNullableStableText,
  hasQueryKey,
  readStableText,
  type StrictQuery,
} from "./filterUrlSyntax";

const LEGACY_RESOURCE_KIND_QUERY_KEY = "kind";
const WORKFLOW_VIEWS = ["overview", "edit", "runs", "yaml"] as const;

export function appendProductDetail(pairs: string[], detail: ProductDetailQuery) {
  appendNullableStableText(pairs, "resource", detail.resource);
  appendNullableStableText(pairs, "resourceKind", detail.resourceKind);
  appendNullableStableText(pairs, "tab", detail.tab);
  appendBoolean(pairs, "full", detail.full);
  appendNullableStableText(pairs, "node", detail.node);
  appendNullableStableText(pairs, "plan", detail.workflowPlan ?? null);
  appendNullableStableText(pairs, "view", detail.workflowView ?? null);
  appendNullableStableText(pairs, "mode", detail.workflowMode ?? null);
}

export function parseProductDetailQuery(
  params: StrictQuery,
  invalidFull: string[],
): ProductDetailQuery {
  const detail = createEmptyProductDetailQuery();
  detail.resource = readStableText(params, "resource");
  detail.resourceKind = readStableText(params, "resourceKind");
  if (!hasQueryKey(params, "resourceKind") && detail.resource !== null) {
    detail.resourceKind = readStableText(params, LEGACY_RESOURCE_KIND_QUERY_KEY);
  }
  detail.tab = readStableText(params, "tab");
  detail.full = parseBooleanQuery(params, "full", invalidFull, ["1"], ["0"]);
  detail.node = readStableText(params, "node");

  const workflowPlan = readStableText(params, "plan");
  if (workflowPlan !== null) detail.workflowPlan = workflowPlan;
  const workflowView = readStableText(params, "view");
  if (isWorkflowView(workflowView)) detail.workflowView = workflowView;
  if (readStableText(params, "mode") === "new") detail.workflowMode = "new";
  return detail;
}

function isWorkflowView(value: string | null): value is NonNullable<ProductDetailQuery["workflowView"]> {
  return value !== null && WORKFLOW_VIEWS.some((view) => view === value);
}
