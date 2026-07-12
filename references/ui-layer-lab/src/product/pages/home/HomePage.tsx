import { CircleAlert, RefreshCw, Server } from "lucide-react";
import type { HomePort, HomePortFailure } from "../../features/home/homeContract";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import { HomeClusterHealth } from "./HomeClusterHealth";
import { HomeIssuesRail } from "./HomeIssuesRail";
import { HomeLiveBand } from "./HomeLiveBand";
import { useHomePageState } from "./useHomePageState";

export function HomePage({ port }: { port: HomePort }) {
  const state = useHomePageState(port);

  if (state.choices.phase === "loading" || state.choices.phase === "idle") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (state.choices.phase === "failed") {
    return <HomeFailureScreen failure={state.choices.failure} onRetry={state.refresh} />;
  }
  if (state.choices.data.clusters.length === 0) {
    return <ProductStateScreen kind="empty" placement="content" />;
  }

  const selectedCluster = state.choices.data.clusters.find(
    (cluster) => cluster.id === state.selectedClusterId,
  );
  const selectItems = state.choices.data.clusters.map((cluster) => ({
    label: clusterOptionLabel(cluster),
    value: cluster.id,
  }));
  const refreshing = [state.choices, state.overview, state.nodes, state.pods].some(
    (resource) => resource.phase === "ready" && resource.refreshing,
  );

  if (state.clusterAccess.kind === "forbidden") {
    return <HomeFailureScreen failure={state.clusterAccess.failure} onRetry={state.refresh} />;
  }

  return (
    <div className="mx-auto grid w-full max-w-[100rem] gap-4 p-4 sm:p-6">
      <header className="flex min-w-0 flex-col justify-between gap-3 xl:flex-row xl:items-center">
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">Fleet Home</h2>
            <Badge variant="outline">실 API · 30초 자동 갱신</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            클러스터 상태에서 Node와 Pod까지 같은 흐름으로 탐색합니다.
          </p>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 xl:w-auto">
          {selectedCluster ? (
            <StatusMark
              label={connectionLabel(selectedCluster.connectionState)}
              tone={connectionTone(selectedCluster.connectionState)}
            />
          ) : null}
          <Select
            items={selectItems}
            onValueChange={(value) => { if (value) state.selectCluster(value); }}
            value={selectedCluster?.id ?? null}
          >
            <SelectTrigger
              aria-label="클러스터 선택"
              className="w-full min-w-0 flex-1 xl:w-96 xl:flex-none"
            >
              <Server aria-hidden="true" />
              <SelectValue placeholder="클러스터 선택" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectLabel>조회 가능한 클러스터</SelectLabel>
                {selectItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            aria-label="새로 고침"
            disabled={refreshing}
            onClick={state.refresh}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw
              aria-hidden="true"
              className={refreshing ? "motion-safe:animate-spin" : undefined}
              data-icon="inline-start"
            />
          </Button>
        </div>
      </header>

      {!state.selectedClusterExists ? (
        <UnknownCluster clusterId={state.selectedClusterId} />
      ) : (
        <>
          <PartialFailureBanner state={state} />
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid min-w-0 content-start gap-4">
              <HomeClusterHealth
                cluster={selectedCluster ?? null}
                onRefresh={state.refresh}
                overview={state.overview}
              />
              <HomeLiveBand state={state} />
            </div>
            <HomeIssuesRail
              cluster={selectedCluster ?? null}
              onRefresh={state.refresh}
              overview={state.overview}
            />
          </div>
        </>
      )}
    </div>
  );
}

function UnknownCluster({ clusterId }: { clusterId: string | null }) {
  return (
    <Surface aria-labelledby="unknown-cluster-title" className="grid min-h-72 place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <CircleAlert aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold" id="unknown-cluster-title">
          현재 조회 목록에서 확인할 수 없습니다
        </h2>
        <p className="text-sm text-muted-foreground">
          URL의 {clusterId ? <code className="font-mono">{clusterId}</code> : "클러스터"} 범위를
          현재 조회 목록에서 확인할 수 없습니다. 자동으로 다른 클러스터로 바꾸지 않았습니다.
          위 선택기에서 접근 가능한 대상을 고르세요.
        </p>
      </div>
    </Surface>
  );
}

function PartialFailureBanner({ state }: { state: ReturnType<typeof useHomePageState> }) {
  const failures = [state.overview, state.nodes].filter(
    (section) => section.phase === "failed" ||
      (section.phase === "ready" && section.refreshFailure !== null),
  );
  if (failures.length === 0) return null;
  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>일부 정보를 불러오지 못했습니다</AlertTitle>
      <AlertDescription>
        성공한 실 API 응답만 유지했습니다. 누락 영역은 값을 0으로 대체하지 않습니다.
      </AlertDescription>
    </Alert>
  );
}

function HomeFailureScreen({
  failure,
  onRetry,
}: {
  failure: HomePortFailure;
  onRetry: () => void;
}) {
  if (failure.code === "forbidden") {
    return (
      <ProductStateScreen
        issue={{ code: "forbidden" }}
        kind="forbidden"
        placement="content"
      />
    );
  }
  if (failure.code === "offline") {
    return (
      <ProductStateScreen
        issue={{ code: "network" }}
        kind="offline"
        placement="content"
        retry={{ label: "다시 연결", onRetry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "server" }}
      kind="error"
      placement="content"
      retry={{
        label: "다시 불러오기",
        onRetry,
        pending: false,
      }}
    />
  );
}

function clusterOptionLabel(cluster: {
  connectionState: string;
  environment: string;
  id: string;
  name: string;
}) {
  return `${cluster.name} · ${cluster.environment} · ${cluster.id} · ${connectionLabel(cluster.connectionState)}`;
}

function connectionTone(state: string) {
  if (state === "online") return "healthy" as const;
  if (state === "stale") return "stale" as const;
  if (state === "offline") return "critical" as const;
  return "unknown" as const;
}

function connectionLabel(state: string) {
  const labels: Record<string, string> = {
    online: "연결됨",
    stale: "연결 지연",
    pending: "연결 대기",
    offline: "연결 끊김",
    unknown: "연결 상태 알 수 없음",
  };
  return labels[state] ?? labels.unknown;
}
