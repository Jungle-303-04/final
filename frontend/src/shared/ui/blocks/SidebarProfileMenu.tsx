import { LogOut, Settings, UserRound } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";

import type { AuthenticatedAuthState } from "../../../features/auth/authContract";
import { presentProductSession } from "../../../features/auth/sessionPresentation";
import { useI18n } from "../../i18n";
import { Alert, AlertDescription, AlertTitle } from "../primitives/alert";
import { Button, buttonVariants } from "../primitives/button";
import { cn } from "@/shared/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "../primitives/popover";
import { Separator } from "../primitives/separator";
import { Spinner } from "../primitives/spinner";

export function ProfileMenu({
  auth,
  settingsHref,
}: {
  auth: AuthenticatedAuthState;
  settingsHref: string;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const issueId = useId();
  const logoutCapabilityId = useId();
  const profile = presentProductSession(auth.session);
  const openLabel = t("shell.profile.open", { name: profile.displayName });
  const issueMessage = auth.signOutIssue
    ? auth.signOutIssue.safeDetail
      ?? t(auth.signOutIssue.messageKey, auth.signOutIssue.messageParams)
    : null;

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={(
          <Button
            aria-label={openLabel}
            className="rounded-full p-0"
            data-slot="profile-menu-trigger"
            size="icon"
            title={profile.fullIdentity}
            variant="ghost"
          />
        )}
      >
        <span className="grid size-7 place-items-center rounded-full bg-primary text-[0.65rem] font-semibold text-primary-foreground">
          {profile.avatarLabel}
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={t("shell.profile.label")}
        className="w-72 max-w-[calc(100vw-1rem)] p-2"
        side="bottom"
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
        <Button
          aria-describedby={auth.signOutIssue
            ? issueId
            : auth.session.logout.supported
              ? undefined
              : logoutCapabilityId}
          aria-busy={auth.signOutPending || undefined}
          className="w-full justify-start"
          disabled={auth.signOutPending || !auth.session.logout.supported}
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
        {!auth.session.logout.supported ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground" id={logoutCapabilityId}>
            {t("auth.logout.upstreamManaged")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
