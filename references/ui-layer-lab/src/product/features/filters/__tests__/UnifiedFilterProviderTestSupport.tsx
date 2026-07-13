import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import type { UnifiedFilterState } from "../filterContract";
import { UnifiedFilterProvider, useUnifiedFilter } from "../UnifiedFilterProvider";

export function FilterProbe() {
  const filter = useUnifiedFilter();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const state = {
    clusters: filter.state.common.clusters,
    detail: filter.detail,
    labels: filter.state.common.labels.map(({ key, value }) => `${key}=${value}`),
    resourceTypes: filter.state.resources.types,
    location: `${location.pathname}${location.search}${location.hash}`,
    navigationType,
    needsCanonicalWrite: filter.needsCanonicalWrite,
  };

  return (
    <>
      <output data-testid="filter-state">{JSON.stringify(state)}</output>
      <output data-testid="issues-href">{filter.navigationHref("/product/issues")}</output>
      <button onClick={filter.canonicalize} type="button">canonicalize</button>
      <button onClick={() => filter.updateFilters(addLabel, "chip-add")} type="button">
        add label
      </button>
      <button onClick={() => filter.updateFilters(addCluster, "chip-add")} type="button">
        add cluster
      </button>
      <button onClick={() => filter.updateFilters(addQuery, "typing")} type="button">
        type query
      </button>
      <button
        onClick={() => {
          filter.updateFilters(addLabel, "chip-add");
          filter.updateDetail((current) => ({
            ...current,
            resource: "shop/api",
            resourceKind: "Pod",
          }), "detail-open");
        }}
        type="button"
      >
        filter and open detail
      </button>
      <button onClick={() => filter.updateFilters(mutateQuery, "typing")} type="button">
        mutate query
      </button>
      <button onClick={() => filter.updateFilters((current) => current, "chip-add")} type="button">
        same filters
      </button>
      <button
        onClick={() => filter.updateDetail((current) => ({
          ...current,
          resource: "shop/api",
          resourceKind: "Pod",
          tab: null,
        }), "detail-open")}
        type="button"
      >
        open detail
      </button>
      <button
        onClick={() => filter.updateDetail((current) => ({ ...current, tab: "events" }), "detail-tab")}
        type="button"
      >
        select detail tab
      </button>
      <button
        onClick={() => filter.updateDetail((current) => ({
          ...current,
          full: false,
          resource: null,
          resourceKind: null,
          tab: null,
        }), "detail-close")}
        type="button"
      >
        close detail
      </button>
      <button
        onClick={() => filter.updateDetail((current) => ({ ...current, node: "worker-a" }), "drill-in")}
        type="button"
      >
        select node
      </button>
      <button onClick={() => navigate(-1)} type="button">back</button>
      <button onClick={() => navigate(1)} type="button">forward</button>
    </>
  );
}

export function renderProvider(entry: string, strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[entry]}>
      <UnifiedFilterProvider><FilterProbe /></UnifiedFilterProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

export function readState(): {
  clusters: readonly string[];
  detail: { resource: string | null; resourceKind: string | null };
  labels: readonly string[];
  resourceTypes: readonly string[];
  location: string;
  navigationType: string;
  needsCanonicalWrite: boolean;
} {
  return JSON.parse(screen.getByTestId("filter-state").textContent ?? "{}") as ReturnType<
    typeof readState
  >;
}

function addLabel(current: UnifiedFilterState): UnifiedFilterState {
  return {
    ...current,
    common: {
      ...current.common,
      labels: [...current.common.labels, { key: "team", value: "checkout" }],
    },
  };
}

function addCluster(current: UnifiedFilterState): UnifiedFilterState {
  return {
    ...current,
    common: { ...current.common, clusters: [...current.common.clusters, "cluster-b"] },
  };
}

function addQuery(current: UnifiedFilterState): UnifiedFilterState {
  return { ...current, resources: { ...current.resources, query: "checkout" } };
}

function mutateQuery(current: UnifiedFilterState): UnifiedFilterState {
  current.resources.query = "mutated";
  return current;
}
