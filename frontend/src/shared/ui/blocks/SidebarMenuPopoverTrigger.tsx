import type { ReactNode } from "react";

import { PopoverTrigger } from "../primitives/popover";
import { sidebarMenuInteractiveClassName } from "../primitives/sidebar-menu";
import { useSidebar } from "../primitives/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "../primitives/tooltip";

export function SidebarMenuPopoverTrigger({
  children,
  label,
  tooltip,
}: {
  children: ReactNode;
  label: string;
  tooltip: string;
}) {
  const { isMobile, state } = useSidebar();
  const trigger = (
    <PopoverTrigger
      aria-label={label}
      className={sidebarMenuInteractiveClassName()}
      data-sidebar-state={state}
    >
      {children}
    </PopoverTrigger>
  );

  if (isMobile || state !== "collapsed") return trigger;
  return (
    <Tooltip>
      <TooltipTrigger render={trigger} />
      <TooltipContent align="center" role="tooltip" side="right">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
