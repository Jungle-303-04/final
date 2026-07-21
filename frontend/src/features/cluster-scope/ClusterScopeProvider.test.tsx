// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HomePortFailure } from "../home/homeContract";
import type { ClusterScopePort } from "./clusterScopeContract";
import {
  collection,
  deferred,
  portOf,
  readState,
  renderScope,
  scopeTree,
} from "./__tests__/ClusterScopeProviderTestSupport";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ClusterScopeProvider", () => {
  it("shares one cluster collection request across a StrictMode remount", async () => {
    const listClusterChoices = vi.fn(async () => collection());

    renderScope({ listClusterChoices }, "/?clusters=cluster-a", true);

    await waitFor(() => expect(readState().selection).toBe("selected"));
    expect(listClusterChoices).toHaveBeenCalledTimes(1);
  });

  it("keeps a zero-cluster canonical filter passive instead of selecting the first Cluster", async () => {
    const entry = "/resources?labels=team%3Dcheckout&resources.types=Pod" +
      "&resource=default%2Fapi&resourceKind=Pod&tab=events&full=true&node=worker-a#panel";
    renderScope(portOf(collection()), entry);

    await waitFor(() => {
      expect(readState()).toMatchObject({
        filterClusters: [],
        location: entry,
        navigationType: "POP",
        requestedClusterId: null,
        selectedClusterId: null,
        selection: "unfiltered",
      });
    });
  });

  it.each([
    [
      "single resolved",
      "/resources?clusters=cluster-a&labels=team%3Dcheckout",
      ["cluster-a"],
      "cluster-a",
      "cluster-a",
      "selected",
    ],
    [
      "multiple resolved",
      "/resources?clusters=cluster-a,cluster-b&labels=team%3Dcheckout",
      ["cluster-a", "cluster-b"],
      null,
      null,
      "multiple",
    ],
    [
      "single unresolved",
      "/resources?clusters=missing&labels=team%3Dcheckout",
      ["missing"],
      "missing",
      null,
      "unknown",
    ],
  ])("projects a %s canonical cluster filter without rewriting the URL", async (
    _case,
    entry,
    filterClusters,
    requestedClusterId,
    selectedClusterId,
    selection,
  ) => {
    renderScope(portOf(collection()), entry);

    await waitFor(() => {
      expect(readState()).toMatchObject({
        filterClusters,
        location: entry,
        navigationType: "POP",
        requestedClusterId,
        selectedClusterId,
        selection,
      });
    });
  });

  it("dual-reads a legacy cluster without migrating it during mount", async () => {
    const entry = "/resources?cluster=cluster-a&labels=team%3Dcheckout" +
      "&resource=default%2Fapi&kind=Pod#panel";
    renderScope(portOf(collection()), entry);

    await waitFor(() => expect(readState().selection).toBe("selected"));
    expect(readState()).toMatchObject({
      filterClusters: ["cluster-a"],
      location: entry,
      navigationType: "POP",
      needsCanonicalWrite: true,
      requestedClusterId: "cluster-a",
      selectedClusterId: "cluster-a",
    });
  });

  it("gives canonical clusters authority over a coexisting legacy cluster", async () => {
    const entry = "/resources?clusters=cluster-b&cluster=cluster-a" +
      "&labels=team%3Dcheckout&resource=default%2Fapi&resourceKind=Pod#panel";
    renderScope(portOf(collection()), entry);

    await waitFor(() => {
      expect(readState()).toMatchObject({
        filterClusters: ["cluster-b"],
        location: entry,
        navigationType: "POP",
        needsCanonicalWrite: true,
        requestedClusterId: "cluster-b",
        selectedClusterId: "cluster-b",
        selection: "selected",
      });
    });
  });

  it("changes only the canonical cluster axis and preserves filters plus detail identity", async () => {
    const user = userEvent.setup();
    const entry = "/resources?clusters=cluster-a" +
      "&namespaces=cluster-a%2Fdefault&applications=app-a&labels=team%3Dcheckout" +
      "&resources.types=Pod&issues.status=open&resource=default%2Fapi" +
      "&resourceKind=Pod&tab=events&full=true&node=worker-a#panel";
    renderScope(
      portOf(collection()),
      entry,
    );

    await waitFor(() => expect(readState().selection).toBe("selected"));
    await user.click(screen.getByRole("button", { name: "select cluster-b" }));

    await waitFor(() => {
      expect(readState()).toMatchObject({
        filterClusters: ["cluster-b"],
        location: "/resources?clusters=cluster-b" +
          "&namespaces=cluster-a%2Fdefault&applications=app-a&labels=team%3Dcheckout" +
          "&resources.types=Pod&issues.status=open&resource=default%2Fapi" +
          "&resourceKind=Pod&tab=events&full=true&node=worker-a#panel",
        requestedClusterId: "cluster-b",
        selectedClusterId: "cluster-b",
      });
    });
  });

  it("reports unauthorized collection failures through the auth gate", async () => {
    const reportUnauthorized = vi.fn();
    const port: ClusterScopePort = {
      listClusterChoices: vi.fn(async () => {
        throw new HomePortFailure("unauthorized");
      }),
    };

    renderScope(port, "/?clusters=cluster-a", false, reportUnauthorized);

    await waitFor(() => expect(reportUnauthorized).toHaveBeenCalledTimes(1));
    expect(readState()).toMatchObject({ phase: "loading", selection: "resolving" });
  });

  it("removes cached collection data when a refresh becomes forbidden", async () => {
    const user = userEvent.setup();
    const listClusterChoices = vi.fn()
      .mockResolvedValueOnce(collection())
      .mockRejectedValueOnce(new HomePortFailure("forbidden"));
    renderScope({ listClusterChoices }, "/?clusters=cluster-a");

    await waitFor(() => expect(readState().selection).toBe("selected"));
    await user.click(screen.getByRole("button", { name: "refresh scope" }));

    await waitFor(() => {
      expect(readState()).toMatchObject({
        failure: "forbidden",
        phase: "failed",
        selectedClusterId: null,
        selection: "unavailable",
      });
    });
  });

  it("clears the previous authority collection before the replacement request settles", async () => {
    const next = deferred<ReturnType<typeof collection>>();
    const listClusterChoices = vi.fn()
      .mockResolvedValueOnce(collection())
      .mockReturnValueOnce(next.promise);
    const port = { listClusterChoices };
    const view = renderScope(port, "/?clusters=cluster-a");

    await waitFor(() => expect(readState().selection).toBe("selected"));
    view.rerender(scopeTree(port, "/?clusters=cluster-a", "workspace-b:user-a"));

    expect(readState()).toMatchObject({
      phase: "loading",
      selectedClusterId: null,
      selection: "resolving",
    });
    await act(async () => {
      next.reject(new HomePortFailure("offline"));
      await Promise.resolve();
    });
    await waitFor(() => expect(readState()).toMatchObject({
      failure: "offline",
      phase: "failed",
      selectedClusterId: null,
      selection: "unavailable",
    }));
  });

  it("retains the last verified collection when a background refresh fails", async () => {
    const user = userEvent.setup();
    const listClusterChoices = vi.fn()
      .mockResolvedValueOnce(collection())
      .mockRejectedValueOnce(new HomePortFailure("offline"));
    renderScope({ listClusterChoices }, "/?clusters=cluster-a");

    await waitFor(() => expect(readState().selection).toBe("selected"));
    await user.click(screen.getByRole("button", { name: "refresh scope" }));

    await waitFor(() => {
      expect(readState()).toMatchObject({
        phase: "ready",
        refreshFailure: "offline",
        selectedClusterId: "cluster-a",
        selection: "selected",
      });
    });
  });

  it("rotates the selection scope key for A to B to A without reusing stale state", async () => {
    const user = userEvent.setup();
    renderScope(portOf(collection()), "/?clusters=cluster-a");

    await waitFor(() => expect(readState().selection).toBe("selected"));
    const firstA = readState().scopeKey;

    await user.click(screen.getByRole("button", { name: "select cluster-b" }));
    await waitFor(() => expect(readState().selectedClusterId).toBe("cluster-b"));
    const clusterB = readState().scopeKey;

    await user.click(screen.getByRole("button", { name: "select cluster-a" }));
    await waitFor(() => expect(readState().selectedClusterId).toBe("cluster-a"));
    const secondA = readState().scopeKey;

    expect(firstA).toMatch(/^cluster-a:/u);
    expect(clusterB).toMatch(/^cluster-b:/u);
    expect(secondA).toMatch(/^cluster-a:/u);
    expect(new Set([firstA, clusterB, secondA])).toHaveLength(3);
  });
});
