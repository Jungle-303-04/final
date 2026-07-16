import type { ResourceCatalogItem } from "../../features/resources/resourcesContract";
import { Pin, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useMotionAwareScrollIntoView } from "../../motion/scrollIntoView";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import { ScrollArea } from "../../shared/ui/primitives/scroll-area";
import { TooltipProvider } from "../../shared/ui/primitives/tooltip";
import { Surface } from "../../shared/ui/Surface";
import { resourceTypePresentation } from "./resourcePresentation";
import { CatalogDisclosure, CatalogItemRow } from "./ResourcesCatalogParts";
import {
  catalogRowId,
  groupCatalog,
  readPinnedResourceTypes,
  writePinnedResourceTypes,
  type CatalogEntry,
} from "./resourcesCatalogModel";

export function ResourcesCatalog({
  items,
  onSelect,
  selectedResourceType,
}: {
  items: ResourceCatalogItem[];
  onSelect: (resourceType: string) => void;
  selectedResourceType: string | null;
}) {
  const { formatNumber, t } = useI18n();
  const groups = useMemo(() => groupCatalog(items), [items]);
  const selectedCategory = groups.find((group) => group.items.some(
    (item) => item.resourceType === selectedResourceType,
  ))?.category.id ?? null;
  const [query, setQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(() => new Set());
  const [favoritesExpanded, setFavoritesExpanded] = useState(true);
  const [pinnedResourceTypes, setPinnedResourceTypes] = useState<string[]>(readPinnedResourceTypes);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const selectedItemRef = useRef<HTMLButtonElement | null>(null);
  const highlightedItemRef = useRef<HTMLButtonElement | null>(null);
  const scrollIntoView = useMotionAwareScrollIntoView();
  const entries = useMemo(() => groups.flatMap((group) => group.items.map((item) => {
    const presentation = resourceTypePresentation(item.resourceType);
    return {
      item,
      label: presentation.labelKey ? t(presentation.labelKey) : presentation.fallbackLabel,
    } satisfies CatalogEntry;
  })), [groups, t]);
  const entryByType = useMemo(() => new Map(
    entries.map((entry) => [entry.item.resourceType, entry]),
  ), [entries]);
  const pinnedEntries = pinnedResourceTypes.flatMap((resourceType) => {
    const entry = entryByType.get(resourceType);
    return entry ? [entry] : [];
  });
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredGroups = groups.map((group) => {
    if (!normalizedQuery) return group;
    const groupLabel = t(group.category.labelKey).toLocaleLowerCase();
    return {
      ...group,
      items: group.items.filter((item) => {
        const entry = entryByType.get(item.resourceType);
        return groupLabel.includes(normalizedQuery)
          || item.resourceType.toLocaleLowerCase().includes(normalizedQuery)
          || entry?.label.toLocaleLowerCase().includes(normalizedQuery);
      }),
    };
  }).filter((group) => group.items.length > 0);
  const effectiveExpandedCategories = new Set(expandedCategories);
  if (selectedCategory) effectiveExpandedCategories.add(selectedCategory);
  if (normalizedQuery) {
    for (const group of filteredGroups) effectiveExpandedCategories.add(group.category.id);
  }
  const pinnedTypeSet = new Set(pinnedEntries.map((entry) => entry.item.resourceType));
  const navigableEntries = [
    ...(favoritesExpanded ? pinnedEntries : []),
    ...filteredGroups.flatMap((group) => effectiveExpandedCategories.has(group.category.id)
      ? group.items.flatMap((item) => {
          const entry = entryByType.get(item.resourceType);
          return entry && !pinnedTypeSet.has(item.resourceType) ? [entry] : [];
        })
      : []),
  ];
  const highlightedType = highlightedIndex >= 0
    ? navigableEntries[highlightedIndex]?.item.resourceType ?? null
    : null;
  const highlightedCategory = highlightedType
    ? groups.find((group) => group.items.some((item) => item.resourceType === highlightedType))?.category.id
    : null;
  const highlightedRowId = highlightedType
    ? catalogRowId(highlightedType, highlightedCategory ?? "other", pinnedTypeSet.has(highlightedType))
    : undefined;

  useEffect(() => writePinnedResourceTypes(pinnedResourceTypes), [pinnedResourceTypes]);
  useEffect(() => {
    scrollIntoView(selectedItemRef.current, { block: "nearest" });
  }, [scrollIntoView, selectedResourceType]);
  useEffect(() => {
    scrollIntoView(highlightedItemRef.current, { block: "nearest" });
  }, [highlightedType, scrollIntoView]);

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };
  const togglePinned = (resourceType: string) => {
    setPinnedResourceTypes((current) => current.includes(resourceType)
      ? current.filter((candidate) => candidate !== resourceType)
      : [...current, resourceType]);
  };
  const selectEntry = (entry: CatalogEntry) => {
    onSelect(entry.item.resourceType);
    setQuery("");
    setHighlightedIndex(-1);
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setQuery("");
      setHighlightedIndex(-1);
      event.currentTarget.blur();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.min(current + 1, navigableEntries.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && highlightedIndex >= 0) {
      const entry = navigableEntries[highlightedIndex];
      if (entry) {
        event.preventDefault();
        selectEntry(entry);
      }
    }
  };

  return (
    <TooltipProvider>
      <Surface aria-labelledby="resource-catalog-title" className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="border-b px-3 py-3">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <h3 className="truncate text-sm font-semibold" id="resource-catalog-title">
              {t("resources.catalog.title")}
            </h3>
            <Badge className="shrink-0 font-mono tabular-nums" variant="secondary">
              {formatNumber(items.reduce((sum, item) => sum + item.count, 0))}
            </Badge>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={t("resources.catalog.description")}>
            {t("resources.catalog.description")}
          </p>
          <label className="mt-3 block" htmlFor="resources-catalog-search">
            <span className="sr-only">{t("resources.catalog.searchLabel")}</span>
            <span className="relative block">
              <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-activedescendant={highlightedRowId}
                aria-controls="resource-catalog-list"
                aria-label={t("resources.catalog.searchLabel")}
                autoComplete="off"
                className="pr-8 pl-8"
                id="resources-catalog-search"
                onChange={(event) => {
                  setQuery(event.currentTarget.value);
                  setHighlightedIndex(event.currentTarget.value ? 0 : -1);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={t("resources.catalog.searchPlaceholder")}
                type="search"
                value={query}
              />
              {query ? (
                <Button
                  aria-label={t("resources.catalog.searchClear")}
                  className="absolute top-1/2 right-1 size-6 -translate-y-1/2"
                  onClick={() => {
                    setQuery("");
                    setHighlightedIndex(-1);
                  }}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <X aria-hidden="true" className="size-3.5" />
                </Button>
              ) : null}
            </span>
          </label>
        </div>
        <ScrollArea aria-label={t("resources.catalog.aria")} className="min-h-0 flex-1" id="resource-catalog-list" orientation="vertical">
          <nav className="space-y-1 p-2" aria-label={t("resources.catalog.aria")}>
            <CatalogDisclosure
              count={pinnedEntries.reduce((sum, entry) => sum + entry.item.count, 0)}
              expanded={favoritesExpanded}
              icon={Pin}
              label={t("resources.catalog.favorites")}
              onToggle={() => setFavoritesExpanded((current) => !current)}
            >
              {pinnedEntries.length > 0 ? pinnedEntries.map((entry) => (
                <CatalogItemRow
                  entry={entry}
                  highlighted={entry.item.resourceType === highlightedType}
                  highlightedRef={highlightedItemRef}
                  key={`favorite-${entry.item.resourceType}`}
                  onSelect={selectEntry}
                  onTogglePinned={togglePinned}
                  pinned
                  rowId={catalogRowId(entry.item.resourceType, "favorite", true)}
                  selected={entry.item.resourceType === selectedResourceType}
                  selectedRef={selectedItemRef}
                />
              )) : (
                <p className="px-2 py-2 text-xs leading-relaxed text-muted-foreground">
                  {t("resources.catalog.favoritesEmpty")}
                </p>
              )}
            </CatalogDisclosure>
            {filteredGroups.map((group) => (
              <CatalogDisclosure
                count={group.total}
                expanded={effectiveExpandedCategories.has(group.category.id)}
                icon={group.category.icon}
                key={group.category.id}
                label={t(group.category.labelKey)}
                onToggle={() => toggleCategory(group.category.id)}
              >
                {group.items.map((item) => {
                  const entry = entryByType.get(item.resourceType);
                  if (!entry) return null;
                  const pinned = pinnedResourceTypes.includes(item.resourceType);
                  return (
                    <CatalogItemRow
                      entry={entry}
                      highlighted={item.resourceType === highlightedType && !pinned}
                      highlightedRef={highlightedItemRef}
                      key={item.resourceType}
                      onSelect={selectEntry}
                      onTogglePinned={togglePinned}
                      pinned={pinned}
                      rowId={catalogRowId(item.resourceType, group.category.id)}
                      selected={item.resourceType === selectedResourceType && !pinned}
                      selectedRef={selectedItemRef}
                    />
                  );
                })}
              </CatalogDisclosure>
            ))}
            {filteredGroups.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs leading-relaxed text-muted-foreground">
                {t("resources.catalog.noMatch")}
              </p>
            ) : null}
          </nav>
        </ScrollArea>
      </Surface>
    </TooltipProvider>
  );
}
