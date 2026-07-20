import { useRef, type KeyboardEvent } from "react";

import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";

export type CostView = "overview" | "trend" | "rightsizing";

const COST_VIEWS: readonly CostView[] = ["overview", "trend", "rightsizing"];

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
    <div
      aria-label={t("cost.tabs.label")}
      className="flex h-[2.55859375rem] w-fit max-w-full min-w-0 gap-[0.15625rem] overflow-x-auto rounded-[0.703125rem] bg-muted/70 p-[0.15625rem]"
      role="tablist"
    >
      {COST_VIEWS.map((view) => {
        const selected = view === value;
        return (
          <button
            aria-controls={`cost-panel-${view}`}
            aria-selected={selected}
            className={cn(
              "h-[2.24609375rem] shrink-0 whitespace-nowrap rounded-[0.546875rem] px-5 text-label-2 font-bold text-muted-foreground transition-[background-color,color,box-shadow] duration-(--motion-micro)",
              "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              selected && "bg-card text-foreground shadow-sm",
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
            {t(view === "overview"
              ? "cost.tabs.overview"
              : view === "trend"
                ? "cost.tabs.trend"
                : "cost.tabs.rightsizing")}
          </button>
        );
      })}
    </div>
  );
}
