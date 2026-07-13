// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import type { UnifiedFilterState } from "./filterContract";
import { UnifiedFilterProvider, useUnifiedFilter } from "./UnifiedFilterProvider";

afterEach(cleanup);

describe("UnifiedFilterProvider", () => {
  it("is passive on mount and keeps legacy or unresolved values URL-authoritative", () => {
    renderProvider(
      "/product/resources?cluster=unknown%2Fcluster&labels=team%3Dcheckout" +
      "&resource=shop%2Fapi&kind=Pod",
      true,
    );

    expect(readState()).toMatchObject({
      clusters: ["unknown/cluster"],
      detail: { resource: "shop/api", resourceKind: "Pod" },
      labels: ["team=checkout"],
      location: "/product/resources?cluster=unknown%2Fcluster&labels=team%3Dcheckout" +
        "&resource=shop%2Fapi&kind=Pod",
      navigationType: "POP",
      needsCanonicalWrite: true,
    });
  });

  it("canonicalizes only on explicit request with replace and preserves detail identity", async () => {
    const user = userEvent.setup();
    renderProvider(
      "/product/resources?cluster=cluster-a&resource=shop%2Fapi&kind=Pod" +
      "&tab=events&full=1&node=worker-a",
    );

    await user.click(screen.getByRole("button", { name: "canonicalize" }));

    expect(readState()).toMatchObject({
      location: "/product/resources?clusters=cluster-a&resource=shop%2Fapi" +
        "&resourceKind=Pod&tab=events&full=true&node=worker-a",
      navigationType: "REPLACE",
      needsCanonicalWrite: false,
    });
  });

  it("uses push for chips, replace for typing, preserves detail, and skips no-op writes", async () => {
    const user = userEvent.setup();
    renderProvider(
      "/product/resources?clusters=cluster-a&resource=shop%2Fapi&resourceKind=Pod#panel",
    );

    await user.click(screen.getByRole("button", { name: "add label" }));
    expect(readState()).toMatchObject({
      labels: ["team=checkout"],
      location: "/product/resources?clusters=cluster-a&labels=team%3Dcheckout" +
        "&resource=shop%2Fapi&resourceKind=Pod#panel",
      navigationType: "PUSH",
    });

    await user.click(screen.getByRole("button", { name: "type query" }));
    expect(readState()).toMatchObject({
      location: "/product/resources?clusters=cluster-a&labels=team%3Dcheckout" +
        "&resources.q=checkout&resource=shop%2Fapi&resourceKind=Pod#panel",
      navigationType: "REPLACE",
    });

    await user.click(screen.getByRole("button", { name: "same filters" }));
    expect(readState().navigationType).toBe("REPLACE");
  });

  it("does not lose a change when an updater mutates the current object in place", async () => {
    const user = userEvent.setup();
    renderProvider("/product/resources?clusters=cluster-a");

    await user.click(screen.getByRole("button", { name: "mutate query" }));

    expect(readState()).toMatchObject({
      location: "/product/resources?clusters=cluster-a&resources.q=mutated",
      navigationType: "REPLACE",
    });
  });

  it("derives state from browser history and never overwrites a pop navigation", async () => {
    const user = userEvent.setup();
    renderProvider("/product/resources?clusters=cluster-a");

    await user.click(screen.getByRole("button", { name: "add label" }));
    await user.click(screen.getByRole("button", { name: "add cluster" }));
    expect(readState()).toMatchObject({
      clusters: ["cluster-a", "cluster-b"],
      labels: ["team=checkout"],
    });

    await user.click(screen.getByRole("button", { name: "back" }));
    expect(readState()).toMatchObject({
      clusters: ["cluster-a"],
      labels: ["team=checkout"],
      navigationType: "POP",
    });

    await user.click(screen.getByRole("button", { name: "forward" }));
    expect(readState()).toMatchObject({
      clusters: ["cluster-a", "cluster-b"],
      navigationType: "POP",
    });
  });

  it("builds cross-surface hrefs with filters but without detail or unknown query", () => {
    renderProvider(
      "/product/resources?clusters=cluster-a&labels=team%3Dcheckout" +
      "&resources.types=Pod&issues.status=open&resource=shop%2Fapi" +
      "&resourceKind=Pod&tab=events&full=true&node=worker-a&debug=1",
    );

    expect(screen.getByTestId("issues-href").textContent).toBe(
      "/product/issues?clusters=cluster-a&labels=team%3Dcheckout" +
      "&resources.types=Pod&issues.status=open",
    );
  });

  it("fails loudly when the hook is used outside its provider", () => {
    expect(() => render(
      <MemoryRouter><FilterProbe /></MemoryRouter>,
    )).toThrow("useUnifiedFilter must be used within UnifiedFilterProvider");
  });
});

function FilterProbe() {
  const filter = useUnifiedFilter();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const state = {
    clusters: filter.state.common.clusters,
    detail: filter.detail,
    labels: filter.state.common.labels.map(({ key, value }) => `${key}=${value}`),
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
        onClick={() => filter.updateFilters(mutateQuery, "typing")}
        type="button"
      >
        mutate query
      </button>
      <button onClick={() => filter.updateFilters((current) => current, "chip-add")} type="button">
        same filters
      </button>
      <button onClick={() => navigate(-1)} type="button">back</button>
      <button onClick={() => navigate(1)} type="button">forward</button>
    </>
  );
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
    common: {
      ...current.common,
      clusters: [...current.common.clusters, "cluster-b"],
    },
  };
}

function addQuery(current: UnifiedFilterState): UnifiedFilterState {
  return {
    ...current,
    resources: { ...current.resources, query: "checkout" },
  };
}

function mutateQuery(current: UnifiedFilterState): UnifiedFilterState {
  current.resources.query = "mutated";
  return current;
}

function renderProvider(entry: string, strict = false) {
  const tree = (
    <MemoryRouter initialEntries={[entry]}>
      <UnifiedFilterProvider><FilterProbe /></UnifiedFilterProvider>
    </MemoryRouter>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function readState(): {
  clusters: readonly string[];
  detail: { resource: string | null; resourceKind: string | null };
  labels: readonly string[];
  location: string;
  navigationType: string;
  needsCanonicalWrite: boolean;
} {
  return JSON.parse(screen.getByTestId("filter-state").textContent ?? "{}") as ReturnType<
    typeof readState
  >;
}
