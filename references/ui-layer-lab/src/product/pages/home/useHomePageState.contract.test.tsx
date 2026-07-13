// @vitest-environment jsdom

import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HomePortFailure, type HomeClusterOverview } from "../../features/home/homeContract";
import {
  clusterChoices,
  deferred,
  homeApi,
  overview,
  renderHomeState,
} from "./useHomePageState.testSupport";

afterEach(cleanup);

describe("useHomePageState refresh contract", () => {
  it("refreshes cluster choices and keeps the last catalog success on a background failure", async () => {
    const api = homeApi();
    const nextChoices = deferred<ReturnType<typeof clusterChoices>>();
    api.list
      .mockResolvedValueOnce(clusterChoices())
      .mockImplementationOnce(() => nextChoices.promise);
    const { result } = renderHomeState(api.port, "/product?cluster=cluster-a");
    await waitFor(() => expect(result.current.choices.phase).toBe("ready"));

    act(() => result.current.refresh());
    expect(result.current.choices.data?.clusters).toHaveLength(2);
    await waitFor(() => {
      expect(result.current.choices.phase).toBe("ready");
      if (result.current.choices.phase === "ready") {
        expect(result.current.choices.refreshing).toBe(true);
      }
    });

    act(() => nextChoices.reject(new HomePortFailure("rate-limited", 17)));
    await waitFor(() => {
      expect(result.current.choices.phase).toBe("ready");
      if (result.current.choices.phase === "ready") {
        expect(result.current.choices.refreshFailure?.code).toBe("rate-limited");
        expect(result.current.choices.refreshFailure?.retryAfterSeconds).toBe(17);
      }
    });
  });

  it("clears a cached catalog when a refresh loses list permission", async () => {
    const api = homeApi();
    api.list
      .mockResolvedValueOnce(clusterChoices())
      .mockRejectedValueOnce(new HomePortFailure("forbidden"));
    const { result } = renderHomeState(api.port, "/product?cluster=cluster-a");
    await waitFor(() => expect(result.current.choices.phase).toBe("ready"));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.choices.phase).toBe("failed"));
    expect(result.current.choices.data).toBeNull();
  });

  it("marks a malformed direct Node as invalid without calling the Pod endpoint", async () => {
    const api = homeApi();
    const invalidNode = `${"a".repeat(254)}/invalid`;
    const { result } = renderHomeState(
      api.port,
      `/product?cluster=cluster-a&node=${invalidNode}`,
    );

    await waitFor(() => expect(result.current.nodes.phase).toBe("ready"));
    expect(result.current.selectedNodeResolution).toBe("invalid");
    expect(api.pods).not.toHaveBeenCalled();
  });

  it("never re-exposes forbidden cached data while a permission retry starts", async () => {
    const api = homeApi();
    const retry = deferred<HomeClusterOverview>();
    api.overview
      .mockResolvedValueOnce(overview("cluster-a", "cached"))
      .mockRejectedValueOnce(new HomePortFailure("forbidden"))
      .mockImplementationOnce(() => retry.promise);
    const { result } = renderHomeState(api.port, "/product?cluster=cluster-a");
    await waitFor(() => expect(result.current.overview.data?.name).toBe("cached"));

    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.clusterAccess.kind).toBe("forbidden"));
    expect(result.current.overview.data).toBeNull();

    act(() => result.current.refresh());
    expect(result.current.clusterAccess.kind).toBe("forbidden");
    expect(result.current.overview.data).toBeNull();
    await waitFor(() => expect(result.current.clusterAccess.kind).toBe("allowed"));
    expect(result.current.overview.data).toBeNull();

    act(() => retry.resolve(overview("cluster-a", "authorized")));
    await waitFor(() => expect(result.current.overview.data?.name).toBe("authorized"));
  });
});
