import { existsSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("provider identity boundary", () => {
  it("keeps the active icon source and rejects the retired duplicate GitOps registry", () => {
    expect(existsSync(new URL("../../devpreview/brandIcons.tsx", import.meta.url))).toBe(true);

    for (const relativePath of [
      "./gitOpsProviderAssets.ts",
      "./gitOpsProviderAssets.test.ts",
      "./gitops/argocd.png",
      "./gitops/flux.svg",
    ]) {
      expect(existsSync(new URL(relativePath, import.meta.url)), relativePath).toBe(false);
    }
  });
});
