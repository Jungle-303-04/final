import { describe, expect, it, vi } from "vitest";

import { createResourceManifestAdapter } from "./createResourceManifestAdapter";

describe("resource manifest adapter", () => {
  it("maps source, diff, and Safe PR receipt without inventing sync completion", async () => {
    const getResourceManifestSource = vi.fn().mockResolvedValue({
      resource_id: "resource-1",
      status: "available",
      choices: [],
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
      content: "kind: Deployment\n",
      reason: null,
    });
    const previewResourceManifestEdit = vi.fn().mockResolvedValue({
      valid: true,
      changed: true,
      base_sha: "a".repeat(40),
      source_sha256: `sha256:${"b".repeat(64)}`,
      desired_sha256: `sha256:${"c".repeat(64)}`,
      diff: "+spec: {}\n",
      errors: [],
      warnings: ["Safe PR only"],
      apply_availability: "available",
      apply_reason_codes: [],
      impact: [{
        api_version: "apps/v1",
        kind: "Deployment",
        namespace: "shop",
        name: "checkout-api",
        selected: true,
      }],
    });
    const approveResourceManifestEdit = vi.fn().mockResolvedValue({
      accepted: true,
      event_id: "event-1",
      correlation_id: "correlation-1",
      workflow_run_id: "workflow-1",
      approval_id: "approval-1",
      sync_state: "awaiting_pr_merge",
    });
    const applyResourceManifestNow = vi.fn().mockResolvedValue({
      accepted: true,
      command_id: "cmd-1",
      event_id: "event-command-1",
      audit_event_id: "event-command-1",
      correlation_id: "correlation-command-1",
      status: "queued",
    });
    const deployResourceManifestEdit = vi.fn().mockResolvedValue({
      accepted: true,
      pathway: "git",
      operation_id: "event-yaml-1",
      workflow_run_id: "workflow-1",
      correlation_id: "correlation-1",
      current_stage: "commit",
      preview: await previewResourceManifestEdit(),
      stages: [{
        stage: "validation",
        status: "completed",
        evidence: { desired_sha256: `sha256:${"c".repeat(64)}` },
        reason_code: null,
      }],
      command_id: "event-yaml-1",
      event_id: "event-1",
      approval_id: "approval-1",
      pending_reason_codes: [],
    });
    previewResourceManifestEdit.mockClear();
    const getResourceManifestCreateCapability = vi.fn().mockResolvedValue({
      cluster_id: "cluster-1",
      namespace: "shop",
      snapshot_id: "snapshot-1",
      available: true,
      reason_codes: [],
      max_documents: 100,
      max_bytes: 1_048_576,
      resources: [{ api_version: "apps/v1", kind: "Deployment", resource: "deployments", force_supported: true }],
    });
    const dryRunResourceManifestCreate = vi.fn().mockResolvedValue({
      accepted: true,
      command_id: "cmd-dry-run-1",
      event_id: "event-dry-run-1",
      audit_event_id: "event-dry-run-1",
      correlation_id: "correlation-dry-run-1",
      status: "queued",
    });
    const createResourceManifest = vi.fn().mockResolvedValue({
      accepted: true,
      command_id: "cmd-create-1",
      event_id: "event-create-1",
      audit_event_id: "event-create-1",
      correlation_id: "correlation-create-1",
      status: "queued",
    });
    const port = createResourceManifestAdapter({
      approveResourceManifestEdit,
      applyResourceManifestNow,
      createResourceManifest,
      dryRunResourceManifestCreate,
      deployResourceManifestEdit,
      getResourceManifestSource,
      getResourceManifestCreateCapability,
      previewResourceManifestEdit,
    });
    const input = {
      applicationId: "app-1",
      baseSha: "a".repeat(40),
      sourceSha256: `sha256:${"b".repeat(64)}`,
      editedYaml: "kind: Deployment\nspec: {}\n",
    };

    await expect(port.loadSource("resource-1")).resolves.toMatchObject({
      resourceId: "resource-1",
      selected: { applicationId: "app-1", manifestPath: "deploy/app.yaml" },
    });
    await expect(port.preview("resource-1", input)).resolves.toMatchObject({
      valid: true,
      diff: "+spec: {}\n",
    });
    await expect(port.saveAndDeploy("resource-1", { ...input, reason: "" }))
      .resolves.toMatchObject({
        pathway: "git",
        operationId: "event-yaml-1",
        workflowRunId: "workflow-1",
        currentStage: "commit",
        stages: [{
          stage: "validation",
          status: "completed",
          evidence: { desired_sha256: `sha256:${"c".repeat(64)}` },
        }],
      });
    expect(deployResourceManifestEdit).toHaveBeenCalledWith(
      "resource-1",
      expect.objectContaining({ confirmation: true, reason: "" }),
      undefined,
    );
    await expect(port.approve("resource-1", { ...input, reason: "approved" }))
      .resolves.toEqual({
        correlationId: "correlation-1",
        workflowRunId: "workflow-1",
        approvalId: "approval-1",
        syncState: "awaiting-pr-merge",
      });
    expect(approveResourceManifestEdit).toHaveBeenCalledWith(
      "resource-1",
      expect.objectContaining({ confirmed: true, reason: "approved" }),
      undefined,
    );
    await expect(port.applyNow("resource-1", {
      ...input,
      desiredSha256: `sha256:${"c".repeat(64)}`,
      reason: "apply now",
    })).resolves.toMatchObject({ commandId: "cmd-1", status: "queued" });
    expect(applyResourceManifestNow).toHaveBeenCalledWith(
      "resource-1",
      expect.objectContaining({
        confirmation: true,
        expectedDesiredSha256: `sha256:${"c".repeat(64)}`,
      }),
      undefined,
    );
    await expect(port.loadCreateCapability("cluster-1", "shop")).resolves.toMatchObject({
      available: true,
      resources: [{ apiVersion: "apps/v1", kind: "Deployment", forceSupported: true }],
    });
    await expect(port.dryRunCreate({
      clusterId: "cluster-1",
      namespace: "shop",
      snapshotId: "snapshot-1",
      editedYaml: "kind: Deployment",
      force: false,
      reason: "validate",
    })).resolves.toMatchObject({ commandId: "cmd-dry-run-1" });
    await expect(port.createResources({
      clusterId: "cluster-1",
      namespace: "shop",
      snapshotId: "snapshot-1",
      editedYaml: "kind: Deployment",
      desiredSha256: `sha256:${"d".repeat(64)}`,
      dryRunCommandId: "cmd-dry-run-1",
      force: true,
      forceConfirmation: true,
      reason: "create",
    })).resolves.toMatchObject({ commandId: "cmd-create-1" });
  });
});
