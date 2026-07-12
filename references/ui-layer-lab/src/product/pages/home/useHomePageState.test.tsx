// @vitest-environment jsdom

import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HomePortFailure,
  type HomeClusterOverview,
  type HomeNodeCollection,
  type HomePodCollection,
} from "../../features/home/homeContract";
import {
  deferred,
  flushEffects,
  flushPromises,
  homeApi,
  nodes,
  overview,
  pods,
  renderHomeState,
  setVisibility,
} from "./useHomePageState.testSupport";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(document, "visibilityState");
});

describe("useHomePageState refresh authority", () => {
  it.each(["overview", "nodes", "pods"] as const)(
    "promotes a cluster.read 403 from %s and clears every cached cluster frame",
    async (deniedSection) => {
      const api = homeApi();
      api.overview
        .mockResolvedValueOnce(overview("cluster-a", "initial"))
        .mockResolvedValue(overview("cluster-a", "refreshed"));
      api.nodes
        .mockResolvedValueOnce(nodes("cluster-a", ["worker-a"]))
        .mockResolvedValue(nodes("cluster-a", ["worker-a"]));
      api.pods
        .mockResolvedValueOnce(pods("cluster-a", "worker-a"))
        .mockResolvedValue(pods("cluster-a", "worker-a"));
      api[deniedSection].mockRejectedValueOnce(new HomePortFailure("forbidden"));

      const { result } = renderHomeState(
        api.port,
        "/product?cluster=cluster-a&node=worker-a",
      );
      await waitFor(() => expect(result.current.pods.phase).toBe("ready"));

      act(() => result.current.refresh());

      await waitFor(() => expect(result.current.clusterAccess.kind).toBe("forbidden"));
      const access = result.current.clusterAccess;
      if (access.kind !== "forbidden") throw new Error("Expected forbidden authority");
      expect(access.failure.code).toBe("forbidden");
      expect(result.current.overview.data).toBeNull();
      expect(result.current.nodes.data).toBeNull();
      expect(result.current.pods.data).toBeNull();
    },
  );

  it("polls only while visible, refreshes on visibility return, and supports manual refresh", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const api = homeApi();
    const { result } = renderHomeState(api.port, "/product?cluster=cluster-a");
    await flushEffects();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.overview).toHaveBeenCalledTimes(1);
    expect(api.nodes).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await flushPromises();
    });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.overview).toHaveBeenCalledTimes(2);
    expect(api.nodes).toHaveBeenCalledTimes(2);

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(60_000);
    });
    await flushEffects();
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.overview).toHaveBeenCalledTimes(2);

    await act(async () => {
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
      await flushPromises();
    });
    expect(api.list).toHaveBeenCalledTimes(3);
    expect(api.overview).toHaveBeenCalledTimes(3);

    await act(async () => {
      result.current.refresh();
      await flushPromises();
    });
    expect(api.list).toHaveBeenCalledTimes(4);
    expect(api.overview).toHaveBeenCalledTimes(4);
  });

  it("keeps the last success and exposes a background refresh failure", async () => {
    const api = homeApi();
    const nextOverview = deferred<HomeClusterOverview>();
    api.overview
      .mockResolvedValueOnce(overview("cluster-a", "last-success"))
      .mockImplementationOnce(() => nextOverview.promise);
    const { result } = renderHomeState(api.port, "/product?cluster=cluster-a");
    await waitFor(() => expect(result.current.overview.phase).toBe("ready"));

    act(() => result.current.refresh());
    expect(result.current.overview.phase).toBe("ready");
    expect(result.current.overview.data?.name).toBe("last-success");
    await waitFor(() => {
      expect(result.current.overview.phase).toBe("ready");
      if (result.current.overview.phase === "ready") {
        expect(result.current.overview.refreshing).toBe(true);
        expect(result.current.overview.data.name).toBe("last-success");
      }
    });

    act(() => nextOverview.reject(new HomePortFailure("offline")));
    await waitFor(() => {
      expect(result.current.overview.phase).toBe("ready");
      if (result.current.overview.phase === "ready") {
        expect(result.current.overview.refreshing).toBe(false);
        expect(result.current.overview.data.name).toBe("last-success");
        expect(result.current.overview.refreshFailure?.code).toBe("offline");
      }
    });
  });
});

describe("useHomePageState deep-link and generation safety", () => {
  it("waits for an unknown-completeness Node list and lets Pod 404 resolve the deep link", async () => {
    const api = homeApi();
    const nextNodes = deferred<HomeNodeCollection>();
    const nextPods = deferred<HomePodCollection>();
    api.nodes.mockImplementationOnce(() => nextNodes.promise);
    api.pods.mockImplementationOnce(() => nextPods.promise);
    const { result } = renderHomeState(
      api.port,
      "/product?cluster=cluster-a&node=external-node",
    );

    await waitFor(() => expect(api.nodes).toHaveBeenCalledOnce());
    expect(api.pods).not.toHaveBeenCalled();
    act(() => nextNodes.resolve(nodes("cluster-a", ["worker-a"])));
    await waitFor(() => expect(api.pods).toHaveBeenCalledWith(
      "cluster-a",
      "external-node",
      expect.any(AbortSignal),
    ));
    expect(result.current.selectedNodeResolution).not.toBe("unknown");

    act(() => nextPods.reject(new HomePortFailure("not-found")));
    await waitFor(() => expect(result.current.selectedNodeResolution).toBe("unknown"));
  });

  it("does not let an older A request replace the newest A frame after A to B to A", async () => {
    const api = homeApi();
    const firstA = deferred<HomeClusterOverview>();
    const secondA = deferred<HomeClusterOverview>();
    const clusterB = deferred<HomeClusterOverview>();
    api.overview.mockImplementation((clusterId) => {
      if (clusterId === "cluster-b") return clusterB.promise;
      return api.overview.mock.calls.filter(([id]) => id === "cluster-a").length === 1
        ? firstA.promise
        : secondA.promise;
    });
    const { result } = renderHomeState(api.port, "/product?cluster=cluster-a");
    await waitFor(() => expect(api.overview).toHaveBeenCalledWith(
      "cluster-a",
      expect.any(AbortSignal),
    ));

    act(() => result.current.selectCluster("cluster-b"));
    await waitFor(() => expect(api.overview).toHaveBeenCalledWith(
      "cluster-b",
      expect.any(AbortSignal),
    ));
    act(() => result.current.selectCluster("cluster-a"));
    await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(3));
    expect(result.current.overview.data).toBeNull();

    act(() => secondA.resolve(overview("cluster-a", "newest-a")));
    await waitFor(() => expect(result.current.overview.data?.name).toBe("newest-a"));
    act(() => firstA.resolve(overview("cluster-a", "obsolete-a")));
    await flushEffects();
    expect(result.current.overview.data?.name).toBe("newest-a");
  });
});
