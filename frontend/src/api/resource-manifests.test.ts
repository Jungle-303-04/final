import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveResourceManifestEdit,
  applyResourceManifestEdit,
  getResourceManifestSource,
  previewResourceManifestEdit,
} from "./resource-manifests";

const SOURCE = {
  resource_id: "pod:cluster-1/shop/checkout-api",
  status: "available",
  choices: [{
    application_id: "app-1",
    application_name: "checkout",
    repository_ref: "project/checkout",
    branch: "main",
    manifest_path: "deploy/app.yaml",
    environment: "staging",
  }],
  selected: {
    application_id: "app-1",
    application_name: "checkout",
    repository_ref: "project/checkout",
    branch: "main",
    manifest_path: "deploy/app.yaml",
    environment: "staging",
  },
  base_sha: "a".repeat(40),
  source_sha256: `sha256:${"b".repeat(64)}`,
  content: "apiVersion: v1\nkind: Pod\nmetadata: {name: checkout-api}\n",
  reason: null,
  live_yaml: "apiVersion: v1\nkind: Pod\nmetadata: {name: checkout-api-7b9}\n",
  live_observed_at: "2026-07-22T09:00:00+00:00",
  live_reason: null,
  edit_target: {
    resource_id: "deployment:cluster-1/shop/checkout-api",
    relationship: "owner",
    kind: "Deployment",
    namespace: "shop",
    name: "checkout-api",
  },
} as const;

describe("resource manifest API", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads an exact application source with encoded resource identity", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(SOURCE), { status: 200 }),
    );

    await expect(getResourceManifestSource("pod:cluster-1/shop/checkout", "app-1"))
      .resolves.toEqual(SOURCE);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/resource-manifests/pod%3Acluster-1%2Fshop%2Fcheckout?application_id=app-1",
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("normalizes live projection fields omitted by a rolling backend deployment", async () => {
    const { live_yaml, live_observed_at, live_reason, edit_target, ...legacySource } = SOURCE;
    void live_yaml;
    void live_observed_at;
    void live_reason;
    void edit_target;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(legacySource), { status: 200 }),
    );

    await expect(getResourceManifestSource("resource-1")).resolves.toMatchObject({
      ...legacySource,
      live_yaml: null,
      live_observed_at: null,
      live_reason: null,
      edit_target: null,
    });
  });

  it("posts preview and human approval through the CSRF-protected boundary", async () => {
    const input = {
      applicationId: "app-1",
      baseSha: "a".repeat(40),
      sourceSha256: `sha256:${"b".repeat(64)}`,
      editedYaml: SOURCE.content.replace("kind: Pod", "kind: Pod\nspec: {}"),
    };
    const preview = {
      valid: true,
      changed: true,
      base_sha: input.baseSha,
      source_sha256: input.sourceSha256,
      desired_sha256: `sha256:${"c".repeat(64)}`,
      diff: "+spec: {}\n",
      errors: [],
      warnings: [],
      apply_availability: "available",
      apply_reason_codes: [],
      impact: [{
        api_version: "v1",
        kind: "Pod",
        namespace: "shop",
        name: "checkout-api",
        selected: true,
      }],
    };
    const approval = {
      accepted: true,
      event_id: "event-1",
      correlation_id: "correlation-1",
      workflow_run_id: "workflow-1",
      approval_id: "approval-1",
      sync_state: "awaiting_pr_merge",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(preview), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(approval), { status: 200 }));

    await expect(previewResourceManifestEdit("resource-1", input)).resolves.toEqual(preview);
    await expect(approveResourceManifestEdit("resource-1", {
      ...input,
      confirmed: true,
      reason: "increase capacity",
    })).resolves.toEqual(approval);

    const previewInit = fetchMock.mock.calls[0][1] as RequestInit;
    const approveInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(new Headers(previewInit.headers).get("x-service-csrf")).toBe("same-origin");
    expect(JSON.parse(String(approveInit.body))).toMatchObject({
      application_id: "app-1",
      confirmed: true,
      reason: "increase capacity",
    });
  });

  it("queues an explicitly confirmed direct apply with idempotency and CSRF", async () => {
    const receipt = {
      accepted: true,
      event_id: "event-apply-1",
      audit_event_id: "event-apply-1",
      correlation_id: "correlation-apply-1",
      command_id: "command-apply-1",
      status: "queued",
    } as const;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(receipt), { status: 202 }),
    );

    await expect(applyResourceManifestEdit("resource-1", {
      applicationId: "app-1",
      baseSha: "a".repeat(40),
      sourceSha256: `sha256:${"b".repeat(64)}`,
      editedYaml: SOURCE.content,
      expectedDesiredSha256: `sha256:${"c".repeat(64)}`,
      confirmation: true,
      reason: "apply inspected change",
      idempotencyKey: "manifest-apply-test-1",
    })).resolves.toEqual(receipt);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/resource-manifests/resource-1/apply");
    expect(headers.get("idempotency-key")).toBe("manifest-apply-test-1");
    expect(headers.get("x-service-csrf")).toBe("same-origin");
    expect(JSON.parse(String(init.body))).toMatchObject({
      expected_desired_sha256: `sha256:${"c".repeat(64)}`,
      confirmation: true,
      reason: "apply inspected change",
    });
  });
});
