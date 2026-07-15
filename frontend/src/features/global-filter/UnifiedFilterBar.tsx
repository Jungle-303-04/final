import {
  AppWindow,
  Boxes,
  Braces,
  Search,
  Server,
  Tags,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useUnifiedFilter } from "../filters/UnifiedFilterProvider";
import { useI18n, type MessageKey } from "../../shared/i18n";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "../../shared/ui/primitives/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/ui/primitives/popover";
import { Spinner } from "../../shared/ui/primitives/spinner";
import {
  SearchPillInput,
  type SearchModifier,
} from "../../shared/ui/SearchPillInput";
import type {
  GlobalFilterPort,
  GlobalFilterSuggestion,
} from "./globalFilterContract";
import {
  addSuggestion,
  namespaceId,
  removeChip,
  selectedChips,
} from "./globalFilterSelection";

type SearchPhase = "idle" | "loading" | "ready" | "failed";
type SuggestionType = GlobalFilterSuggestion["type"];

const groupOrder: readonly SuggestionType[] = [
  "cluster",
  "namespace",
  "application",
  "resourceType",
  "label",
  "resource",
];

const groupKeys: Record<SuggestionType, MessageKey> = {
  cluster: "shell.filter.group.cluster",
  namespace: "shell.filter.group.namespace",
  application: "shell.filter.group.application",
  resourceType: "shell.filter.group.resourceType",
  label: "shell.filter.group.label",
  resource: "shell.filter.group.resource",
};

const groupIcons = {
  cluster: Server,
  namespace: Braces,
  application: AppWindow,
  resourceType: Boxes,
  label: Tags,
  resource: Boxes,
} satisfies Record<SuggestionType, typeof Server>;

export function UnifiedFilterBar({ port }: { port: GlobalFilterPort }) {
  const filter = useUnifiedFilter();
  const { formatNumber, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [suggestions, setSuggestions] = useState<readonly GlobalFilterSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const selection = useMemo(() => ({
    clusters: filter.state.common.clusters,
    namespaces: filter.state.common.namespaces.map(
      (item) => namespaceId(item.clusterId, item.namespace),
    ),
    applications: filter.state.common.applications,
    resourceTypes: filter.state.resources.types,
    labels: filter.state.common.labels.map((label) => `${label.key}=${label.value}`),
  }), [filter.state.common, filter.state.resources.types]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => {
      setPhase("loading");
      void port.search(query, selection, controller.signal).then(
        (items) => {
          if (!active) return;
          setSuggestions(items);
          setPhase("ready");
        },
        (error: unknown) => {
          if (!active || isAbortError(error)) return;
          setSuggestions([]);
          setPhase("failed");
        },
      );
    }, 150);
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, port, query, selection]);

  const groups = groupOrder.map((type) => ({
    type,
    items: suggestions.filter((item) => item.type === type),
  })).filter((group) => group.items.length > 0);
  const chips = selectedChips(filter.state);
  const pills: SearchModifier[] = chips.map((chip) => ({
    key: chip.type,
    keyLabel: t(groupKeys[chip.type]),
    label: chip.label,
    value: chip.id,
  }));

  const selectSuggestion = (suggestion: GlobalFilterSuggestion) => {
    filter.updateFilters((current) => addSuggestion(current, suggestion), "chip-add");
    setQuery("");
  };

  const changeSearch = (next: { text: string; pills: SearchModifier[] }) => {
    setQuery(next.text);
    if (next.pills.length >= pills.length) return;
    const remaining = new Set(next.pills.map(pillIdentity));
    const removed = chips.filter((chip) =>
      !remaining.has(pillIdentity({ key: chip.type, value: chip.id })),
    );
    if (removed.length === 0) return;
    filter.updateFilters(
      (current) => removed.reduce(removeChip, current),
      "chip-remove",
    );
  };

  const clearAll = () => {
    setQuery("");
    if (chips.length === 0) return;
    filter.updateFilters(
      (current) => chips.reduce(removeChip, current),
      "clear-filters",
    );
  };

  const changePopoverOpen = (nextOpen: boolean) => {
    if (
      !nextOpen &&
      typeof document !== "undefined" &&
      document.activeElement === inputRef.current
    ) {
      return;
    }
    setOpen(nextOpen);
  };

  return (
    <div className="min-w-0 flex-1 sm:max-w-xl" data-slot="unified-filter-bar">
      <Popover onOpenChange={changePopoverOpen} open={open}>
        <SearchPillInput
          aria-label={t("shell.filter.placeholder")}
          className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          getRemovePillLabel={(pill) => t("shell.filter.remove", {
            label: pill.label ?? pill.value,
            type: pill.keyLabel ?? pill.key,
          })}
          inputRef={inputRef}
          leftSlot={(
            <PopoverTrigger
              aria-label={t("shell.filter.placeholder")}
              className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search aria-hidden="true" className="size-4" />
            </PopoverTrigger>
          )}
          onChange={changeSearch}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          pills={pills}
          placeholder={t("shell.filter.placeholder")}
          restorePillOnBackspace={false}
          rightSlot={chips.length > 0 || query.length > 0 ? (
            <button
              aria-label={t("shell.filter.clearAll")}
              className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={clearAll}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ) : null}
          text={query}
        />
        <PopoverContent
          align="start"
          className="w-[min(34rem,calc(100vw-2rem))]"
          initialFocus={false}
        >
          <Command label={t("shell.filter.placeholder")} shouldFilter={false}>
            <CommandList>
              {phase === "failed" ? (
                <CommandEmpty>{t("shell.filter.failed")}</CommandEmpty>
              ) : groups.length === 0 && phase !== "loading" ? (
                <CommandEmpty>{t("shell.filter.empty")}</CommandEmpty>
              ) : null}
              {groups.map(({ items, type }) => {
                const Icon = groupIcons[type];
                return (
                  <CommandGroup heading={t(groupKeys[type])} key={type}>
                    {items.map((item) => (
                      <CommandItem
                        key={`${item.type}:${item.id}`}
                        onSelect={() => selectSuggestion(item)}
                        value={`${item.type}:${item.id}`}
                      >
                        <Icon aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.type === "resource" ? (
                          <span className="text-xs text-muted-foreground">{item.kind}</span>
                        ) : null}
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatCount(item, formatNumber, t)}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              })}
              {phase === "loading" ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground" role="status">
                  <Spinner className="size-4" decorative />
                  {t("common.state.loading")}
                </div>
              ) : null}
            </CommandList>
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              {t("shell.filter.rule")}
            </p>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function pillIdentity(pill: Pick<SearchModifier, "key" | "value">): string {
  return `${pill.key}:${pill.value}`;
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error &&
    error.name === "AbortError";
}

function formatCount(
  item: GlobalFilterSuggestion,
  formatNumber: (value: number | bigint) => string,
  t: ReturnType<typeof useI18n>["t"],
): string {
  if (item.count === null || item.count_completeness === "unavailable") {
    return t("shell.filter.count.unknown");
  }
  const count = formatNumber(item.count);
  return item.count_completeness === "partial"
    ? t("shell.filter.count.partial", { count })
    : count;
}
