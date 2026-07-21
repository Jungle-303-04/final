import { LogOut, Settings, UserRound } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";

import type { AuthenticatedAuthState } from "../../../features/auth/authContract";
import { presentProductSession } from "../../../features/auth/sessionPresentation";
import { useI18n } from "../../i18n";
import { ThemeSelectionList } from "../ThemeToggle";
import type { ProductThemeController } from "../useProductTheme";
import { Alert, AlertDescription, AlertTitle } from "../primitives/alert";
import { Button, buttonVariants } from "../primitives/button";
import { cn } from "@/shared/lib/cn";
import { Popover, PopoverContent } from "../primitives/popover";
import { Separator } from "../primitives/separator";
import {
  SidebarMenu,
  SidebarMenuItem,
} from "../primitives/sidebar-menu";
import { SidebarText, useSidebar } from "../primitives/sidebar";
import { Spinner } from "../primitives/spinner";
import { SidebarMenuPopoverTrigger } from "./SidebarMenuPopoverTrigger";

export function SidebarProfileMenu({
  auth,
  settingsHref,
  themeController,
}: {
  auth: AuthenticatedAuthState;
  settingsHref: string;
  themeController: ProductThemeController;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const { isMobile } = useSidebar();
  const issueId = useId();
  const profile = presentProductSession(auth.session);
  const openLabel = t("shell.profile.open", { name: profile.displayName });
  const issueMessage = auth.signOutIssue
    ? auth.signOutIssue.safeDetail
      ?? t(auth.signOutIssue.messageKey, auth.signOutIssue.messageParams)
    : null;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuPopoverTrigger label={openLabel} tooltip={profile.fullIdentity}>
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-sidebar-primary text-[0.65rem] font-semibold text-sidebar-primary-foreground">
              {profile.avatarLabel}
            </span>
            <SidebarText className="flex-1" title={profile.fullIdentity}>
              <span className="block truncate">{profile.displayName}</span>
              <span className="block truncate text-xs font-normal text-sidebar-foreground/60">
                {profile.secondaryLabel}
              </span>
            </SidebarText>
          </SidebarMenuPopoverTrigger>
        </SidebarMenuItem>
      </SidebarMenu>
      <PopoverContent
        align="end"
        aria-label={t("shell.profile.label")}
        className="w-72 p-2"
        side={isMobile ? "top" : "right"}
      >
        <div className="flex min-w-0 items-center gap-3 px-2 py-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {profile.avatarLabel}
          </span>
          <div className="min-w-0" title={profile.fullIdentity}>
            <p className="truncate text-sm font-medium">{profile.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.secondaryLabel}</p>
          </div>
        </div>
        <Separator className="my-1" />
        <Link
          className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-start")}
          onClick={() => setOpen(false)}
          to={`${settingsHref}#profile`}
        >
          <UserRound aria-hidden="true" data-icon="inline-start" />
          {t("shell.profile.account")}
        </Link>
        <Link
          className={cn(buttonVariants({ variant: "ghost" }), "w-full justify-start")}
          onClick={() => setOpen(false)}
          to={settingsHref}
        >
          <Settings aria-hidden="true" data-icon="inline-start" />
          {t("shell.profile.settings")}
        </Link>
        <Separator className="my-1" />
        <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
          {t("shell.profile.theme")}
        </p>
        <ThemeSelectionList controller={themeController} />
        <Separator className="my-1" />
        <Button
          aria-describedby={auth.signOutIssue ? issueId : undefined}
          aria-busy={auth.signOutPending || undefined}
          className="w-full justify-start"
          disabled={auth.signOutPending}
          onClick={auth.onSignOut}
          variant="ghost"
        >
          {auth.signOutPending
            ? <Spinner data-icon="inline-start" decorative />
            : <LogOut aria-hidden="true" data-icon="inline-start" />}
          {auth.signOutPending ? t("auth.logout.pending") : t("auth.logout.action")}
        </Button>
        {auth.signOutIssue ? (
          <Alert className="mt-2 [overflow-wrap:anywhere]" id={issueId} variant="destructive">
            <AlertTitle>{t("auth.logout.error.title")}</AlertTitle>
            <AlertDescription>{issueMessage}</AlertDescription>
          </Alert>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
