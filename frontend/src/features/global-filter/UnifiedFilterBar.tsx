import { Search, X } from "lucide-react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useNavigate } from "react-router-dom";
import { useUnifiedFilter } from "../filters/UnifiedFilterProvider";
import { useClusterScope } from "../cluster-scope/ClusterScopeProvider";
import { useI18n } from "../../shared/i18n";
import { clusterDisplayLabel } from "../../shared/ui/ClusterConnectionStatus";
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
import { useOptionalShellSessions } from "../shell-sessions/ShellSessionsProvider";
import {
  AnchoredScopeFilterCommand,
  handleAnchoredScopeFilterKeyDown,
  ScopeSelectionConfirmationDialog,
  type PendingScopeSelection,
} from "./AnchoredScopeFilterCommand";
import { GlobalFilterClusterConnectionMark } from "./GlobalFilterClusterConnectionMark";
import {
  buildSuggestionGroups,
  findSelectedScopeSuggestionChip,
  formatSuggestionCount,
  isAbortError,
  pillIdentity,
  suggestionGroupKey,
  type GlobalFilterSearchPhase,
} from "./globalFilterCommandModel";

type SuggestionType = GlobalFilterSuggestion["type"];

export interface UnifiedFilterBarHandle {
  closeGroup: () => void;
  focus: () => void;
  openGroup: (type: "cluster" | "namespace") => void;
}

export const UnifiedFilterBar = forwardRef<
  UnifiedFilterBarHandle,
  {
    groupAnchor?: RefObject<Element | null>;
    hiddenChipTypes?: readonly SuggestionType[];
    onGroupOpenChange?: (type: "cluster" | "namespace" | null) => void;
    port: GlobalFilterPort;
  }
>(function UnifiedFilterBar({
  groupAnchor,
  hiddenChipTypes = [],
  onGroupOpenChange,
  port,
}, ref) {
  const filter = useUnifiedFilter();
  const clusterScope = useClusterScope();
  const shellSessions = useOptionalShellSessions();
  const navigate = useNavigate();
  const { formatNumber, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<GlobalFilterSearchPhase>("idle");
  const [suggestions, setSuggestions] = useState<readonly GlobalFilterSuggestion[]>([]);
  const [groupFilter, setGroupFilter] = useState<"cluster" | "namespace" | null>(null);
  const [groupCommandValue, setGroupCommandValue] = useState("");
  const [pendingSelection, setPendingSelection] = useState<PendingScopeSelection | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shortcutFocusRef = useRef(false);
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
    onGroupOpenChange?.(open ? groupFilter : null);
  }, [groupFilter, onGroupOpenChange, open]);

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

  const groups = buildSuggestionGroups(suggestions);
  const chips = selectedChips(filter.state).filter(
    (chip) => !hiddenChipTypes.includes(chip.type),
  );
  const clusterChoices = useMemo(() => new Map(
    clusterScope.collection.phase === "ready"
      ? clusterScope.collection.data.clusters.map((cluster) => [cluster.id, cluster] as const)
      : [],
  ), [clusterScope.collection]);
  const pills: SearchModifier[] = chips.map((chip) => {
    const cluster = chip.type === "cluster" ? clusterChoices.get(chip.id) : null;
    return {
      key: chip.type,
      keyLabel: t(suggestionGroupKey(chip.type)),
      label: cluster ? clusterDisplayLabel(cluster) : chip.label,
      value: chip.id,
    };
  });

  const closeGroup = useCallback(() => {
    setGroupFilter(null);
    setOpen(false);
    setQuery("");
    queueMicrotask(() => {
      groupAnchor?.current?.querySelector<HTMLElement>("button")?.focus();
    });
  }, [groupAnchor]);
  useEffect(() => {
    if (!open || groupFilter === null) return;
    const dismiss = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeGroup();
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [closeGroup, groupFilter, open]);

  const applySuggestion = (suggestion: GlobalFilterSuggestion) => {
    if (suggestion.type === "resource") {
      const detail = {
        ...filter.detail,
        detail: [
          suggestion.resource.kind,
          suggestion.resource.namespace ?? "~",
          suggestion.resource.name,
        ].join("/"),
        resource: null,
        resourceKind: null,
        tab: null,
      };
      filter.updateFilters((current) => ({
        ...current,
        common: {
          ...current.common,
          clusters: [suggestion.clusterId],
          namespaces: suggestion.resource.namespace === null
            ? []
            : [{
                clusterId: suggestion.clusterId,
                namespace: suggestion.resource.namespace,
              }],
        },
        resources: {
          ...current.resources,
          types: [suggestion.resourceType],
        },
      }), "legacy-migration");
      navigate(filter.navigationHref("/resources", detail));
      setOpen(false);
      setQuery("");
      return;
    }
    filter.updateFilters((current) => addSuggestion(current, suggestion), "chip-add");
    setQuery("");
    if (groupFilter !== null) {
      closeGroup();
    }
  };

  const clearGroup = (type: "cluster" | "namespace") => {
    filter.updateFilters((current) => ({
      ...current,
      common: type === "cluster"
        ? { ...current.common, clusters: [], namespaces: [] }
        : { ...current.common, namespaces: [] },
    }), "chip-remove");
    closeGroup();
  };

  const findSelectedScopeSelection = (suggestion: GlobalFilterSuggestion) => {
    return findSelectedScopeSuggestionChip(suggestion, filter.state.common);
  };

  const selectSuggestion = (suggestion: GlobalFilterSuggestion) => {
    const nextClusterId = suggestion.type === "cluster"
      ? suggestion.id
      : suggestion.type === "resource" ? suggestion.clusterId : null;
    const currentClusterId = filter.state.common.clusters.length === 1
      ? filter.state.common.clusters[0] ?? null
      : null;
    if (shellSessions !== null && nextClusterId !== null && nextClusterId !== currentClusterId) {
      const counts = shellSessions.countsForCluster(currentClusterId);
      if (counts.total > 0) {
        setOpen(false);
        setPendingSelection({ counts, suggestion });
        return;
      }
    }
    applySuggestion(suggestion);
  };

  const toggleGroupSuggestion = (suggestion: GlobalFilterSuggestion) => {
    const selectedChip = findSelectedScopeSelection(suggestion);
    if (selectedChip !== null) {
      filter.updateFilters(
        (current) => removeChip(current, selectedChip),
        "chip-remove",
      );
      closeGroup();
      return;
    }
    selectSuggestion(suggestion);
  };

  const groupSuggestions = groupFilter === null
    ? []
    : suggestions.filter((item) => item.type === groupFilter);

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

  const changePopoverOpen = (
    nextOpen: boolean,
    eventDetails: { reason?: string },
  ) => {
    if (
      !nextOpen &&
      typeof document !== "undefined" &&
      document.activeElement === inputRef.current &&
      eventDetails.reason !== "escape-key" &&
      eventDetails.reason != null
    ) {
      return;
    }
    setOpen(nextOpen);
  };
  const openGroup = useCallback((type: "cluster" | "namespace") => {
    shortcutFocusRef.current = true;
    setGroupFilter(type);
    setGroupCommandValue(type === "cluster"
      ? `${type}:${filter.state.common.clusters[0] ?? "__all__"}`
      : `${type}:${filter.state.common.namespaces[0]
        ? namespaceId(
            filter.state.common.namespaces[0].clusterId,
            filter.state.common.namespaces[0].namespace,
          )
        : "__all__"}`);
    setQuery("");
    setOpen(true);
    queueMicrotask(() => {
      inputRef.current?.focus();
      shortcutFocusRef.current = false;
    });
  }, [filter.state.common.clusters, filter.state.common.namespaces]);
  const focus = useCallback(() => {
    setGroupFilter(null);
    setOpen(true);
    queueMicrotask(() => inputRef.current?.focus());
  }, []);

  useImperativeHandle(
    ref,
    () => ({ closeGroup, focus, openGroup }),
    [closeGroup, focus, openGroup],
  );

  return (
    <>
      <div
        className="mx-auto min-w-0 flex-1 sm:max-w-(--product-global-search-width)"
        data-slot="unified-filter-bar"
        onKeyDownCapture={(event) => {
          if (event.key === "Tab") setOpen(false);
        }}
      >
      <Popover onOpenChange={changePopoverOpen} open={open}>
        <SearchPillInput
          aria-label={t("shell.filter.placeholder")}
          className="h-(--product-global-search-height) w-full gap-2 rounded-[var(--product-radius-md)] border border-border bg-background-subtle px-3 text-body shadow-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
          getRemovePillLabel={(pill) => t("shell.filter.remove", {
            label: pill.label ?? pill.value,
            type: pill.keyLabel ?? pill.key,
          })}
          inputRef={inputRef}
          inputClassName="text-[length:var(--type-body)] leading-[var(--type-body-line)] md:text-[length:var(--type-body)]"
          leftSlot={(
            <PopoverTrigger
              aria-label={t("shell.filter.placeholder")}
              className="grid size-5 shrink-0 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setGroupFilter(null)}
            >
              <Search aria-hidden="true" className="size-4" />
            </PopoverTrigger>
          )}
          onChange={changeSearch}
          onFocus={() => {
            if (!shortcutFocusRef.current) setGroupFilter(null);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (groupFilter !== null) {
              const handled = handleAnchoredScopeFilterKeyDown(event, {
                commandValue: groupCommandValue,
                onClear: () => clearGroup(groupFilter),
                onClose: closeGroup,
                onToggle: toggleGroupSuggestion,
                onValueChange: setGroupCommandValue,
                suggestions: groupSuggestions,
                type: groupFilter,
              });
              if (handled) return;
            }
            if (event.key === "Escape") setOpen(false);
          }}
          pills={pills}
          placeholder={t("shell.filter.placeholder")}
          restorePillOnBackspace={false}
          renderPillStart={(pill) => {
            if (pill.key !== "cluster") return null;
            const cluster = clusterChoices.get(pill.value);
            if (!cluster) return null;
            return (
              <GlobalFilterClusterConnectionMark
                clusterLabel={clusterDisplayLabel(cluster)}
                connectionState={cluster.connectionState}
                onRefresh={clusterScope.refresh}
                refreshing={clusterScope.collection.phase === "ready" && clusterScope.collection.refreshing}
              />
            );
          }}
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
          ) : (
            <kbd
              aria-hidden="true"
              className="shrink-0 rounded-[var(--product-radius-tile)] border border-border-subtle px-1.5 py-0.5 font-mono text-caption text-muted-foreground"
            >
              {t("shell.filter.shortcutHint")}
            </kbd>
          )}
          text={query}
        />
        {groupFilter !== null ? (
          <AnchoredScopeFilterCommand
            anchor={groupAnchor}
            commandValue={groupCommandValue}
            hasSelection={groupFilter === "cluster"
              ? filter.state.common.clusters.length > 0
              : filter.state.common.namespaces.length > 0}
            isSelected={(item) => findSelectedScopeSelection(item) !== null}
            onClear={() => clearGroup(groupFilter)}
            onCommandValueChange={setGroupCommandValue}
            onToggle={toggleGroupSuggestion}
            phase={phase}
            suggestions={groupSuggestions}
            t={t}
            type={groupFilter}
          />
        ) : (
          <PopoverContent
            align="start"
            className="w-[min(34rem,calc(100vw-2rem))]"
            initialFocus={false}
            sideOffset={6}
          >
            <Command label={t("shell.filter.placeholder")} shouldFilter={false}>
              <CommandList>
                {phase === "failed" ? (
                  <CommandEmpty>{t("shell.filter.failed")}</CommandEmpty>
                ) : groups.length === 0 && phase !== "loading" ? (
                  <CommandEmpty>{t("shell.filter.empty")}</CommandEmpty>
                ) : null}
                {groups.map(({ Icon, items, key, type }) => {
                  return (
                    <CommandGroup heading={t(key)} key={type}>
                      {items.map((item) => (
                        <CommandItem
                          key={`${item.type}:${item.id}`}
                          onSelect={() => selectSuggestion(item)}
                          value={`${item.type}:${item.id}`}
                        >
                          <Icon aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.type === "resource" ? (
                            <span className="text-xs text-muted-foreground">
                              {item.resource.kind}
                            </span>
                          ) : null}
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {formatSuggestionCount(item, formatNumber, t)}
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
        )}
      </Popover>
      </div>
      <ScopeSelectionConfirmationDialog
        onCancel={() => setPendingSelection(null)}
        onConfirm={applySuggestion}
        selection={pendingSelection}
        t={t}
      />
    </>
  );
});
