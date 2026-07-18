// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ResourceManifestPort } from "../../features/resources/resourceManifestContract";
import {
  OperationStatusStoreProvider,
  type OperationStatusStore,
} from "../../features/operations/OperationStatusStore";
import { I18nProvider } from "../../shared/i18n";
import { POD_DETAIL } from "./ResourcesPage.testFixtures";
import { ResourceManifestEditor } from "./ResourceManifestEditor";

afterEach(cleanup);

describe("ResourceManifestEditor", () => {
  it("announces loading with the shared reduced-motion-safe spinner", async () => {
    const user = userEvent.setup();
    const source = deferred<Awaited<ReturnType<ResourceManifestPort["loadSource"]>>>();
    const port: ResourceManifestPort = {
      loadSource: vi.fn().mockReturnValue(source.promise),
      preview: vi.fn(),
      approve: vi.fn(),
      applyNow: vi.fn(),
    };
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourceManifestEditor detail={POD_DETAIL} port={port} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "YAML 편집" }));

    const status = await screen.findByRole("status");
    const spinner = status.querySelector<HTMLElement>("[data-slot=spinner]");
    expect(spinner?.getAttribute("aria-hidden")).toBe("true");
    expect(spinner?.classList.contains("motion-safe:animate-spin")).toBe(true);
    expect(spinner?.classList.contains("motion-reduce:animate-none")).toBe(true);
  });

  it("loads Git YAML, validates an exact diff, and requires a human approval reason", async () => {
    const user = userEvent.setup();
    const sourceYaml = "apiVersion: v1\nkind: Pod\nmetadata:\n  name: checkout-api-0\n  namespace: shop\nspec:\n  restartPolicy: Always\n";
    const port: ResourceManifestPort = {
      loadSource: vi.fn().mockResolvedValue({
        resourceId: POD_DETAIL.resource.inventoryKey,
        status: "available",
        choices: [],
        selected: {
          applicationId: "app-1",
          applicationName: "checkout",
          repositoryRef: "project/checkout",
          branch: "main",
          manifestPath: "deploy/app.yaml",
          environment: "staging",
        },
        baseSha: "a".repeat(40),
        sourceSha256: `sha256:${"b".repeat(64)}`,
        content: sourceYaml,
        reason: null,
      }),
      preview: vi.fn().mockResolvedValue({
        valid: true,
        changed: true,
        baseSha: "a".repeat(40),
        sourceSha256: `sha256:${"b".repeat(64)}`,
        desiredSha256: `sha256:${"c".repeat(64)}`,
        diff: "-  restartPolicy: Always\n+  restartPolicy: Never\n",
        errors: [],
        warnings: [],
        applyAvailability: "available",
        applyReasonCodes: [],
        impact: [{
          apiVersion: "v1",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-0",
          selected: true,
        }],
      }),
      approve: vi.fn().mockResolvedValue({
        correlationId: "correlation-1",
        workflowRunId: "workflow-1",
        approvalId: "approval-1",
        syncState: "awaiting-pr-merge",
      }),
      applyNow: vi.fn().mockResolvedValue({
        accepted: true,
        commandId: "cmd-manifest-1",
        eventId: "event-manifest-1",
        auditEventId: "event-manifest-1",
        correlationId: "correlation-manifest-1",
        status: "queued",
      }),
    };
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourceManifestEditor detail={POD_DETAIL} port={port} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "YAML 편집" }));
    const editor = await screen.findByRole("textbox", { name: "YAML 원문" });
    expect(editor.getAttribute("autocapitalize")).toBe("off");
    expect(editor.getAttribute("autocorrect")).toBe("off");
    expect(editor.getAttribute("spellcheck")).toBe("false");
    fireEvent.change(editor, { target: { value: sourceYaml.replace("Always", "Never") } });
    await user.click(screen.getByRole("button", { name: "검증 및 diff" }));
    expect(await screen.findByText("승인 준비 완료")).toBeTruthy();
    expect(screen.getAllByText(/restartPolicy: Never/u).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-slot="unified-diff"]')).toBeTruthy();
    expect(document.querySelector('[data-diff-kind="removal"]')).toBeTruthy();
    expect(document.querySelector('[data-diff-kind="addition"]')).toBeTruthy();
    expect(screen.getByText("Pod/checkout-api-0")).toBeTruthy();

    const approve = screen.getByRole("button", { name: "Safe PR 승인" });
    expect(screen.getByRole("button", { name: "지금 적용" })).toBeTruthy();
    expect(approve.hasAttribute("disabled")).toBe(true);
    await user.type(screen.getByPlaceholderText("이 매니페스트 변경을 적용하는 이유"), "운영 정책 반영");
    expect(approve.hasAttribute("disabled")).toBe(false);
    await user.click(approve);

    await waitFor(() => expect(port.approve).toHaveBeenCalledOnce());
    expect(await screen.findByText("Safe PR 워크플로 수락")).toBeTruthy();
    expect(screen.getByText(/PR 검토·병합 후에만/u)).toBeTruthy();
  });

  it("starts the common operation stream only after direct apply is accepted", async () => {
    const user = userEvent.setup();
    const sourceYaml = "apiVersion: v1\nkind: Pod\nmetadata:\n  name: checkout-api-0\n  namespace: shop\nspec:\n  restartPolicy: Always\n";
    const start = vi.fn();
    const store = operationStore(start);
    const port: ResourceManifestPort = {
      loadSource: vi.fn().mockResolvedValue({
        resourceId: POD_DETAIL.resource.inventoryKey,
        status: "available",
        choices: [],
        selected: {
          applicationId: "app-1",
          applicationName: "checkout",
          repositoryRef: "project/checkout",
          branch: "main",
          manifestPath: "deploy/app.yaml",
          environment: "staging",
        },
        baseSha: "a".repeat(40),
        sourceSha256: `sha256:${"b".repeat(64)}`,
        content: sourceYaml,
        reason: null,
      }),
      preview: vi.fn().mockResolvedValue({
        valid: true,
        changed: true,
        baseSha: "a".repeat(40),
        sourceSha256: `sha256:${"b".repeat(64)}`,
        desiredSha256: `sha256:${"c".repeat(64)}`,
        diff: "+  restartPolicy: Never\n",
        errors: [],
        warnings: [],
        applyAvailability: "available",
        applyReasonCodes: [],
        impact: [{
          apiVersion: "v1",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-0",
          selected: true,
        }],
      }),
      approve: vi.fn(),
      applyNow: vi.fn().mockResolvedValue({
        accepted: true,
        commandId: "cmd-manifest-1",
        eventId: "event-manifest-1",
        auditEventId: "event-manifest-1",
        correlationId: "correlation-manifest-1",
        status: "queued",
      }),
    };
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <OperationStatusStoreProvider store={store}>
          <ResourceManifestEditor detail={POD_DETAIL} port={port} />
        </OperationStatusStoreProvider>
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "YAML 편집" }));
    fireEvent.change(await screen.findByRole("textbox", { name: "YAML 원문" }), {
      target: { value: sourceYaml.replace("Always", "Never") },
    });
    await user.click(screen.getByRole("button", { name: "검증 및 diff" }));
    await user.type(screen.getByPlaceholderText("이 매니페스트 변경을 적용하는 이유"), "즉시 반영 필요");
    await user.click(screen.getByRole("button", { name: "지금 적용" }));

    await waitFor(() => expect(port.applyNow).toHaveBeenCalledOnce());
    expect(start).toHaveBeenCalledWith("cmd-manifest-1");
    expect(await screen.findByText("클러스터 적용 접수")).toBeTruthy();
  });

  it("edits an agent-observed live source without offering a fake Safe PR", async () => {
    const user = userEvent.setup();
    const sourceYaml = "apiVersion: v1\nkind: Pod\nmetadata:\n  name: checkout-api-0\n  namespace: shop\nspec:\n  restartPolicy: Always\n";
    const port: ResourceManifestPort = {
      loadSource: vi.fn().mockResolvedValue({
        resourceId: POD_DETAIL.resource.inventoryKey,
        status: "available",
        choices: [],
        selected: null,
        baseSha: "a".repeat(64),
        sourceSha256: `sha256:${"b".repeat(64)}`,
        content: sourceYaml,
        reason: null,
      }),
      preview: vi.fn().mockResolvedValue({
        valid: true,
        changed: true,
        baseSha: "a".repeat(64),
        sourceSha256: `sha256:${"b".repeat(64)}`,
        desiredSha256: `sha256:${"c".repeat(64)}`,
        diff: "+  restartPolicy: Never\n",
        errors: [],
        warnings: [],
        applyAvailability: "available",
        applyReasonCodes: [],
        impact: [{
          apiVersion: "v1",
          kind: "Pod",
          namespace: "shop",
          name: "checkout-api-0",
          selected: true,
        }],
      }),
      approve: vi.fn(),
      applyNow: vi.fn(),
    };
    render(
      <I18nProvider navigatorLanguage="ko-KR" storage={null}>
        <ResourceManifestEditor detail={POD_DETAIL} port={port} />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "YAML 편집" }));
    expect(await screen.findByText("에이전트 관측 라이브 원문")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "YAML 원문" }), {
      target: { value: sourceYaml.replace("Always", "Never") },
    });
    await user.click(screen.getByRole("button", { name: "검증 및 diff" }));

    expect(await screen.findByRole("button", { name: "지금 적용" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Safe PR 승인" })).toBeNull();
    expect(port.preview).toHaveBeenCalledWith(
      POD_DETAIL.resource.inventoryKey,
      expect.objectContaining({ applicationId: null }),
    );
  });
});

function operationStore(start: (commandId: string) => void): OperationStatusStore {
  const snapshots: ReturnType<OperationStatusStore["getSnapshots"]> = [];
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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
