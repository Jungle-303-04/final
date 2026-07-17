// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  HelmPortFailure,
  type HelmFailureCode,
  type HelmPort,
  type HelmRelease,
} from "../../features/helm/helmContract";
import { HelmPage } from "./HelmPage";

const scopeState = vi.hoisted(() => ({ value: null as unknown }));
const operationState = vi.hoisted(() => ({ value: null as unknown }));

vi.mock("../../features/cluster-scope/ClusterScopeProvider", () => ({
  useClusterScope: () => scopeState.value,
}));
vi.mock("../../features/operations/OperationStatusStore", () => ({
  useOptionalOperationStatusStore: () => operationState.value,
  useOptionalOperationStatus: (commandId: string) => (
    commandId ? (operationState.value as { getSnapshot?: (id: string) => unknown } | null)
      ?.getSnapshot?.(commandId) ?? null : null
  ),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  scopeState.value = {
    selection: { kind: "selected", cluster: { id: "cluster-a" } },
  };
  operationState.value = null;
});

describe("HelmPage", () => {
  it("renders only observed release metadata and keeps missing chart data explicit", async () => {
    const port = helmPort();
    renderRoute("/helm", port);

    expect(await screen.findByRole("heading", { name: "Helm releases" })).toBeTruthy();
    expect(screen.getAllByText("storefront").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Not observed").length).toBeGreaterThan(0);
    expect(screen.queryByText("must-not-leak")).toBeNull();
    await waitFor(() => expect(port.listReleases).toHaveBeenCalledWith(
      { clusterIds: ["cluster-a"] },
      expect.any(AbortSignal),
    ));
  });

  it("searches ArtifactHub metadata and loads exact chart details without an install action", async () => {
    const port = helmPort();
    const chart = {
      packageId: "pkg-redis",
      name: "redis",
      version: "22.0.0",
      appVersion: "8.0",
      description: "Redis chart",
      stars: 12,
      deprecated: false,
      signed: true,
      repository: {
        name: "bitnami",
        url: "https://charts.bitnami.com/bitnami",
        official: true,
        verifiedPublisher: true,
      },
    };
    port.searchArtifactHub.mockResolvedValue({
      items: [chart], total: 1, offset: 0, limit: 20, hasMore: false,
      observedAt: "2026-07-17T08:00:00Z",
    });
    port.getArtifactHubChart.mockResolvedValue({
      chart,
      readme: "# Redis",
      availableVersions: [{ version: "22.0.0", appVersion: "8.0" }],
      versionsTruncated: false,
      observedAt: "2026-07-17T08:00:00Z",
    });
    renderRoute("/helm", port);

    fireEvent.change(await screen.findByRole("textbox", { name: "Search ArtifactHub charts" }), {
      target: { value: "redis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(await screen.findByRole("button", { name: "bitnami/redis 22.0.0" }));

    expect(await screen.findByRole("heading", { name: "bitnami/redis" })).toBeTruthy();
    expect(port.getArtifactHubChart).toHaveBeenCalledWith({
      repository: "bitnami",
      chart: "redis",
      version: "22.0.0",
    }, expect.any(AbortSignal));
    expect(screen.queryByRole("button", { name: /install bitnami\/redis/i })).toBeNull();
  });

  it("searches registered sources and keeps exact chart detail identity in the URL", async () => {
    const port = helmPort();
    const source = {
      id: "source-repository",
      provider: "repository" as const,
      name: "Stable",
      reference: "https://charts.example.test/stable",
      status: "active" as const,
      actions: [] as const,
      credentialsConfigured: false,
      observedAt: "2026-07-17T08:00:00Z",
    };
    const chart = {
      source,
      name: "redis",
      version: "2.0.0",
      appVersion: "8.0",
      description: "Redis chart",
      deprecated: false,
    };
    port.listChartSources.mockResolvedValue({
      items: [source], limit: 50, hasMore: false, nextCursor: null,
    });
    port.searchCharts.mockResolvedValue({
      availability: "available",
      items: [chart],
      total: 1,
      limit: 20,
      query: "redis",
      sourceId: "source-repository",
      provider: "repository",
      allVersions: false,
      observedAt: "2026-07-17T08:00:00Z",
      truncated: false,
      reasonCodes: [],
    });
    port.getChartDetail.mockResolvedValue({
      availability: "available",
      chart,
      versions: [{ version: "2.0.0", appVersion: "8.0", deprecated: false }],
      valuesSchema: {
        availability: "unavailable",
        schema: null,
        reasonCode: "helm_chart_values_schema_unavailable",
      },
      install: {
        availability: "unavailable",
        target: null,
        reasonCode: "helm_chart_install_recipe_unavailable",
      },
      observedAt: "2026-07-17T08:00:00Z",
      truncated: false,
      reasonCodes: [],
    });
    renderRoute("/helm", port);

    fireEvent.change(await screen.findByRole("textbox", { name: "Search registered charts" }), {
      target: { value: "redis" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Chart source" }), {
      target: { value: "source-repository" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search catalog" }));
    fireEvent.click(await screen.findByRole("button", { name: "Stable/redis 2.0.0" }));

    await waitFor(() => expect(port.getChartDetail).toHaveBeenCalledWith({
      sourceId: "source-repository",
      chart: "redis",
      version: "2.0.0",
    }, expect.any(AbortSignal)));
    expect(await screen.findByRole("heading", { name: "Stable/redis" })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toContain(
      "helmChartSource=source-repository",
    );
    expect(screen.getByTestId("location").textContent).toContain("helmChart=redis");
    expect(screen.getByText("Values schema is not available for this chart source.")).toBeTruthy();
  });

  it("installs only a server-owned recipe and hands its command to the operation stream", async () => {
    const port = helmPort();
    port.listInstallTargets.mockResolvedValue({
      namespace: "sandbox",
      targets: [{
        itemId: "catalog-redis",
        name: "Redis",
        version: "1.0.0",
        chartVersion: "23.1.1",
        inputs: [],
      }],
    });
    const store = {
      start: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => null),
    };
    operationState.value = store;
    renderRoute("/helm", port);

    fireEvent.click(await screen.findByRole("button", { name: "Install release" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "Release name" }), {
      target: { value: "redis" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm install" }));

    await waitFor(() => expect(port.installRelease).toHaveBeenCalledWith(
      expect.objectContaining({
        clusterId: "cluster-a",
        namespace: "sandbox",
        releaseName: "redis",
        catalogItemId: "catalog-redis",
        confirmation: true,
      }),
      expect.any(AbortSignal),
    ));
    expect(store.start).toHaveBeenCalledWith("cmd-install");
  });

  it("decorates the release list only with server-resolved batch upgrade evidence", async () => {
    const port = helmPort();
    port.checkReleaseUpgrades.mockResolvedValue({
      releases: {
        "cluster-a/storefront/storefront": availableUpgradeInfo(),
      },
      coverage: { availability: "available", observedAt: null, reasonCodes: [] },
      truncated: false,
      reasonCodes: [],
      refreshAfterSeconds: 30,
    });
    renderRoute("/helm", port);

    expect(await screen.findByText("2.0.0 available")).toBeTruthy();
    await waitFor(() => expect(port.checkReleaseUpgrades).toHaveBeenCalledWith(
      { clusterIds: ["cluster-a"] },
      expect.any(AbortSignal),
    ));
  });

  it("shows the exact source and newest-first versions in release detail", async () => {
    const port = helmPort();
    port.getRelease.mockResolvedValue({
      ...detail(),
      release: {
        ...release(),
        chart: "storefront",
        chartVersion: "1.2.3",
        chartReasonCodes: [],
      },
    });
    port.getReleaseUpgradeInfo.mockResolvedValue(availableUpgradeInfo());
    port.listReleaseVersions.mockResolvedValue({
      availability: "available",
      chartName: "storefront",
      currentVersion: "1.2.3",
      source: availableUpgradeInfo().source,
      versions: [
        { version: "2.0.0", appVersion: "4.0.0", deprecated: false },
        { version: "1.2.3", appVersion: "3.0.0", deprecated: false },
      ],
      observedAt: "2026-07-17T00:01:00Z",
      truncated: false,
      reasonCodes: [],
      refreshAfterSeconds: 10,
    });
    renderRoute("/helm/detail/cluster-a/storefront/storefront", port);

    expect(await screen.findByText("1.2.3 → 2.0.0")).toBeTruthy();
    expect(screen.getByText("Stable · repository")).toBeTruthy();
    expect(screen.getByText("2.0.0, 1.2.3")).toBeTruthy();
  });

  it("preserves a route identity when a row opens its read-only detail", async () => {
    const port = helmPort();
    renderRoute("/helm", port);

    fireEvent.click(await screen.findByRole("button", { name: "Open storefront" }));

    expect((await screen.findByTestId("location")).textContent).toBe(
      "/helm/detail/cluster-a/storefront/storefront",
    );
  });

  it("moves focus to the release search when the list shortcut is used", async () => {
    const port = helmPort();
    renderRoute("/helm", port);

    const search = await screen.findByRole("textbox", { name: "Filter releases" });
    fireEvent.keyDown(window, { key: "/" });

    await waitFor(() => expect(document.activeElement).toBe(search));
  });

  it("does not steal the list search shortcut from editable, modal, or already-handled owners", async () => {
    const port = helmPort();
    renderRoute("/helm", port);

    const search = await screen.findByRole("textbox", { name: "Filter releases" });
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    document.body.append(editor);
    fireEvent.keyDown(editor, { key: "/" });

    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("role", "dialog");
    document.body.append(modal);
    fireEvent.keyDown(modal, { key: "/" });

    const handled = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "/" });
    handled.preventDefault();
    window.dispatchEvent(handled);

    expect(document.activeElement).not.toBe(search);
    editor.remove();
    modal.remove();
  });

  it("renders safe availability copy without exposing internal provider or executor codes", async () => {
    const port = helmPort();
    renderRoute("/helm/detail/cluster-a/storefront/storefront", port);

    expect(await screen.findByRole("heading", { name: "storefront" })).toBeTruthy();
    expect(screen.getByText("A safe manifest source is not available for this release.")).toBeTruthy();
    expect(screen.getByText("Helm commands are not available for this release.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Owned resources" })).toBeTruthy();
    expect(screen.getByText("Deployment")).toBeTruthy();
    expect(screen.getAllByText("healthy").length).toBeGreaterThan(0);
    for (const reasonCode of [
      "helm_manifest_provider_not_integrated",
      "helm_values_provider_not_integrated",
      "agent_helm_executor_not_integrated",
    ]) expect(screen.queryByText(reasonCode)).toBeNull();
    expect(screen.queryByRole("button", { name: /upgrade|rollback|uninstall/i })).toBeNull();
    await waitFor(() => expect(port.getRelease).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
    }, expect.any(AbortSignal)));
  });

  it("confirms the server-advertised upgrade once, starts its stream, and refreshes immediately", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const port = helmPort();
    const upgradeDetail = detail();
    port.getRelease.mockResolvedValue({
      ...upgradeDetail,
      release: {
        ...upgradeDetail.release,
        storageNamespace: "sandbox",
        scope: { ...upgradeDetail.release.scope, namespaces: ["sandbox"] },
        storage: { ...upgradeDetail.release.storage, namespace: "sandbox" },
        chart: "redis",
        chartVersion: "22.0.0",
        chartReasonCodes: [],
      },
      commands: availableUpgradeCommands(),
    });
    port.listReleaseVersions.mockResolvedValue(redisUpgradeVersions());
    const store = {
      start: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => null),
    };
    operationState.value = store;
    renderRoute("/helm/detail/cluster-a/sandbox/storefront", port);

    const upgradeButton = await screen.findByRole("button", { name: "Upgrade" });
    expect(screen.getByRole("button", { name: "Rollback" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Uninstall" })).toBeTruthy();
    fireEvent.click(upgradeButton);
    expect(screen.getByRole("dialog", { name: "Confirm Helm upgrade" })).toBeTruthy();
    expect(screen.getByText(/cluster-a · sandbox · storefront · revision 3/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("master.persistence.storageClass"), {
      target: { value: "gp3" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm upgrade" }));

    await waitFor(() => expect(port.upgradeRelease).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      namespace: "sandbox",
      releaseName: "storefront",
      expectedRevision: 3,
      catalogItemId: "catalog-redis",
      catalogVersion: "1.0.0",
      values: { "master.persistence.storageClass": "gp3" },
      confirmation: true,
      reason: "Upgrade storefront to Redis 1.0.0",
    }, expect.any(AbortSignal)));
    expect(store.start).toHaveBeenCalledWith("cmd-helm-upgrade-1");
    await waitFor(() => expect(port.getRelease.mock.calls.length).toBeGreaterThanOrEqual(2));
    await vi.advanceTimersByTimeAsync(1_200);
    await waitFor(() => expect(port.getRelease.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("renders one strict redacted values preview and invalidates it when an input changes", async () => {
    const port = helmPort();
    const upgradeDetail = detail();
    port.getRelease.mockResolvedValue({
      ...upgradeDetail,
      release: {
        ...upgradeDetail.release,
        storageNamespace: "sandbox",
        scope: { ...upgradeDetail.release.scope, namespaces: ["sandbox"] },
        storage: { ...upgradeDetail.release.storage, namespace: "sandbox" },
        chart: "redis",
        chartVersion: "22.0.0",
        chartReasonCodes: [],
      },
      commands: availableUpgradeCommands(),
    });
    port.listReleaseVersions.mockResolvedValue(redisUpgradeVersions());
    port.previewReleaseValues.mockResolvedValue({
      accepted: true,
      eventId: "evt-preview-1",
      auditEventId: "evt-preview-1",
      correlationId: "corr-preview-1",
      commandId: "cmd-preview-1",
      status: "queued",
    });
    const store = {
      start: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => completedPreviewSnapshot()),
    };
    operationState.value = store;
    renderRoute("/helm/detail/cluster-a/sandbox/storefront", port);

    fireEvent.click(await screen.findByRole("button", { name: "Upgrade" }));
    const input = screen.getByLabelText("master.persistence.storageClass");
    fireEvent.change(input, { target: { value: "gp3" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));

    await waitFor(() => expect(port.previewReleaseValues).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      namespace: "sandbox",
      releaseName: "storefront",
      expectedRevision: 3,
      catalogItemId: "catalog-redis",
      catalogVersion: "1.0.0",
      values: { "master.persistence.storageClass": "gp3" },
    }, expect.any(AbortSignal)));
    expect(store.start).toHaveBeenCalledWith("cmd-preview-1");
    expect(await screen.findByRole("heading", { name: "Rendered resource changes" })).toBeTruthy();
    expect(screen.getByText("Service/storefront")).toBeTruthy();
    expect(screen.getByText("spec.replicas")).toBeTruthy();

    fireEvent.change(input, { target: { value: "standard" } });
    expect(screen.queryByRole("heading", { name: "Rendered resource changes" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Confirm upgrade" }));
    await waitFor(() => expect(port.upgradeRelease).toHaveBeenCalled());
  });

  it("does not expose an upgrade when the authorized source lacks the server target", async () => {
    const port = helmPort();
    port.getRelease.mockResolvedValue({
      ...detail(),
      release: {
        ...release(),
        chart: "redis",
        chartVersion: "22.0.0",
        chartReasonCodes: [],
      },
      commands: availableUpgradeCommands(),
    });
    port.listReleaseVersions.mockResolvedValue({
      ...redisUpgradeVersions(),
      versions: [{ version: "22.0.0", appVersion: null, deprecated: false }],
    });

    renderRoute("/helm/detail/cluster-a/sandbox/storefront", port);

    expect(await screen.findByRole("heading", { name: "storefront" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Upgrade" })).toBeNull();
  });

  it("maps known and unknown coverage reasons to safe copy", async () => {
    const port = helmPort();
    port.listReleases.mockResolvedValue({
      releases: [release()],
      refreshAfterSeconds: 30,
      postMutationRefreshAfterSeconds: 1.2,
      coverage: {
        availability: "unavailable",
        observedAt: "2026-07-16T09:00:00Z",
        reasonCodes: [
          "authorization_scope_empty",
          "inventory_snapshot_unavailable:cluster-a",
          "source_resources_incomplete",
          "helm_storage_labels_incomplete",
          "unknown_internal_helm_reason",
        ],
      },
    });
    renderRoute("/helm", port);

    expect(await screen.findByText("Release discovery is unavailable for this scope.")).toBeTruthy();
    expect(screen.getByText("The current authorization scope does not permit release discovery.")).toBeTruthy();
    expect(screen.getByText("A current inventory observation is not available for this scope.")).toBeTruthy();
    expect(screen.getByText("Some inventory observations are incomplete for this scope.")).toBeTruthy();
    expect(screen.getByText("The source did not provide complete release discovery evidence.")).toBeTruthy();
    for (const reasonCode of [
      "authorization_scope_empty",
      "inventory_snapshot_unavailable:cluster-a",
      "source_resources_incomplete",
      "helm_storage_labels_incomplete",
      "unknown_internal_helm_reason",
    ]) expect(screen.queryByText(reasonCode)).toBeNull();
  });

  it("keeps forbidden Helm reads safe without rendering the raw failure code twice", async () => {
    const port = helmPort();
    port.listReleases.mockRejectedValue(new HelmPortFailure("forbidden"));
    renderRoute("/helm", port);

    expect(await screen.findByText("You cannot access this scope")).toBeTruthy();
    expect(screen.getByText("Your account is not authorized to read Helm release metadata for this scope.")).toBeTruthy();
    // ProductStateScreen supplies the single standardized error code. Helm must not echo it as detail.
    expect(screen.getAllByText("forbidden", { exact: true })).toHaveLength(1);
  });

  it("uses safe offline copy without exposing the raw failure detail", async () => {
    const port = helmPort();
    port.listReleases.mockRejectedValue(new HelmPortFailure("offline"));
    renderRoute("/helm", port);

    expect(await screen.findByText("Helm release data cannot be reached right now. Check the connection and try again.")).toBeTruthy();
    expect(screen.queryByText("offline", { exact: true })).toBeNull();
  });

  it("uses generic safe copy when a runtime failure code is unknown", async () => {
    const port = helmPort();
    const unknownCode = "unexpected_helm_failure";
    port.listReleases.mockRejectedValue(new HelmPortFailure(unknownCode as HelmFailureCode));
    renderRoute("/helm", port);

    expect(await screen.findByText("Helm release data could not be loaded. Try again shortly.")).toBeTruthy();
    expect(screen.queryByText(unknownCode, { exact: true })).toBeNull();
  });

  it("uses generic safe copy for an unknown unavailable feature reason", async () => {
    const port = helmPort();
    port.getRelease.mockResolvedValue({
      ...detail(),
      manifest: unavailable("unknown_internal_helm_feature_reason"),
    });
    renderRoute("/helm/detail/cluster-a/storefront/storefront", port);

    expect(await screen.findByText("This release capability is not available from the current source.")).toBeTruthy();
    expect(screen.queryByText("unknown_internal_helm_feature_reason")).toBeNull();
  });

  it("streams a redacted revision artifact and renders only the typed result", async () => {
    const port = helmPort();
    const content = "---\nkind: Deployment\nmetadata:\n  name: storefront\n";
    const completedSnapshot = {
      commandId: "cmd-helm-1",
      event: {
        commandId: "cmd-helm-1",
        sequence: 2,
        kind: "completed" as const,
        occurredAt: "2026-07-16T09:02:00Z",
        payload: {
          result: {
            artifact: {
              artifact: "manifest",
              format: "yaml",
              namespace: "storefront",
              release_name: "storefront",
              revision: 3,
              comparison_revision: null,
              all_values: false,
              content,
              content_sha256: "0".repeat(64),
              content_bytes: new TextEncoder().encode(content).byteLength,
              source_bytes: 80,
              redaction_applied: true,
              truncated: false,
            },
          },
        },
      },
      failure: null,
      retry: null,
      sequence: 2,
      status: "completed" as const,
      updatedAt: 1,
    };
    const store = {
      start: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => completedSnapshot),
    };
    operationState.value = store;
    renderRoute("/helm/detail/cluster-a/storefront/storefront", port);

    fireEvent.click(await screen.findByRole("button", { name: "Load manifest" }));

    await waitFor(() => expect(port.readArtifact).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
      artifact: "manifest",
      revision: 3,
      comparisonRevision: undefined,
      allValues: false,
    }));
    expect(store.start).toHaveBeenCalledWith("cmd-helm-1");
    expect(await screen.findByText("Sensitive values were removed by the cluster agent.")).toBeTruthy();
    expect(screen.getByText(/kind: Deployment/u)).toBeTruthy();
    expect(screen.queryByText("password=must-not-leak")).toBeNull();
  });

  it("streams a typed hook comparison without rendering raw hook manifests", async () => {
    const port = helmPort();
    operationState.value = completedOperationStore({
      artifact: "hooks_diff",
      format: "structured",
      namespace: "storefront",
      release_name: "storefront",
      revision: 3,
      comparison_revision: 2,
      all_values: false,
      source_bytes: 300,
      redaction_applied: true,
      truncated: false,
      projection_sha256: "0".repeat(64),
      projection_bytes: 260,
      hooks_diff: {
        revision1: 3,
        revision2: 2,
        added: [],
        removed: [],
        modified: [{
          api_version: "batch/v1",
          kind: "Job",
          name: "migrate",
          namespace: "storefront",
          events: ["pre-upgrade"],
          weight: 2,
          delete_policies: ["hook-succeeded"],
          output_log_policies: ["hook-failed"],
          manifest_changed: true,
        }],
        unchanged: [],
        parse_error_count: 1,
      },
    });
    renderRoute("/helm/detail/cluster-a/storefront/storefront", port);

    fireEvent.click(await screen.findByRole("button", { name: "Compare hooks" }));

    await waitFor(() => expect(port.readArtifact).toHaveBeenCalledWith({
      clusterId: "cluster-a",
      namespace: "storefront",
      releaseName: "storefront",
      artifact: "hooks_diff",
      revision: 3,
      comparisonRevision: 2,
      allValues: false,
    }));
    expect(await screen.findByRole("heading", { name: "Modified hooks" })).toBeTruthy();
    expect(screen.getByText("Job/migrate")).toBeTruthy();
    expect(screen.getByText("Manifest changed")).toBeTruthy();
    expect(screen.getByText("1 hook document could not be parsed.")).toBeTruthy();
    expect(screen.queryByText("token=must-not-leak")).toBeNull();
  });

  it("resumes an exact revision comparison from URL state without re-enqueueing the read", async () => {
    const port = helmPort();
    const store = completedOperationStore({
      artifact: "hooks_diff",
      format: "structured",
      namespace: "storefront",
      release_name: "storefront",
      revision: 3,
      comparison_revision: 2,
      all_values: false,
      source_bytes: 200,
      redaction_applied: true,
      truncated: false,
      projection_sha256: "0".repeat(64),
      projection_bytes: 100,
      hooks_diff: {
        revision1: 3,
        revision2: 2,
        added: [],
        removed: [],
        modified: [],
        unchanged: [],
        parse_error_count: 0,
      },
    });
    operationState.value = store;
    renderRoute(
      "/helm/detail/cluster-a/storefront/storefront?clusters=cluster-a&helmRevision=3&helmCompare=2&helmArtifact=hooks_diff&helmCommand=cmd-helm-1",
      port,
    );

    await screen.findByRole("heading", { name: "storefront" });
    await waitFor(() => expect(store.start).toHaveBeenCalledWith("cmd-helm-1"));
    expect(port.readArtifact).not.toHaveBeenCalled();
    expect((screen.getByRole("combobox", { name: "Revision" }) as HTMLSelectElement).value).toBe("3");
    expect((screen.getByRole("combobox", { name: "Compare with" }) as HTMLSelectElement).value).toBe("2");
    expect(screen.getByTestId("location").textContent).toContain("helmCommand=cmd-helm-1");
    expect(await screen.findByText("The sanitized revision artifact is empty.")).toBeTruthy();
  });

  it("renders typed resource changes and partial parse evidence", async () => {
    const port = helmPort();
    operationState.value = completedOperationStore({
      artifact: "resources_diff",
      format: "structured",
      namespace: "storefront",
      release_name: "storefront",
      revision: 3,
      comparison_revision: 2,
      all_values: false,
      source_bytes: 400,
      redaction_applied: true,
      truncated: false,
      projection_sha256: "0".repeat(64),
      projection_bytes: 360,
      resources_diff: {
        revision1: 3,
        revision2: 2,
        added: [{
          api_version: "v1",
          kind: "Service",
          name: "storefront",
          namespace: "storefront",
        }],
        removed: [],
        modified: [{
          api_version: "apps/v1",
          kind: "Deployment",
          name: "storefront",
          namespace: "storefront",
          summary: "2 fields changed",
          field_count: 2,
          fields: [{
            path: "spec.replicas",
            old_value: 1,
            new_value: 3,
          }],
        }],
        unchanged: [],
        parse_error_count: 1,
      },
    });
    renderRoute("/helm/detail/cluster-a/storefront/storefront", port);

    fireEvent.click(await screen.findByRole("button", { name: "Compare resources" }));

    expect(await screen.findByRole("heading", { name: "Modified resources" })).toBeTruthy();
    expect(screen.getByText("Deployment/storefront")).toBeTruthy();
    expect(screen.getByText("spec.replicas")).toBeTruthy();
    expect(screen.getByText("1 resource document could not be parsed.")).toBeTruthy();
  });
});

function renderRoute(path: string, port: HelmPort) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <HelmPage port={port} />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function helmPort(): HelmPort & {
  listInstallTargets: ReturnType<typeof vi.fn>;
  installRelease: ReturnType<typeof vi.fn>;
  searchCharts: ReturnType<typeof vi.fn>;
  getChartDetail: ReturnType<typeof vi.fn>;
  searchArtifactHub: ReturnType<typeof vi.fn>;
  getArtifactHubChart: ReturnType<typeof vi.fn>;
  checkReleaseUpgrades: ReturnType<typeof vi.fn>;
  listReleases: ReturnType<typeof vi.fn>;
  getRelease: ReturnType<typeof vi.fn>;
  getReleaseUpgradeInfo: ReturnType<typeof vi.fn>;
  listReleaseVersions: ReturnType<typeof vi.fn>;
  readArtifact: ReturnType<typeof vi.fn>;
  upgradeRelease: ReturnType<typeof vi.fn>;
  previewReleaseValues: ReturnType<typeof vi.fn>;
  rollbackRelease: ReturnType<typeof vi.fn>;
  uninstallRelease: ReturnType<typeof vi.fn>;
  refreshChartSource: ReturnType<typeof vi.fn>;
  listChartSources: ReturnType<typeof vi.fn>;
  registerChartSource: ReturnType<typeof vi.fn>;
  deleteChartSource: ReturnType<typeof vi.fn>;
} {
  return {
    listInstallTargets: vi.fn().mockResolvedValue({ namespace: "sandbox", targets: [] }),
    installRelease: vi.fn().mockResolvedValue({
      accepted: true,
      eventId: "event-install",
      auditEventId: "event-install",
      commandId: "cmd-install",
      correlationId: "corr-install",
      status: "queued",
    }),
    searchCharts: vi.fn().mockResolvedValue({
      availability: "available",
      items: [],
      total: 0,
      limit: 20,
      query: "",
      sourceId: null,
      provider: null,
      allVersions: false,
      observedAt: "2026-07-17T08:00:00Z",
      truncated: false,
      reasonCodes: [],
    }),
    getChartDetail: vi.fn(),
    previewReleaseValues: vi.fn().mockResolvedValue({
      accepted: true,
      eventId: "evt-preview",
      auditEventId: "evt-preview",
      correlationId: "corr-preview",
      commandId: "cmd-preview",
      status: "queued",
    }),
    searchArtifactHub: vi.fn().mockResolvedValue({
      items: [], total: 0, offset: 0, limit: 20, hasMore: false,
      observedAt: "2026-07-17T08:00:00Z",
    }),
    getArtifactHubChart: vi.fn().mockResolvedValue({
      chart: {
        packageId: "pkg", name: "chart", version: "1.0.0", appVersion: null,
        description: null, stars: 0, deprecated: false, signed: false,
        repository: { name: "repository", url: "https://example.test", official: false, verifiedPublisher: false },
      },
      readme: null, availableVersions: [], versionsTruncated: false,
      observedAt: "2026-07-17T08:00:00Z",
    }),
    checkReleaseUpgrades: vi.fn().mockResolvedValue({
      releases: {},
      coverage: { availability: "available", observedAt: null, reasonCodes: [] },
      truncated: false,
      reasonCodes: [],
      refreshAfterSeconds: 30,
    }),
    listReleases: vi.fn().mockResolvedValue({
      releases: [release()],
      refreshAfterSeconds: 30,
      postMutationRefreshAfterSeconds: 1.2,
      coverage: { availability: "available", observedAt: "2026-07-16T09:00:00Z", reasonCodes: [] },
    }),
    getRelease: vi.fn().mockResolvedValue(detail()),
    getReleaseUpgradeInfo: vi.fn().mockResolvedValue({
      availability: "unavailable",
      chartName: null,
      currentVersion: null,
      latestVersion: null,
      updateAvailable: null,
      source: null,
      observedAt: null,
      reasonCodes: ["helm_chart_identity_unavailable"],
      refreshAfterSeconds: 10,
    }),
    listReleaseVersions: vi.fn().mockResolvedValue({
      availability: "unavailable",
      chartName: null,
      currentVersion: null,
      source: null,
      versions: [],
      observedAt: null,
      truncated: false,
      reasonCodes: ["helm_chart_identity_unavailable"],
      refreshAfterSeconds: 10,
    }),
    readArtifact: vi.fn().mockResolvedValue({
      accepted: true,
      eventId: "evt-helm-1",
      auditEventId: "evt-helm-1",
      correlationId: "corr-helm-1",
      commandId: "cmd-helm-1",
      status: "queued",
    }),
    upgradeRelease: vi.fn().mockResolvedValue({
      accepted: true,
      eventId: "evt-helm-upgrade-1",
      auditEventId: "evt-helm-upgrade-1",
      correlationId: "corr-helm-upgrade-1",
      commandId: "cmd-helm-upgrade-1",
      status: "queued",
    }),
    rollbackRelease: vi.fn().mockResolvedValue({
      accepted: true,
      eventId: "evt-helm-rollback-1",
      auditEventId: "evt-helm-rollback-1",
      correlationId: "corr-helm-rollback-1",
      commandId: "cmd-helm-rollback-1",
      status: "queued",
    }),
    uninstallRelease: vi.fn().mockResolvedValue({
      accepted: true,
      eventId: "evt-helm-uninstall-1",
      auditEventId: "evt-helm-uninstall-1",
      correlationId: "corr-helm-uninstall-1",
      commandId: "cmd-helm-uninstall-1",
      status: "queued",
    }),
    refreshChartSource: vi.fn().mockResolvedValue({
      sourceId: "source-repository",
      chartCount: 1,
      observedAt: "2026-07-17T08:00:00Z",
      eventId: "event-refresh-source",
      correlationId: "correlation-refresh-source",
    }),
    deleteChartSource: vi.fn().mockResolvedValue({
      accepted: true,
      eventId: "event-delete-source",
      correlationId: "correlation-delete-source",
    }),
    listChartSources: vi.fn().mockResolvedValue({
      items: [],
      limit: 50,
      hasMore: false,
      nextCursor: null,
    }),
    registerChartSource: vi.fn().mockResolvedValue({
      id: "source-repository",
      provider: "repository",
      name: "Stable",
      reference: "https://charts.example.test/index.yaml",
      status: "active",
      actions: ["delete"],
      credentialsConfigured: false,
      observedAt: null,
    }),
  };
}

function completedPreviewSnapshot() {
  const resources = {
    added: [{ api_version: "v1", kind: "Service", name: "storefront", namespace: "sandbox" }],
    removed: [],
    modified: [{
      api_version: "apps/v1",
      kind: "Deployment",
      name: "storefront",
      namespace: "sandbox",
      summary: "1 fields changed",
      field_count: 1,
      fields: [{ path: "spec.replicas", old_value: 1, new_value: 3 }],
    }],
    unchanged: [],
    parse_error_count: 0,
  };
  return {
    commandId: "cmd-preview-1",
    event: {
      commandId: "cmd-preview-1",
      sequence: 2,
      kind: "completed",
      occurredAt: "2026-07-17T02:00:00Z",
      payload: {
        result: {
          preview: {
            namespace: "sandbox",
            release_name: "storefront",
            expected_revision: 3,
            catalog_item_id: "catalog-redis",
            catalog_version: "1.0.0",
            chart_name: "redis",
            chart_version: "23.1.1",
            resources,
            projection_sha256: "0".repeat(64),
            projection_bytes: new TextEncoder().encode(JSON.stringify(resources)).byteLength,
            source_bytes: 2_048,
            redaction_applied: true,
            truncated: false,
          },
        },
      },
    },
    failure: null,
    retry: null,
    sequence: 2,
    status: "completed",
    updatedAt: 1,
  };
}

function availableUpgradeInfo() {
  return {
    availability: "available" as const,
    chartName: "storefront",
    currentVersion: "1.2.3",
    latestVersion: "2.0.0",
    updateAvailable: true,
    source: {
      id: "source-a",
      provider: "repository" as const,
      name: "Stable",
      reference: "https://charts.example.test/stable",
      status: "active" as const,
      actions: [],
      credentialsConfigured: false,
      observedAt: "2026-07-17T00:00:00Z",
    },
    observedAt: "2026-07-17T00:01:00Z",
    reasonCodes: [],
    refreshAfterSeconds: 10,
  };
}

function detail() {
  return {
    release: release(),
    history: [
      {
        storage: release().storage,
        revision: 3,
        status: "deployed",
        observedAt: "2026-07-16T09:00:00Z",
      },
      {
        storage: {
          ...release().storage,
          name: "sh.helm.release.v1.storefront.v2",
          uid: "storage-2",
        },
        revision: 2,
        status: "superseded",
        observedAt: "2026-07-15T09:00:00Z",
      },
    ],
    manifest: unavailable("helm_manifest_provider_not_integrated"),
    values: unavailable("helm_values_provider_not_integrated"),
    ownedResources: {
      availability: "available" as const,
      items: [{
        resource: {
          apiGroup: "apps",
          version: "v1",
          kind: "Deployment",
          namespace: "storefront",
          name: "storefront",
          uid: "deployment-storefront",
        },
        status: "Available",
        health: "healthy",
        observedAt: "2026-07-16T09:01:00Z",
      }],
      observedAt: "2026-07-16T09:01:00Z",
      truncated: false,
      reasonCodes: [],
    },
    commands: unavailable("agent_helm_executor_not_integrated"),
    refreshAfterSeconds: 10,
    postMutationRefreshAfterSeconds: 1.2,
  };
}

function release(): HelmRelease {
  return {
    scope: {
      workspaceId: "workspace-a",
      clusterId: "cluster-a",
      namespaces: ["storefront"],
      freshness: "live",
    },
    name: "storefront",
    storageNamespace: "storefront",
    storage: {
      apiGroup: "",
      version: "v1",
      kind: "Secret",
      namespace: "storefront",
      name: "sh.helm.release.v1.storefront.v3",
      uid: "storage-3",
    },
    storageResourceVersion: "1042",
    chart: null,
    chartVersion: null,
    chartReasonCodes: ["helm_chart_identity_unavailable"],
    appVersion: null,
    status: "deployed",
    revision: 3,
    observedAt: "2026-07-16T09:00:00Z",
    resourceHealth: {
      availability: "available",
      health: "healthy",
      resourceCount: 1,
      observedAt: "2026-07-16T09:01:00Z",
      reasonCodes: [],
    },
  };
}

function unavailable(reasonCode: string) {
  return { availability: "unavailable" as const, reasonCode };
}

function availableUpgradeCommands() {
  return {
    availability: "available" as const,
    actions: ["upgrade", "rollback", "uninstall"] as const,
    confirmationRequired: true as const,
    realtime: true as const,
    upgradeTargets: [{
      itemId: "catalog-redis",
      name: "Redis",
      version: "1.0.0",
      chartVersion: "23.1.1",
      inputs: [{
        name: "master.persistence.storageClass",
        valueType: "string" as const,
        required: true,
        defaultValue: null,
        allowedValues: [],
      }],
    }],
  };
}

function redisUpgradeVersions() {
  return {
    availability: "available" as const,
    chartName: "redis",
    currentVersion: "22.0.0",
    source: {
      id: "source-redis",
      provider: "repository" as const,
      name: "Redis stable",
      reference: "https://charts.example.test/stable",
      status: "active" as const,
      actions: [],
      credentialsConfigured: false,
      observedAt: "2026-07-17T00:00:00Z",
    },
    versions: [
      { version: "23.1.1", appVersion: null, deprecated: false },
      { version: "22.0.0", appVersion: null, deprecated: false },
    ],
    observedAt: "2026-07-17T00:01:00Z",
    truncated: false,
    reasonCodes: [],
    refreshAfterSeconds: 10,
  };
}

function completedOperationStore(artifact: Record<string, unknown>) {
  const projection = artifact.hooks_diff ?? artifact.resources_diff;
  const normalizedArtifact = projection && typeof projection === "object"
    ? {
      ...artifact,
      projection_bytes: new TextEncoder().encode(JSON.stringify(projection)).byteLength,
    }
    : artifact;
  const snapshot = {
    commandId: "cmd-helm-1",
    event: {
      commandId: "cmd-helm-1",
      sequence: 2,
      kind: "completed" as const,
      occurredAt: "2026-07-16T09:02:00Z",
      payload: { result: { artifact: normalizedArtifact } },
    },
    failure: null,
    retry: null,
    sequence: 2,
    status: "completed" as const,
    updatedAt: 1,
  };
  return {
    start: vi.fn(),
    subscribe: vi.fn(() => () => undefined),
    getSnapshot: vi.fn(() => snapshot),
  };
}
