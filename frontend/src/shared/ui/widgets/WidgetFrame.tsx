import { ChevronDown, Info, MoveRight } from "lucide-react";
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
        "grid min-h-0 overflow-hidden rounded-card border border-border-subtle bg-card",
        className,
      )}
      data-collapsed={collapsed || undefined}
      data-slot="widget-frame"
    >
      <header className="flex min-w-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
        <h2
          className="min-w-0 truncate text-body-strong font-semibold text-foreground"
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
              className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
              href={deepLink.href}
            >
              <MoveRight aria-hidden="true" className="size-4" />
            </a>
          ) : null}
          {collapsible ? (
            <button
              aria-controls={contentId}
              aria-expanded={!collapsed}
              aria-label={collapsed ? expandLabel : collapseLabel}
              className="grid size-7 place-items-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
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
          <div className="h-full min-h-0 p-4">{children}</div>
        </div>
      </div>
    </section>
  );
}
