// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { HelmPort } from "../../features/helm/helmContract";
import { useHelmReleaseDetail, useHelmReleaseList } from "./useHelmReleaseData";

afterEach(() => cleanup());

describe("Helm request identity", () => {
  it("does not restart list reads when an equal cluster array is recreated", async () => {
    const listReleases = vi.fn().mockResolvedValue({
      releases: [],
      refreshAfterSeconds: 300,
      postMutationRefreshAfterSeconds: 1,
      coverage: { availability: "available", observedAt: null, reasonCodes: [] },
    });
    const checkReleaseUpgrades = vi.fn().mockResolvedValue({
      releases: {},
      coverage: { availability: "available", observedAt: null, reasonCodes: [] },
      truncated: false,
      reasonCodes: [],
      refreshAfterSeconds: 300,
    });
    const port = { listReleases, checkReleaseUpgrades } as unknown as HelmPort;
    const { rerender, result } = renderHook(
      ({ clusterId }) => useHelmReleaseList(port, [clusterId]),
      { initialProps: { clusterId: "cluster-a" } },
    );

    await waitFor(() => expect(result.current.frame.phase).toBe("ready"));
    rerender({ clusterId: "cluster-a" });
    await Promise.resolve();

    expect(listReleases).toHaveBeenCalledTimes(1);
    expect(checkReleaseUpgrades).toHaveBeenCalledTimes(1);
  });

  it("does not restart detail reads when an equal request object is recreated", async () => {
    const getRelease = vi.fn().mockResolvedValue({ refreshAfterSeconds: 300 });
    const getReleaseUpgradeInfo = vi.fn().mockResolvedValue({ refreshAfterSeconds: 300 });
    const listReleaseVersions = vi.fn().mockResolvedValue({ refreshAfterSeconds: 300 });
    const port = {
      getRelease,
      getReleaseUpgradeInfo,
      listReleaseVersions,
    } as unknown as HelmPort;
    const { rerender, result } = renderHook(
      ({ releaseName }) => useHelmReleaseDetail(port, {
        clusterId: "cluster-a",
        namespace: "storefront",
        releaseName,
      }),
      { initialProps: { releaseName: "storefront" } },
    );

    await waitFor(() => expect(result.current.frame.phase).toBe("ready"));
    rerender({ releaseName: "storefront" });
    await Promise.resolve();

    expect(getRelease).toHaveBeenCalledTimes(1);
    expect(getReleaseUpgradeInfo).toHaveBeenCalledTimes(1);
    expect(listReleaseVersions).toHaveBeenCalledTimes(1);
  });
});
