import { Braces, Check, Server } from "lucide-react";
import type { KeyboardEvent, RefObject } from "react";
import type { useI18n } from "../../shared/i18n";
import { Button } from "../../shared/ui/primitives/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "../../shared/ui/primitives/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../shared/ui/primitives/dialog";
import { PopoverContent } from "../../shared/ui/primitives/popover";
import { Spinner } from "../../shared/ui/primitives/spinner";
import type { ShellSessionCounts } from "../shell-sessions/ShellSessionsProvider";
import type { GlobalFilterSuggestion } from "./globalFilterContract";

type ScopeType = "cluster" | "namespace";
type SearchPhase = "idle" | "loading" | "ready" | "failed";

interface AnchoredScopeFilterCommandProps {
  anchor?: RefObject<Element | null>;
  commandValue: string;
  hasSelection: boolean;
  isSelected: (suggestion: GlobalFilterSuggestion) => boolean;
  onClear: () => void;
  onCommandValueChange: (value: string) => void;
  onToggle: (suggestion: GlobalFilterSuggestion) => void;
  phase: SearchPhase;
  suggestions: readonly GlobalFilterSuggestion[];
  t: ReturnType<typeof useI18n>["t"];
  type: ScopeType;
}

export function AnchoredScopeFilterCommand({
  anchor,
  commandValue,
  hasSelection,
  isSelected,
  onClear,
  onCommandValueChange,
  onToggle,
  phase,
  suggestions,
  t,
  type,
}: AnchoredScopeFilterCommandProps) {
  const Icon = type === "cluster" ? Server : Braces;
  const items = suggestions.filter((item) => item.type === type);

  return (
    <PopoverContent
      align="start"
      anchor={anchor}
      className={anchor
        ? "max-w-[min(34rem,calc(100vw-2rem))] rounded-[var(--product-radius-lg)]"
        : "w-[min(34rem,calc(100vw-2rem))]"}
      initialFocus={false}
      sideOffset={anchor ? -1 : 6}
    >
      <Command
        label={t("shell.filter.placeholder")}
        onValueChange={onCommandValueChange}
        shouldFilter={false}
        value={commandValue}
      >
        <CommandList>
          {phase === "failed" ? (
            <CommandEmpty>{t("shell.filter.failed")}</CommandEmpty>
          ) : items.length === 0 && phase !== "loading" ? (
            <CommandEmpty>{t("shell.filter.empty")}</CommandEmpty>
          ) : null}
          {items.length > 0 ? (
            <CommandGroup
              heading={anchor
                ? undefined
                : t(type === "cluster"
                    ? "shell.filter.group.cluster"
                    : "shell.filter.group.namespace")}
            >
              <CommandItem onSelect={onClear} value={`${type}:__all__`}>
                <Icon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  {type === "cluster"
                    ? t("resources.graph.clusterGrid.title")
                    : t("traffic.scope.allNamespaces")}
                </span>
                {!hasSelection ? <Check aria-hidden="true" /> : null}
              </CommandItem>
              {items.map((item) => (
                <CommandItem
                  key={`${item.type}:${item.id}`}
                  onSelect={() => onToggle(item)}
                  value={`${item.type}:${item.id}`}
                >
                  <Icon aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {isSelected(item) ? <Check aria-hidden="true" /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {phase === "loading" ? (
            <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground" role="status">
              <Spinner className="size-4" decorative />
              {t("common.state.loading")}
            </div>
          ) : null}
        </CommandList>
      </Command>
    </PopoverContent>
  );
}

interface AnchoredScopeKeyDownOptions {
  commandValue: string;
  onClear: () => void;
  onClose: () => void;
  onToggle: (suggestion: GlobalFilterSuggestion) => void;
  onValueChange: (value: string) => void;
  suggestions: readonly GlobalFilterSuggestion[];
  type: ScopeType;
}

export function handleAnchoredScopeFilterKeyDown(
  event: KeyboardEvent,
  options: AnchoredScopeKeyDownOptions,
): boolean {
  const items = options.suggestions.filter((item) => item.type === options.type);
  const values = [
    `${options.type}:__all__`,
    ...items.map((item) => `${item.type}:${item.id}`),
  ];

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const current = values.indexOf(options.commandValue);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const next = current < 0
      ? 0
      : (current + direction + values.length) % values.length;
    options.onValueChange(values[next] ?? values[0] ?? "");
    return true;
  }
  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    options.onValueChange(
      event.key === "Home" ? values[0] ?? "" : values[values.length - 1] ?? "",
    );
    return true;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (options.commandValue === `${options.type}:__all__`) {
      options.onClear();
    } else {
      const item = items.find(
        (suggestion) => `${suggestion.type}:${suggestion.id}` === options.commandValue,
      );
      if (item) options.onToggle(item);
    }
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    options.onClose();
    return true;
  }
  return false;
}

export interface PendingScopeSelection {
  counts: ShellSessionCounts;
  suggestion: GlobalFilterSuggestion;
}

interface ScopeSelectionConfirmationDialogProps {
  onCancel: () => void;
  onConfirm: (suggestion: GlobalFilterSuggestion) => void;
  selection: PendingScopeSelection | null;
  t: ReturnType<typeof useI18n>["t"];
}

export function ScopeSelectionConfirmationDialog({
  onCancel,
  onConfirm,
  selection,
  t,
}: ScopeSelectionConfirmationDialogProps) {
  return (
    <Dialog onOpenChange={(open) => !open && onCancel()} open={selection !== null}>
      <DialogContent closeLabel={t("shell.sessions.cancel")}>
        <DialogHeader>
          <DialogTitle>{t("shell.sessions.confirmTitle")}</DialogTitle>
          <DialogDescription>{t("shell.sessions.confirmDescription")}</DialogDescription>
        </DialogHeader>
        {selection ? (
          <dl className="grid grid-cols-3 gap-2 text-center text-sm">
            <SessionCount
              label={t("shell.sessions.portForwards", { count: selection.counts.portForwards })}
              value={selection.counts.portForwards}
            />
            <SessionCount
              label={t("shell.sessions.exec", { count: selection.counts.execSessions })}
              value={selection.counts.execSessions}
            />
            <SessionCount
              label={t("shell.sessions.localTerminals", { count: selection.counts.localTerminals })}
              value={selection.counts.localTerminals}
            />
          </dl>
        ) : null}
        <DialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            {t("shell.sessions.cancel")}
          </Button>
          <Button
            onClick={() => {
              const next = selection?.suggestion;
              onCancel();
              if (next) onConfirm(next);
            }}
            type="button"
          >
            {t("shell.sessions.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border bg-muted/40 p-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
