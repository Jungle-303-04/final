// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BottomDock } from "../../app/BottomDock";
import { ProductSessionProvider } from "../../features/auth/ProductSessionContext";
import { DiagnoseSessionProvider } from "../../features/diagnose/DiagnoseSessionContext";
import type {
  DiagnoseCapabilities,
  DiagnosePort,
} from "../../features/diagnose/diagnoseContract";
import { createOperationStatusStore, OperationStatusStoreProvider } from "../../features/operations/OperationStatusStore";
import type { OperationEventsPort } from "../../features/operations/operationEventsContract";
import type { ResourceActionCapability, ResourceActionsPort } from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import { I18nProvider } from "../../shared/i18n";
import { ResourceDetailActions } from "./ResourceDetailActions";
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";

afterEach(cleanup);

describe("ResourceDetailActions operation handoff", () => {
  it("keeps receipts A and B exactly once in the root dock after the detail consumer closes", async () => {
    const user = userEvent.setup();
    const actionsPort: ResourceActionsPort = {
      execute: vi.fn()
        .mockResolvedValueOnce({ accepted: true, correlationId: "correlation-a", commandId: "command-a", eventId: "event-a" })
        .mockResolvedValueOnce({ accepted: true, correlationId: "correlation-b", commandId: "command-b", eventId: "event-b" }),
    };
    const store = createOperationStatusStore(completedOperations());
    const view = renderSurface(store, actionsPort, true);

    await submitRestart(user);
    await submitRestart(user);
    await waitFor(() => expect(store.getSnapshot("command-b").status).toBe("completed"));

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
          roles: ["viewer"],
          userId: "user-1",
          workspaceId: "workspace-1",
        }}>
          <DiagnoseSessionProvider port={diagnose}>
            <ResourceDetailActions
              actionsPort={{ execute: vi.fn() }}
              capabilities={{ ...capabilities, data: { ...capabilities.data!, capabilities: [] } }}
              detail={detail}
            />
          </DiagnoseSessionProvider>
        </ProductSessionProvider>
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Opsia AI" }));

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
          actionsPort={{ execute }}
          capabilities={cronjobCapabilities}
          detail={cronjobDetail}
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
      resourceId: "resource-cronjob-nightly",
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
    <I18nProvider navigatorLanguage="en-US" storage={null}>
      <OperationStatusStoreProvider store={store}>
        {detailsOpen ? (
          <ResourceDetailActions
            actionsPort={actionsPort}
            capabilities={capabilities}
            detail={detail}
          />
        ) : null}
        <BottomDock onAskAi={() => undefined} />
      </OperationStatusStoreProvider>
    </I18nProvider>
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
