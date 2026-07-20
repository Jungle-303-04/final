// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { ProductNotificationCenter } from "../../app/ProductNotificationCenter";
import { ProductSessionProvider } from "../../features/auth/ProductSessionContext";
import { DiagnoseSessionProvider } from "../../features/diagnose/DiagnoseSessionContext";
import type { DiagnoseCapabilities, DiagnosePort } from "../../features/diagnose/diagnoseContract";
import { AlertEventsProvider } from "../../features/alerts/AlertEventsProvider";
import { EMPTY_ALERT_EVENTS_PORT } from "../../features/alerts/alertEventsContract";
import { ProductNotificationsProvider } from "../../features/notifications/ProductNotificationsProvider";
import { createOperationStatusStore, OperationStatusStoreProvider } from "../../features/operations/OperationStatusStore";
import type { OperationEventsPort } from "../../features/operations/operationEventsContract";
import type { ResourceActionCapability, ResourceActionsPort } from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { ResourceDetailActions } from "./ResourceDetailActions";
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";
afterEach(cleanup);
describe("ResourceDetailActions operation handoff", () => {
  it("keeps receipts A and B exactly once in the unified Bell after the detail consumer closes", async () => {
    const user = userEvent.setup();
    const actionsPort: ResourceActionsPort = {
      execute: vi.fn()
        .mockResolvedValueOnce({ accepted: true, correlationId: "correlation-a", commandId: "command-a", eventId: "event-a" })
        .mockResolvedValueOnce({ accepted: true, correlationId: "correlation-b", commandId: "command-b", eventId: "event-b" }),
      previewDeletion: vi.fn(),
      previewRollback: vi.fn(),
    };
    const store = createOperationStatusStore(completedOperations());
    const view = renderSurface(store, actionsPort, true);
    await submitRestart(user);
    await submitRestart(user);
    await waitFor(() => expect(store.getSnapshot("command-b").status).toBe("completed"));
    await user.click(screen.getByRole("button", { name: /^Notifications/u }));
    expect(screen.getAllByText("command-a")).toHaveLength(1);
    expect(screen.getAllByText("command-b")).toHaveLength(1);
    expect(screen.getByText(/correlation-b/u)).toBeTruthy();
    view.rerender(renderSurfaceTree(store, actionsPort, false));
    expect(screen.queryByText(/correlation-b/u)).toBeNull();
    expect(screen.getAllByText("command-a")).toHaveLength(1);
    expect(screen.getAllByText("command-b")).toHaveLength(1);
    expect(screen.getAllByRole("region")).toHaveLength(1);
    store.dispose();
  });
  it("launches a resource investigation with the server identity carried by the detail contract", async () => {
    const user = userEvent.setup();
    const diagnose = diagnosePort();
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ProductSessionProvider session={{
          authEnabled: true,
          authMode: "password",
          groups: [],
          logout: { action: "end_session", supported: true, reauthenticationExpected: false },
          roles: ["viewer"],
          userId: "user-1",
          workspaceId: "workspace-1",
        }}>
          <DiagnoseSessionProvider port={diagnose}>
            <ResourceDetailActions
              actionsPort={{ execute: vi.fn(), previewDeletion: vi.fn(), previewRollback: vi.fn() }}
              capabilities={{ ...capabilities, data: { ...capabilities.data!, capabilities: [] } }}
              detail={detail}
            />
          </DiagnoseSessionProvider>
        </ProductSessionProvider>
      </I18nProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Kyro AI" }));

    await waitFor(() => expect(diagnose.startResourceRun).toHaveBeenCalledWith(
      {
        apiGroup: "apps",
        apiVersion: "v1",
        clusterId: "cluster-1",
        kind: "Deployment",
        name: "checkout",
        namespace: "shop",
        resourceType: "workloads",
        uid: "uid-1",
      },
      DIAGNOSE_CAPABILITIES,
    ));
  });

  it("reuses one exact CronJob execution key after a transport failure", async () => {
    const user = userEvent.setup();
    const execute = vi.fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({
        accepted: true,
        auditEventId: "event-cronjob-1",
        correlationId: "correlation-cronjob-1",
        commandId: "command-cronjob-1",
        eventId: "event-cronjob-1",
        status: "queued",
      });
    const onInvalidate = vi.fn();
    const cronjobDetail: ResourceDetail = {
      ...detail,
      identity: {
        kind: "CronJob",
        name: "nightly",
        namespace: "shop",
        resourceType: "workload",
      },
      resource: {
        ...detail.resource,
        apiVersion: "batch/v1",
        inventoryKey: "resource-cronjob-nightly",
        kind: "CronJob",
        name: "nightly",
        uid: "cronjob-uid-1",
      },
    };
    const cronjobCapability: ResourceActionCapability = {
      ...capability,
      capabilityId: "cronjob.trigger",
      description: "Create one Job from this CronJob.",
      label: "Trigger",
      path: "/clusters/cluster-1/namespaces/shop/cronjobs/nightly/trigger",
      requestContext: "exact-resource",
    };
    const cronjobCapabilities: ResourceCapabilitiesFrame = {
      data: {
        capabilities: [cronjobCapability],
        revision: "a".repeat(64),
        subject: {
          clusterId: "cluster-1",
          kind: "CronJob",
          name: "nightly",
          namespace: "shop",
          resourceId: "resource-cronjob-nightly",
          resourceType: "workload",
          snapshotId: "snapshot-42",
        },
      },
      failure: null,
      phase: "ready",
    };

    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceDetailActions
          actionsPort={{ execute, previewDeletion: vi.fn(), previewRollback: vi.fn() }}
          capabilities={cronjobCapabilities}
          detail={cronjobDetail}
          onInvalidate={onInvalidate}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Trigger" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
    await screen.findByText("The change request was not accepted.");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    const firstContext = execute.mock.calls[0]?.[2];
    const secondContext = execute.mock.calls[1]?.[2];
    expect(firstContext).toEqual({
      capabilityId: "cronjob.trigger",
      idempotencyKey: expect.stringMatching(/^resource-action-/u),
      requestContext: "exact-resource",
      resourceId: "resource-cronjob-nightly",
      resultIntent: "refresh-resource",
      snapshotId: "snapshot-42",
      revision: "a".repeat(64),
      resource: {
        apiGroup: "batch",
        version: "v1",
        kind: "CronJob",
        namespace: "shop",
        name: "nightly",
        uid: "cronjob-uid-1",
      },
    });
    expect(secondContext.idempotencyKey).toBe(firstContext.idempotencyKey);
    expect(onInvalidate).toHaveBeenCalledOnce();
    expect(onInvalidate).toHaveBeenCalledWith(firstContext);
  });

  it("loads the server-owned cascade before exposing one destructive confirmation", async () => {
    const user = userEvent.setup();
    const execute = vi.fn().mockResolvedValue({
      accepted: true,
      auditEventId: "event-delete",
      commandId: "command-delete",
      correlationId: "correlation-delete",
      eventId: "event-delete",
      status: "queued",
    });
    const previewDeletion = vi.fn().mockResolvedValue({
      dependents: [{
        apiGroup: "apps",
        kind: "ReplicaSet",
        name: "checkout-77f",
        namespace: "shop",
        resourceVersion: "17",
        uid: "replicaset-uid-1",
        version: "v1",
      }],
      maxDependents: 200,
      revision: `sha256:${"a".repeat(64)}`,
      root: {
        apiGroup: "apps",
        kind: "Deployment",
        name: "checkout",
        namespace: "shop",
        resourceVersion: "42",
        uid: "uid-1",
        version: "v1",
      },
      truncated: false,
    });
    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceDetailActions
          actionsPort={{ execute, previewDeletion, previewRollback: vi.fn() }}
          capabilities={{
            ...capabilities,
            data: { ...capabilities.data!, capabilities: [deleteCapability] },
          }}
          detail={detail}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");

    expect(previewDeletion).toHaveBeenCalledWith(deleteCapability);
    expect(within(dialog).getByText(/ReplicaSet\/checkout-77f/u)).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      deleteCapability,
      expect.objectContaining({
        preview_revision: `sha256:${"a".repeat(64)}`,
        idempotency_key: expect.stringMatching(/^resource-delete-/u),
      }),
    ));
  });

  it("loads an exact revision preview and submits one rollback confirmation", async () => {
    const user = userEvent.setup();
    const execute = vi.fn().mockResolvedValue({
      accepted: true,
      auditEventId: "event-rollback",
      commandId: "command-rollback",
      correlationId: "correlation-rollback",
      eventId: "event-rollback",
      status: "queued",
    });
    const previewRollback = vi.fn().mockResolvedValue({
      availability: "available",
      completeness: "exact",
      current: {
        resource: {
          apiGroup: "apps",
          version: "v1",
          kind: "Deployment",
          namespace: "shop",
          name: "checkout",
          uid: "uid-1",
        },
        resourceVersion: "42",
        templateSha256: `sha256:${"c".repeat(64)}`,
      },
      nextCursor: null,
      reason: null,
      revisions: [{
        changes: [{ path: "/spec/containers/0/image", before: "checkout:v3", after: "checkout:v2" }],
        createdAt: "2026-07-02T00:00:00Z",
        previewRevision: `sha256:${"p".repeat(64)}`,
        resource: {
          apiGroup: "apps",
          version: "v1",
          kind: "ReplicaSet",
          namespace: "shop",
          name: "checkout-r2",
          uid: "revision-uid-2",
        },
        resourceVersion: "2",
        revision: "2",
        templateSha256: `sha256:${"t".repeat(64)}`,
      }],
      snapshotId: "snapshot-42",
    });
    const rollbackCapability: ResourceActionCapability = {
      ...capability,
      capabilityId: "workload.rollback",
      description: "Restore an exact observed workload revision.",
      label: "Rollback",
      path: "/resource-rollbacks/inventory-1",
      requestContext: "rollback",
    };

    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceDetailActions
          actionsPort={{ execute, previewDeletion: vi.fn(), previewRollback }}
          capabilities={{
            ...capabilities,
            data: { ...capabilities.data!, capabilities: [rollbackCapability] },
          }}
          detail={detail}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Rollback" }));
    const dialog = await screen.findByRole("dialog");
    expect(previewRollback).toHaveBeenCalledWith(rollbackCapability);
    expect(within(dialog).getByText("checkout:v3 → checkout:v2")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      rollbackCapability,
      {},
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^workload-rollback-/u),
        rollback: expect.objectContaining({
          previewRevision: `sha256:${"p".repeat(64)}`,
          targetResourceVersion: "2",
        }),
      }),
    ));
  });

  it("submits node drain with one exact snapshot context and bounded defaults", async () => {
    const user = userEvent.setup();
    const execute = vi.fn().mockResolvedValue({
      accepted: true,
      auditEventId: "event-drain",
      commandId: "command-drain",
      correlationId: "correlation-drain",
      eventId: "event-drain",
      status: "queued",
    });
    const nodeDetail: ResourceDetail = {
      ...detail,
      identity: { kind: "Node", name: "worker-a", namespace: null, resourceType: "node" },
      resource: {
        ...detail.resource,
        apiVersion: "v1",
        inventoryKey: "resource-node-worker-a",
        kind: "Node",
        name: "worker-a",
        namespace: null,
        resourceType: "node",
        uid: "node-uid-1",
      },
    };
    const drainCapability: ResourceActionCapability = {
      ...capability,
      capabilityId: "node.drain",
      description: "Drain this exact node.",
      inputSchema: [
        { key: "timeout_seconds", label: "Timeout", type: "integer", required: true, minimum: 10, maximum: 600, default: 60, prefillResultKey: null },
        { key: "max_parallel", label: "Parallel", type: "integer", required: true, minimum: 1, maximum: 32, default: 8, prefillResultKey: null },
        { key: "force", label: "Evict unmanaged Pods", type: "boolean", required: true, minimum: null, maximum: null, default: false, prefillResultKey: null },
      ],
      label: "Drain",
      path: "/clusters/cluster-1/nodes/worker-a/drain",
      requestContext: "exact-resource",
      resultIntent: "resource-summary",
    };
    const frame: ResourceCapabilitiesFrame = {
      data: {
        capabilities: [drainCapability],
        revision: "d".repeat(64),
        subject: {
          clusterId: "cluster-1",
          kind: "Node",
          name: "worker-a",
          namespace: null,
          resourceId: "resource-node-worker-a",
          resourceType: "node",
          snapshotId: "snapshot-node-42",
        },
      },
      failure: null,
      phase: "ready",
    };

    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <ResourceDetailActions
          actionsPort={{ execute, previewDeletion: vi.fn(), previewRollback: vi.fn() }}
          capabilities={frame}
          detail={nodeDetail}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Drain" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      drainCapability,
      { timeout_seconds: 60, max_parallel: 8, force: false },
      {
        capabilityId: "node.drain",
        idempotencyKey: expect.stringMatching(/^resource-action-/u),
        requestContext: "exact-resource",
        resourceId: "resource-node-worker-a",
        resultIntent: "resource-summary",
        snapshotId: "snapshot-node-42",
        revision: "d".repeat(64),
        resource: {
          apiGroup: "",
          version: "v1",
          kind: "Node",
          namespace: null,
          name: "worker-a",
          uid: "node-uid-1",
        },
      },
    ));
  });

  it("uses descriptor result intent for terminal handoff and cleanup input prefill", async () => {
    const user = userEvent.setup();
    const digestImage = `registry.example/debug@sha256:${"a".repeat(64)}`;
    const execute = vi.fn().mockResolvedValue({
      accepted: true,
      auditEventId: "event-debug",
      commandId: "command-debug",
      correlationId: "correlation-debug",
      eventId: "event-debug",
      status: "queued",
    });
    const onTerminalReady = vi.fn();
    const podDetail: ResourceDetail = {
      ...detail,
      identity: { kind: "Pod", name: "checkout-0", namespace: "shop", resourceType: "pod" },
      resource: {
        ...detail.resource,
        apiVersion: "v1",
        inventoryKey: "resource-pod-checkout-0",
        kind: "Pod",
        name: "checkout-0",
        namespace: "shop",
        resourceType: "pod",
        uid: "pod-uid-1",
      },
    };
    const debugCapability: ResourceActionCapability = {
      ...capability,
      capabilityId: "maintenance.attach-diagnostics",
      description: "Attach an ephemeral debug container.",
      inputSchema: [
        { key: "target_container", label: "Target container", type: "string", required: true, minimum: null, maximum: null, default: "", prefillResultKey: null },
        { key: "image", label: "Image", type: "string", required: true, minimum: null, maximum: null, default: "", prefillResultKey: null },
      ],
      label: "Debug container",
      path: "/clusters/cluster-1/namespaces/shop/pods/checkout-0/debug",
      requestContext: "exact-resource",
      resultIntent: "terminal-session",
    };
    const cleanupCapability: ResourceActionCapability = {
      ...capability,
      capabilityId: "maintenance.cleanup-diagnostics",
      description: "Clean up the owned debug session.",
      inputSchema: [
        { key: "namespace", label: "Namespace", type: "string", required: true, minimum: null, maximum: null, default: "", prefillResultKey: "namespace" },
        { key: "session_id", label: "Debug session ID", type: "string", required: true, minimum: null, maximum: null, default: "", prefillResultKey: "session_id" },
      ],
      label: "Clean up debug session",
      path: "/clusters/cluster-1/nodes/worker-a/debug/cleanup",
      requestContext: "exact-resource",
      resultIntent: "refresh-resource",
    };
    const frame: ResourceCapabilitiesFrame = {
      data: {
        capabilities: [debugCapability, cleanupCapability],
        revision: "e".repeat(64),
        subject: {
          clusterId: "cluster-1",
          kind: "Pod",
          name: "checkout-0",
          namespace: "shop",
          resourceId: "resource-pod-checkout-0",
          resourceType: "pod",
          snapshotId: "snapshot-pod-42",
        },
      },
      failure: null,
      phase: "ready",
    };
    const store = createOperationStatusStore({
      async *subscribeOperationEvents(commandId) {
        yield {
          commandId,
          sequence: 1,
          kind: "completed",
          occurredAt: "2026-07-17T00:00:00Z",
          payload: {
            result: {
              namespace: "shop",
              pod: "checkout-0",
              container_name: "opsia-debug-session-42",
              session_id: "debug-session-42",
              terminal: {
                namespace: "shop",
                pod: "checkout-0",
                container: "opsia-debug-session-42",
              },
            },
          },
        };
      },
    });

    render(
      <I18nProvider navigatorLanguage="en-US" storage={null}>
        <OperationStatusStoreProvider store={store}>
          <ResourceDetailActions
            actionsPort={{ execute, previewDeletion: vi.fn(), previewRollback: vi.fn() }}
            capabilities={frame}
            detail={podDetail}
            onTerminalReady={onTerminalReady}
          />
        </OperationStatusStoreProvider>
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Debug container" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Target container"), "app");
    await user.type(within(dialog).getByLabelText("Image"), digestImage);
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(onTerminalReady).toHaveBeenCalledWith({
      namespace: "shop",
      pod: "checkout-0",
      container: "opsia-debug-session-42",
    }));
    await user.click(screen.getByRole("button", { name: "Clean up debug session" }));
    const cleanupDialog = await screen.findByRole("dialog");
    expect(within(cleanupDialog).getByLabelText("Namespace")).toHaveProperty("value", "shop");
    expect(within(cleanupDialog).getByLabelText("Debug session ID"))
      .toHaveProperty("value", "debug-session-42");
    store.dispose();
  });
});

async function submitRestart(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Restart" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
}

function renderSurface(
  store: ReturnType<typeof createOperationStatusStore>,
  actionsPort: ResourceActionsPort,
  detailsOpen: boolean,
) {
  return render(renderSurfaceTree(store, actionsPort, detailsOpen));
}

function renderSurfaceTree(
  store: ReturnType<typeof createOperationStatusStore>,
  actionsPort: ResourceActionsPort,
  detailsOpen: boolean,
) {
  return (
    <I18nProvider navigatorLanguage="en-US" storage={null}><MemoryRouter>
      <AlertEventsProvider port={EMPTY_ALERT_EVENTS_PORT}><ProductNotificationsProvider>
        <OperationStatusStoreProvider store={store}>
          {detailsOpen
            ? <ResourceDetailActions actionsPort={actionsPort} capabilities={capabilities} detail={detail} />
            : null}
          <ProductNotificationCenter />
        </OperationStatusStoreProvider>
      </ProductNotificationsProvider></AlertEventsProvider>
    </MemoryRouter></I18nProvider>
  );
}

const capability: ResourceActionCapability = {
  capabilityId: "restart",
  confirmationRequired: true,
  description: "Restart the deployment.",
  execution: "command",
  inputSchema: [],
  label: "Restart",
  method: "POST",
  path: "/api/resource-actions/restart",
  realtime: true,
  requestContext: "simple",
  resultIntent: "refresh-resource",
};

const deleteCapability: ResourceActionCapability = {
  capabilityId: "resource.delete",
  confirmationRequired: true,
  description: "Delete this exact resource after reviewing its cascade.",
  execution: "command",
  inputSchema: [],
  label: "Delete",
  method: "POST",
  path: "/resource-deletions/inventory-1",
  realtime: true,
  requestContext: "simple",
  resultIntent: "refresh-resource",
};

const detail: ResourceDetail = {
  clusterId: "cluster-1",
  dataQualityWarnings: [],
  eventExcludedCount: 0,
  events: [],
  eventsCompleteness: "unknown",
  identity: {
    kind: "Deployment",
    name: "checkout",
    namespace: "shop",
    resourceType: "workloads",
  },
  related: [],
  relatedCompleteness: "unknown",
  relatedExcludedCount: 0,
  resource: {
    apiVersion: "apps/v1",
    clusterId: "cluster-1",
    deletedAt: null,
    facts: {
      availableReplicas: 1,
      desiredReplicas: 1,
      generation: 1,
      observedGeneration: 1,
      readyReplicas: 1,
      type: "workload",
      unavailableReplicas: 0,
      updatedReplicas: 1,
    },
    firstSeenAt: null,
    health: "healthy",
    healthStatus: "Healthy",
    id: "resource-1",
    identityStability: "uid",
    inventoryKey: "inventory-1",
    kind: "Deployment",
    lastSeenAt: null,
    name: "checkout",
    namespace: "shop",
    observedAt: null,
    resourceType: "workloads",
    status: "Ready",
    uid: "uid-1",
  },
};

const capabilities = {
  data: {
    capabilities: [capability],
    revision: "revision-1",
    subject: {
      clusterId: "cluster-1",
      kind: "Deployment",
      name: "checkout",
      namespace: "shop",
      resourceId: "inventory-1",
      resourceType: "workloads",
      snapshotId: "snapshot-1",
    },
  },
  failure: null,
  phase: "ready",
} satisfies ResourceCapabilitiesFrame;

function completedOperations(): OperationEventsPort {
  return {
    async *subscribeOperationEvents(commandId) {
      yield {
        commandId,
        sequence: 1,
        kind: "completed",
        occurredAt: "2026-07-15T00:00:00Z",
        payload: {},
      };
    },
  };
}

const DIAGNOSE_CAPABILITIES: DiagnoseCapabilities = {
  agent: {
    effort: "medium",
    id: "opsia-resource-investigator",
    isolated: true,
    model: null,
  },
  consented: true,
  disclosureRevision: "diagnose-v1",
  enabled: true,
  label: "Resource investigation",
  reasonCodes: [],
};

function diagnosePort(): DiagnosePort {
  return {
    addTurn: vi.fn(),
    clearFinished: vi.fn(),
    getCapabilities: vi.fn().mockResolvedValue(DIAGNOSE_CAPABILITIES),
    grantBrowserConsent: vi.fn(),
    listRuns: vi.fn(),
    startResourceRun: vi.fn().mockImplementation(async (target) => ({
      created: true,
      deduplicated: false,
      run: {
        createdAt: "2026-07-16T00:00:00Z",
        runId: "run-1",
        status: "queued",
        statusReason: null,
        target,
        updatedAt: "2026-07-16T00:00:00Z",
      },
    })),
    stopRun: vi.fn(),
    async *subscribeEvents() {
      yield* [];
    },
  };
}
