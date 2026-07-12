import { Activity, Boxes, Cpu, MemoryStick, Server } from "lucide-react";
import type { ReactNode } from "react";
import type {
  HomeClusterChoice,
  HomeClusterOverview,
} from "../../features/home/homeContract";
import { Metric } from "../../shared/ui/Metric";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
import { Progress } from "../../shared/ui/primitives/progress";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { HomeRefreshFailure, HomeSectionFailure } from "./HomeSectionFeedback";
import type { HomeResourceState } from "./useHomePageState";

export function HomeClusterHealth({
  cluster,
  overview,
  onRefresh,
}: {
  cluster: HomeClusterChoice | null;
  overview: HomeResourceState<HomeClusterOverview>;
  onRefresh: () => void;
}) {
  const busy = overview.phase === "loading" || overview.phase === "idle" ||
    (overview.phase === "ready" && overview.refreshing);
  return (
    <Surface
      aria-busy={busy || undefined}
      aria-labelledby="cluster-health-title"
      className="grid min-w-0 gap-0 overflow-hidden"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="grid min-w-0 gap-1">
          <p className="text-xs font-medium text-muted-foreground">CLUSTER HEALTH</p>
          <h2 className="truncate text-base font-semibold" id="cluster-health-title">
            클러스터 상태
          </h2>
        </div>
        {overview.phase === "ready" ? (
          <StatusMark tone={overview.data.health} />
        ) : overview.phase === "failed" ? (
          <StatusMark label="클러스터 요약 오류" tone="critical" />
        ) : cluster ? (
          <StatusMark label="상태 확인 중" tone="unknown" />
        ) : null}
      </div>

      {overview.phase === "loading" || overview.phase === "idle" ? (
        <HealthSkeleton />
      ) : overview.phase === "failed" ? (
        <HomeSectionFailure
          failure={overview.failure}
          label="클러스터 요약"
          onRetry={onRefresh}
        />
      ) : (
        <>
          <HomeRefreshFailure
            failure={overview.refreshFailure}
            label="클러스터 요약"
            onRetry={onRefresh}
          />
          <HealthContent cluster={cluster} overview={overview.data} />
        </>
      )}
    </Surface>
  );
}

function HealthContent({
  cluster,
  overview,
}: {
  cluster: HomeClusterChoice | null;
  overview: HomeClusterOverview;
}) {
  const usage = overview.usage;
  return (
    <div className="grid min-w-0 divide-y">
      <div className="grid min-w-0 grid-cols-2 divide-x sm:grid-cols-3 xl:grid-cols-6">
        <Metric
          label="Pod"
          note={usage ? `${usage.podsRunning} running` : undefined}
          unit="개"
          value={usage?.podsTotal ?? cluster?.podCount ?? null}
        />
        <Metric
          label="Node"
          note={usage ? `${usage.nodesReady} ready` : undefined}
          unit="개"
          value={usage?.nodesTotal ?? cluster?.nodeCount ?? null}
        />
        <Metric
          label="CPU 사용률"
          unavailableLabel="—"
          unit="%"
          value={usage?.cpuPercent ?? null}
        />
        <Metric
          label="메모리 사용률"
          unavailableLabel="—"
          unit="%"
          value={usage?.memoryPercent ?? null}
        />
        <Metric
          label="최근 재시작"
          unavailableLabel="—"
          unit="회"
          value={usage?.restartCount ?? null}
        />
        <Metric
          label="활성 인시던트"
          note={`표시 경고 ${overview.warnings.length} · 전체 수 미확인`}
          tone={(cluster?.incidentCount ?? 0) > 0 ? "critical" : "neutral"}
          unit="건"
          value={cluster?.incidentCount ?? null}
        />
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <UsageProgress
          icon={<Cpu aria-hidden="true" />}
          label="CPU 사용률"
          value={usage?.cpuPercent ?? null}
        />
        <UsageProgress
          icon={<MemoryStick aria-hidden="true" />}
          label="메모리 사용률"
          value={usage?.memoryPercent ?? null}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Server aria-hidden="true" className="size-3.5" />
          {overview.name}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Boxes aria-hidden="true" className="size-3.5" />
          표시 워크로드 {overview.workloads.length}개 · 전체 수 미확인
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Activity aria-hidden="true" className="size-3.5" />
          관측 {formatObservedAt(usage?.observedAt ?? cluster?.lastObservedAt ?? null)}
        </span>
      </div>
    </div>
  );
}

function UsageProgress({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number | null;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <span className="[&_svg]:size-3.5">{icon}</span>{label}
        </span>
        <span className="font-mono text-muted-foreground">
          {value === null ? (
            <>
              <span aria-hidden="true">—</span>
              <span className="sr-only">사용할 수 없음</span>
            </>
          ) : `${value}%`}
        </span>
      </div>
      {value === null ? (
        <div aria-hidden="true" className="h-2 w-full rounded-full bg-secondary" />
      ) : (
        <Progress
          aria-label={label}
          value={Math.max(0, Math.min(value, 100))}
          valueText={value > 100 ? `${value}% (표시 상한 100%)` : `${value}%`}
        />
      )}
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div aria-atomic="true" aria-live="polite" className="grid gap-4 p-4" role="status">
      <span className="sr-only">클러스터 요약을 불러오는 중입니다.</span>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton className="h-16" key={index} />
        ))}
      </div>
      <Skeleton aria-hidden="true" className="h-10" />
    </div>
  );
}

function formatObservedAt(value: string | null) {
  if (!value) return "알 수 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
