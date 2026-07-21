// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../features/auth/AuthSessionGate";
import type { ClusterDisconnectPort } from "../features/clusters/clustersContract";
import { I18nProvider } from "../shared/i18n";
import type { DevpreviewCluster } from "./contracts";
import { ClusterLifecycleControl, toHomeClusterChoice } from "./ClusterLifecycleControl";

const TARGET: DevpreviewCluster = {
  id: "game-server-live",
  workspaceId: "default",
  name: "game-server-live",
  displayName: "game-server",
  environment: "production",
  provider: "eks",
  connectionStatus: "online",
  connectionStage: "ready",
  observationMode: "agent",
  lastObservedAt: "2026-07-21T01:00:00Z",
  kubernetesVersion: "v1.32.0-eks",
  nodeCount: 3,
  podCount: 18,
  namespaceCount: 13,
  incidentCount: 0,
  role: "target",
  readOnly: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ClusterLifecycleControl", () => {
  it("requires an explicit typed confirmation before calling the live disconnect port", async () => {
    const user = userEvent.setup();
    const disconnect = vi.fn().mockResolvedValue({
      status: "disconnected" as const,
      stage: "registration_revoked" as const,
      commandId: null,
      uninstallCommand: null,
      cleanupVerified: true,
      cleanupResources: [],
      residualResources: [],
      failureReason: null,
    });
    const onDisconnected = vi.fn();
    const onPhaseChange = vi.fn();
    renderControl({
      confirmManualCleanup: vi.fn(),
      disconnect,
      loadDisconnect: vi.fn(),
    }, { onDisconnected, onPhaseChange });

    await user.click(screen.getByRole("button", { name: "game-server 연결 해제" }));
    const submit = screen.getByRole("button", { name: "연결 해제" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    await user.type(
      screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }),
      "game-server",
    );
    await user.click(submit);

    expect(disconnect).toHaveBeenCalledWith("game-server-live", expect.any(AbortSignal));
    expect(await screen.findByText("연결이 해제되었습니다")).toBeTruthy();
    expect(screen.getByText("에이전트 자격 증명 폐기")).toBeTruthy();
    expect(screen.getByText("등록 해제 확인")).toBeTruthy();
    expect(screen.getByText("0개")).toBeTruthy();
    expect(onDisconnected).toHaveBeenCalledWith("game-server-live");
    expect(onPhaseChange).toHaveBeenCalledWith("game-server-live", "submitting");
    expect(onPhaseChange).toHaveBeenCalledWith("game-server-live", "succeeded");
  });

  it("does not expose destructive controls for management clusters or non-admin sessions", () => {
    const management = { ...TARGET, id: "management-server", role: "management" as const, readOnly: true };
    const { rerender } = renderControl(noopPort(), { cluster: management });
    expect(screen.queryByRole("button", { name: /연결 해제/u })).toBeNull();

    rerender(wrapped(
      <ClusterLifecycleControl
        cluster={TARGET}
        onDisconnected={vi.fn()}
        port={noopPort()}
        roles={[]}
      />,
    ));
    expect(screen.queryByRole("button", { name: /연결 해제/u })).toBeNull();
  });

  it("projects only observed cluster fields into the canonical dialog contract", () => {
    expect(toHomeClusterChoice(TARGET)).toEqual({
      id: "game-server-live",
      workspaceId: "default",
      name: "game-server",
      environment: "production",
      provider: "eks",
      connectionStage: "ready",
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-21T01:00:00Z",
      nodeCount: 3,
      podCount: 18,
      incidentCount: 0,
    });
  });
});

function renderControl(
  port: ClusterDisconnectPort,
  options: {
    cluster?: DevpreviewCluster;
    onDisconnected?: (clusterId: string) => void;
    onPhaseChange?: (clusterId: string, phase: Parameters<NonNullable<ComponentProps<typeof ClusterLifecycleControl>["onPhaseChange"]>>[1]) => void;
  } = {},
) {
  return render(wrapped(
    <ClusterLifecycleControl
      cluster={options.cluster ?? TARGET}
      onDisconnected={options.onDisconnected ?? vi.fn()}
      onPhaseChange={options.onPhaseChange}
      port={port}
      roles={["service_admin"]}
    />,
  ));
}

function wrapped(children: ReactNode) {
  return (
    <I18nProvider navigatorLanguage="ko" storage={null}>
      <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
        {children}
      </AuthSessionGateProvider>
    </I18nProvider>
  );
}

function noopPort(): ClusterDisconnectPort {
  return {
    confirmManualCleanup: vi.fn(),
    disconnect: vi.fn(),
    loadDisconnect: vi.fn(),
  };
}
