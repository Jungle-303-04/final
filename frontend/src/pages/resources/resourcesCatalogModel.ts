import type { ResourceCatalogItem } from "../../features/resources/resourcesContract";
import {
  resourceTypePresentation,
  type ResourceCategoryPresentation,
} from "./resourcePresentation";

const PINNED_RESOURCE_TYPES_KEY = "opsia.resources.pinned-types.v1";

export interface CatalogGroup {
  category: ResourceCategoryPresentation;
  items: ResourceCatalogItem[];
  total: number;
}

export interface CatalogEntry {
  item: ResourceCatalogItem;
  label: string;
}

export function groupCatalog(items: ResourceCatalogItem[]): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>();
  for (const item of items) {
    const presentation = resourceTypePresentation(item.resourceType);
    const group = groups.get(presentation.category.id) ?? {
      category: presentation.category,
      items: [],
      total: 0,
    };
    group.items.push(item);
    group.total += item.count;
    groups.set(presentation.category.id, group);
  }
  return [...groups.values()]
    .sort((left, right) => left.category.order - right.category.order)
    .map((group) => ({
      ...group,
      items: [...group.items].sort((left, right) => {
        const leftPresentation = resourceTypePresentation(left.resourceType);
        const rightPresentation = resourceTypePresentation(right.resourceType);
        return leftPresentation.order - rightPresentation.order
          || left.resourceType.localeCompare(right.resourceType);
      }),
    }));
}

export function readPinnedResourceTypes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(PINNED_RESOURCE_TYPES_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export function writePinnedResourceTypes(resourceTypes: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PINNED_RESOURCE_TYPES_KEY, JSON.stringify(resourceTypes));
  } catch {
    // Storage can be unavailable in privacy contexts; the in-memory interaction still works.
  }
}

export function catalogRowId(resourceType: string, categoryId: string, favorite = false): string {
  const safeType = resourceType.replace(/[^a-zA-Z0-9_-]/g, "-");
  return favorite
    ? `resource-catalog-favorite-${safeType}`
    : `resource-catalog-${categoryId}-${safeType}`;
}
