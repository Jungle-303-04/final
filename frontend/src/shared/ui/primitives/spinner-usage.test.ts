import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedSurfaces = [
  "../../../features/global-filter/UnifiedFilterBar.tsx",
  "../../../features/issues/IssuesPanels.tsx",
  "../../../features/issues/IssuesSurface.tsx",
  "../../../pages/clusters/ClusterConnectDialog.tsx",
  "../../../pages/clusters/ClusterConnectDialogParts.tsx",
  "../../../pages/gitops/DeploymentTargetDialog.tsx",
] as const;

describe("shared spinner usage", () => {
  it("forbids raw spin animation in audited product surfaces", () => {
    for (const relativePath of auditedSurfaces) {
      const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
      expect(source).not.toMatch(/(?<!motion-safe:)animate-spin/);
    }
  });
});
