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
      saveAndDeploy: vi.fn(),
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

  it("submits one server-owned Git deployment request and renders its exact diff and stages", async () => {
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
      preview: vi.fn(),
      approve: vi.fn(),
      applyNow: vi.fn(),
      saveAndDeploy: vi.fn().mockResolvedValue(deployment("git")),
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
    const approve = screen.getByRole("button", { name: "저장 및 배포" });
    expect(screen.queryByRole("button", { name: "Safe PR 승인" })).toBeNull();
    expect(screen.queryByRole("button", { name: "지금 적용" })).toBeNull();
    expect(approve.hasAttribute("disabled")).toBe(false);
    await user.click(approve);

    await waitFor(() => expect(port.saveAndDeploy).toHaveBeenCalledOnce());
    expect(port.preview).not.toHaveBeenCalled();
    expect(port.approve).not.toHaveBeenCalled();
    expect(port.applyNow).not.toHaveBeenCalled();
    expect(screen.getAllByText(/restartPolicy: Never/u).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-slot="unified-diff"]')).toBeTruthy();
    expect(document.querySelector('[data-diff-kind="removal"]')).toBeTruthy();
    expect(document.querySelector('[data-diff-kind="addition"]')).toBeTruthy();
    expect(screen.getByText("Pod/checkout-api-0")).toBeTruthy();
    expect(await screen.findByText("보호된 Git 워크플로")).toBeTruthy();
    expect(screen.getAllByText("Pull Request").length).toBeGreaterThan(0);
    expect(document.querySelector('[data-slot="sheet-content"]')).toBeTruthy();
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
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
        selected: null,
        baseSha: "a".repeat(40),
        sourceSha256: `sha256:${"b".repeat(64)}`,
        content: sourceYaml,
        reason: null,
      }),
      preview: vi.fn(),
      approve: vi.fn(),
      applyNow: vi.fn(),
      saveAndDeploy: vi.fn().mockResolvedValue(deployment("agent")),
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
    await user.click(screen.getByRole("button", { name: "저장 및 배포" }));

    await waitFor(() => expect(port.saveAndDeploy).toHaveBeenCalledOnce());
    expect(port.preview).not.toHaveBeenCalled();
    expect(port.approve).not.toHaveBeenCalled();
    expect(port.applyNow).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith("cmd-manifest-1");
    expect(await screen.findByText("Outbound 에이전트")).toBeTruthy();
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
      preview: vi.fn(),
      approve: vi.fn(),
      applyNow: vi.fn(),
      saveAndDeploy: vi.fn().mockResolvedValue(deployment("agent", 64)),
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
    await user.click(await screen.findByRole("button", { name: "저장 및 배포" }));

    expect(screen.queryByRole("button", { name: "Safe PR 승인" })).toBeNull();
    expect(screen.queryByRole("button", { name: "지금 적용" })).toBeNull();
    expect(port.preview).not.toHaveBeenCalled();
    expect(port.saveAndDeploy).toHaveBeenCalledWith(
      POD_DETAIL.resource.inventoryKey,
      expect.objectContaining({ applicationId: null, reason: "" }),
      expect.any(AbortSignal),
    );
  });
});

function deployment(pathway: "git" | "agent", baseLength = 40) {
  const preview = {
    valid: true,
    changed: true,
    baseSha: "a".repeat(baseLength),
    sourceSha256: `sha256:${"b".repeat(64)}`,
    desiredSha256: `sha256:${"c".repeat(64)}`,
    diff: "-  restartPolicy: Always\n+  restartPolicy: Never\n",
    errors: [],
    warnings: [],
    applyAvailability: "available" as const,
    applyReasonCodes: [],
    impact: [{
      apiVersion: "v1",
      kind: "Pod",
      namespace: "shop",
      name: "checkout-api-0",
      selected: true,
    }],
  };
  return {
    accepted: true,
    pathway,
    operationId: pathway === "git" ? "event-yaml-1" : "cmd-manifest-1",
    workflowRunId: pathway === "git" ? "workflow-1" : null,
    correlationId: "correlation-manifest-1",
    currentStage: pathway === "git" ? "pull_request" as const : "rollout" as const,
    preview,
    stages: [
      { stage: "validation" as const, status: "completed" as const, evidence: {}, reasonCode: null },
      { stage: "commit" as const, status: pathway === "git" ? "pending" as const : "unavailable" as const, evidence: {}, reasonCode: null },
      { stage: "pull_request" as const, status: pathway === "git" ? "accepted" as const : "unavailable" as const, evidence: {}, reasonCode: null },
      { stage: "merge" as const, status: pathway === "git" ? "pending" as const : "unavailable" as const, evidence: {}, reasonCode: null },
      { stage: "sync" as const, status: pathway === "git" ? "pending" as const : "unavailable" as const, evidence: {}, reasonCode: null },
      { stage: "rollout" as const, status: pathway === "agent" ? "accepted" as const : "pending" as const, evidence: {}, reasonCode: null },
      { stage: "done" as const, status: "pending" as const, evidence: {}, reasonCode: null },
    ],
    commandId: pathway === "git" ? "event-yaml-1" : "cmd-manifest-1",
    eventId: "event-manifest-1",
    approvalId: pathway === "git" ? "approval-1" : null,
    pendingReasonCodes: [],
  };
}

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
