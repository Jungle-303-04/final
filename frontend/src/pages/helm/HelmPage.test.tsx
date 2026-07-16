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
      },
      commands: availableUpgradeCommands(),
    });
    const store = {
      start: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => null),
    };
    operationState.value = store;
    renderRoute("/helm/detail/cluster-a/sandbox/storefront", port);

    fireEvent.click(await screen.findByRole("button", { name: "Upgrade" }));
    expect(screen.getByRole("dialog", { name: "Confirm Helm upgrade" })).toBeTruthy();
    expect(screen.getByText(/cluster-a · sandbox · storefront · revision 3/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /rollback|uninstall/i })).toBeNull();

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
  listReleases: ReturnType<typeof vi.fn>;
  getRelease: ReturnType<typeof vi.fn>;
  readArtifact: ReturnType<typeof vi.fn>;
  upgradeRelease: ReturnType<typeof vi.fn>;
  listChartSources: ReturnType<typeof vi.fn>;
  registerChartSource: ReturnType<typeof vi.fn>;
  deleteChartSource: ReturnType<typeof vi.fn>;
} {
  return {
    listReleases: vi.fn().mockResolvedValue({
      releases: [release()],
      refreshAfterSeconds: 30,
      postMutationRefreshAfterSeconds: 1.2,
      coverage: { availability: "available", observedAt: "2026-07-16T09:00:00Z", reasonCodes: [] },
    }),
    getRelease: vi.fn().mockResolvedValue(detail()),
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
    chart: null,
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
    actions: ["upgrade" as const],
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
