import { useRef, type KeyboardEvent } from "react";

import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";

export type CostView = "overview" | "trend";

const COST_VIEWS: readonly CostView[] = ["overview", "trend"];

export function CostViewTabs({
  onSelect,
  value,
}: {
  onSelect(value: CostView): void;
  value: CostView;
}) {
  const { t } = useI18n();
  const refs = useRef<Partial<Record<CostView, HTMLButtonElement>>>({});
  const selectFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, current: CostView) => {
    const currentIndex = COST_VIEWS.indexOf(current);
    const nextIndex = event.key === "ArrowRight"
      ? (currentIndex + 1) % COST_VIEWS.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + COST_VIEWS.length) % COST_VIEWS.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? COST_VIEWS.length - 1
            : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = COST_VIEWS[nextIndex]!;
    onSelect(next);
    refs.current[next]?.focus();
  };
  return (
    <div aria-label={t("cost.tabs.label")} className="flex min-w-0 gap-1 overflow-x-auto border-b" role="tablist">
      {COST_VIEWS.map((view) => {
        const selected = view === value;
        return (
          <button
            aria-controls={`cost-panel-${view}`}
            aria-selected={selected}
            className={cn(
              "relative shrink-0 px-3 py-2 text-sm font-medium text-muted-foreground transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              selected && "text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary",
            )}
            id={`cost-tab-${view}`}
            key={view}
            onClick={() => onSelect(view)}
            onKeyDown={(event) => selectFromKeyboard(event, view)}
            ref={(node) => { refs.current[view] = node ?? undefined; }}
            role="tab"
            tabIndex={selected ? 0 : -1}
            type="button"
          >
            {t(view === "overview" ? "cost.tabs.overview" : "cost.tabs.trend")}
          </button>
        );
      })}
    </div>
  );
}
