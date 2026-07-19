import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { cn } from "@/shared/lib/cn";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../primitives/tooltip";

type WidgetCollapseProps =
  | {
      collapsible?: false;
      collapseLabel?: never;
      collapsed?: never;
      defaultCollapsed?: never;
      expandLabel?: never;
      onCollapsedChange?: never;
    }
  | {
      collapseLabel: string;
      collapsed?: boolean;
      collapsible: true;
      defaultCollapsed?: boolean;
      expandLabel: string;
      onCollapsedChange?: (collapsed: boolean) => void;
    };

export type WidgetFrameProps = WidgetCollapseProps & {
  children: ReactNode;
  className?: string;
  deepLink?: {
    href: string;
    label: string;
  };
  description?: string;
  editing?: boolean;
  headerActions?: ReactNode;
  title: ReactNode;
};

export function WidgetFrame({
  children,
  className,
  collapseLabel,
  collapsed: controlledCollapsed,
  collapsible = false,
  deepLink,
  defaultCollapsed = false,
  description,
  editing = false,
  expandLabel,
  headerActions,
  onCollapsedChange,
  title,
}: WidgetFrameProps) {
  const [uncontrolledCollapsed, setUncontrolledCollapsed] = useState(defaultCollapsed);
  const collapsed = controlledCollapsed ?? uncontrolledCollapsed;
  const titleId = useId();
  const contentId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "grid min-h-0 overflow-hidden rounded-card bg-card transition-[border-color] duration-(--motion-fade) ease-(--ease-soft) motion-reduce:transition-none",
        editing
          ? "border-[1.5px] border-dashed border-primary/50"
          : "border border-border",
        className,
      )}
      data-collapsed={collapsed || undefined}
      data-editing={editing || undefined}
      data-slot="widget-frame"
    >
      <header className="flex min-w-0 items-center gap-[7px] px-[15px] pt-[13px]">
        <h2
          className="min-w-0 truncate text-body font-bold tracking-[-0.01em] text-foreground"
          id={titleId}
        >
          {title}
        </h2>
        {description ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                aria-label={description}
                className="grid size-5 shrink-0 place-items-center rounded-sm text-caption-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
              >
                <Info aria-hidden="true" className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent>{description}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {headerActions}
          {deepLink ? (
            <a
              aria-label={deepLink.label}
              className="flex items-center gap-0.5 rounded-md px-1 py-0.5 text-caption-2 font-bold text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/60"
              href={deepLink.href}
            >
              {deepLink.label}
              <ChevronRight aria-hidden="true" className="size-3" />
            </a>
          ) : null}
          {collapsible ? (
            <button
              aria-controls={contentId}
              aria-expanded={!collapsed}
              aria-label={collapsed ? expandLabel : collapseLabel}
              className="grid size-[22px] place-items-center rounded-full bg-foreground/5 text-caption-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              onClick={() => {
                const next = !collapsed;
                if (controlledCollapsed === undefined) setUncontrolledCollapsed(next);
                onCollapsedChange?.(next);
              }}
              type="button"
            >
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 transition-transform duration-(--motion-quick) ease-(--ease-soft) motion-reduce:transition-none",
                  collapsed && "-rotate-90",
                )}
              />
            </button>
          ) : null}
        </span>
      </header>
      <div
        className={cn(
          "grid min-h-0 transition-[grid-template-rows,opacity] duration-(--motion-layout) ease-(--ease-soft) motion-reduce:transition-none",
          collapsed ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
        )}
        id={contentId}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="h-full min-h-0 px-[15px] pt-[11px] pb-[13px]">{children}</div>
        </div>
      </div>
    </section>
  );
}
