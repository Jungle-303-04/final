import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { GITOPS_PROVIDER_ASSETS } from "./gitOpsProviderAssets";

const SOURCE_HASHES = Object.freeze({
  argocd: "1fc1ad5fb2d385d5ded352f381ef8dc94ab6bf8b466ad87d4225ecdfce6e0c9c",
  flux: "ad60cbcee156a403dcde9ecd2b487f07ef9ca5c9e30724c8d9de5024a723406e",
});

function assetSha256(filename: string): string {
  const bytes = readFileSync(new URL(`./gitops/${filename}`, import.meta.url));
  return createHash("sha256").update(bytes).digest("hex");
}

describe("GitOps provider asset registry", () => {
  it("keeps the provider identity boundary independent of source file paths", () => {
    expect(GITOPS_PROVIDER_ASSETS).toEqual({
      argocd: expect.objectContaining({ label: "Argo CD", src: expect.any(String) }),
      flux: expect.objectContaining({ label: "Flux", src: expect.any(String) }),
    });
  });

  it("preserves the immutable upstream provider-mark bytes", () => {
    expect(assetSha256("argocd.png")).toBe(SOURCE_HASHES.argocd);
    expect(assetSha256("flux.svg")).toBe(SOURCE_HASHES.flux);
  });
});
