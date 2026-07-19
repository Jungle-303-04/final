import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/cn";

export function ProductSurfaceTitle({
  className,
  icon: Icon,
  id,
  title,
}: {
  className?: string;
  icon: LucideIcon;
  id?: string;
  title: string;
}) {
  return (
    <div
      className={cn("flex min-w-0 items-center gap-[0.78125rem]", className)}
      data-slot="product-surface-title"
    >
      <Icon aria-hidden="true" className="size-[1.328125rem] shrink-0 text-primary" />
      <h1
        className="truncate text-heading font-extrabold tracking-[-0.02em]"
        id={id}
      >
        {title}
      </h1>
    </div>
  );
}
