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
  it("coalesces scoped deferred-ready invalidations behind the successful dashboard read", async () => {
    const api = homeApi();
    renderHomeState(api.port, "/?clusters=cluster-a");
    await waitFor(() => expect(api.dashboardStreams).toHaveLength(1));
    await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(1));

    act(() => {
      api.dashboardStreams[0]?.emit("snapshot-2");
      api.dashboardStreams[0]?.emit("snapshot-3");
    });

    await waitFor(() => expect(api.overview).toHaveBeenCalledTimes(2));
    expect(api.nodes).toHaveBeenCalledTimes(2);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it("does not subscribe when the server disables dashboard event invalidation", async () => {
    const api = homeApi();
    api.port.loadDashboardRefreshPolicy = vi.fn().mockResolvedValue({
      staleAfterSeconds: 15,
      refreshAfterSeconds: 30,
      keepLastSuccess: true,
      pauseWhenHidden: true,
      eventInvalidation: false,
      retryAfterSeconds: null,
      retryLimit: null,
      postMutationRefreshAfterSeconds: null,
    });

    renderHomeState(api.port, "/?clusters=cluster-a");
    await waitFor(() => expect(api.port.loadDashboardRefreshPolicy).toHaveBeenCalled());
    expect(api.port.subscribeDashboardInvalidations).not.toHaveBeenCalled();
  });

  it("aborts a hidden or obsolete scope stream and reconnects only for the visible active scope", async () => {
    setVisibility("visible");
    const api = homeApi();
    const { result, unmount } = renderHomeState(api.port, "/?clusters=cluster-a");
    await waitFor(() => expect(api.dashboardStreams).toHaveLength(1));
    expect(api.dashboardStreams[0]?.clusterId).toBe("cluster-a");

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(api.dashboardStreams[0]?.signal?.aborted).toBe(true));

    act(() => {
      setVisibility("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(api.dashboardStreams).toHaveLength(2));
    expect(api.dashboardStreams[1]?.clusterId).toBe("cluster-a");

    act(() => result.current.selectCluster("cluster-b"));
    await waitFor(() => expect(api.dashboardStreams).toHaveLength(3));
    expect(api.dashboardStreams[1]?.signal?.aborted).toBe(true);
    expect(api.dashboardStreams[2]?.clusterId).toBe("cluster-b");

    unmount();
    expect(api.dashboardStreams[2]?.signal?.aborted).toBe(true);
  });

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
        "/?clusters=cluster-a&node=worker-a",
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

  it("refreshes every dashboard section on the exact server cadence only while visible", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const api = homeApi(7);
    const { result } = renderHomeState(api.port, "/?clusters=cluster-a&node=worker-a");
    await flushEffects();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.overview).toHaveBeenCalledTimes(1);
    expect(api.nodes).toHaveBeenCalledTimes(1);
    expect(api.pods).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(6_999);
      await flushPromises();
    });
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(api.overview).toHaveBeenCalledTimes(1);
    expect(api.nodes).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      await flushPromises();
    });
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.overview).toHaveBeenCalledTimes(2);
    expect(api.nodes).toHaveBeenCalledTimes(2);
    expect(api.pods).toHaveBeenCalledTimes(2);

    act(() => {
      setVisibility("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(20_000);
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
    expect(api.pods).toHaveBeenCalledTimes(3);

    await act(async () => {
      result.current.refresh();
      await flushPromises();
    });
    expect(api.list).toHaveBeenCalledTimes(4);
    expect(api.overview).toHaveBeenCalledTimes(4);
    expect(api.pods).toHaveBeenCalledTimes(4);
  });

  it("uses the server-declared Home insights cadence instead of the summary poll", async () => {
    vi.useFakeTimers();
    setVisibility("visible");
    const api = homeApi();
    renderHomeState(api.port, "/?clusters=cluster-a");
    await flushEffects();
    expect(api.insights).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(29_999);
      await flushPromises();
    });
    expect(api.insights).toHaveBeenCalledOnce();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await flushPromises();
    });
    expect(api.insights).toHaveBeenCalledTimes(2);
  });

  it("keeps the last success and exposes a background refresh failure", async () => {
    const api = homeApi();
    const nextOverview = deferred<HomeClusterOverview>();
    api.overview
      .mockResolvedValueOnce(overview("cluster-a", "last-success"))
      .mockImplementationOnce(() => nextOverview.promise);
    const { result } = renderHomeState(api.port, "/?clusters=cluster-a");
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
      "/?clusters=cluster-a&node=external-node",
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
    const { result } = renderHomeState(api.port, "/?clusters=cluster-a");
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
