import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Surface } from "./Surface";

interface ProductPageHeaderProps {
  actions?: ReactNode;
  description: string;
  icon: LucideIcon;
  meta?: ReactNode;
  title: string;
}

export function ProductPageHeader({
  actions,
  description,
  icon: Icon,
  meta,
  title,
}: ProductPageHeaderProps) {
  return (
    <Surface as="div" className="overflow-hidden shadow-xs">
      <header className="flex min-w-0 flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-primary-soft-border bg-primary-soft text-primary-soft-foreground shadow-xs">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
            {meta ? (
              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
                {meta}
              </div>
            ) : null}
            <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {description}
            </p>
          </div>
        </div>
        {actions ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 lg:max-w-[48%] lg:justify-end">
            {actions}
          </div>
        ) : null}
      </header>
    </Surface>
  );
}
