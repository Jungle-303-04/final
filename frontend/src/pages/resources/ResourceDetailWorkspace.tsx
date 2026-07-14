import { Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type {
  ResourceDetail,
  ResourceIdentity,
} from "../../features/resources/resourcesContract";
import type { ResourceActionsPort } from "../../features/resources/resourceCapabilitiesContract";
import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import type { ResourcesResourceState } from "./resourcesPageStateModel";
import { ResourceDetailBody } from "./ResourceDetailSheet";
import { ResourceDetailActions } from "./ResourceDetailActions";
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function ResourceDetailWorkspace({
  detail,
  identity,
  actionsPort,
  capabilities,
  onClose,
  onTabChange,
  tab,
}: {
  detail: ResourcesResourceState<ResourceDetail>;
  identity: ResourceIdentity | null;
  actionsPort: ResourceActionsPort;
  capabilities: ResourceCapabilitiesFrame;
  onClose: () => void;
  onTabChange: (tab: string) => void;
  tab: string;
}) {
  const { t } = useI18n();
  const filter = useUnifiedFilter();
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const title = identity
    ? t("resources.detail.title", { name: identity.name })
    : t("resources.detail.errorTitle");
  const labels = contextLabels(filter.state, t);

  useEffect(() => {
    closeRef.current?.focus();
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const requestClose = () => {
    if (closing) return;
    if (reducedMotion) {
      onClose();
      return;
    }
    setClosing(true);
    closeTimer.current = window.setTimeout(onClose, 320);
  };

  return (
    <section
      aria-labelledby="resource-detail-workspace-title"
      aria-modal="true"
      className="motion-detail-workspace grid min-h-[calc(100svh-3.5rem)] min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-background"
      data-closing={closing || undefined}
      data-slot="resource-detail-workspace"
      onKeyDown={(event) => trapWorkspaceKey(event, rootRef.current, requestClose)}
      ref={rootRef}
      role="dialog"
    >
      <header className="grid min-w-0 gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            aria-label={t("resources.detail.close")}
            className="relative shrink-0"
            onClick={requestClose}
            ref={closeRef}
            size="icon"
            type="button"
            variant="outline"
          >
            <Minimize2 aria-hidden="true" />
          </Button>
          <div className="min-w-0">
            <h2
              className="font-heading text-lg font-medium [overflow-wrap:anywhere]"
              id="resource-detail-workspace-title"
            >
              {title}
            </h2>
            <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {identity
                ? `${identity.kind} · ${identity.namespace ?? t("resources.detail.clusterScope")}`
                : t("resources.detail.identityDescription")}
            </p>
          </div>
        </div>
        <div
          aria-label={t("resources.detail.context")}
          className="flex min-w-0 flex-wrap items-center gap-1.5"
        >
          {labels.length > 0
            ? labels.map((label) => (
                <Badge key={label} variant="outline">{label}</Badge>
              ))
            : <span className="text-xs text-muted-foreground">{t("resources.detail.contextAll")}</span>}
        </div>
        {detail.phase === "ready" ? (
          <ResourceDetailActions
            actionsPort={actionsPort}
            capabilities={capabilities}
            detail={detail.data}
          />
        ) : null}
      </header>
      <div className="min-h-0 min-w-0 overflow-y-auto px-4 pb-6 sm:px-6">
        <ResourceDetailBody
          detail={detail}
          identity={identity}
          onTabChange={onTabChange}
          tab={tab}
        />
      </div>
    </section>
  );
}

function trapWorkspaceKey(
  event: React.KeyboardEvent<HTMLElement>,
  root: HTMLElement | null,
  onClose: () => void,
) {
  if (event.key === "Escape") {
    event.preventDefault();
    onClose();
    return;
  }
  if (event.key !== "Tab" || root === null) return;
  const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (focusable.length === 0) return;
  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function contextLabels(
  state: ReturnType<typeof useUnifiedFilter>["state"],
  t: ReturnType<typeof useI18n>["t"],
): string[] {
  return [
    ...state.common.clusters.map((value) => `${t("shell.filter.group.cluster")}: ${value}`),
    ...state.common.namespaces.map(({ namespace }) => `${t("shell.filter.group.namespace")}: ${namespace}`),
    ...state.common.applications.map((value) => `${t("shell.filter.group.application")}: ${value}`),
    ...state.common.labels.map(({ key, value }) => `${t("shell.filter.group.label")}: ${key}=${value}`),
    ...state.resources.types.map((value) => `${t("shell.filter.group.resource")}: ${value}`),
    ...(state.resources.query
      ? [`${t("shell.filter.group.resource")}: ${state.resources.query}`]
      : []),
  ];
}
