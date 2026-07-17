// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { ProductSessionProvider } from "../../features/auth/ProductSessionContext";
import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type { SettingsPort } from "../../features/settings/settingsContract";
import type { ShellStatePort } from "../../features/shell-state/shellStateContract";
import { I18nProvider } from "../../shared/i18n";
import { SettingsPage } from "./SettingsPage";
import {
  OperationStatusStoreProvider,
  type OperationStatusStore,
} from "../../features/operations/OperationStatusStore";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("shows verified session and cluster data before navigating to unavailable administration contracts", async () => {
    const user = userEvent.setup();
    renderSettings("/settings");

    expect(screen.getByRole("heading", { name: "설정", level: 2 })).toBeTruthy();
    expect(screen.getByText("default")).toBeTruthy();
    expect(screen.getByText("Woo Nyong")).toBeTruthy();
    expect(screen.getByText("woonyong.kr@gmail.com")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("표시 가능한 클러스터 2개")).toBeTruthy());

    await user.click(screen.getByRole("tab", { name: "관리" }));
    expect(screen.getAllByText("준비 중")).toHaveLength(5);
    expect(screen.getByText("호스트 설정")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Prometheus" })).toBeTruthy();
  });

  it("renders product decisions beside observed cluster-agent execution access", async () => {
    renderSettings("/settings?clusters=cluster-1#profile");

    expect(await screen.findByText("현재 권한 주체")).toBeTruthy();
    expect(screen.getByText("cluster-1")).toBeTruthy();
    expect(screen.getByText("cluster.read")).toBeTruthy();
    expect(screen.getByText("pod.exec")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "네임스페이스 범위" }).textContent)
      .toContain("shop");
    expect(screen.getByText("Kubernetes 실행 권한")).toBeTruthy();
    expect(screen.getByText("cluster-agent")).toBeTruthy();
    expect(screen.getByText("get, list")).toBeTruthy();
    expect(screen.getByText("Deployment")).toBeTruthy();
    expect(settingsPort.getAccessProfile).toHaveBeenCalledWith(
      "cluster-1",
      "shop",
      expect.any(AbortSignal),
    );
    expect(shellStatePort.getNamespaceScope).toHaveBeenCalledWith(
      "cluster-1",
      expect.any(AbortSignal),
    );
  });

  it("reuses global theme and locale controllers for automatically persisted preferences", async () => {
    const user = userEvent.setup();
    renderSettings("/settings#preferences");

    await user.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { name: "Settings", level: 2 })).toBeTruthy();
    expect(screen.getByText("Changes are saved automatically with optimistic revision checks."))
      .toBeTruthy();
  });

  it("updates dynamic Prometheus headers, clears their values, and starts shared streaming feedback", async () => {
    const user = userEvent.setup();
    renderSettings("/settings?clusters=cluster-1#administration", operationStatusStore);

    expect(await screen.findByDisplayValue("https://prometheus.example.com")).toBeTruthy();
    expect(screen.getByDisplayValue("Authorization")).toBeTruthy();
    const initialSecret = screen.getByLabelText("Authorization 값") as HTMLInputElement;
    expect(initialSecret.type).toBe("password");
    expect(initialSecret.value).toBe("");
    expect(screen.queryByText("Bearer server-secret")).toBeNull();

    await user.type(initialSecret, "Bearer replacement");
    await user.click(screen.getByRole("button", { name: "헤더 추가" }));
    const nameInputs = screen.getAllByLabelText("헤더 이름");
    await user.type(nameInputs[1], "X-Scope-OrgID");
    await user.type(screen.getByLabelText("X-Scope-OrgID 값"), "tenant-a");
    await user.click(screen.getByRole("button", { name: "Prometheus 설정 저장" }));

    await waitFor(() => expect(settingsPort.updatePrometheusIntegration).toHaveBeenCalledWith({
      clusterId: "cluster-1",
      url: "https://prometheus.example.com",
      headers: [
        { name: "Authorization", value: "Bearer replacement" },
        { name: "X-Scope-OrgID", value: "tenant-a" },
      ],
    }, expect.any(AbortSignal)));
    expect(operationStatusStore.start).toHaveBeenCalledWith("operation-b");
    expect(screen.queryByDisplayValue("Bearer replacement")).toBeNull();
    expect(screen.queryByDisplayValue("tenant-a")).toBeNull();
    expect(screen.getByText(/correlation-b/)).toBeTruthy();
  });

  it("keeps empty input local and renders update failures without discarding the form", async () => {
    const user = userEvent.setup();
    vi.mocked(settingsPort.getPrometheusIntegration).mockResolvedValueOnce({
      clusterId: "cluster-1",
      configurationRevision: null,
      operationId: null,
      url: null,
      headerNames: [],
      state: "unconfigured",
      errorCode: null,
      receipt: null,
    });
    vi.mocked(settingsPort.updatePrometheusIntegration).mockRejectedValueOnce(new Error("offline"));
    renderSettings("/settings?clusters=cluster-1#administration", operationStatusStore);

    const save = await screen.findByRole("button", { name: "Prometheus 설정 저장" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(settingsPort.updatePrometheusIntegration).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Prometheus URL"), "https://prometheus.example.com");
    expect(save.disabled).toBe(false);
    await user.click(save);
    expect(await screen.findByText("Prometheus 설정을 저장하지 못했습니다.")).toBeTruthy();
    expect(screen.getByDisplayValue("https://prometheus.example.com")).toBeTruthy();
  });

});

const settingsPort: SettingsPort = {
  getAccessProfile: vi.fn().mockResolvedValue({
    workspaceId: "default",
    userId: "user-bf4f9d6a-acf5-5612-bcd9-00d938e4a063",
    clusterId: "cluster-1",
    roles: ["service_admin"],
    authority: "opsia_rbac",
    permissions: [
      { permission: "cluster.read", category: "cluster", allowed: true },
      { permission: "pod.exec", category: "pod", allowed: false },
    ],
    kubernetesRules: {
      status: "observed",
      authority: "cluster_agent_service_account",
      namespace: "shop",
      observedAt: "2026-07-17T00:00:00Z",
      subject: { kind: "ServiceAccount", namespace: "agent-system", name: "cluster-agent" },
      resourceRules: [{
        verbs: ["get", "list"],
        apiGroups: [""],
        resources: ["pods"],
        resourceNames: [],
        nonResourceUrls: [],
      }],
      nonResourceRules: [],
      truncated: false,
    },
    restrictedResourceTypes: {
      status: "observed",
      authority: "cluster_agent_service_account",
      namespace: "shop",
      observedAt: "2026-07-17T00:00:00Z",
      completeness: "exact",
      reasonCodes: [],
      items: [{
        apiGroup: "apps",
        version: "v1",
        resource: "deployments",
        kind: "Deployment",
        namespaced: true,
        reasonCode: "list_permission_not_observed",
      }],
    },
    revision: "a".repeat(64),
  }),
  getPrometheusIntegration: vi.fn().mockResolvedValue({
    clusterId: "cluster-1",
    configurationRevision: "revision-a",
    operationId: "operation-a",
    url: "https://prometheus.example.com",
    headerNames: ["Authorization"],
    state: "connected",
    errorCode: null,
    receipt: null,
  }),
  updatePrometheusIntegration: vi.fn().mockResolvedValue({
    clusterId: "cluster-1",
    configurationRevision: "revision-b",
    operationId: "operation-b",
    url: "https://prometheus.example.com",
    headerNames: ["Authorization", "X-Scope-OrgID"],
    state: "pending",
    errorCode: null,
    receipt: {
      accepted: true,
      commandId: "operation-b",
      eventId: "event-b",
      auditEventId: "event-b",
      correlationId: "correlation-b",
      status: "queued",
    },
  }),
};

const shellStatePort: ShellStatePort = {
  getNamespaceScope: vi.fn().mockResolvedValue({
    clusterId: "cluster-1",
    activeNamespaces: [],
    accessibleNamespaces: ["shop", "team-a"],
    accessibleNamespaceCount: 2,
    completeness: "exact",
    reasonCodes: [],
    revision: 0,
  }),
  updateNamespaceScope: vi.fn(),
  getUiPreferences: vi.fn(),
  updateUiPreferences: vi.fn(),
};

function renderSettings(initialEntry: string, store?: OperationStatusStore) {
  const page = (
    <SettingsPage settingsPort={settingsPort} shellStatePort={shellStatePort} />
  );
  render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <MemoryRouter initialEntries={[initialEntry]}>
          <AuthSessionGateProvider reportUnauthorized={() => undefined}>
            <UnifiedFilterProvider>
              <ProductSessionProvider session={{
                authEnabled: true,
                authMode: "password",
                displayName: "Woo Nyong",
                email: "woonyong.kr@gmail.com",
                groups: ["group-platform"],
                logout: {
                  action: "end_session",
                  supported: true,
                  reauthenticationExpected: false,
                },
                roles: ["service_admin"],
                userId: "user-bf4f9d6a-acf5-5612-bcd9-00d938e4a063",
                workspaceId: "default",
              }}>
                <ClusterScopeProvider authorityKey="default:user" port={clusterScopePort}>
                  {store ? <OperationStatusStoreProvider store={store}>{page}</OperationStatusStoreProvider> : page}
                </ClusterScopeProvider>
              </ProductSessionProvider>
            </UnifiedFilterProvider>
          </AuthSessionGateProvider>
        </MemoryRouter>
      </ThemeProvider>
    </I18nProvider>,
  );
}

const operationStatusStore: OperationStatusStore = {
  dispose: vi.fn(),
  getSnapshot: vi.fn(() => operationSnapshot),
  getSnapshots: vi.fn(() => []),
  reobserve: vi.fn(),
  start: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
  subscribeAll: vi.fn(() => () => undefined),
};

const operationSnapshot = {
  commandId: "operation-b",
  event: null,
  failure: null,
  retry: null,
  sequence: null,
  status: "connecting" as const,
  updatedAt: 0,
};

const clusterScopePort: ClusterScopePort = {
  listClusterChoices: async () => ({
    completeness: "unknown",
    clusters: [cluster("cluster-1"), cluster("cluster-2")],
  }),
};

function cluster(id: string) {
  return {
    id,
    workspaceId: "default",
    name: id,
    environment: "production",
    provider: "eks" as const,
    connectionStage: null,
    registrationState: "active" as const,
    connectionState: "online" as const,
    lastObservedAt: "2026-07-14T00:00:00.000Z",
    nodeCount: 1,
    podCount: 1,
    incidentCount: 0,
  };
}
