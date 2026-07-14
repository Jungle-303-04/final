import { renderHook } from "@testing-library/react";
import { vi } from "vitest";

import type { UnifiedFilterState } from "../../features/filters/filterContract";
import { createEmptyUnifiedFilterState } from "../../features/filters/filterContract";
import {
  toResourcesFacetPage,
  toResourcesLabelFacetPage,
  toResourcesResourcePage,
} from "../../features/resources/resourcesFilterCanonical";
import type {
  ResourcesFilterFacetPage,
  ResourcesFilterLabelFacetPage,
  ResourcesFilterPort,
  ResourcesFilterResourcePage,
  ResourcesFilterSnapshot,
} from "../../features/resources/resourcesFilterContract";
import {
  FACET_PAGE,
  LABEL_PAGE,
  RESOURCE_PAGE,
} from "../../features/resources/createResourcesFilterAdapter.testSupport";
import {
  useResourcesFilterDataFrame,
  type ResourcesFilterDataFrameInput,
} from "./useResourcesFilterDataFrame";

export const FILTER_STATE_A: UnifiedFilterState = {
  ...createEmptyUnifiedFilterState(),
  common: {
    clusters: ["cluster-a", "cluster-b"],
    namespaces: [
      { clusterId: "cluster-a", namespace: "shop" },
      { clusterId: "cluster-b", namespace: "platform" },
    ],
    applications: ["app-checkout"],
    labels: [
      { key: "team", value: "checkout" },
      { key: "tier", value: "critical" },
    ],
  },
  resources: {
    types: ["pod", "service"],
    health: ["healthy", "degraded"],
    includeDeleted: false,
    query: "checkout",
    view: "table",
  },
};

export const FILTER_STATE_B: UnifiedFilterState = {
  ...FILTER_STATE_A,
  common: {
    ...FILTER_STATE_A.common,
    clusters: ["cluster-c"],
  },
  resources: {
    ...FILTER_STATE_A.resources,
    query: "orders",
  },
};

const CANONICAL_RESOURCE_PAGE = toResourcesResourcePage(RESOURCE_PAGE);
const CANONICAL_FACET_PAGE = toResourcesFacetPage(FACET_PAGE);
const CANONICAL_LABEL_PAGE = toResourcesLabelFacetPage(LABEL_PAGE);

export function resourcePage(
  name: string,
  nextCursor: string | null = null,
  snapshot: Partial<ResourcesFilterSnapshot> = {},
): ResourcesFilterResourcePage {
  const first = CANONICAL_RESOURCE_PAGE.items[0]!;
  return {
    ...CANONICAL_RESOURCE_PAGE,
    items: [{
      ...first,
      resource: {
        ...first.resource,
        id: `cluster-a:pod:shop:${name}`,
        inventoryKey: `inventory-${name}`,
        name,
      },
    }],
    nextCursor,
    hasMore: nextCursor !== null,
    snapshot: { ...CANONICAL_RESOURCE_PAGE.snapshot, ...snapshot },
  };
}

export function facetPage(
  value: string,
  nextCursor: string | null = null,
  snapshot: Partial<ResourcesFilterSnapshot> = {},
): ResourcesFilterFacetPage {
  const first = CANONICAL_FACET_PAGE.items[0]!;
  if (first.axis !== "cluster") throw new TypeError("Expected a cluster facet fixture");
  return {
    ...CANONICAL_FACET_PAGE,
    items: [{ ...first, value, clusterId: value, name: value }],
    nextCursor,
    hasMore: nextCursor !== null,
    snapshot: { ...CANONICAL_FACET_PAGE.snapshot, ...snapshot },
  };
}

export function labelPage(
  selector: string,
  nextCursor: string | null = null,
  snapshot: Partial<ResourcesFilterSnapshot> = {},
): ResourcesFilterLabelFacetPage {
  const [key = "team", value = "checkout"] = selector.split("=");
  return {
    ...CANONICAL_LABEL_PAGE,
    items: [{
      ...CANONICAL_LABEL_PAGE.items[0]!,
      key,
      value,
      selector,
    }],
    nextCursor,
    hasMore: nextCursor !== null,
    snapshot: { ...CANONICAL_LABEL_PAGE.snapshot, ...snapshot },
  };
}

export function resourcesFilterPort(
  overrides: Partial<ResourcesFilterPort> = {},
): ResourcesFilterPort {
  return {
    listFacetPage: vi.fn(overrides.listFacetPage ?? (() => Promise.resolve(facetPage("cluster-a")))),
    listResourcePage: vi.fn(
      overrides.listResourcePage ?? (() => Promise.resolve(resourcePage("checkout-api-0"))),
    ),
    listLabelFacetPage: vi.fn(
      overrides.listLabelFacetPage ?? (() => Promise.resolve(labelPage("team=checkout"))),
    ),
  };
}

export function renderResourcesFilterFrame(
  overrides: Partial<ResourcesFilterDataFrameInput> = {},
) {
  const port = overrides.port ?? resourcesFilterPort();
  const input: ResourcesFilterDataFrameInput = {
    active: true,
    authorityKey: "workspace-1:user-1",
    facetAxis: "clusters",
    facetQuery: "",
    filterState: FILTER_STATE_A,
    port,
    reportUnauthorized: vi.fn(),
    revision: 0,
    ...overrides,
  };
  const rendered = renderHook(
    ({ current }: { current: ResourcesFilterDataFrameInput }) =>
      useResourcesFilterDataFrame(current),
    { initialProps: { current: input } },
  );
  return { ...rendered, input, port };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

export async function flushEffects() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}
