import { LogOut } from "lucide-react";
import { useId } from "react";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { Spinner } from "../../shared/ui/primitives/spinner";
import { cn } from "../../shared/ui/primitives/cn";
import { useI18n } from "../../shared/i18n";
import type { AuthenticatedAuthState } from "./authContract";

export function AuthSessionControl({
  auth,
  mode = "panel",
}: {
  auth: AuthenticatedAuthState;
  mode?: "panel" | "toolbar";
}) {
  const isToolbar = mode === "toolbar";
  const { t } = useI18n();
  const issueId = useId();
  const label = auth.signOutPending ? t("auth.logout.pending") : t("auth.logout.action");
  const issueMessage = auth.signOutIssue
    ? auth.signOutIssue.safeDetail ??
      t(auth.signOutIssue.messageKey, auth.signOutIssue.messageParams)
    : null;
  return (
    <div className={cn(
      "grid min-w-0 gap-2",
      isToolbar ? "relative justify-items-end" : "w-full",
    )}>
      <div className="flex min-w-0 max-w-full items-center justify-end gap-2">
        <div className={cn(
          "min-w-0 text-right",
          isToolbar ? "hidden lg:block lg:w-(--product-toolbar-identity-width)" : "block",
        )}>
          <p className="truncate text-xs font-medium" title={auth.session.userId}>
            {auth.session.userId}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={auth.session.workspaceId}>
            {auth.session.workspaceId}
          </p>
        </div>
        <Button
          aria-describedby={auth.signOutIssue ? issueId : undefined}
          aria-busy={auth.signOutPending || undefined}
          className="h-auto min-h-8 whitespace-normal"
          disabled={auth.signOutPending}
          onClick={auth.onSignOut}
          size={isToolbar ? "icon" : "default"}
          title={isToolbar ? t("auth.logout.action") : undefined}
          type="button"
          variant="outline"
        >
          {auth.signOutPending
            ? <Spinner data-icon="inline-start" decorative />
            : <LogOut aria-hidden="true" data-icon="inline-start" />}
          <span className={isToolbar ? "sr-only" : undefined}>
            {label}
          </span>
        </Button>
      </div>
      {auth.signOutIssue ? (
        <Alert
          className={cn(
            "max-w-sm [overflow-wrap:anywhere]",
            isToolbar &&
              "absolute top-full right-0 z-50 mt-2 max-h-[min(16rem,calc(100svh-5rem))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto shadow-lg",
          )}
          id={issueId}
          variant="destructive"
        >
          <AlertTitle>{t("auth.logout.error.title")}</AlertTitle>
          <AlertDescription>{issueMessage}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
