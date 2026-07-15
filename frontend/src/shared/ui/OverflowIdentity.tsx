import type { ComponentProps, ReactElement } from "react";

import { cn } from "../lib/cn";
import { shortIdentity } from "../presentation/shortIdentity";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./primitives/tooltip";

type TooltipSide = ComponentProps<typeof TooltipContent>["side"];

export function OverflowIdentity({
  className,
  render,
  side = "top",
  value,
}: {
  className?: string;
  render?: ReactElement;
  side?: TooltipSide;
  value: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={render ?? (
          <span
            className={cn(
              "block min-w-0 truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              className,
            )}
            data-slot="overflow-identity"
            tabIndex={0}
          />
        )}
      >
        {shortIdentity(value)}
      </TooltipTrigger>
      <TooltipContent
        className="cursor-copy break-all select-all"
        data-copy-value={value}
        onClick={() => void globalThis.navigator?.clipboard?.writeText(value)}
        side={side}
      >
        {value}
      </TooltipContent>
    </Tooltip>
  );
}
