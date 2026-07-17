// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

import { PortForwardSessionsProvider } from "../service-access/PortForwardSessionsProvider";
import type {
  PortForwardSession,
  PortForwardSessionPort,
} from "../service-access/portForwardSessionContract";
import {
  ShellSessionsProvider,
  useShellSessions,
} from "./ShellSessionsProvider";

describe("ShellSessionsProvider", () => {
  it("aggregates only active cluster and local sessions from their existing owners", async () => {
    const port = portForwardPort([
      portForwardSession("active-cluster-a", "cluster-a", "running"),
      portForwardSession("stopped-cluster-a", "cluster-a", "stopped"),
      portForwardSession("active-cluster-b", "cluster-b", "starting"),
    ]);

    render(
      <PortForwardSessionsProvider port={port}>
        <ShellSessionsProvider>
          <SessionProbe />
        </ShellSessionsProvider>
      </PortForwardSessionsProvider>,
    );

    await waitFor(() => expect(port.list).toHaveBeenCalledTimes(1));
    expect((await screen.findByTestId("cluster-a-session-counts")).textContent).toBe(
      JSON.stringify({
        execSessions: 2,
        localTerminals: 1,
        portForwards: 1,
        total: 4,
      }),
    );
  });
});

function SessionProbe() {
  const sessions = useShellSessions();
  const register = sessions.register;
  useEffect(() => {
    const closeExec = register({
      clusterId: "cluster-a",
      id: "exec-1",
      kind: "exec",
    });
    const closeParallelExec = register({
      clusterId: "cluster-a",
      id: "exec-1",
      kind: "exec",
    });
    const closeLocal = register({
      clusterId: null,
      id: "local-1",
      kind: "local-terminal",
    });
    return () => {
      closeExec();
      closeParallelExec();
      closeLocal();
    };
  }, [register]);
  return (
    <output data-testid="cluster-a-session-counts">
      {JSON.stringify(sessions.countsForCluster("cluster-a"))}
    </output>
  );
}

function portForwardPort(
  sessions: readonly PortForwardSession[],
): PortForwardSessionPort & { list: ReturnType<typeof vi.fn> } {
  return {
    available: true,
    list: vi.fn().mockResolvedValue({
      refreshPolicy: {
        eventInvalidation: false,
        keepLastSuccess: true,
        pauseWhenHidden: true,
        postMutationRefreshAfterSeconds: 0.5,
        refreshAfterSeconds: 30,
        retryAfterSeconds: null,
        retryLimit: null,
        staleAfterSeconds: null,
      },
      sessions,
    }),
    recreate: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
}

function portForwardSession(
  id: string,
  clusterId: string,
  status: PortForwardSession["status"],
): PortForwardSession {
  return {
    clusterId,
    error: null,
    exitCode: null,
    freshness: "live",
    id,
    listenAddress: "127.0.0.1",
    localPort: 18_080,
    namespace: "shop",
    podName: "checkout-0",
    podPort: 8080,
    resourceKind: "Pod",
    resourceName: "checkout-0",
    resourceUid: `uid-${id}`,
    scheme: null,
    serviceName: null,
    servicePort: null,
    startedAt: "2026-07-17T04:00:00Z",
    status,
    workspaceId: "workspace-main",
  };
}
