import {
  AppWindow,
  Boxes,
  Braces,
  LoaderCircle,
  Search,
  Server,
  Tags,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useUnifiedFilter } from "../filters/UnifiedFilterProvider";
import type { NamespaceFilterRef } from "../filters/filterContract";
import { useI18n, type MessageKey } from "../../shared/i18n";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../shared/ui/primitives/command";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/ui/primitives/popover";
import type {
  GlobalFilterPort,
  GlobalFilterSuggestion,
} from "./globalFilterContract";

type SearchPhase = "idle" | "loading" | "ready" | "failed";
type SuggestionType = GlobalFilterSuggestion["type"];

const groupOrder: readonly SuggestionType[] = [
  "cluster",
  "namespace",
  "application",
  "label",
  "resource",
];

const groupKeys: Record<SuggestionType, MessageKey> = {
  cluster: "shell.filter.group.cluster",
  namespace: "shell.filter.group.namespace",
  application: "shell.filter.group.application",
  label: "shell.filter.group.label",
  resource: "shell.filter.group.resource",
};

const groupIcons = {
  cluster: Server,
  namespace: Braces,
  application: AppWindow,
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
  const selection = useMemo(() => ({
    clusters: filter.state.common.clusters,
    namespaces: filter.state.common.namespaces.map(namespaceId),
    applications: filter.state.common.applications,
    labels: filter.state.common.labels.map((label) => `${label.key}=${label.value}`),
  }), [filter.state.common]);

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

  const selectSuggestion = (suggestion: GlobalFilterSuggestion) => {
    filter.updateFilters((current) => addSuggestion(current, suggestion), "chip-add");
    setQuery("");
  };

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5" data-slot="unified-filter-bar">
      {chips.map((chip) => (
        <span
          className="inline-flex h-8 max-w-52 items-center gap-1 rounded-lg border bg-muted px-2 text-xs"
          key={`${chip.type}:${chip.id}`}
        >
          <span className="text-muted-foreground">{t(groupKeys[chip.type])}:</span>
          <span className="truncate">{chip.label}</span>
          <button
            aria-label={t("shell.filter.remove", {
              label: chip.label,
              type: t(groupKeys[chip.type]),
            })}
            className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => filter.updateFilters(
              (current) => removeChip(current, chip),
              "chip-remove",
            )}
            type="button"
          >
            <X aria-hidden="true" className="size-3" />
          </button>
        </span>
      ))}

      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          className="flex h-8 min-w-48 flex-1 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-left text-sm text-muted-foreground outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-xl"
        >
          <Search aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">{t("shell.filter.placeholder")}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(34rem,calc(100vw-2rem))]" initialFocus>
          <Command label={t("shell.filter.placeholder")} shouldFilter={false}>
            <CommandInput
              onValueChange={setQuery}
              placeholder={t("shell.filter.placeholder")}
              value={query}
            />
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
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
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

function namespaceId(value: NamespaceFilterRef): string {
  return `${value.clusterId}/${value.namespace}`;
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

type FilterState = ReturnType<typeof useUnifiedFilter>["state"];
type SelectedChip = { type: SuggestionType; id: string; label: string };

function selectedChips(state: FilterState): SelectedChip[] {
  return [
    ...state.common.clusters.map((id) => ({ type: "cluster" as const, id, label: id })),
    ...state.common.namespaces.map((item) => ({
      type: "namespace" as const,
      id: namespaceId(item),
      label: item.namespace,
    })),
    ...state.common.applications.map((id) => ({ type: "application" as const, id, label: id })),
    ...state.common.labels.map((item) => ({
      type: "label" as const,
      id: `${item.key}=${item.value}`,
      label: `${item.key}=${item.value}`,
    })),
    ...(state.resources.query ? [{
      type: "resource" as const,
      id: state.resources.query,
      label: state.resources.query,
    }] : []),
  ];
}

function addSuggestion(state: FilterState, item: GlobalFilterSuggestion): FilterState {
  if (item.type === "cluster") {
    return { ...state, common: { ...state.common, clusters: addUnique(state.common.clusters, item.id) } };
  }
  if (item.type === "namespace") {
    const namespace = item.id.startsWith(`${item.clusterId}/`)
      ? item.id.slice(item.clusterId.length + 1)
      : item.label;
    const next = { clusterId: item.clusterId, namespace };
    return {
      ...state,
      common: {
        ...state.common,
        namespaces: state.common.namespaces.some((value) => namespaceId(value) === item.id)
          ? state.common.namespaces
          : [...state.common.namespaces, next],
      },
    };
  }
  if (item.type === "application") {
    return { ...state, common: { ...state.common, applications: addUnique(state.common.applications, item.id) } };
  }
  if (item.type === "label") {
    return {
      ...state,
      common: {
        ...state.common,
        labels: state.common.labels.some((value) => value.key === item.key && value.value === item.value)
          ? state.common.labels
          : [...state.common.labels, { key: item.key, value: item.value }],
      },
    };
  }
  return { ...state, resources: { ...state.resources, query: item.label } };
}

function removeChip(state: FilterState, chip: SelectedChip): FilterState {
  if (chip.type === "cluster") {
    return { ...state, common: { ...state.common, clusters: state.common.clusters.filter((id) => id !== chip.id) } };
  }
  if (chip.type === "namespace") {
    return { ...state, common: { ...state.common, namespaces: state.common.namespaces.filter((item) => namespaceId(item) !== chip.id) } };
  }
  if (chip.type === "application") {
    return { ...state, common: { ...state.common, applications: state.common.applications.filter((id) => id !== chip.id) } };
  }
  if (chip.type === "label") {
    return { ...state, common: { ...state.common, labels: state.common.labels.filter((item) => `${item.key}=${item.value}` !== chip.id) } };
  }
  return { ...state, resources: { ...state.resources, query: "" } };
}

function addUnique(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : [...values, value];
}
