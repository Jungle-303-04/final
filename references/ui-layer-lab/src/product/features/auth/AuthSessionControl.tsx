import { LogOut } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { Spinner } from "../../shared/ui/primitives/spinner";
import { cn } from "../../shared/ui/primitives/cn";
import type { AuthenticatedAuthState } from "./authContract";

export function AuthSessionControl({
  auth,
  mode = "panel",
}: {
  auth: AuthenticatedAuthState;
  mode?: "panel" | "toolbar";
}) {
  const isToolbar = mode === "toolbar";
  return (
    <div className={cn("grid min-w-0 gap-2", isToolbar ? "justify-items-end" : "w-full")}>
      <div className="flex min-w-0 max-w-full items-center justify-end gap-2">
        <div className={cn("min-w-0 text-right", isToolbar ? "hidden sm:block" : "block")}>
          <p className="truncate text-xs font-medium" title={auth.session.userId}>
            {auth.session.userId}
          </p>
          <p className="truncate text-xs text-muted-foreground" title={auth.session.workspaceId}>
            {auth.session.workspaceId}
          </p>
        </div>
        <Button
          aria-busy={auth.signOutPending || undefined}
          className="h-auto min-h-8 whitespace-normal"
          disabled={auth.signOutPending}
          onClick={auth.onSignOut}
          size={isToolbar ? "icon" : "default"}
          title={isToolbar ? "로그아웃" : undefined}
          type="button"
          variant="outline"
        >
          {auth.signOutPending
            ? <Spinner data-icon="inline-start" decorative />
            : <LogOut aria-hidden="true" data-icon="inline-start" />}
          <span className={isToolbar ? "sr-only" : undefined}>
            {auth.signOutPending ? "로그아웃 중" : "로그아웃"}
          </span>
        </Button>
      </div>
      {auth.signOutIssue ? (
        <Alert className="max-w-sm [overflow-wrap:anywhere]" variant="destructive">
          <AlertTitle>세션 종료 오류</AlertTitle>
          <AlertDescription>{auth.signOutIssue.message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
