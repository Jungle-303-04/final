// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ConnectWizard } from "./devpreview-connect";
import {
  connectApplication,
  listClusters,
  listRepositoryBranches,
  listRepositoryManifestCandidates,
  probeRepository,
  validateRepositoryManifest,
  type ClusterProvidersView,
  type ClusterSummaryView,
} from "./devpreview/connectFeed";

const PROVIDERS: ClusterProvidersView = {
  status: "ready",
  cloudProviders: new Map(),
  sourceProviders: [
    {
      key: "github",
      label: "GitHub",
      available: true,
      unavailableReason: null,
    },
  ],
  defaultCloudProvider: null,
  defaultDeployProvider: null,
  deployProviderFor: () => null,
  providerConfigFieldsFor: () => [],
};

const CONNECTED_CLUSTER: ClusterSummaryView = {
  workspace_id: "workspace-1",
  cluster_id: "cluster-1",
  name: "game-server",
  environment: "development",
  provider: "eks",
  observation_mode: "agent",
  status: "healthy",
  settings: {},
  connection_status: "online",
  connection_stage: "ready",
  last_agent_id: "agent-1",
  last_agent_seen_at: "2026-07-21T00:00:00Z",
  node_count: 3,
  pod_count: 12,
  namespace_count: 4,
  kubernetes_version: "1.33",
  crd_discovery_status: "exact",
  incident_count: 0,
  server_count: 3,
  app_count: 1,
  open_incidents: 0,
  last_seen_at: "2026-07-21T00:00:00Z",
  created_at: "2026-07-21T00:00:00Z",
  updated_at: "2026-07-21T00:00:00Z",
};

vi.mock("./devpreview/connectFeed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./devpreview/connectFeed")>();
  return {
    ...actual,
    useClusterProviders: () => PROVIDERS,
    connectApplication: vi.fn(),
    listClusters: vi.fn(),
    listRepositoryBranches: vi.fn(),
    listRepositoryManifestCandidates: vi.fn(),
    probeRepository: vi.fn(),
    validateRepositoryManifest: vi.fn(),
  };
});

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  vi.mocked(probeRepository).mockResolvedValue({
    repo_ref: "team/game",
    normalized_repo_ref: "team/game",
    valid: true,
    reachable: true,
    default_branch: "release/demo",
    private: false,
    html_url: "https://github.com/team/game",
    warnings: [],
    errors: [],
  });
  vi.mocked(listRepositoryBranches).mockResolvedValue({
    repo_ref: "team/game",
    default_branch: "release/demo",
    branches: [
      { name: "release/demo", protected: true, default: true },
      { name: "main", protected: false, default: false },
    ],
    warnings: [],
  });
  vi.mocked(listRepositoryManifestCandidates).mockResolvedValue({
    repo_ref: "team/game",
    branch: "release/demo",
    candidates: [
      {
        path: "deploy/gamefleet.yaml",
        source_type: "raw-yaml",
        display_name: "GameFleet",
        reason: "Kubernetes manifest",
      },
    ],
    warnings: [],
  });
  vi.mocked(validateRepositoryManifest).mockResolvedValue({
    repo_ref: "team/game",
    branch: "release/demo",
    manifest_path: "deploy/gamefleet.yaml",
    valid: true,
    status: "validated",
    validation_mode: "server",
    resource_count: 1,
    resources: [
      {
        api_version: "games.opsia.io/v1alpha1",
        kind: "GameFleet",
        namespace: "sandbox",
        name: "game",
      },
    ],
    warnings: [],
    errors: [],
  });
  vi.mocked(listClusters).mockResolvedValue({ clusters: [CONNECTED_CLUSTER] });
  vi.mocked(connectApplication).mockResolvedValue(
    {} as Awaited<ReturnType<typeof connectApplication>>,
  );
});

describe("devpreview live repository connection", () => {
  it("renders only server discovery results and validates the selected manifest before connecting", async () => {
    const user = userEvent.setup();
    const onRepositoryComplete = vi.fn();
    render(
      <ConnectWizard
        embedded
        initialView="repo"
        repositoryContext={{ clusterId: "cluster-1", namespace: "yaml-demo" }}
        onRepositoryComplete={onRepositoryComplete}
      />,
    );

    expect(screen.queryByText(/저장소 서버 연동은 미지원/)).toBeNull();
    expect(screen.getByText("서버 지원 소스 제공자(라이브)")).toBeTruthy();

    await user.type(
      screen.getByPlaceholderText("https://github.com/org/repo"),
      "https://github.com/team/game",
    );
    await user.click(await screen.findByRole(
      "button",
      { name: "저장소 확인 · 배포 대상 선택" },
      { timeout: 2_500 },
    ));

    await waitFor(() => {
      expect(probeRepository).toHaveBeenCalledWith("team/game", undefined);
      expect(listRepositoryBranches).toHaveBeenCalledWith("team/game");
      expect(listRepositoryManifestCandidates).toHaveBeenCalledWith(
        "team/game",
        "release/demo",
        expect.any(AbortSignal),
      );
      expect(listClusters).toHaveBeenCalledWith({}, expect.any(AbortSignal));
    });

    expect(screen.getByRole("option", { name: "release/demo · 기본 · 보호" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "main" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "GameFleet · deploy/gamefleet.yaml" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "invented-branch" })).toBeNull();
    expect((screen.getByLabelText("네임스페이스") as HTMLInputElement).value).toBe("yaml-demo");
    expect((screen.getByLabelText("연결된 클러스터") as HTMLSelectElement).value).toBe("cluster-1");

    await user.click(screen.getByRole("button", { name: "서버 검증 후 연결" }));

    await waitFor(() => {
      expect(validateRepositoryManifest).toHaveBeenCalledWith(
        "team/game",
        "release/demo",
        "deploy/gamefleet.yaml",
        "raw-yaml",
      );
      expect(connectApplication).toHaveBeenCalledWith({
        name: "game",
        repository: "team/game",
        branch: "release/demo",
        manifestPath: "deploy/gamefleet.yaml",
        sourceType: "raw-yaml",
        clusterId: "cluster-1",
        namespace: "yaml-demo",
        environment: "development",
      });
    });

    expect(await screen.findByText("저장소 연결 완료")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "GitOps에서 확인" }));
    expect(onRepositoryComplete).toHaveBeenCalledWith("team/game");
  });
});
