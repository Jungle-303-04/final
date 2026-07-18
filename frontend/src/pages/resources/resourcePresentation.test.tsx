// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  normalizeResourceKind,
  resourceKindIcon,
  resourceTypePresentation,
} from "./resourcePresentation";

afterEach(cleanup);

describe("resource topology presentation", () => {
  it.each([
    ["Deployment", "lucide-rocket"],
    ["DaemonSet", "lucide-rows-3"],
    ["StatefulSet", "lucide-database-zap"],
    ["ReplicaSet", "lucide-copy"],
    ["Workflow", "lucide-activity"],
    ["ServiceAccount", "lucide-user-cog"],
    ["ServiceMonitor", "lucide-radio"],
    ["SealedSecret", "lucide-key-round"],
    ["HTTPRoute", "lucide-globe"],
    ["Application", "lucide-git-branch"],
    ["HelmRelease", "lucide-anchor"],
    ["NodePool", "lucide-server"],
    ["KubeadmControlPlane", "lucide-shield"],
    ["VulnerabilityReport", "lucide-shield"],
    ["SbomReport", "lucide-file-search"],
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

  it.each([
    ["deployment", "resources.type.deployment"],
    ["daemonset", "resources.type.daemonset"],
    ["statefulset", "resources.type.statefulset"],
    ["replicaset", "resources.type.replicaset"],
  ])("uses translated workload labels for %s", (resourceType, labelKey) => {
    expect(resourceTypePresentation(resourceType).labelKey).toBe(labelKey);
  });
});
