import { Maximize2, Minimize2, ScrollText, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type {
  ResourceDetail,
  ResourceIdentity,
} from "../../features/resources/resourcesContract";
import type { ResourceActionsPort } from "../../features/resources/resourceCapabilitiesContract";
import type { ResourceManifestPort } from "../../features/resources/resourceManifestContract";
import { usePrefersReducedMotion } from "../../motion/usePrefersReducedMotion";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { StatusMark } from "../../shared/ui/StatusMark";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import type { ResourcesResourceState } from "./resourcesPageStateModel";
import type { ResourceMetricsHistoryFrame } from "./useResourceMetricsHistoryDataFrame";
import { ResourceDetailBody } from "./ResourceDetailSheet";
import { ResourceDetailActions } from "./ResourceDetailActions";
import {
  ResourceManifestEditor,
  type ResourceManifestEditorHandle,
} from "./ResourceManifestEditor";
import type { ResourceCapabilitiesFrame } from "./useResourceCapabilitiesDataFrame";
import type { ResourceIssuesFrame } from "./useResourceIssuesDataFrame";
import { useBottomDock } from "../../features/bottom-dock/BottomDockProvider";
import { logStreamTargetFromDetail } from "../../features/log-stream/logStreamTarget";
import {
  EMPTY_POD_TERMINAL_PORT,
  type PodTerminalCoordinates,
  type PodTerminalPort,
} from "../../features/pod-terminal/podTerminalContract";
import { PodTerminalDialog } from "./PodTerminalDialog";
import type { ServiceAccessPort } from "../../features/service-access/serviceAccessContract";
import type { PortForwardSessionPort } from "../../features/service-access/portForwardSessionContract";
import { ServiceAccessActions } from "./ServiceAccessActions";
import type { ChecksPort } from "../../features/checks/checksContract";
import type { ResourceFilesPort } from "../../features/resource-files/resourceFilesContract";
import { ResourceFilesystemBrowser } from "./ResourceFilesystemBrowser";

export function ResourceDetailWorkspace({
  detail,
  identity,
  actionsPort,
  capabilities,
  onClose,
  onFullChange,
  onTabChange,
  full,
  metricHistory,
  resourceIssues,
  checksPort,
  manifestPort,
  onUnauthorized,
  onNavigateResource,
  onResourceActionInvalidation,
  tab,
  terminalPort = EMPTY_POD_TERMINAL_PORT,
  serviceAccessPort,
  portForwardSessions,
  resourceFilesPort,
}: {
  detail: ResourcesResourceState<ResourceDetail>;
  identity: ResourceIdentity | null;
  actionsPort: ResourceActionsPort;
  capabilities: ResourceCapabilitiesFrame;
  onClose: () => void;
  onFullChange: (full: boolean) => void;
  onTabChange: (tab: string) => void;
  full: boolean;
  metricHistory: ResourceMetricsHistoryFrame;
  resourceIssues: ResourceIssuesFrame;
  checksPort?: ChecksPort;
  manifestPort?: ResourceManifestPort;
  onUnauthorized?: () => void;
  onNavigateResource: (identity: ResourceIdentity) => void;
  onResourceActionInvalidation?: () => void;
  tab: string;
  terminalPort?: PodTerminalPort;
  serviceAccessPort?: ServiceAccessPort;
  portForwardSessions?: PortForwardSessionPort;
  resourceFilesPort?: ResourceFilesPort;
}) {
  const { t } = useI18n();
  const dock = useBottomDock();
  const filter = useUnifiedFilter();
  const reducedMotion = usePrefersReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const manifestEditorRef = useRef<ResourceManifestEditorHandle>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [preferredTerminalTarget, setPreferredTerminalTarget] = useState<PodTerminalCoordinates | null>(null);
  const clearPreferredTerminalTarget = useCallback(() => {
    setPreferredTerminalTarget(null);
  }, []);
  const title = identity
    ? t("resources.detail.title", { name: identity.name })
    : t("resources.detail.errorTitle");
  const labels = contextLabels(filter.state, t);
  const logTarget = detail.phase === "ready" ? logStreamTargetFromDetail(detail.data) : null;

  useEffect(() => {
    closeRef.current?.focus();
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);
  useEffect(() => {
    if (tab !== "manifest" || detail.phase !== "ready" || !manifestPort) return;
    manifestEditorRef.current?.open();
    onTabChange("overview");
  }, [detail.phase, manifestPort, onTabChange, tab]);

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
      className="motion-detail-workspace grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-background shadow-2xl shadow-black/5"
      data-closing={closing || undefined}
      data-detail-size={full ? "full" : "peek"}
      data-motion-side="end"
      data-slot="resource-detail-workspace"
      onKeyDown={(event) => {
        if (event.key.toLowerCase() === "l" && !isEditingElement(event.target) && logTarget) {
          event.preventDefault();
          dock.openLogs(logTarget);
          return;
        }
        if (
          event.key.toLowerCase() === "y" &&
          !isEditingElement(event.target) &&
          detail.phase === "ready" &&
          manifestPort
        ) {
          event.preventDefault();
          manifestEditorRef.current?.open();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          requestClose();
        }
      }}
      ref={rootRef}
      role="dialog"
    >
      <header className="grid min-w-0 gap-3 border-b px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0 flex-1">
            <OverflowIdentity
              className="font-heading text-lg font-medium"
              render={<h2 aria-label={title} id="resource-detail-workspace-title" />}
              value={title}
            />
            <OverflowIdentity
              className="text-sm text-muted-foreground"
              render={<p />}
              value={identity
                ? `${identity.kind} · ${identity.namespace ?? t("resources.detail.clusterScope")}`
                : t("resources.detail.identityDescription")}
            />
          </div>
          {detail.phase === "ready" ? (
            <StatusMark
              label={detail.data.resource.healthStatus}
              tone={detail.data.resource.health}
            />
          ) : null}
          <Button
            aria-label={full ? t("resources.detail.collapse") : t("resources.detail.expand")}
            className="relative shrink-0"
            onClick={() => onFullChange(!full)}
            size="icon"
            type="button"
            variant="outline"
          >
            {full ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
          </Button>
          <Button
            aria-label={t("resources.detail.close")}
            className="relative shrink-0"
            onClick={requestClose}
            ref={closeRef}
            size="icon"
            type="button"
            variant="outline"
          >
            <X aria-hidden="true" />
          </Button>
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
          <div className="flex min-w-0 flex-wrap items-center gap-2" data-slot="resource-detail-command-bar">
            {logTarget ? (
              <Button
                onClick={() => dock.openLogs(logTarget)}
                size="sm"
                type="button"
                variant="outline"
              >
                <ScrollText aria-hidden="true" />
                {t("shell.shortcut.resources.openLogs")}
              </Button>
            ) : null}
            <PodTerminalDialog
              capabilities={capabilities}
              detail={detail.data}
              port={terminalPort}
              preferredTarget={preferredTerminalTarget}
              onPreferredTargetHandled={clearPreferredTerminalTarget}
            />
            {resourceFilesPort ? (
              <ResourceFilesystemBrowser
                capabilities={capabilities}
                detail={detail.data}
                port={resourceFilesPort}
              />
            ) : null}
            {serviceAccessPort ? (
              <ServiceAccessActions
                detail={detail.data}
                port={serviceAccessPort}
                portForwardSessions={portForwardSessions}
              />
            ) : null}
            <ResourceDetailActions
              actionsPort={actionsPort}
              capabilities={capabilities}
              detail={detail.data}
              onInvalidate={onResourceActionInvalidation}
              onTerminalReady={setPreferredTerminalTarget}
            />
            {manifestPort ? (
              <ResourceManifestEditor
                detail={detail.data}
                onInvalidate={onResourceActionInvalidation}
                onUnauthorized={onUnauthorized}
                port={manifestPort}
                ref={manifestEditorRef}
              />
            ) : null}
          </div>
        ) : null}
      </header>
      <div className="min-h-0 min-w-0 overflow-y-auto px-4 pb-6 sm:px-6">
        <ResourceDetailBody
          detail={detail}
          full={full}
          identity={identity}
          metricHistory={metricHistory}
          metricRange={filter.detail.timeRange ?? "1h"}
          onMetricRangeChange={(range) => filter.updateDetail(
            (current) => ({
              ...current,
              timeRange: range === "1h" ? undefined : range,
            }),
            "time-range",
          )}
          onNavigateResource={onNavigateResource}
          resourceIssues={resourceIssues}
          checksPort={checksPort}
          onTabChange={onTabChange}
          tab={tab}
        />
      </div>
    </section>
  );
}

function isEditingElement(target: EventTarget): boolean {
  return target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable=true]");
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
