import { ChevronDown, Pin } from "lucide-react";
import type { RefObject } from "react";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../shared/ui/primitives/tooltip";
import { resourceTypePresentation, type ResourceCategoryPresentation } from "./resourcePresentation";
import type { CatalogEntry } from "./resourcesCatalogModel";

export function CatalogDisclosure({
  children,
  count,
  expanded,
  icon: Icon,
  label,
  onToggle,
}: {
  children: React.ReactNode;
  count: number;
  expanded: boolean;
  icon: ResourceCategoryPresentation["icon"];
  label: string;
  onToggle: () => void;
}) {
  const { formatNumber, t } = useI18n();
  const countLabel = formatNumber(count);
  return (
    <section className="min-w-0">
      <button
        aria-expanded={expanded}
        aria-label={t("resources.catalog.groupAria", { count: countLabel, label })}
        className="group flex h-8 w-full min-w-0 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        onClick={onToggle}
        title={label}
        type="button"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
            !expanded && "-rotate-90",
          )}
        />
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] leading-none tabular-nums text-foreground group-hover:bg-background">
          {countLabel}
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none",
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-w-0 overflow-hidden">
          <div className="space-y-0.5 pt-0.5 pb-1 pl-2">{children}</div>
        </div>
      </div>
    </section>
  );
}

export function CatalogItemRow({
  entry,
  highlighted,
  highlightedRef,
  onSelect,
  onTogglePinned,
  pinned,
  rowId,
  selected,
  selectedRef,
}: {
  entry: CatalogEntry;
  highlighted: boolean;
  highlightedRef: RefObject<HTMLButtonElement | null>;
  onSelect: (entry: CatalogEntry) => void;
  onTogglePinned: (resourceType: string) => void;
  pinned: boolean;
  rowId: string;
  selected: boolean;
  selectedRef: RefObject<HTMLButtonElement | null>;
}) {
  const { formatNumber, t } = useI18n();
  const presentation = resourceTypePresentation(entry.item.resourceType);
  const Icon = presentation.icon;
  const countLabel = formatNumber(entry.item.count);
  const ref = highlighted ? highlightedRef : selected ? selectedRef : undefined;
  return (
    <div className={cn(
      "group/item flex min-w-0 items-center rounded-lg transition-colors motion-reduce:transition-none",
      selected ? "bg-secondary text-secondary-foreground" : highlighted ? "bg-muted text-foreground" : "hover:bg-muted/70",
    )}>
      <button
        aria-current={selected ? "page" : undefined}
        aria-label={t("resources.catalog.itemAria", { count: countLabel, label: entry.label })}
        className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-l-lg px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id={rowId}
        onClick={() => onSelect(entry)}
        ref={ref}
        title={entry.label}
        type="button"
      >
        <span className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground",
          selected && "border-foreground/10 text-foreground",
        )}>
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
        <Tooltip>
          <TooltipTrigger render={<span className="min-w-0 flex-1 truncate text-left font-medium" />}>
            {entry.label}
          </TooltipTrigger>
          <TooltipContent>{entry.label}</TooltipContent>
        </Tooltip>
        <span className={cn(
          "min-w-7 shrink-0 rounded-md px-1.5 py-0.5 text-center font-mono text-[11px] leading-none tabular-nums",
          entry.item.count === 0 ? "bg-muted text-muted-foreground" : "bg-background text-foreground",
        )}>
          {countLabel}
        </span>
      </button>
      <Tooltip>
        <TooltipTrigger render={(
          <button
            aria-label={t(pinned ? "resources.catalog.unpin" : "resources.catalog.pin", { label: entry.label })}
            className={cn(
              "mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-[color,opacity,background-color] hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              pinned ? "opacity-100 text-foreground" : "opacity-40 group-hover/item:opacity-100 group-focus-within/item:opacity-100",
            )}
            onClick={() => onTogglePinned(entry.item.resourceType)}
            type="button"
          />
        )}>
          <Pin aria-hidden="true" className={cn("size-3.5", pinned && "fill-current")} />
        </TooltipTrigger>
        <TooltipContent>
          {t(pinned ? "resources.catalog.unpin" : "resources.catalog.pin", { label: entry.label })}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
