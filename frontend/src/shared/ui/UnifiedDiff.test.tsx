import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  classifyUnifiedDiffLine,
  hasUnifiedDiffBodyChange,
  UnifiedDiff,
} from "./UnifiedDiff";

describe("UnifiedDiff", () => {
  it("does not misclassify file headers as body changes", () => {
    expect(classifyUnifiedDiffLine("+++ values.yaml")).toMatchObject({
      isAddition: false,
      isHeader: true,
      isRemoval: false,
      kind: "header",
    });
    expect(classifyUnifiedDiffLine("--- values.yaml")).toMatchObject({
      isAddition: false,
      isHeader: true,
      isRemoval: false,
      kind: "header",
    });
    expect(hasUnifiedDiffBodyChange("--- old\n+++ new\n@@ -1 +1 @@")).toBe(false);
    expect(hasUnifiedDiffBodyChange("--- old\n+++ new\n@@ -1 +1 @@\n-old\n+new")).toBe(true);
  });

  it("renders one shared semantic row model with optional line numbers", () => {
    const markup = renderToStaticMarkup(
      <UnifiedDiff
        aria-label="Validated diff"
        diff={"--- old\n+++ new\n@@ -1 +1 @@\n-old\n+new"}
        numbered
      />,
    );

    expect(markup).toContain('data-slot="unified-diff"');
    expect(markup).toContain('data-diff-kind="header"');
    expect(markup).toContain('data-diff-kind="removal"');
    expect(markup).toContain('data-diff-kind="addition"');
    expect(markup).toContain(">5<");
    expect(markup).toContain("bg-status-healthy/10");
    expect(markup).toContain("bg-destructive/10");
  });
});
