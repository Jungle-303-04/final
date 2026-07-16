// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { normalizeResourceKind, resourceKindIcon } from "./resourcePresentation";

afterEach(cleanup);

describe("resource topology presentation", () => {
  it.each([
    ["Workflow", "lucide-workflow"],
    ["WorkflowTemplate", "lucide-file-text"],
    ["ClusterWorkflowTemplate", "lucide-file-text"],
    ["CronWorkflow", "lucide-clock-3"],
    ["ServiceAccount", "lucide-id-card"],
    ["ServiceMonitor", "lucide-monitor-dot"],
    ["SealedSecret", "lucide-lock-keyhole"],
  ])("uses the shared icon registry for %s", (kind, className) => {
    const Icon = resourceKindIcon(kind);
    const { container } = render(createElement(Icon, { "aria-hidden": true }));
    expect(container.querySelector(`.${className}`)).toBeTruthy();
  });

  it("normalizes API kind syntax and keeps unknown CRDs on the neutral fallback", () => {
    expect(normalizeResourceKind("  example.io/My-Widget ")).toBe("exampleiomywidget");
    const UnknownIcon = resourceKindIcon("example.io/My-Widget");
    const { container } = render(createElement(UnknownIcon, { "aria-hidden": true }));
    expect(container.querySelector(".lucide-puzzle")).toBeTruthy();
  });
});
