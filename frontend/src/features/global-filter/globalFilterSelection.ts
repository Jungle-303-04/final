import type { UnifiedFilterState } from "../filters/filterContract";
import type { GlobalFilterSuggestion } from "./globalFilterContract";
import { humanizeFilterValue } from "../../shared/presentation/humanizeFilterValue";

export type SelectedChip = {
  type: GlobalFilterSuggestion["type"];
  id: string;
  label: string;
};

export function selectedChips(state: UnifiedFilterState): SelectedChip[] {
  return [
    ...state.common.clusters.map((id) => ({ type: "cluster" as const, id, label: id })),
    ...state.common.namespaces.map((item) => ({
      type: "namespace" as const,
      id: namespaceId(item.clusterId, item.namespace),
      label: item.namespace,
    })),
    ...state.common.applications.map((id) => ({
      type: "application" as const,
      id,
      label: id,
    })),
    ...state.resources.types.map((id) => ({
      type: "resourceType" as const,
      id,
      label: humanizeFilterValue(id),
    })),
    ...state.common.labels.map((item) => ({
      type: "label" as const,
      id: `${item.key}=${item.value}`,
      label: `${item.key}=${item.value}`,
    })),
    ...(state.resources.query ? [{
      type: "resource" as const,
      id: state.resources.query,
      label: state.resources.query,
    }] : []),
  ];
}

export function addSuggestion(
  state: UnifiedFilterState,
  item: GlobalFilterSuggestion,
): UnifiedFilterState {
  if (item.type === "cluster") {
    return {
      ...state,
      common: { ...state.common, clusters: addUnique(state.common.clusters, item.id) },
    };
  }
  if (item.type === "namespace") {
    const namespace = item.id.startsWith(`${item.clusterId}/`)
      ? item.id.slice(item.clusterId.length + 1)
      : item.label;
    const id = namespaceId(item.clusterId, namespace);
    return {
      ...state,
      common: {
        ...state.common,
        namespaces: state.common.namespaces.some(
          (value) => namespaceId(value.clusterId, value.namespace) === id,
        )
          ? state.common.namespaces
          : [...state.common.namespaces, { clusterId: item.clusterId, namespace }],
      },
    };
  }
  if (item.type === "application") {
    return {
      ...state,
      common: {
        ...state.common,
        applications: addUnique(state.common.applications, item.id),
      },
    };
  }
  if (item.type === "resourceType") {
    return {
      ...state,
      resources: { ...state.resources, types: addUnique(state.resources.types, item.id) },
    };
  }
  if (item.type === "label") {
    const exists = state.common.labels.some(
      (value) => value.key === item.key && value.value === item.value,
    );
    return {
      ...state,
      common: {
        ...state.common,
        labels: exists
          ? state.common.labels
          : [...state.common.labels, { key: item.key, value: item.value }],
      },
    };
  }
  return { ...state, resources: { ...state.resources, query: item.label } };
}

export function removeChip(
  state: UnifiedFilterState,
  chip: SelectedChip,
): UnifiedFilterState {
  if (chip.type === "cluster") {
    return {
      ...state,
      common: {
        ...state.common,
        clusters: state.common.clusters.filter((id) => id !== chip.id),
      },
    };
  }
  if (chip.type === "namespace") {
    return {
      ...state,
      common: {
        ...state.common,
        namespaces: state.common.namespaces.filter(
          (item) => namespaceId(item.clusterId, item.namespace) !== chip.id,
        ),
      },
    };
  }
  if (chip.type === "application") {
    return {
      ...state,
      common: {
        ...state.common,
        applications: state.common.applications.filter((id) => id !== chip.id),
      },
    };
  }
  if (chip.type === "resourceType") {
    return {
      ...state,
      resources: {
        ...state.resources,
        types: state.resources.types.filter((id) => id !== chip.id),
      },
    };
  }
  if (chip.type === "label") {
    return {
      ...state,
      common: {
        ...state.common,
        labels: state.common.labels.filter(
          (item) => `${item.key}=${item.value}` !== chip.id,
        ),
      },
    };
  }
  return { ...state, resources: { ...state.resources, query: "" } };
}

export function namespaceId(clusterId: string, namespace: string): string {
  return `${clusterId}/${namespace}`;
}

function addUnique(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : [...values, value];
}
