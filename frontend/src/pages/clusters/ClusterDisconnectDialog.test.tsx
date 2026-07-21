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
      residualResources: ["target:serviceaccount/cluster-agent"],
      failureReason: null,
    });
    const onDisconnected = vi.fn();
    renderDialog({ confirmManualCleanup: vi.fn(), disconnect, loadDisconnect }, onDisconnected);

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
    expect(await screen.findByText("에이전트 실행이 중단되었습니다")).toBeTruthy();
    expect(screen.getByText("남은 권한 정리 명령")).toBeTruthy();
    expect(screen.getByText("kubectl delete deployment/cluster-agent")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "닫기" })).toHaveLength(1);
    expect(onDisconnected).not.toHaveBeenCalled();
  });

  it("keeps a failed request visible and retryable without inventing completion", async () => {
    const user = userEvent.setup();
    const disconnect = vi.fn()
      .mockRejectedValueOnce(new ClustersPortFailure("offline"))
      .mockResolvedValueOnce(uninstallingReceipt());
    const onDisconnected = vi.fn();
    renderDialog({
      confirmManualCleanup: vi.fn(),
      disconnect,
      loadDisconnect: vi.fn().mockResolvedValue({
        status: "completed",
        cleanupCompleted: true,
        cleanupResources: ["target:deployment/cluster-agent"],
        residualResources: ["target:serviceaccount/cluster-agent"],
        failureReason: null,
      }),
    }, onDisconnected);
    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("연결을 해제하지 못했습니다")).toBeTruthy();
    expect(onDisconnected).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "연결 해제" }));
    expect(await screen.findByText("에이전트 실행이 중단되었습니다")).toBeTruthy();
  });

  it("forwards an unauthorized mutation to the session gate", async () => {
    const user = userEvent.setup();
    const reportUnauthorized = vi.fn();
    renderDialog(
      {
        confirmManualCleanup: vi.fn(),
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

  it("keeps an offline agent visible until the operator runs the exact cleanup command", async () => {
    const user = userEvent.setup();
    const confirmManualCleanup = vi.fn().mockResolvedValue({
      ...cleanupRequiredReceipt(),
      status: "disconnected",
      stage: "registration_revoked",
      cleanupVerified: true,
      residualResources: [],
    });
    const onDisconnected = vi.fn();
    renderDialog({
      confirmManualCleanup,
      disconnect: vi.fn().mockResolvedValue(cleanupRequiredReceipt()),
      loadDisconnect: vi.fn(),
    }, onDisconnected);
    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("클러스터에서 정리 명령을 실행하세요")).toBeTruthy();
    expect(onDisconnected).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "정리 완료 확인" }));
    expect(confirmManualCleanup).toHaveBeenCalledWith("cluster-1", expect.any(AbortSignal));
    expect(await screen.findByText("연결이 해제되었습니다")).toBeTruthy();
  });

  it("stops indefinite command polling and offers honest DB-only cleanup", async () => {
    const user = userEvent.setup();
    const startedAt = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(startedAt);
    const loadDisconnect = vi.fn().mockImplementation(async () => {
      now.mockReturnValue(startedAt + 9_000);
      return {
        status: "running" as const,
        cleanupCompleted: false,
        cleanupResources: [],
        residualResources: [],
        failureReason: null,
      };
    });
    renderDialog({
      confirmManualCleanup: vi.fn(),
      disconnect: vi.fn().mockResolvedValue(uninstallingReceipt()),
      loadDisconnect,
    });

    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("클러스터에서 정리 명령을 실행하세요")).toBeTruthy();
    expect(screen.getByRole("button", { name: "정리 완료 확인" })).toBeTruthy();
    expect(loadDisconnect).toHaveBeenCalledOnce();
  });

  it("blocks DB removal when the server supplies no executable cleanup command", async () => {
    const user = userEvent.setup();
    const confirmManualCleanup = vi.fn();
    renderDialog({
      confirmManualCleanup,
      disconnect: vi.fn().mockResolvedValue({
        ...cleanupRequiredReceipt(),
        uninstallCommand: null,
      }),
      loadDisconnect: vi.fn(),
    });

    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("자동 정리 확인이 필요합니다")).toBeTruthy();
    expect(screen.getByText("수동 정리 명령을 받지 못했습니다")).toBeTruthy();
    expect(screen.getByText(/잔여 리소스 0개가 확인되기 전에는/u)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "정리 완료 확인" })).toBeNull();
    expect(confirmManualCleanup).not.toHaveBeenCalled();
  });

  it("does not remove the cluster when manual confirmation still reports residual resources", async () => {
    const user = userEvent.setup();
    const onDisconnected = vi.fn();
    renderDialog({
      confirmManualCleanup: vi.fn().mockResolvedValue({
        ...cleanupRequiredReceipt(),
        status: "disconnected",
        stage: "registration_revoked",
        cleanupVerified: true,
        residualResources: ["target:clusterrole/cluster-agent"],
      }),
      disconnect: vi.fn().mockResolvedValue(cleanupRequiredReceipt()),
      loadDisconnect: vi.fn(),
    }, onDisconnected);

    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));
    await user.click(await screen.findByRole("button", { name: "정리 완료 확인" }));

    expect(await screen.findByText("남은 권한을 정리할 수 있습니다")).toBeTruthy();
    expect(screen.getByText(/target:clusterrole\/cluster-agent/u)).toBeTruthy();
    expect(onDisconnected).not.toHaveBeenCalled();
  });
});

function uninstallingReceipt() {
  return {
    status: "uninstalling" as const,
    stage: "agent_cleanup_queued" as const,
    commandId: "cmd-uninstall-1",
    uninstallCommand: "kubectl delete deployment/cluster-agent",
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
    uninstallCommand: "kubectl delete deployment/cluster-agent",
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
