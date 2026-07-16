import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";
import { Spinner } from "./spinner";

interface PaneLoaderProps {
  children?: ReactNode;
  className?: string;
  label: ReactNode;
}

function PaneLoader({ children, className, label }: PaneLoaderProps) {
  return (
    <div
      aria-live="polite"
      className={cn("flex items-center justify-center", className)}
      data-slot="pane-loader"
      role="status"
    >
      <span className="relative">
        <Spinner aria-hidden decorative className="size-11" />
        <span className="absolute top-full left-1/2 mt-3 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 text-center text-sm font-semibold tracking-tight text-foreground">
          <span className="block whitespace-nowrap">{label}</span>
          {children ? <span className="block whitespace-normal">{children}</span> : null}
        </span>
      </span>
    </div>
  );
}

export { PaneLoader };
export type { PaneLoaderProps };
