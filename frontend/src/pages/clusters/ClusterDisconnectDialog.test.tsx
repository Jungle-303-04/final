// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import {
  ClustersPortFailure,
  type ClusterDisconnectPort,
  type ClusterDisconnectReceipt,
} from "../../features/clusters/clustersContract";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import { I18nProvider } from "../../shared/i18n";
import { ClusterDisconnectDialog } from "./ClusterDisconnectDialog";

const CLUSTER: HomeClusterChoice = {
  id: "cluster-1",
  workspaceId: "workspace-main",
  name: "Production",
  environment: "production",
  provider: "eks",
  connectionStage: "ready",
  registrationState: "active",
  connectionState: "online",
  lastObservedAt: "2026-07-14T01:00:00Z",
  nodeCount: 3,
  podCount: 24,
  incidentCount: 0,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ClusterDisconnectDialog", () => {
  it("requires the exact cluster name and shows the real submit and refresh handoff states", async () => {
    const user = userEvent.setup();
    let resolveDisconnect: () => void = () => {
      // Replaced synchronously by the promise executor below.
    };
    const disconnect = vi.fn((_clusterId: string, _signal?: AbortSignal) =>
      new Promise<ClusterDisconnectReceipt>((resolve) => {
        resolveDisconnect = () => resolve(uninstallingReceipt());
      }));
    const loadDisconnect = vi.fn().mockResolvedValue({
      status: "completed",
      cleanupCompleted: true,
      cleanupResources: ["target:deployment/cluster-agent"],
      residualResources: [],
      failureReason: null,
    });
    const onDisconnected = vi.fn();
    renderDialog({ disconnect, loadDisconnect }, onDisconnected);

    const submit = screen.getByRole("button", { name: "연결 해제" });
    expect(submit.hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "production");
    expect(submit.hasAttribute("disabled")).toBe(true);
    await user.clear(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }));
    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(submit);

    expect(disconnect).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
    const pendingStatus = screen.getByRole("status");
    expect(pendingStatus.textContent).toContain("연결 해제를 요청하는 중");
    const spinner = pendingStatus.querySelector<HTMLElement>("[data-slot=spinner]");
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(spinner?.classList.contains("motion-safe:animate-spin")).toBe(true);
    expect(spinner?.classList.contains("motion-reduce:animate-none")).toBe(true);
    expect(screen.getByRole("button", { name: "백그라운드에서 계속" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();

    resolveDisconnect?.();
    expect(await screen.findByText("연결이 해제되었습니다")).toBeTruthy();
    expect(screen.queryByText("남은 권한 정리 명령")).toBeNull();
    expect(screen.getAllByRole("button", { name: "닫기" })).toHaveLength(1);
    expect(onDisconnected).toHaveBeenCalledWith("cluster-1");
  });

  it("keeps a failed request visible and retryable without inventing completion", async () => {
    const user = userEvent.setup();
    const disconnect = vi.fn()
      .mockRejectedValueOnce(new ClustersPortFailure("offline"))
      .mockResolvedValueOnce(uninstallingReceipt());
    const onDisconnected = vi.fn();
    renderDialog({
      disconnect,
      loadDisconnect: vi.fn().mockResolvedValue({
        status: "completed",
        cleanupCompleted: true,
        cleanupResources: ["target:deployment/cluster-agent"],
        residualResources: [],
        failureReason: null,
      }),
    }, onDisconnected);
    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("연결을 해제하지 못했습니다")).toBeTruthy();
    expect(onDisconnected).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "연결 해제" }));
    expect(await screen.findByText("연결이 해제되었습니다")).toBeTruthy();
  });

  it("forwards an unauthorized mutation to the session gate", async () => {
    const user = userEvent.setup();
    const reportUnauthorized = vi.fn();
    renderDialog(
      {
        disconnect: vi.fn().mockRejectedValue(new ClustersPortFailure("unauthorized")),
        loadDisconnect: vi.fn(),
      },
      vi.fn(),
      reportUnauthorized,
    );
    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("연결을 해제하지 못했습니다")).toBeTruthy();
    expect(reportUnauthorized).toHaveBeenCalledOnce();
  });

  it("keeps an offline agent pending without exposing a browser cleanup escape hatch", async () => {
    const user = userEvent.setup();
    const onDisconnected = vi.fn();
    renderDialog({
      disconnect: vi.fn().mockResolvedValue(cleanupRequiredReceipt()),
      loadDisconnect: vi.fn(),
    }, onDisconnected);
    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("에이전트 정리 응답 대기 중")).toBeTruthy();
    expect(onDisconnected).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "DB 등록 강제 제거" })).toBeNull();
    expect(screen.queryByText(/kubectl/)).toBeNull();
  });

  it("stops indefinite command polling without a DB-only cleanup escape hatch", async () => {
    const user = userEvent.setup();
    const startedAt = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAt);
    const loadDisconnect = vi.fn().mockImplementation(async () => {
      now.mockReturnValue(startedAt + 9_000);
      return {
        status: "running" as const,
        cleanupCompleted: false,
        cleanupResources: [],
        residualResources: ["target:serviceaccount/cluster-agent"],
        failureReason: null,
      };
    });
    renderDialog({
      disconnect: vi.fn().mockResolvedValue(uninstallingReceipt()),
      loadDisconnect,
    });

    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("에이전트 정리 응답 대기 중")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "DB 등록 강제 제거" })).toBeNull();
    expect(loadDisconnect).toHaveBeenCalledOnce();
  });
});

function uninstallingReceipt() {
  return {
    status: "uninstalling" as const,
    stage: "agent_cleanup_queued" as const,
    commandId: "cmd-uninstall-1",
    uninstallCommand: "cluster.agent.uninstall",
    cleanupVerified: false,
    cleanupResources: ["target:deployment/cluster-agent"],
    residualResources: ["target:serviceaccount/cluster-agent"],
    failureReason: null,
  };
}

function cleanupRequiredReceipt() {
  return {
    status: "cleanup-required" as const,
    stage: "agent_cleanup_pending" as const,
    commandId: null,
    uninstallCommand: "cluster.agent.uninstall",
    cleanupVerified: false,
    cleanupResources: ["target:deployment/cluster-agent"],
    residualResources: ["target:serviceaccount/cluster-agent"],
    failureReason: "agent is offline",
  };
}

function renderDialog(
  port: ClusterDisconnectPort,
  onDisconnected = vi.fn(),
  reportUnauthorized = vi.fn(),
) {
  return render(
    <I18nProvider navigatorLanguage="ko" storage={null}>
      <AuthSessionGateProvider reportUnauthorized={reportUnauthorized}>
        <ClusterDisconnectDialog
          cluster={CLUSTER}
          onDisconnected={onDisconnected}
          onOpenChange={vi.fn()}
          open
          port={port}
        />
      </AuthSessionGateProvider>
    </I18nProvider>,
  );
}
