// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { AuthSessionGateProvider } from "../../features/auth/AuthSessionGate";
import { ClusterScopeProvider } from "../../features/cluster-scope/ClusterScopeProvider";
import type { ClusterScopePort } from "../../features/cluster-scope/clusterScopeContract";
import { UnifiedFilterProvider } from "../../features/filters/UnifiedFilterProvider";
import type { SettingsPort } from "../../features/settings/settingsContract";
import { I18nProvider } from "../../shared/i18n";
import { PrometheusIntegrationCard } from "./PrometheusIntegrationCard";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PrometheusIntegrationCard write-only headers", () => {
  it("preserves stored secrets when names are unchanged and values stay empty", async () => {
    const user = userEvent.setup();
    renderCard();

    const save = await screen.findByRole("button", { name: "Prometheus 설정 저장" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    await user.click(save);

    await waitFor(() => expect(settingsPort.updatePrometheusIntegration).toHaveBeenCalledWith({
      clusterId: "cluster-1",
      url: "https://prometheus.example.com",
      headers: undefined,
    }, expect.any(AbortSignal)));
  });

  it("sends an empty header set only after every stored header is removed", async () => {
    const user = userEvent.setup();
    renderCard();

    await screen.findByDisplayValue("Authorization");
    await user.click(screen.getByRole("button", { name: "Authorization 헤더 제거" }));
    await user.click(screen.getByRole("button", { name: "Prometheus 설정 저장" }));

    await waitFor(() => expect(settingsPort.updatePrometheusIntegration).toHaveBeenCalledWith({
      clusterId: "cluster-1",
      url: "https://prometheus.example.com",
      headers: [],
    }, expect.any(AbortSignal)));
  });

  it("requires secret re-entry or explicit removal when the Prometheus origin changes", async () => {
    const user = userEvent.setup();
    renderCard();

    const url = await screen.findByLabelText("Prometheus URL");
    await user.clear(url);
    await user.type(url, "https://other.example.com");

    expect(screen.getByText("URL 출처가 바뀌면 기존 헤더 비밀값을 유지할 수 없습니다.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Prometheus 설정 저장" }) as HTMLButtonElement).disabled)
      .toBe(true);
    expect(settingsPort.updatePrometheusIntegration).not.toHaveBeenCalled();
  });
});

function renderCard() {
  render(
    <I18nProvider navigatorLanguage="ko-KR" storage={null}>
      <MemoryRouter initialEntries={["/settings?clusters=cluster-1#administration"]}>
        <AuthSessionGateProvider reportUnauthorized={() => undefined}>
          <UnifiedFilterProvider>
            <ClusterScopeProvider authorityKey="default:user" port={clusterScopePort}>
              <PrometheusIntegrationCard settingsPort={settingsPort} />
            </ClusterScopeProvider>
          </UnifiedFilterProvider>
        </AuthSessionGateProvider>
      </MemoryRouter>
    </I18nProvider>,
  );
}

const settingsPort: SettingsPort = {
  getAccessProfile: vi.fn(),
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
    headerNames: [],
    state: "pending",
    errorCode: null,
    receipt: null,
  }),
};

const clusterScopePort: ClusterScopePort = {
  listClusterChoices: async () => ({
    completeness: "unknown",
    clusters: [{
      id: "cluster-1",
      workspaceId: "default",
      name: "cluster-1",
      environment: "production",
      provider: "eks",
      connectionStage: null,
      registrationState: "active",
      connectionState: "online",
      lastObservedAt: "2026-07-17T00:00:00.000Z",
      nodeCount: 1,
      podCount: 1,
      incidentCount: 0,
    }],
  }),
};
