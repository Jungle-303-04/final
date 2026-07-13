// @vitest-environment jsdom

import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourcesFilterSnapshot } from "../../features/resources/resourcesFilterContract";
import {
  FILTER_STATE_B,
  deferred,
  facetPage,
  labelPage,
  renderResourcesFilterFrame,
  resourcePage,
  resourcesFilterPort,
} from "./useResourcesFilterDataFrame.testSupport";

afterEach(cleanup);

describe("useResourcesFilterDataFrame pagination", () => {
  it.each(["list", "facet", "labels"] as const)(
    "resets the %s cursor when filter identity changes",
    async (target) => {
      const pending = deferred<never>();
      const methodName = target === "list"
        ? "listResourcePage"
        : target === "facet" ? "listFacetPage" : "listLabelFacetPage";
      const firstPage = target === "list"
        ? resourcePage("page-1", "cursor-2")
        : target === "facet" ? facetPage("cluster-a", "cursor-2") : labelPage("team=a", "cursor-2");
      const nextScopePage = target === "list"
        ? resourcePage("scope-b")
        : target === "facet" ? facetPage("cluster-b") : labelPage("team=b");
      const method = vi.fn()
        .mockResolvedValueOnce(firstPage)
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(nextScopePage);
      const port = resourcesFilterPort({ [methodName]: method });
      const rendered = renderResourcesFilterFrame({ port });
      await waitFor(() => expect(rendered.result.current[target].phase).toBe("ready"));

      act(() => rendered.result.current[target === "list"
        ? "loadMoreList"
        : target === "facet" ? "loadMoreFacet" : "loadMoreLabels"]());
      await waitFor(() => expect(method).toHaveBeenCalledTimes(2));
      expect(method.mock.calls[1]?.[1]).toMatchObject({ cursor: "cursor-2" });

      rendered.rerender({ current: { ...rendered.input, filterState: FILTER_STATE_B } });
      await waitFor(() => expect(method).toHaveBeenCalledTimes(3));
      expect(method.mock.calls[2]?.[1]).not.toHaveProperty("cursor");
      await waitFor(() => expect(rendered.result.current[target].phase).toBe("ready"));
      expect(rendered.result.current[target].data?.items).toHaveLength(1);
    },
  );

  it("appends each channel only within its verified page chain", async () => {
    const port = resourcesFilterPort({
      listResourcePage: vi.fn()
        .mockResolvedValueOnce(resourcePage("resource-1", "list-2"))
        .mockResolvedValueOnce(resourcePage("resource-2")),
      listFacetPage: vi.fn()
        .mockResolvedValueOnce(facetPage("cluster-a", "facet-2"))
        .mockResolvedValueOnce(facetPage("cluster-b")),
      listLabelFacetPage: vi.fn()
        .mockResolvedValueOnce(labelPage("team=a", "label-2"))
        .mockResolvedValueOnce(labelPage("team=b")),
    });
    const rendered = renderResourcesFilterFrame({ port });
    await waitFor(() => expect(rendered.result.current.labels.phase).toBe("ready"));

    act(() => {
      rendered.result.current.loadMoreList();
      rendered.result.current.loadMoreFacet();
      rendered.result.current.loadMoreLabels();
    });
    await waitFor(() => expect(rendered.result.current.list.data?.items).toHaveLength(2));
    expect(rendered.result.current.facet.data?.items.map(({ value }) => value))
      .toEqual(["cluster-a", "cluster-b"]);
    expect(rendered.result.current.labels.data?.items.map(({ selector }) => selector))
      .toEqual(["team=a", "team=b"]);
  });

  it("starts a first-page refresh after pagination when the revision changes", async () => {
    const listResourcePage = vi.fn()
      .mockResolvedValueOnce(resourcePage("resource-1", "cursor-2"))
      .mockResolvedValueOnce(resourcePage("resource-2"))
      .mockResolvedValueOnce(resourcePage("resource-refreshed"));
    const rendered = renderResourcesFilterFrame({
      port: resourcesFilterPort({ listResourcePage }),
    });
    await waitFor(() => expect(rendered.result.current.list.phase).toBe("ready"));
    act(() => rendered.result.current.loadMoreList());
    await waitFor(() => expect(rendered.result.current.list.data?.items).toHaveLength(2));

    rendered.rerender({ current: { ...rendered.input, revision: 1 } });
    await waitFor(() => expect(listResourcePage).toHaveBeenCalledTimes(3));
    expect(listResourcePage.mock.calls[2]?.[1]).not.toHaveProperty("cursor");
    await waitFor(() => expect(rendered.result.current.list.data?.items[0]?.resource.name)
      .toBe("resource-refreshed"));
  });

  it.each([
    ["snapshotRevision", { snapshotRevision: 43 }],
    ["authorizationRevision", { authorizationRevision: "auth-8" }],
    ["filterFingerprint", { filterFingerprint: "filter-8" }],
  ] satisfies ReadonlyArray<[keyof ResourcesFilterSnapshot, Partial<ResourcesFilterSnapshot>]>) (
    "rejects a resource append when %s changes",
    async (_field, changedSnapshot) => {
      const listResourcePage = vi.fn()
        .mockResolvedValueOnce(resourcePage("resource-1", "cursor-2"))
        .mockResolvedValueOnce(resourcePage("resource-2", "cursor-3", changedSnapshot));
      const rendered = renderResourcesFilterFrame({
        port: resourcesFilterPort({ listResourcePage }),
      });
      await waitFor(() => expect(rendered.result.current.list.phase).toBe("ready"));
      act(() => rendered.result.current.loadMoreList());
      await waitFor(() => expect(rendered.result.current.list.appendFailure?.code)
        .toBe("invalid-response"));

      expect(rendered.result.current.list.data?.items.map(({ resource }) => resource.name))
        .toEqual(["resource-1"]);
      expect(rendered.result.current.list.data?.nextCursor).toBe("cursor-2");
      expect(rendered.result.current.list.appendFailure?.code).toBe("invalid-response");
      expect(listResourcePage).toHaveBeenCalledTimes(2);
    },
  );
});
