// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiveResourceManifestEditor } from "./resourceManifestEditor";

const SOURCE_YAML = "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: checkout-api\n  namespace: shop\nspec:\n  replicas: 2\n";

const SOURCE = {
  resource_id: "pod-1",
  status: "available",
  choices: [],
  selected: {
    application_id: "app-1",
    application_name: "checkout",
    repository_ref: "project/checkout",
    branch: "main",
    manifest_path: "deploy/checkout.yaml",
    environment: "staging",
  },
  base_sha: "a".repeat(40),
  source_sha256: `sha256:${"b".repeat(64)}`,
  content: SOURCE_YAML,
  reason: null,
  live_yaml: "apiVersion: v1\nkind: Pod\nmetadata:\n  name: checkout-api-7b9\n",
  live_observed_at: "2026-07-22T09:00:00+00:00",
  live_reason: null,
  edit_target: {
    resource_id: "deployment-1",
    relationship: "owner",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout-api",
  },
} as const;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LiveResourceManifestEditor", () => {
  it("keeps observed Pod YAML read-only and edits the exact Git owner source", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(SOURCE), { status: 200 }),
    );

    render(<LiveResourceManifestEditor resourceId="pod-1" />);

    const live = await screen.findByRole("textbox", { name: "Live YAML" });
    const git = screen.getByRole("textbox", { name: "Git YAML 원본 편집기" });
    expect(live.hasAttribute("readonly")).toBe(true);
    expect(live.textContent ?? (live as HTMLTextAreaElement).value).toContain("kind: Pod");
    expect(git.hasAttribute("readonly")).toBe(false);
    expect((git as HTMLTextAreaElement).value).toContain("kind: Deployment");
    expect(screen.getByText("Owner Deployment/checkout-api")).toBeTruthy();
  });

  it("records the exact Safe PR artifact before queuing emergency owner apply", async () => {
    const user = userEvent.setup();
    const desired = SOURCE_YAML.replace("replicas: 2", "replicas: 3");
    const preview = {
      valid: true,
      changed: true,
      base_sha: SOURCE.base_sha,
      source_sha256: SOURCE.source_sha256,
      desired_sha256: `sha256:${"c".repeat(64)}`,
      diff: "-  replicas: 2\n+  replicas: 3\n",
      errors: [],
      warnings: [],
      apply_availability: "available",
      apply_reason_codes: [],
      impact: [{
        api_version: "apps/v1",
        kind: "Deployment",
        namespace: "shop",
        name: "checkout-api",
        selected: true,
      }],
    };
    const approval = {
      accepted: true,
      event_id: "event-pr-1",
      correlation_id: "correlation-pr-1",
      workflow_run_id: "workflow-1",
      approval_id: "approval-1",
      sync_state: "awaiting_pr_merge",
    };
    const receipt = {
      accepted: true,
      event_id: "event-apply-1",
      audit_event_id: "event-apply-1",
      correlation_id: "correlation-apply-1",
      command_id: "command-apply-1",
      status: "queued",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(SOURCE), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(approval), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(receipt), { status: 202 }));

    render(<LiveResourceManifestEditor resourceId="pod-1" />);
    const editor = await screen.findByRole("textbox", { name: "Git YAML 원본 편집기" });
    fireEvent.change(editor, { target: { value: desired } });
    await user.click(screen.getByRole("button", { name: "변경 검증·미리보기" }));
    await user.type(await screen.findByRole("textbox", { name: "변경 사유" }), "긴급 용량 조정");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Git 기록 후 긴급 적용" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(fetchMock.mock.calls[2][0]).toBe("/api/resource-manifests/pod-1/approve");
    expect(fetchMock.mock.calls[3][0]).toBe("/api/resource-manifests/pod-1/apply");
    const approvedBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    const appliedBody = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body));
    expect(approvedBody.edited_yaml).toBe(desired);
    expect(appliedBody.edited_yaml).toBe(desired);
    expect(await screen.findByText("Git artifact 기록 · PR pending")).toBeTruthy();
    expect(screen.getByText("Owner controller 적용 명령 접수")).toBeTruthy();
  });
});
