// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductSessionProvider } from "../../features/auth/ProductSessionContext";
import { publishNamespaceScopeInvalidation } from "../../features/namespace-scope/namespaceScopeInvalidation";
import type { PodTerminalPort } from "../../features/pod-terminal/podTerminalContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { POD_DETAIL } from "./ResourcesPage.testFixtures";
import { PodTerminalDialog } from "./PodTerminalDialog";
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";

const DETAIL: ResourceDetail = {
  ...POD_DETAIL,
  resource: {
    ...POD_DETAIL.resource,
    facts: {
      type: "pod",
      phase: "Running",
      nodeName: "worker-a",
      owner: { kind: "ReplicaSet", name: "checkout-api" },
      readiness: { ready: 2, total: 2 },
      restartCount: 0,
      cpuMillicores: 10,
      memoryMebibytes: 32,
      podIp: "10.0.0.4",
      hostIp: "10.0.0.2",
      waitingReasons: [],
      terminatedReasons: [],
      containerNames: ["app", "sidecar"],
    },
  },
};

const CAPABILITY_DATA = {
    subject: {
      resourceId: DETAIL.resource.inventoryKey,
      snapshotId: "snapshot-42",
      clusterId: DETAIL.clusterId,
      resourceType: "pod",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-0",
    },
    revision: "a".repeat(64),
    capabilities: [{
      capabilityId: "pod.exec",
      label: "Terminal",
      description: "Open an audited terminal session and stream its output.",
      execution: "terminal" as const,
      confirmationRequired: true,
      realtime: true,
      inputSchema: [],
      method: "WEBSOCKET" as const,
      path: "/live/terminal",
      requestContext: "simple" as const,
      resultIntent: "refresh-resource" as const,
    }],
  };

const CAPABILITIES: ResourceCapabilitiesFrame = {
  phase: "ready",
  data: CAPABILITY_DATA,
  failure: null,
};

afterEach(() => cleanup());

describe("PodTerminalDialog", () => {
  it("opens only the authorized exact pod target and streams real port events", async () => {
    const user = userEvent.setup();
    const sendInput = vi.fn();
    const close = vi.fn();
    let handlers!: Parameters<PodTerminalPort["open"]>[2];
    const port: PodTerminalPort = {
      open: vi.fn((_target, _command, nextHandlers) => {
        handlers = nextHandlers;
        return { sendInput, close };
      }),
    };
    renderTerminal(CAPABILITIES, port);

    await user.click(screen.getByRole("button", { name: "Pod 터미널" }));
    expect(screen.getByRole("dialog", { name: "터미널 · checkout-api-0" })).toBeTruthy();
    expect(screen.getByLabelText("컨테이너")).toHaveProperty("value", "app");
    await user.selectOptions(screen.getByLabelText("컨테이너"), "sidecar");
    await user.type(screen.getByLabelText("명령"), "uname -a");
    await user.click(screen.getByRole("button", { name: "명령 실행" }));

    expect(port.open).toHaveBeenCalledWith(
      {
        workspaceId: "workspace-main",
        clusterId: "cluster-1",
        namespace: "shop",
        pod: "checkout-api-0",
        container: "sidecar",
      },
      "uname -a",
      expect.any(Object),
    );

    act(() => handlers.onEvent({ type: "connected", sessionId: "session-1" }));
    expect(screen.getByRole("status").textContent).toContain("연결됨");
    await user.type(screen.getByLabelText("표준 입력"), "confirm");
    await user.click(screen.getByRole("button", { name: "입력 전송" }));
    expect(sendInput).toHaveBeenCalledWith("confirm\n");

    act(() => handlers.onEvent({
      type: "output",
      sessionId: "session-1",
      stream: "stdout",
      data: "Linux checkout 6.1\n",
    }));
    expect(screen.getByLabelText("Pod 터미널 출력").textContent).toContain("Linux checkout 6.1");

    act(() => handlers.onEvent({
      type: "ended",
      sessionId: "session-1",
      exitCode: 0,
      reason: "completed",
    }));
    expect(screen.getByRole("status").textContent).toBe("종료 코드 0");
    expect(screen.queryByLabelText("표준 입력")).toBeNull();
  });

  it("does not expose a terminal control for a mismatched capability subject", () => {
    const mismatched: ResourceCapabilitiesFrame = {
      ...CAPABILITIES,
      data: {
        ...CAPABILITY_DATA,
        subject: { ...CAPABILITY_DATA.subject, name: "another-pod" },
      },
    };
    renderTerminal(mismatched, { open: vi.fn() });

    expect(screen.queryByRole("button", { name: "Pod 터미널" })).toBeNull();
  });

  it("closes an active terminal when namespace authority is replaced", async () => {
    const user = userEvent.setup();
    const close = vi.fn();
    const port: PodTerminalPort = {
      open: vi.fn(() => ({ sendInput: vi.fn(), close })),
    };
    renderTerminal(CAPABILITIES, port);

    await user.click(screen.getByRole("button", { name: "Pod 터미널" }));
    await user.type(screen.getByLabelText("명령"), "sh");
    await user.click(screen.getByRole("button", { name: "명령 실행" }));
    act(() => publishNamespaceScopeInvalidation({
      clusterId: "cluster-1",
      allowedNamespaces: ["other"],
    }));

    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "터미널 · checkout-api-0" })).toBeNull();
  });

  it("opens the terminal on the completed debug container handoff", () => {
    const debugContainer = "opsia-debug-session-42";
    const facts = DETAIL.resource.facts;
    if (facts.type !== "pod") throw new Error("Pod terminal fixture must contain Pod facts");
    const detail: ResourceDetail = {
      ...DETAIL,
      resource: {
        ...DETAIL.resource,
        facts: {
          ...facts,
          containerNames: ["app", "sidecar", debugContainer],
        },
      },
    };

    renderTerminal(CAPABILITIES, { open: vi.fn() }, debugContainer, detail);

    expect(screen.getByRole("dialog", { name: "터미널 · checkout-api-0" })).toBeTruthy();
    expect(screen.getByLabelText("컨테이너")).toHaveProperty("value", debugContainer);
  });

  it("reuses the terminal for a descriptor-authorized Node debug result", () => {
    const nodeDetail: ResourceDetail = {
      ...DETAIL,
      identity: {
        kind: "Node",
        name: "worker-a",
        namespace: null,
        resourceType: "node",
      },
      resource: {
        ...DETAIL.resource,
        apiVersion: "v1",
        facts: {
          type: "node",
          ready: true,
          podCapacity: 110,
          cpuMillicores: 4000,
          memoryMebibytes: 8192,
          cpuRatio: null,
          memoryRatio: null,
        },
        inventoryKey: "resource-node-worker-a",
        kind: "Node",
        name: "worker-a",
        namespace: null,
        resourceType: "node",
        uid: "node-uid-1",
      },
    };
    const nodeCapabilities: ResourceCapabilitiesFrame = {
      phase: "ready",
      failure: null,
      data: {
        revision: "b".repeat(64),
        subject: {
          resourceId: nodeDetail.resource.inventoryKey,
          snapshotId: "snapshot-node-42",
          clusterId: nodeDetail.clusterId,
          resourceType: "node",
          kind: "Node",
          namespace: null,
          name: "worker-a",
        },
        capabilities: [{
          capabilityId: "maintenance.node-diagnostics",
          label: "Debug node",
          description: "Create one owned debug Pod.",
          execution: "command",
          confirmationRequired: true,
          realtime: true,
          inputSchema: [],
          method: "POST",
          path: "/clusters/cluster-1/nodes/worker-a/debug",
          requestContext: "exact-resource",
          resultIntent: "terminal-session",
        }],
      },
    };
    const port: PodTerminalPort = { open: vi.fn() };

    renderTerminal(
      nodeCapabilities,
      port,
      null,
      nodeDetail,
      {
        namespace: "sandbox",
        pod: "opsia-node-debug-abc123",
        container: "debugger",
      },
    );

    expect(screen.getByRole("dialog", { name: "터미널 · opsia-node-debug-abc123" })).toBeTruthy();
    expect(screen.getByLabelText("컨테이너")).toHaveProperty("value", "debugger");
  });
});

function renderTerminal(
  capabilities: ResourceCapabilitiesFrame,
  port: PodTerminalPort,
  preferredContainer: string | null = null,
  detail: ResourceDetail = DETAIL,
  preferredTarget: { namespace: string; pod: string; container: string } | null = null,
) {
  return render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <ProductSessionProvider session={{
        userId: "operator-1",
        roles: ["cluster_steward"],
        workspaceId: "workspace-main",
      }}>
        <PodTerminalDialog
          capabilities={capabilities}
          detail={detail}
          port={port}
          preferredContainer={preferredContainer}
          preferredTarget={preferredTarget}
        />
      </ProductSessionProvider>
    </I18nProvider>,
  );
}
