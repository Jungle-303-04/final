import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AuthenticatedAuthState,
  ProductWorkspaceList,
} from "../features/auth/authContract";
import { cn } from "../shared/lib/cn";
import { useI18n } from "../shared/i18n";
import { Button } from "../shared/ui/primitives/button";
import { Popover, PopoverContent, PopoverTrigger } from "../shared/ui/primitives/popover";
import { Spinner } from "../shared/ui/primitives/spinner";

type CatalogState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; catalog: ProductWorkspaceList }
  | { kind: "error" };

export function ProductHeaderWorkspaceSwitcher({ auth }: { auth: AuthenticatedAuthState }) {
  const [open, setOpen] = useState(false);
  const [catalogState, setCatalogState] = useState<CatalogState>({ kind: "idle" });
  const [switchingWorkspaceId, setSwitchingWorkspaceId] = useState<string | null>(null);
  const [switchFailed, setSwitchFailed] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const { t } = useI18n();
  const workspaceId = auth.session.workspaceId;
  const label = t("shell.workspace.current", { workspace: workspaceId });

  const loadCatalog = useCallback(() => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setCatalogState({ kind: "loading" });
    setSwitchFailed(false);
    void auth.listWorkspaces(controller.signal).then(
      (catalog) => {
        if (!controller.signal.aborted) {
          setCatalogState(
            catalog.currentWorkspaceId === workspaceId
              ? { kind: "ready", catalog }
              : { kind: "error" },
          );
        }
      },
      () => {
        if (!controller.signal.aborted) setCatalogState({ kind: "error" });
      },
    );
  }, [auth, workspaceId]);

  useEffect(() => () => requestRef.current?.abort(), []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) loadCatalog();
    else requestRef.current?.abort();
  }, [loadCatalog]);

  const selectWorkspace = useCallback(async (nextWorkspaceId: string) => {
    if (nextWorkspaceId === workspaceId || switchingWorkspaceId !== null) return;
    setSwitchingWorkspaceId(nextWorkspaceId);
    setSwitchFailed(false);
    try {
      await auth.switchWorkspace(nextWorkspaceId);
      setOpen(false);
    } catch {
      setSwitchFailed(true);
    } finally {
      setSwitchingWorkspaceId(null);
    }
  }, [auth, switchingWorkspaceId, workspaceId]);

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        render={(
          <Button
            aria-label={label}
            className="min-w-0 gap-2 px-2 sm:w-(--product-toolbar-identity-width) sm:justify-start"
            data-slot="workspace-switcher-trigger"
            title={label}
            variant="ghost"
          />
        )}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
          <Building2 aria-hidden="true" className="size-4" />
        </span>
        <span className="hidden min-w-0 flex-1 flex-col items-start leading-tight sm:flex">
          <span className="block w-full truncate text-[0.625rem] font-normal text-muted-foreground">
            {t("shell.workspace.label")}
          </span>
          <span className="block w-full truncate text-xs">{workspaceId}</span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="hidden size-3.5 shrink-0 text-muted-foreground sm:block"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label={t("shell.workspace.label")}
        className="w-72 max-w-[calc(100vw-1rem)] p-3"
        side="bottom"
      >
        <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("shell.workspace.label")}
        </p>
        {catalogState.kind === "loading" ? (
          <p className="mt-3 flex items-center gap-2 px-1 text-sm text-muted-foreground" role="status">
            <Spinner decorative />
            {t("shell.workspace.loading")}
          </p>
        ) : null}
        {catalogState.kind === "error" ? (
          <div className="mt-3 px-1">
            <p className="text-sm text-destructive" role="alert">
              {t("shell.workspace.loadFailed")}
            </p>
            <button
              className="mt-2 rounded-md border px-2.5 py-1.5 text-xs font-medium outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              onClick={loadCatalog}
              type="button"
            >
              {t("common.action.retry")}
            </button>
          </div>
        ) : null}
        {catalogState.kind === "ready" && catalogState.catalog.items.length === 0 ? (
          <p className="mt-3 px-1 text-sm text-muted-foreground">{t("shell.workspace.empty")}</p>
        ) : null}
        {catalogState.kind === "ready" && catalogState.catalog.items.length > 0 ? (
          <ul
            aria-busy={switchingWorkspaceId !== null}
            aria-label={t("shell.workspace.label")}
            className="mt-2 grid gap-1"
          >
            {catalogState.catalog.items.map((workspace) => {
              const selected = workspace.workspaceId === workspaceId;
              const switching = workspace.workspaceId === switchingWorkspaceId;
              const actionLabel = selected
                ? t("shell.workspace.selected")
                : switching
                  ? t("shell.workspace.switching", { workspace: workspace.name })
                  : t("shell.workspace.switchTo", { workspace: workspace.name });
              return (
                <li key={workspace.workspaceId}>
                  <button
                    aria-current={selected ? "true" : undefined}
                    aria-label={actionLabel}
                    className={cn(
                      "grid w-full min-w-0 grid-cols-[1fr_auto] items-center gap-2 rounded-md px-2 py-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                      selected && "bg-accent/70",
                    )}
                    disabled={selected || switchingWorkspaceId !== null}
                    onClick={() => void selectWorkspace(workspace.workspaceId)}
                    type="button"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{workspace.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {workspace.workspaceId}
                      </span>
                    </span>
                    {selected ? <Check aria-hidden="true" className="size-4" /> : null}
                    {switching ? <Spinner decorative /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
        {switchFailed ? (
          <p className="mt-2 px-1 text-sm text-destructive" role="alert">
            {t("shell.workspace.switchFailed")}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
