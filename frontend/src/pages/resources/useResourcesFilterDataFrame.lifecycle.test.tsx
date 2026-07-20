// @vitest-environment jsdom

import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourcesPortFailure } from "../../features/resources/resourcesContract";
import type {
  ResourcesFilterFacetPage,
  ResourcesFilterLabelFacetPage,
  ResourcesFilterResourcePage,
} from "../../features/resources/resourcesFilterContract";
import {
  FILTER_STATE_A,
  FILTER_STATE_B,
  deferred,
  facetPage,
  flushEffects,
  labelPage,
  renderResourcesFilterFrame,
  resourcePage,
  resourcesFilterPort,
} from "./useResourcesFilterDataFrame.testSupport";

afterEach(cleanup);

describe("useResourcesFilterDataFrame lifecycle", () => {
  it("aborts every active channel when scope changes and ignores late results", async () => {
    const oldList = deferred<ResourcesFilterResourcePage>();
    const oldFacet = deferred<ResourcesFilterFacetPage>();
    const oldLabels = deferred<ResourcesFilterLabelFacetPage>();
    const signals: AbortSignal[] = [];
    const port = resourcesFilterPort({
      listResourcePage: vi.fn((state, _options, signal) => {
        signals.push(signal!);
        return state.resources.query === "checkout"
          ? oldList.promise
          : Promise.resolve(resourcePage("orders-api-0"));
      }),
      listFacetPage: vi.fn((state, _options, signal) => {
        signals.push(signal!);
        return state.resources.query === "checkout"
          ? oldFacet.promise
          : Promise.resolve(facetPage("cluster-c"));
      }),
      listLabelFacetPage: vi.fn((state, _options, signal) => {
        signals.push(signal!);
        return state.resources.query === "checkout"
          ? oldLabels.promise
          : Promise.resolve(labelPage("team=orders"));
      }),
    });
    const rendered = renderResourcesFilterFrame({ port });
    await waitFor(() => expect(signals).toHaveLength(3));

    rendered.rerender({ current: { ...rendered.input, filterState: FILTER_STATE_B } });
    await waitFor(() => expect(signals).toHaveLength(6));
    await act(flushEffects);
    await waitFor(() => {
      expect(signals.slice(0, 3).every((signal) => signal.aborted)).toBe(true);
    });
    expect(rendered.result.current.list.phase).toBe("ready");
    expect(rendered.result.current.list.data?.items[0]?.resource.name).toBe("orders-api-0");

    act(() => {
      oldList.resolve(resourcePage("stale-checkout"));
      oldFacet.resolve(facetPage("stale-cluster"));
      oldLabels.resolve(labelPage("team=stale"));
    });
    await act(flushEffects);
    expect(rendered.result.current.list.data?.items[0]?.resource.name).toBe("orders-api-0");
    expect(rendered.result.current.facet.data?.items[0]?.value).toBe("cluster-c");
    expect(rendered.result.current.labels.data?.items[0]?.selector).toBe("team=orders");
  });

  it("aborts all active channels on unmount without retrying", async () => {
    const pending = [
      deferred<ResourcesFilterResourcePage>(),
      deferred<ResourcesFilterFacetPage>(),
      deferred<ResourcesFilterLabelFacetPage>(),
    ] as const;
    const signals: AbortSignal[] = [];
    const port = resourcesFilterPort({
      listResourcePage: vi.fn((_state, _options, signal) => {
        signals.push(signal!);
        return pending[0].promise;
      }),
      listFacetPage: vi.fn((_state, _options, signal) => {
        signals.push(signal!);
        return pending[1].promise;
      }),
      listLabelFacetPage: vi.fn((_state, _options, signal) => {
        signals.push(signal!);
        return pending[2].promise;
      }),
    });
    const rendered = renderResourcesFilterFrame({ port });
    await waitFor(() => expect(signals).toHaveLength(3));
    rendered.unmount();
    await flushEffects();

    await waitFor(() => expect(signals.every((signal) => signal.aborted)).toBe(true));
    expect(port.listResourcePage).toHaveBeenCalledOnce();
    expect(port.listFacetPage).toHaveBeenCalledOnce();
    expect(port.listLabelFacetPage).toHaveBeenCalledOnce();
  });

  it("preserves verified list rows during a same-scope background refresh failure", async () => {
    const refresh = deferred<ResourcesFilterResourcePage>();
    const listResourcePage = vi.fn()
      .mockResolvedValueOnce(resourcePage("checkout-api-0"))
      .mockReturnValueOnce(refresh.promise);
    const port = resourcesFilterPort({ listResourcePage });
    const rendered = renderResourcesFilterFrame({ port });
    await waitFor(() => expect(rendered.result.current.list.phase).toBe("ready"));

    rendered.rerender({ current: { ...rendered.input, revision: 1 } });
    await waitFor(() => expect(listResourcePage).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(rendered.result.current.list.refreshing).toBe(true));
    expect(rendered.result.current.list.phase).toBe("ready");
    expect(rendered.result.current.list.data?.items[0]?.resource.name).toBe("checkout-api-0");

    act(() => refresh.reject(new ResourcesPortFailure("offline")));
    await act(flushEffects);
    expect(rendered.result.current.list.data?.items[0]?.resource.name).toBe("checkout-api-0");
    expect(rendered.result.current.list.refreshing).toBe(false);
    expect(rendered.result.current.list.refreshFailure?.code).toBe("offline");
  });

  it.each(["list", "facet", "labels"] as const)(
    "isolates a %s failure from the other channels",
    async (failedTarget) => {
      const failure = Promise.reject(new ResourcesPortFailure("unavailable"));
      const port = resourcesFilterPort({
        ...(failedTarget === "list" ? { listResourcePage: vi.fn(() => failure) } : {}),
        ...(failedTarget === "facet" ? { listFacetPage: vi.fn(() => failure) } : {}),
        ...(failedTarget === "labels" ? { listLabelFacetPage: vi.fn(() => failure) } : {}),
      });
      const rendered = renderResourcesFilterFrame({ port });
      await waitFor(() => expect(rendered.result.current[failedTarget].phase).toBe("failed"));

      for (const target of ["list", "facet", "labels"] as const) {
        expect(rendered.result.current[target].phase).toBe(target === failedTarget ? "failed" : "ready");
      }
      expect(port.listResourcePage).toHaveBeenCalledOnce();
      expect(port.listFacetPage).toHaveBeenCalledOnce();
      expect(port.listLabelFacetPage).toHaveBeenCalledOnce();
    },
  );

  it("sends multi-axis filters once per channel without fan-out or fallback", async () => {
    const port = resourcesFilterPort();
    renderResourcesFilterFrame({ filterState: FILTER_STATE_A, port });
    await waitFor(() => expect(port.listResourcePage).toHaveBeenCalledOnce());
    expect(port.listFacetPage).toHaveBeenCalledOnce();
    expect(port.listLabelFacetPage).toHaveBeenCalledOnce();
    const [state, options, signal] = vi.mocked(port.listResourcePage).mock.calls[0]!;
    expect(state.common.clusters).toEqual(["cluster-a", "cluster-b"]);
    expect(state.common.namespaces).toEqual(FILTER_STATE_A.common.namespaces);
    expect(state.common.applications).toEqual(["app-checkout"]);
    expect(state.common.labels).toEqual(FILTER_STATE_A.common.labels);
    expect(options).toEqual({});
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});
