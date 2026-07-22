// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConnectWizard,
  toInteractiveSafePosixCommand,
  toInteractiveSafePowerShellCommand,
} from "./devpreview-connect";
import { connectCluster, type ClusterProvidersView } from "./devpreview/connectFeed";

const PROVIDERS: ClusterProvidersView = {
  status: "ready",
  cloudProviders: new Map([
    ["eks", { key: "eks", label: "Amazon EKS", available: true, unavailableReason: null }],
  ]),
  sourceProviders: [],
  defaultCloudProvider: "eks",
  defaultDeployProvider: "manual-manifest",
  deployProviderFor: () => "manual-manifest",
  providerConfigFieldsFor: () => [],
};

let providerView: ClusterProvidersView = PROVIDERS;

vi.mock("./devpreview/connectFeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./devpreview/connectFeed")>();
  return {
    ...actual,
    connectCluster: vi.fn(),
    useClusterProviders: () => providerView,
    useClusterConnectionStatus: () => ({
      status: "idle",
      connection: null,
      agentVersion: null,
      connectedAt: null,
    }),
    useClusterActivationReadiness: () => ({
      status: "idle",
      heartbeat: "waiting",
      inventory: "waiting",
      metrics: "waiting",
    }),
  };
});

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  providerView = PROVIDERS;
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.mocked(connectCluster).mockResolvedValue({
    cluster_id: "game-server",
    install_command: "curl https://kyro.example/install/token | kubectl apply -f -",
    powershell_install_command: "$tmp = New-TemporaryFile; Invoke-WebRequest https://kyro.example/install/token -OutFile $tmp; kubectl apply -f $tmp",
    expires_at: "2026-07-21T12:00:00Z",
  });
});

async function reachInstallStep(user: ReturnType<typeof userEvent.setup>) {
  render(<ConnectWizard embedded initialView="cluster" />);
  await user.click(screen.getByRole("button", { name: "등록 단계로" }));
}

describe("devpreview name-only cluster wizard", () => {
  it("asks for the display name only and removes provider configuration fields", () => {
    render(<ConnectWizard embedded initialView="cluster" />);

    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("textbox", { name: "클러스터 표시 이름" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "AWS region" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "EKS cluster name" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Context alias" })).toBeNull();
    expect(screen.getByRole("button", { name: /Amazon EKS/ })).toBeTruthy();
    expect(screen.getByText("플랫폼")).toBeTruthy();
  });

  it("creates the two server-issued install commands from the name-only endpoint", async () => {
    const user = userEvent.setup();
    await reachInstallStep(user);
    await user.click(await screen.findByRole("button", { name: "설치 명령 생성" }));

    expect(screen.queryByLabelText("연결 진행 단계")).toBeNull();

    expect(connectCluster).toHaveBeenCalledWith(
      { name: "game-server", provider: "aws" },
      expect.any(AbortSignal),
    );
    await user.click(await screen.findByRole("tab", { name: "macOS/Linux" }));
    expect(screen.getByText((_, element) => (
      element?.tagName === "CODE"
      && element.textContent === "(curl https://kyro.example/install/token | kubectl apply -f -)"
    ))).toBeTruthy();

    await user.click(screen.getByRole("tab", { name: "Windows PowerShell" }));
    expect(screen.getByText(/Invoke-WebRequest https:\/\/kyro\.example\/install\/token/)).toBeTruthy();
  });

  it("contains an older ownership guard so it cannot close the interactive shell", () => {
    const unsafe = 'existing="game-server-live"; if [ "$existing" != next ]; then exit 1; fi; curl example | kubectl apply -f -';

    expect(toInteractiveSafePosixCommand(unsafe)).toBe(`(${unsafe})`);
    expect(toInteractiveSafePosixCommand(`(${unsafe})`)).toBe(`(${unsafe})`);
  });

  it("allows a first install when the runtime ConfigMap does not exist in PowerShell", () => {
    const legacy = "$existing=(& kubectl -n 'target' get configmap target-runtime-config -o 'jsonpath={.data.TARGET_CLUSTER_ID}' 2>$null);";

    const compatible = toInteractiveSafePowerShellCommand(legacy);
    expect(compatible).toContain(
      "get configmap target-runtime-config --ignore-not-found -o",
    );
    expect(compatible).toContain(
      "get namespace 'target' --ignore-not-found -o name",
    );
  });

  it("keeps provider lookup failures out of the primary registration flow", () => {
    providerView = { ...PROVIDERS, status: "error" };
    render(<ConnectWizard embedded initialView="cluster" />);

    expect(screen.queryByText(/제공자 목록을 불러오지 못했습니다/)).toBeNull();
    expect(screen.getByRole("button", { name: /Amazon EKS/ })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "클러스터 표시 이름" })).toBeTruthy();
  });

  it("surfaces a registration error without fabricating a command", async () => {
    vi.mocked(connectCluster).mockRejectedValue(new Error("cluster name already exists"));
    const user = userEvent.setup();
    await reachInstallStep(user);
    await user.click(await screen.findByRole("button", { name: "설치 명령 생성" }));

    expect(await screen.findByText("cluster name already exists")).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Windows PowerShell" })).toBeNull();
  });
});
