import { AppWindow, Boxes, Braces, Server, Tags } from "lucide-react";
import type { useI18n, MessageKey } from "../../shared/i18n";
import type { SearchModifier } from "../../shared/ui/SearchPillInput";
import type { UnifiedFilterState } from "../filters/filterContract";
import type { GlobalFilterSuggestion } from "./globalFilterContract";
import { namespaceId, type SelectedChip } from "./globalFilterSelection";

export type GlobalFilterSearchPhase = "idle" | "loading" | "ready" | "failed";

const groupDefinitions = [
  { Icon: Server, key: "shell.filter.group.cluster", type: "cluster" },
  { Icon: Braces, key: "shell.filter.group.namespace", type: "namespace" },
  { Icon: AppWindow, key: "shell.filter.group.application", type: "application" },
  { Icon: Boxes, key: "shell.filter.group.resourceType", type: "resourceType" },
  { Icon: Tags, key: "shell.filter.group.label", type: "label" },
  { Icon: Boxes, key: "shell.filter.group.resource", type: "resource" },
] as const satisfies readonly {
  Icon: typeof Server;
  key: MessageKey;
  type: GlobalFilterSuggestion["type"];
}[];

export function buildSuggestionGroups(
  suggestions: readonly GlobalFilterSuggestion[],
) {
  return groupDefinitions.map((definition) => ({
    ...definition,
    items: suggestions.filter((item) => item.type === definition.type),
  })).filter((group) => group.items.length > 0);
}

export function suggestionGroupKey(
  type: GlobalFilterSuggestion["type"],
): MessageKey {
  return groupDefinitions.find((definition) => definition.type === type)?.key ??
    "shell.filter.group.resource";
}

export function findSelectedScopeSuggestionChip(
  suggestion: GlobalFilterSuggestion,
  common: UnifiedFilterState["common"],
): SelectedChip | null {
  if (suggestion.type === "cluster") {
    return common.clusters.includes(suggestion.id)
      ? { type: "cluster", id: suggestion.id, label: suggestion.label }
      : null;
  }
  if (suggestion.type !== "namespace") return null;
  const selected = common.namespaces.find(({ clusterId, namespace }) =>
    clusterId === suggestion.clusterId && (
      suggestion.id === namespaceId(clusterId, namespace) ||
      suggestion.label === namespace
    ),
  );
  return selected
    ? {
        type: "namespace",
        id: namespaceId(selected.clusterId, selected.namespace),
        label: selected.namespace,
      }
    : null;
}

export function formatSuggestionCount(
  item: GlobalFilterSuggestion,
  formatNumber: (value: number | bigint) => string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (item.count === null || item.count_completeness === "unavailable") {
    return t("shell.filter.count.unknown");
  }
  const count = formatNumber(item.count);
  return item.count_completeness === "partial"
    ? t("shell.filter.count.partial", { count })
    : count;
}

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

export function pillIdentity(
  pill: Pick<SearchModifier, "key" | "value">,
): string {
  return `${pill.key}:${pill.value}`;
}
