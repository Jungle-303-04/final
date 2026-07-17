// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import {
  ClustersPortFailure,
  type ClusterDisconnectPort,
  type ClusterDisconnectReceipt,
} from "../../features/clusters/clustersContract";
import type { HomeClusterChoice } from "../../features/home/homeContract";
import {
  en,
  I18nProvider,
  ko,
  useI18n,
  type I18nController,
} from "../../shared/i18n";
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
  it("updates progress accessibility copy immediately when the locale changes", async () => {
    const user = userEvent.setup();
    let setLocale: I18nController["setLocale"] | null = null;
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <LocaleCapture capture={(nextSetLocale) => { setLocale = nextSetLocale; }} />
        <AuthSessionGateProvider reportUnauthorized={vi.fn()}>
          <ClusterDisconnectDialog
            cluster={CLUSTER}
            onDisconnected={vi.fn()}
            onOpenChange={vi.fn()}
            open
            port={{
              disconnect: vi.fn(() => new Promise<ClusterDisconnectReceipt>(() => undefined)),
              loadDisconnect: vi.fn(),
            }}
          />
        </AuthSessionGateProvider>
      </I18nProvider>,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Enter the cluster name to confirm" }),
      "Production",
    );
    await user.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByRole("list", { name: "Cluster disconnection progress" })).toBeTruthy();

    act(() => { setLocale?.("ko"); });

    expect(screen.getByRole("list", { name: "클러스터 연결 해제 진행" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Cluster disconnection progress" })).toBeNull();
  });

  it("keeps Korean and English placeholders aligned across operations pages", () => {
    for (const prefix of ["home.", "issues.", "alerts.", "clusters."]) {
      const englishKeys = (Object.keys(en) as Array<keyof typeof en>)
        .filter((key) => key.startsWith(prefix));
      const koreanKeys = (Object.keys(ko) as Array<keyof typeof ko>)
        .filter((key) => key.startsWith(prefix));

      expect(koreanKeys.sort()).toEqual(englishKeys.sort());
      for (const key of englishKeys) {
        expect(placeholders(ko[key]), key).toEqual(placeholders(en[key]));
      }
    }
  });

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
    expect(screen.queryByText(/kubectl/)).toBeNull();
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

  it("keeps an offline agent pending without a kubectl or registration-revocation escape hatch", async () => {
    const user = userEvent.setup();
    const onDisconnected = vi.fn();
    renderDialog({
      disconnect: vi.fn().mockResolvedValue(cleanupRequiredReceipt()),
      loadDisconnect: vi.fn().mockResolvedValue({
        status: "failed",
        cleanupCompleted: false,
        failureReason: "agent offline",
      }),
    }, onDisconnected);
    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("에이전트 정리를 기다리는 중")).toBeTruthy();
    expect(onDisconnected).not.toHaveBeenCalled();
    expect(screen.queryByText(/kubectl/)).toBeNull();
    expect(screen.queryByRole("button", { name: /강제 제거/ })).toBeNull();
    expect(screen.getByRole("button", { name: "에이전트 상태 다시 확인" })).toBeTruthy();
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
        failureReason: null,
      };
    });
    renderDialog({
      disconnect: vi.fn().mockResolvedValue(uninstallingReceipt()),
      loadDisconnect,
    });

    await user.type(screen.getByRole("textbox", { name: "확인을 위해 클러스터 이름 입력" }), "Production");
    await user.click(screen.getByRole("button", { name: "연결 해제" }));

    expect(await screen.findByText("에이전트 정리를 기다리는 중")).toBeTruthy();
    expect(screen.getByRole("button", { name: "에이전트 상태 다시 확인" })).toBeTruthy();
    expect(loadDisconnect).toHaveBeenCalledOnce();
  });
});

function uninstallingReceipt() {
  return {
    status: "uninstalling" as const,
    commandId: "cmd-uninstall-1",
    failureReason: null,
  };
}

function cleanupRequiredReceipt() {
  return {
    status: "cleanup-required" as const,
    commandId: "cmd-uninstall-1",
    failureReason: "agent is offline",
  };
}

function LocaleCapture({
  capture,
}: {
  capture: (setLocale: I18nController["setLocale"]) => void;
}) {
  capture(useI18n().setLocale);
  return null;
}

function placeholders(message: string): string[] {
  return Array.from(
    message.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g),
    (match) => match[1]!,
  ).sort();
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
