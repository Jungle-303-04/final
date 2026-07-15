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
    });
    const approveResourceManifestEdit = vi.fn().mockResolvedValue({
      accepted: true,
      event_id: "event-1",
      correlation_id: "correlation-1",
      workflow_run_id: "workflow-1",
      approval_id: "approval-1",
      sync_state: "awaiting_pr_merge",
    });
    const port = createResourceManifestAdapter({
      approveResourceManifestEdit,
      getResourceManifestSource,
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
  });
});
