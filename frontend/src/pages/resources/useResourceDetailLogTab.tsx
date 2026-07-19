import { useEffect, useEffectEvent, type ReactNode } from "react";

import { LogStreamTab } from "../../app/LogStreamTab";
import type { BottomDockController } from "../../features/bottom-dock/BottomDockProvider";
import { logStreamTargetKey } from "../../features/log-stream/logStreamContract";
import { logStreamTargetFromDetail } from "../../features/log-stream/logStreamTarget";
import type { ResourceDetail } from "../../features/resources/resourcesContract";
import type { ResourcesResourceState } from "./resourcesPageStateModel";

export function useResourceDetailLogTab(
  detail: ResourcesResourceState<ResourceDetail>,
  dock: BottomDockController,
  tab: string,
): { content: ReactNode; target: ReturnType<typeof logStreamTargetFromDetail> } {
  const target = detail.phase === "ready" ? logStreamTargetFromDetail(detail.data) : null;
  const id = target ? logStreamTargetKey(target) : null;
  const stream = id ? dock.tabs.find((candidate) => candidate.id === id) ?? null : null;
  const openCurrentLogStream = useEffectEvent(() => {
    if (target === null) return;
    dock.openLogs(target);
    dock.setCollapsed(true);
  });
  useEffect(() => {
    if (tab !== "logs" || id === null) return;
    openCurrentLogStream();
  }, [id, tab]);
  return {
    target,
    content: stream ? (
      <div className="flex min-h-[28rem] overflow-hidden rounded-lg border bg-code">
        <LogStreamTab onRetry={() => dock.retryTab(stream.id)} tab={stream} />
      </div>
    ) : undefined,
  };
}
