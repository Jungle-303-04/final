import { AlertTriangle, Box, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  HomePortFailure,
  type HomePodCollection,
  type HomePodSummary,
  type HomePort,
} from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { Button } from "../../shared/ui/primitives/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/ui/primitives/popover";
import { ScrollArea } from "../../shared/ui/primitives/scroll-area";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import type { PhysicalPodOpenTarget } from "./physicalTopologyGraphTypes";

type NodePodsPort = Pick<HomePort, "loadNodePods">;
type NodePodsFrame =
  | { phase: "idle" | "loading"; data: null }
  | { phase: "ready"; data: HomePodCollection }
  | { phase: "failed"; data: null };

export function NodePodsPopover({
  clusterId,
  expectedTotal,
  nodeName,
  omittedCount,
  onOpenPod,
  onUnauthorized,
  port,
}: {
  clusterId: string;
  expectedTotal: number;
  nodeName: string;
  omittedCount: number;
  onOpenPod: (pod: PhysicalPodOpenTarget) => void;
  onUnauthorized: () => void;
  port: NodePodsPort;
}) {
  const { formatNumber, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [retryRevision, setRetryRevision] = useState(0);
  const [frame, setFrame] = useState<NodePodsFrame>({ phase: "idle", data: null });
  const cacheRef = useRef<{ key: string; data: HomePodCollection } | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const pinnedRef = useRef(false);
  const key = `${clusterId}\u0000${nodeName}`;

  useEffect(() => {
    if (!open) return undefined;
    if (cacheRef.current?.key === key && retryRevision === 0) {
      setFrame({ phase: "ready", data: cacheRef.current.data });
      return undefined;
    }
    const controller = new AbortController();
    setFrame({ phase: "loading", data: null });
    void port.loadNodePods(clusterId, nodeName, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      cacheRef.current = { key, data };
      setRetryRevision(0);
      setFrame({ phase: "ready", data });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      if (error instanceof HomePortFailure && error.code === "unauthorized") {
        onUnauthorized();
      }
      setFrame({ phase: "failed", data: null });
    });
    return () => controller.abort();
  }, [clusterId, key, nodeName, onUnauthorized, open, port, retryRevision]);

  const cancelClose = () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };
  const openFromIntent = () => {
    cancelClose();
    setOpen(true);
  };
  const scheduleClose = () => {
    if (pinnedRef.current) return;
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 140);
  };
  const overlayLabel = t("resources.graph.server.pods.title", { name: nodeName });
  const returnedCount = frame.phase === "ready" ? frame.data.pods.length : 0;
  const returnedPods = frame.phase === "ready" ? frame.data.pods : [];
  const unavailableCount = Math.max(0, expectedTotal - returnedCount);
  const selectPod = (pod: HomePodSummary) => {
    pinnedRef.current = false;
    cancelClose();
    setOpen(false);
    onOpenPod(pod);
  };

  return (
    <Popover
      onOpenChange={(nextOpen, details) => {
        if (details.reason === "trigger-press") {
          const nextPinned = !pinnedRef.current;
          pinnedRef.current = nextPinned;
          cancelClose();
          setOpen(nextPinned);
          return;
        }
        if (
          !nextOpen &&
          pinnedRef.current &&
          (details.reason === "trigger-hover" || details.reason === "focus-out")
        ) return;
        if (!nextOpen) pinnedRef.current = false;
        setOpen(nextOpen);
      }}
      open={open}
    >
      <PopoverTrigger
        aria-label={t("resources.graph.server.pods.open", { name: nodeName })}
        onBlur={scheduleClose}
        onFocus={openFromIntent}
        onPointerEnter={openFromIntent}
        onPointerLeave={scheduleClose}
        render={<Button className="h-6 px-1.5 text-[0.6875rem]" size="sm" variant="ghost" />}
      >
        {t("resources.graph.server.more", { count: formatNumber(omittedCount) })}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-label={overlayLabel}
        className="w-[min(30rem,calc(100vw-1rem))] overflow-hidden p-0"
        initialFocus={false}
        onBlur={scheduleClose}
        onFocus={cancelClose}
        onPointerEnter={cancelClose}
        onPointerLeave={scheduleClose}
        role="dialog"
        side="top"
      >
        <header className="flex items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{overlayLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {frame.phase === "ready"
                ? t("resources.graph.server.pods.returned", {
                    count: formatNumber(returnedCount),
                  })
                : t("resources.graph.server.pods.loading")}
            </p>
          </div>
          <Box aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        </header>

        {frame.phase === "loading" || frame.phase === "idle" ? (
          <div aria-label={t("resources.graph.server.pods.loading")} className="grid gap-2 p-3" role="status">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="h-14 rounded-lg" key={index} />
            ))}
          </div>
        ) : frame.phase === "failed" ? (
          <div className="grid justify-items-center gap-2 px-5 py-7 text-center">
            <AlertTriangle aria-hidden="true" className="size-5 text-destructive" />
            <p className="text-sm font-medium">{t("resources.graph.server.pods.failed")}</p>
            <Button
              onClick={() => {
                cacheRef.current = null;
                setRetryRevision((current) => current + 1);
              }}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("common.action.retry")}
            </Button>
          </div>
        ) : (
          <>
            <ScrollArea
              aria-label={t("resources.graph.server.pods.list", { name: nodeName })}
              className="h-[min(22rem,55vh)]"
              orientation="vertical"
            >
              <ul className="divide-y px-2" role="list">
                {returnedPods.map((pod) => (
                  <PodRow key={pod.id} onOpen={() => selectPod(pod)} pod={pod} />
                ))}
              </ul>
            </ScrollArea>
            {unavailableCount > 0 ? (
              <div className="flex items-start gap-2 border-t bg-amber-500/8 px-3 py-2 text-xs text-muted-foreground">
                <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>
                  {t("resources.graph.server.pods.unavailable", {
                    count: formatNumber(unavailableCount),
                  })}
                </span>
              </div>
            ) : null}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function PodRow({ onOpen, pod }: { onOpen: () => void; pod: HomePodSummary }) {
  const { formatNumber, t } = useI18n();
  const usage = pod.cpuMillicores === null && pod.memoryMebibytes === null
    ? t("resources.graph.server.pods.usageUnavailable")
    : `${pod.cpuMillicores === null ? "—" : `${formatMetric(pod.cpuMillicores)}m`} · ${
      pod.memoryMebibytes === null ? "—" : `${formatMetric(pod.memoryMebibytes)} MiB`
    }`;
  return (
    <li>
      <button
        aria-label={t("resources.table.openDetail", { name: pod.name })}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onOpen}
        type="button"
      >
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{pod.namespace}</span>
            <OverflowIdentity className="text-xs font-semibold" side="left" value={pod.name} />
          </div>
          <p className="mt-1 text-[0.6875rem] text-muted-foreground">
            {pod.phase} · {pod.health}
          </p>
        </div>
        <div className="grid min-w-28 justify-items-end gap-1 text-[0.6875rem]">
          <span className="font-medium tabular-nums">{usage}</span>
          <span className={cn("flex items-center gap-1 text-muted-foreground", pod.restartCount > 0 && "text-destructive") }>
            <RotateCcw aria-hidden="true" className="size-3" />
            {t("resources.graph.server.pods.restarts", {
              count: formatNumber(pod.restartCount),
            })}
          </span>
        </div>
        <span className="sr-only">{t("resources.table.openDetail.sr")}</span>
      </button>
    </li>
  );
}

function formatMetric(value: number): string {
  return Number(value.toFixed(1)).toString();
}
