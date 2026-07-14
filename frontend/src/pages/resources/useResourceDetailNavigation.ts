import { useEffect } from "react";

import type {
  ResourceIdentity,
  ResourceSummary,
} from "../../features/resources/resourcesContract";

export function useResourceDetailNavigation({
  active,
  current,
  items,
  onNavigate,
}: {
  active: boolean;
  current: ResourceIdentity | null;
  items: ResourceSummary[];
  onNavigate: (identity: ResourceIdentity) => void;
}) {
  useEffect(() => {
    if (!active || current === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isEditingTarget(event.target)
      ) return;
      const key = event.key.toLocaleLowerCase();
      if (key !== "j" && key !== "k") return;
      const currentIndex = items.findIndex((item) => sameIdentity(item, current));
      if (currentIndex < 0) return;
      const nextIndex = Math.max(
        0,
        Math.min(items.length - 1, currentIndex + (key === "j" ? 1 : -1)),
      );
      const next = items[nextIndex];
      if (!next || nextIndex === currentIndex) return;
      event.preventDefault();
      onNavigate(identityOf(next));
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [active, current, items, onNavigate]);
}

function sameIdentity(item: ResourceSummary, identity: ResourceIdentity): boolean {
  return item.resourceType === identity.resourceType &&
    item.kind === identity.kind &&
    item.namespace === identity.namespace &&
    item.name === identity.name;
}

function identityOf(item: ResourceSummary): ResourceIdentity {
  return {
    resourceType: item.resourceType,
    kind: item.kind,
    namespace: item.namespace,
    name: item.name,
  };
}

function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    target.matches("input, textarea, select, [contenteditable=true]");
}
