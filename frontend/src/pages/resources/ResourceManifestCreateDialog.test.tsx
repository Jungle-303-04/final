// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OperationStatusStoreProvider,
  type OperationStatusSnapshot,
  type OperationStatusStore,
} from "../../features/operations/OperationStatusStore";
import type {
  ResourceManifestCreatePort,
  ResourceManifestPort,
} from "../../features/resources/resourceManifestContract";
import { I18nProvider } from "../../shared/i18n";
import { ResourceManifestCreateDialog } from "./ResourceManifestCreateDialog";

afterEach(cleanup);

describe("ResourceManifestCreateDialog", () => {
  it("requires a server dry-run and explicit force confirmation before create", async () => {
    const user = userEvent.setup();
    const start = vi.fn();
    const invalidate = vi.fn();
    const port = createPort();
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <OperationStatusStoreProvider store={operationStore(start)}>
          <ResourceManifestCreateDialog
            clusterId="cluster-1"
            namespace="shop"
            onInvalidate={invalidate}
            port={port}
          />
        </OperationStatusStoreProvider>
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "리소스 생성" }));
    expect(await screen.findByText("Deployment · apps/v1")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "생성 YAML" }), {
      target: { value: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: checkout\n" },
    });
    await user.type(screen.getByPlaceholderText("생성 또는 강제 적용 사유"), "신규 워크로드 배포");
    await user.click(screen.getByRole("checkbox", { name: "필드 소유권 충돌을 강제로 인수" }));

    expect(screen.getByRole("button", { name: "서버 Dry-run" }).hasAttribute("disabled")).toBe(true);
    await user.click(screen.getByRole("checkbox", { name: "강제 적용 위험을 확인했습니다" }));
    await user.click(screen.getByRole("button", { name: "서버 Dry-run" }));

    await waitFor(() => expect(port.dryRunCreate).toHaveBeenCalledOnce());
    expect(start).toHaveBeenCalledWith("cmd-dry-run-1");
    expect(await screen.findByText("서버 Dry-run 통과")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "검증된 리소스 생성" }));
    await waitFor(() => expect(port.createResources).toHaveBeenCalledOnce());
    expect(start).toHaveBeenCalledWith("cmd-create-1");
  });
});

function createPort(): ResourceManifestPort & ResourceManifestCreatePort {
  return {
    loadSource: vi.fn(),
    preview: vi.fn(),
    approve: vi.fn(),
    applyNow: vi.fn(),
    saveAndDeploy: vi.fn(),
    loadCreateCapability: vi.fn().mockResolvedValue({
      clusterId: "cluster-1",
      namespace: "shop",
      snapshotId: "snapshot-1",
      available: true,
      reasonCodes: [],
      maxDocuments: 100,
      maxBytes: 1_048_576,
      resources: [{
        apiVersion: "apps/v1",
        kind: "Deployment",
        resource: "deployments",
        forceSupported: true,
      }],
    }),
    dryRunCreate: vi.fn().mockResolvedValue({
      accepted: true,
      commandId: "cmd-dry-run-1",
      eventId: "event-dry-run-1",
      auditEventId: "event-dry-run-1",
      correlationId: "correlation-dry-run-1",
      status: "queued",
    }),
    createResources: vi.fn().mockResolvedValue({
      accepted: true,
      commandId: "cmd-create-1",
      eventId: "event-create-1",
      auditEventId: "event-create-1",
      correlationId: "correlation-create-1",
      status: "queued",
    }),
  };
}

function operationStore(start: (commandId: string) => void): OperationStatusStore {
  const snapshots: readonly OperationStatusSnapshot[] = [{
    commandId: "cmd-dry-run-1",
    event: {
      commandId: "cmd-dry-run-1",
      sequence: 2,
      kind: "completed",
      payload: {
        result: {
          completeness: "exact",
          desired_sha256: `sha256:${"d".repeat(64)}`,
          dry_run: true,
        },
      },
      occurredAt: "2026-07-17T00:00:00Z",
    },
    failure: null,
    retry: null,
    sequence: 2,
    status: "completed",
    updatedAt: 1,
  }];
  return {
    dispose: vi.fn(),
    getSnapshot: vi.fn(),
    getSnapshots: () => snapshots,
    reobserve: vi.fn(),
    start,
    subscribe: () => () => undefined,
    subscribeAll: () => () => undefined,
  };
}
