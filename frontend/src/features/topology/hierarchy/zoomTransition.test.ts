import { describe, expect, it } from "vitest";

import {
  classifyHierarchyZoom,
  nestLayoutRects,
  nestRect,
  projectLayoutRects,
  projectRectThroughFocus,
  scopeIdentity,
  type ZoomScope,
} from "./zoomTransition";

const fleet: ZoomScope = { level: "fleet" };
const cluster: ZoomScope = { level: "cluster", clusterKey: "cluster-a" };
const node: ZoomScope = {
  level: "node",
  clusterKey: "cluster-a",
  nodeKey: "node-a",
};

describe("classifyHierarchyZoom", () => {
  it("recognizes one-level zoom-in steps and the focused entity", () => {
    expect(classifyHierarchyZoom(fleet, cluster)).toEqual({
      direction: "in",
      focusEntityKey: "cluster-a",
    });
    expect(classifyHierarchyZoom(cluster, node)).toEqual({
      direction: "in",
      focusEntityKey: "node-a",
    });
  });

  it("recognizes one-level zoom-out steps and preserves the child focus", () => {
    expect(classifyHierarchyZoom(node, cluster)).toEqual({
      direction: "out",
      focusEntityKey: "node-a",
    });
    expect(classifyHierarchyZoom(cluster, fleet)).toEqual({
      direction: "out",
      focusEntityKey: "cluster-a",
    });
  });

  it("does not animate unrelated, skipped, or identical scopes", () => {
    expect(classifyHierarchyZoom(fleet, node)).toBeNull();
    expect(
      classifyHierarchyZoom(cluster, {
        level: "cluster",
        clusterKey: "cluster-b",
      }),
    ).toBeNull();
    expect(classifyHierarchyZoom(node, node)).toBeNull();
  });
});

describe("continuous treemap coordinates", () => {
  it("projects the focused rectangle to the complete viewport", () => {
    const focus = { x: 20, y: 25, width: 40, height: 50 };

    expect(projectRectThroughFocus(focus, focus)).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
  });

  it("moves siblings outside the viewport while the focus expands", () => {
    expect(
      projectRectThroughFocus(
        { x: 0, y: 0, width: 20, height: 25 },
        { x: 20, y: 25, width: 40, height: 50 },
      ),
    ).toEqual({ x: -50, y: -50, width: 50, height: 50 });
  });

  it("nests a child rectangle in its parent's coordinate space", () => {
    expect(
      nestRect(
        { x: 20, y: 25, width: 40, height: 50 },
        { x: 25, y: 20, width: 50, height: 60 },
      ),
    ).toEqual({ x: 30, y: 35, width: 20, height: 30 });
  });

  it("rejects projection through a zero-area focus", () => {
    expect(
      projectRectThroughFocus(
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 0, y: 0, width: 0, height: 10 },
      ),
    ).toBeNull();
  });

  it("keeps stable entity keys while projecting a complete layer", () => {
    const projected = projectLayoutRects(
      [
        { key: "cluster-a", rect: { x: 20, y: 25, width: 40, height: 50 } },
        { key: "cluster-b", rect: { x: 60, y: 25, width: 40, height: 50 } },
      ],
      "cluster-a",
    );

    expect(projected && Array.from(projected.keys())).toEqual([
      "cluster-a",
      "cluster-b",
    ]);
    expect(projected?.get("cluster-a")).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(projected?.get("cluster-b")?.x).toBe(100);
  });

  it("nests a complete child layer without changing its keys", () => {
    const nested = nestLayoutRects(
      { x: 20, y: 25, width: 40, height: 50 },
      [
        { key: "node-a", rect: { x: 0, y: 0, width: 25, height: 100 } },
        { key: "node-b", rect: { x: 25, y: 0, width: 75, height: 100 } },
      ],
    );

    expect(Array.from(nested.keys())).toEqual(["node-a", "node-b"]);
    expect(nested.get("node-b")).toEqual({
      x: 30,
      y: 25,
      width: 30,
      height: 50,
    });
  });
});

describe("scopeIdentity", () => {
  it("is stable and collision-free across hierarchy levels", () => {
    expect([scopeIdentity(fleet), scopeIdentity(cluster), scopeIdentity(node)]).toEqual([
      "fleet",
      "cluster:cluster-a",
      "node:cluster-a:node-a",
    ]);
  });
});
