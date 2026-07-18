import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyResourceManifestNow,
  createResourceManifest,
  dryRunResourceManifestCreate,
  deployResourceManifestEdit,
  approveResourceManifestEdit,
  getResourceManifestSource,
  getResourceManifestCreateCapability,
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
        api_version: "apps/v1",
        kind: "Deployment",
        namespace: "shop",
        name: "checkout",
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

  it("posts a confirmed source-pinned direct apply with an idempotency key", async () => {
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

    await expect(applyResourceManifestNow("resource-1", {
      applicationId: "app-1",
      baseSha: "a".repeat(40),
      sourceSha256: `sha256:${"b".repeat(64)}`,
      editedYaml: SOURCE.content,
      expectedDesiredSha256: `sha256:${"c".repeat(64)}`,
      confirmation: true,
      reason: "apply reviewed manifest",
    })).resolves.toEqual(receipt);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Idempotency-Key")).toMatch(/^manifest:[0-9a-f]{8}:[0-9a-f]{32}$/u);
    expect(JSON.parse(String(init.body))).toMatchObject({
      expected_desired_sha256: `sha256:${"c".repeat(64)}`,
      confirmation: true,
      reason: "apply reviewed manifest",
    });
  });

  it("submits validation, routing, and deployment through one idempotent endpoint", async () => {
    const preview = {
      valid: true,
      changed: true,
      base_sha: "a".repeat(40),
      source_sha256: `sha256:${"b".repeat(64)}`,
      desired_sha256: `sha256:${"c".repeat(64)}`,
      diff: "+spec: {}\n",
      errors: [],
      warnings: [],
      apply_availability: "available",
      apply_reason_codes: [],
      impact: [{
        api_version: "apps/v1",
        kind: "Deployment",
        namespace: "shop",
        name: "checkout",
        selected: true,
      }],
    };
    const deployment = {
      accepted: true,
      pathway: "git",
      operation_id: "workflow-1",
      correlation_id: "correlation-1",
      current_stage: "pull_request",
      preview,
      stages: [{
        stage: "validation",
        status: "completed",
        evidence: { desired_sha256: preview.desired_sha256 },
        reason_code: null,
      }],
      command_id: null,
      event_id: "event-1",
      approval_id: "approval-1",
      pending_reason_codes: ["safe_pr_worker_pending"],
    } as const;
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(deployment), { status: 202 }),
    );

    await expect(deployResourceManifestEdit("resource-1", {
      applicationId: "app-1",
      baseSha: preview.base_sha,
      sourceSha256: preview.source_sha256,
      editedYaml: SOURCE.content,
      confirmation: true,
      reason: "",
    })).resolves.toEqual(deployment);

    expect(fetchMock.mock.calls[0][0]).toBe("/api/resource-manifests/resource-1/deploy");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get("Idempotency-Key"))
      .toMatch(/^manifest-deploy:[0-9a-f]{8}:[0-9a-f]{32}$/u);
    expect(JSON.parse(String(init.body))).toMatchObject({
      application_id: "app-1",
      confirmation: true,
      reason: "",
    });
  });

  it("discovers create capability and binds dry-run evidence to create", async () => {
    const capability = {
      cluster_id: "cluster-1",
      namespace: "shop",
      snapshot_id: "snapshot-1",
      available: true,
      reason_codes: [],
      max_documents: 100,
      max_bytes: 1_048_576,
      resources: [{
        api_version: "apps/v1",
        kind: "Deployment",
        resource: "deployments",
        force_supported: true,
      }],
    };
    const dryReceipt = {
      accepted: true,
      event_id: "event-dry-1",
      audit_event_id: "event-dry-1",
      correlation_id: "correlation-dry-1",
      command_id: "command-dry-1",
      status: "queued",
    } as const;
    const createReceipt = {
      ...dryReceipt,
      event_id: "event-create-1",
      audit_event_id: "event-create-1",
      correlation_id: "correlation-create-1",
      command_id: "command-create-1",
    };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(capability), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(dryReceipt), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(createReceipt), { status: 202 }));
    const createInput = {
      clusterId: "cluster-1",
      namespace: "shop",
      snapshotId: "snapshot-1",
      editedYaml: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: checkout\n",
      force: true,
      reason: "create checkout",
    };

    await expect(getResourceManifestCreateCapability("cluster-1", "shop"))
      .resolves.toEqual(capability);
    await expect(dryRunResourceManifestCreate(createInput)).resolves.toEqual(dryReceipt);
    await expect(createResourceManifest({
      ...createInput,
      desiredSha256: `sha256:${"d".repeat(64)}`,
      dryRunCommandId: "command-dry-1",
      confirmation: true,
      forceConfirmation: true,
    })).resolves.toEqual(createReceipt);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "/api/resource-manifests/create/capability?cluster_id=cluster-1&namespace=shop",
    );
    const dryHeaders = new Headers((fetchMock.mock.calls[1][1] as RequestInit).headers);
    expect(dryHeaders.get("Idempotency-Key")).toMatch(/^manifest-create:dry-run:/u);
    const createBody = JSON.parse(String((fetchMock.mock.calls[2][1] as RequestInit).body));
    expect(createBody).toMatchObject({
      dry_run_command_id: "command-dry-1",
      confirmation: true,
      force: true,
      force_confirmation: true,
    });
  });
});
