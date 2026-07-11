import type { LayoutRect } from "./layout";

export type ZoomScope =
  | { readonly level: "fleet" }
  | { readonly level: "cluster"; readonly clusterKey: string }
  | {
      readonly level: "node";
      readonly clusterKey: string;
      readonly nodeKey: string;
    };

export type HierarchyZoom = {
  readonly direction: "in" | "out";
  readonly focusEntityKey: string;
};

export type KeyedRect = {
  readonly key: string;
  readonly rect: LayoutRect;
};

export function scopeIdentity(scope: ZoomScope): string {
  if (scope.level === "fleet") return "fleet";
  if (scope.level === "cluster") return `cluster:${scope.clusterKey}`;
  return `node:${scope.clusterKey}:${scope.nodeKey}`;
}

export function classifyHierarchyZoom(
  from: ZoomScope,
  to: ZoomScope,
): HierarchyZoom | null {
  if (from.level === "fleet" && to.level === "cluster") {
    return { direction: "in", focusEntityKey: to.clusterKey };
  }

  if (
    from.level === "cluster" &&
    to.level === "node" &&
    from.clusterKey === to.clusterKey
  ) {
    return { direction: "in", focusEntityKey: to.nodeKey };
  }

  if (
    from.level === "node" &&
    to.level === "cluster" &&
    from.clusterKey === to.clusterKey
  ) {
    return { direction: "out", focusEntityKey: from.nodeKey };
  }

  if (from.level === "cluster" && to.level === "fleet") {
    return { direction: "out", focusEntityKey: from.clusterKey };
  }

  return null;
}

export function projectRectThroughFocus(
  rect: LayoutRect,
  focus: LayoutRect,
): LayoutRect | null {
  if (focus.width <= 0 || focus.height <= 0) return null;

  return {
    x: ((rect.x - focus.x) / focus.width) * 100,
    y: ((rect.y - focus.y) / focus.height) * 100,
    width: (rect.width / focus.width) * 100,
    height: (rect.height / focus.height) * 100,
  };
}

export function nestRect(parent: LayoutRect, child: LayoutRect): LayoutRect {
  return {
    x: parent.x + (child.x / 100) * parent.width,
    y: parent.y + (child.y / 100) * parent.height,
    width: (child.width / 100) * parent.width,
    height: (child.height / 100) * parent.height,
  };
}

export function projectLayoutRects(
  items: readonly KeyedRect[],
  focusEntityKey: string,
): ReadonlyMap<string, LayoutRect> | null {
  const focus = items.find((item) => item.key === focusEntityKey)?.rect;
  if (focus === undefined) return null;

  const projected = new Map<string, LayoutRect>();
  for (const item of items) {
    const rect = projectRectThroughFocus(item.rect, focus);
    if (rect === null) return null;
    projected.set(item.key, rect);
  }
  return projected;
}

export function nestLayoutRects(
  parent: LayoutRect,
  items: readonly KeyedRect[],
): ReadonlyMap<string, LayoutRect> {
  return new Map(
    items.map((item) => [item.key, nestRect(parent, item.rect)] as const),
  );
}
