import { cloneElement, type ComponentProps, type ReactElement } from "react";

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
  render?: ReactElement<{
    "aria-label"?: string;
    className?: string;
    "data-slot"?: string;
    tabIndex?: number;
  }>;
  side?: TooltipSide;
  value: string;
}) {
  const triggerClassName = cn(
    "block min-w-0 truncate rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
    className,
  );
  const trigger = render
    ? cloneElement(render, {
        "aria-label": render.props["aria-label"] ?? value,
        className: cn(triggerClassName, render.props.className),
        "data-slot": render.props["data-slot"] ?? "overflow-identity",
        tabIndex: render.props.tabIndex ?? 0,
      })
    : (
        <span
          aria-label={value}
          className={triggerClassName}
          data-slot="overflow-identity"
          tabIndex={0}
        />
      );
  return (
    <Tooltip>
      <TooltipTrigger render={trigger}>
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
