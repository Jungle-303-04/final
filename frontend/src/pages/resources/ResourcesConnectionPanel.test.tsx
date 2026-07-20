// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../shared/i18n";
import { ResourcesConnectionPanel } from "./ResourcesConnectionPanel";
import type { RelationTopologyFrame } from "./useRelationTopologyDataFrame";

afterEach(cleanup);

describe("ResourcesConnectionPanel", () => {
  it("keeps the v3 service/config/repository lens on observed relationship nodes", async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    const onOpen = vi.fn();
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <MemoryRouter>
          <ResourcesConnectionPanel
            focusedNodeId={null}
            frame={relationFrame()}
            onFocus={onFocus}
            onOpen={onOpen}
            repositoryHref="/deploy?section=repositories"
          />
        </MemoryRouter>
      </I18nProvider>,
    );

    const service = screen.getByRole("button", { name: /^checkout · Service · Ready$/u });
    await user.click(service);
    expect(onFocus).toHaveBeenCalledWith(expect.objectContaining({ id: "service:shop:checkout" }));
    await user.dblClick(service);
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "service:shop:checkout" }));

    await user.click(screen.getByRole("button", { name: "구성" }));
    expect(screen.getByRole("button", { name: /checkout-config/u })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^checkout · Service · Ready$/u })).toBeNull();

    await user.click(screen.getByRole("button", { name: "저장소" }));
    expect(screen.getByRole("button", { name: /checkout-app/u })).toBeTruthy();
    expect(screen.getByRole("link", { name: "저장소·동기화 열기" }).getAttribute("href"))
      .toBe("/deploy?section=repositories");
  });
});

function relationFrame(): RelationTopologyFrame {
  return {
    phase: "ready",
    failure: null,
    refreshFailure: null,
    refreshing: false,
    updatedAt: Date.UTC(2026, 6, 20),
    data: {
      availability: "available",
      clusterId: "cluster-1",
      clusterProjectionRevision: 1,
      graphRevision: "a".repeat(64),
      refreshAfterSeconds: 30,
      nodes: [
        node("service:shop:checkout", "service", "Service", "shop", "checkout", "Ready"),
        node("config:shop:checkout", "configmap", "ConfigMap", "shop", "checkout-config", "Active"),
        node("application:checkout", "application", "Application", null, "checkout-app", "Synced"),
      ],
      edges: [],
      counts: {
        filteredCount: 3,
        unfilteredCount: 3,
        filteredCountCompleteness: "exact",
        unfilteredCountCompleteness: "exact",
      },
      relationCompleteness: "exact",
      partialReasonCodes: [],
      truncated: false,
      omittedNodeCount: 0,
      omittedEdgeCount: 0,
      snapshot: {
        snapshotRevision: 1,
        authorizationRevision: "b".repeat(64),
        filterFingerprint: "c".repeat(64),
        observedAt: "2026-07-20T00:00:00Z",
        stale: false,
        partialReasonCodes: [],
      },
    },
  };
}

function node(
  id: string,
  resourceType: string,
  kind: string,
  namespace: string | null,
  name: string,
  status: string,
) {
  return {
    id,
    identity: { resourceType, kind, namespace, name },
    kind,
    name,
    status,
  };
}
