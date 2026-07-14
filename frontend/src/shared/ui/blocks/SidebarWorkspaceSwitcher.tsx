import { Building2, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { useI18n } from "../../i18n";
import {
  SidebarMenu,
  SidebarMenuItem,
} from "../primitives/sidebar-menu";
import { SidebarText, useSidebar } from "../primitives/sidebar";
import { Popover, PopoverContent } from "../primitives/popover";
import { SidebarMenuPopoverTrigger } from "./SidebarMenuPopoverTrigger";

export function SidebarWorkspaceSwitcher({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const { isMobile } = useSidebar();
  const label = t("shell.workspace.current", { workspace: workspaceId });

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuPopoverTrigger label={label} tooltip={label}>
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
              <Building2 aria-hidden="true" className="size-4" />
            </span>
            <SidebarText className="flex-1">
              <span className="block truncate text-xs text-sidebar-foreground/60">
                {t("shell.workspace.label")}
              </span>
              <span className="block truncate">{workspaceId}</span>
            </SidebarText>
            <ChevronsUpDown aria-hidden="true" className="ml-auto size-4 shrink-0 text-sidebar-foreground/50" />
          </SidebarMenuPopoverTrigger>
        </SidebarMenuItem>
      </SidebarMenu>
      <PopoverContent
        align="start"
        aria-label={t("shell.workspace.label")}
        className="w-72 p-3"
        side={isMobile ? "top" : "right"}
      >
        <p className="text-sm font-medium">{workspaceId}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {t("shell.workspace.onlyCurrent")}
        </p>
      </PopoverContent>
    </Popover>
  );
}
