// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectWizard } from "./devpreview-connect";
import {
  preflightClusterTarget,
  registerClusterTarget,
  type ClusterProvidersView,
  type TargetPreflightResponse,
} from "./devpreview/connectFeed";

const PROVIDERS: ClusterProvidersView = {
  status: "ready",
  cloudProviders: new Map([
    ["eks", { key: "eks", label: "Amazon EKS", available: true, unavailableReason: null }],
  ]),
  sourceProviders: [],
  defaultCloudProvider: "eks",
  defaultDeployProvider: "manual-manifest",
  deployProviderFor: () => "manual-manifest",
  providerConfigFieldsFor: (cloudProvider) => cloudProvider === "eks" ? [
    {
      key: "region",
      label: "AWS region",
      required: true,
      kind: "text",
      options: [],
      description: "",
    },
    {
      key: "eks_cluster_name",
      label: "EKS cluster name",
      required: true,
      kind: "text",
      options: [],
      description: "",
    },
    {
      key: "context_alias",
      label: "Context alias",
      required: false,
      kind: "text",
      options: [],
      description: "생략하면 등록 cluster_id를 alias로 사용.",
    },
  ] : [],
};

const PREFLIGHT_OK: TargetPreflightResponse = {
  valid: true,
  duplicate_cluster_id: false,
  provider_ready: true,
  agent_install_status: "never_connected",
  connection_status: "never_connected",
  kube_context_allowed: null,
  errors: [],
  warnings: [],
  selected: {},
  last_agent_id: null,
  last_seen_at: null,
  management_access: null,
};

vi.mock("./devpreview/connectFeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./devpreview/connectFeed")>();
  return {
    ...actual,
    useClusterProviders: () => PROVIDERS,
    useClusterConnectionStatus: () => ({
      status: "idle",
      connection: null,
      agentVersion: null,
      connectedAt: null,
    }),
    preflightClusterTarget: vi.fn(),
    registerClusterTarget: vi.fn(),
  };
});

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.mocked(preflightClusterTarget).mockResolvedValue(PREFLIGHT_OK);
  vi.mocked(registerClusterTarget).mockResolvedValue({
    registered: true,
    cluster_id: "game-server",
    status: "pending_install",
    applied: false,
    apply_output: null,
    install_manifest: "",
    agent_token: "ephemeral-token",
    install_command: "aws eks update-kubeconfig && kubectl apply -f -",
    bootstrap_command: "aws eks update-kubeconfig && kubectl apply -f -",
    bootstrap_steps: [],
    connect_timeout_seconds: 1_800,
    connect_expires_at: "2026-07-21T12:00:00Z",
    connection_stage: "token_issued",
    management_access: null,
  });
});

async function reachInstallStep(user: ReturnType<typeof userEvent.setup>) {
  render(<ConnectWizard embedded initialView="cluster" />);
  await user.type(screen.getByRole("textbox", { name: "AWS region" }), "ap-northeast-2");
  await user.type(screen.getByRole("textbox", { name: "EKS cluster name" }), "game-server");
  await user.click(screen.getByRole("button", { name: "등록 단계로" }));
  await user.click(await screen.findByRole("button", { name: "사전검증 실행" }));
}

describe("devpreview AWS cluster wizard", () => {
  it("renders the live catalog EKS fields and requires both mandatory values", async () => {
    const user = userEvent.setup();
    render(<ConnectWizard embedded initialView="cluster" />);

    expect(screen.getByRole("textbox", { name: "AWS region" }).hasAttribute("required")).toBe(true);
    expect(screen.getByRole("textbox", { name: "EKS cluster name" }).hasAttribute("required")).toBe(true);
    expect(screen.getByRole("textbox", { name: "Context alias" }).hasAttribute("required")).toBe(false);
    expect(screen.queryByRole("button", { name: "등록 단계로" })).toBeNull();

    await user.type(screen.getByRole("textbox", { name: "AWS region" }), "ap-northeast-2");
    expect(screen.queryByRole("button", { name: "등록 단계로" })).toBeNull();
    await user.type(screen.getByRole("textbox", { name: "EKS cluster name" }), "game-server");
    expect(screen.getByRole("button", { name: "등록 단계로" })).toBeTruthy();
  });

  it("sends the same cluster selection to preflight and registration", async () => {
    const user = userEvent.setup();
    await reachInstallStep(user);

    expect(await screen.findByText("사전검증 통과")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "에이전트 등록 · 설치 명령 생성" }));

    const expectedFields = {
      cloudProvider: "eks",
      deployProvider: "manual-manifest",
      name: "game-server",
      environment: "prod",
      providerConfig: {
        region: "ap-northeast-2",
        eks_cluster_name: "game-server",
      },
    };
    expect(preflightClusterTarget).toHaveBeenCalledWith(expectedFields, expect.any(AbortSignal));
    expect(registerClusterTarget).toHaveBeenCalledWith(expectedFields, expect.any(AbortSignal));
  });

  it.each([
    ["invalid", { valid: false, provider_ready: false, duplicate_cluster_id: false }],
    ["duplicate", { valid: true, provider_ready: true, duplicate_cluster_id: true }],
  ])("does not expose registration after a %s preflight", async (_case, override) => {
    vi.mocked(preflightClusterTarget).mockResolvedValue({ ...PREFLIGHT_OK, ...override });
    const user = userEvent.setup();
    await reachInstallStep(user);

    expect(await screen.findByText("사전검증: 확인 필요")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "에이전트 등록 · 설치 명령 생성" })).toBeNull();
    expect(registerClusterTarget).not.toHaveBeenCalled();
  });
});
