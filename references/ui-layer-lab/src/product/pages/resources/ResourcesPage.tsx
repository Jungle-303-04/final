import { CircleAlert, RefreshCw, Server } from "lucide-react";
import { useEffect } from "react";
import type { HomePort } from "../../features/home/homeContract";
import type {
  ResourceList,
  ResourcesPort,
  ResourcesPortFailure,
} from "../../features/resources/resourcesContract";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
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
import { ResourceDetailSheet } from "./ResourceDetailSheet";
import { ResourcesCatalog } from "./ResourcesCatalog";
import { filterResourceRows, ResourcesTable } from "./ResourcesTable";
import { ResourcesToolbar } from "./ResourcesToolbar";
import { useResourcesPageState } from "./useResourcesPageState";

type ClusterPort = Pick<HomePort, "listClusterChoices">;

export function ResourcesPage({
  clusterPort,
  port,
}: {
  clusterPort: ClusterPort;
  port: ResourcesPort;
}) {
  const state = useResourcesPageState(port, clusterPort);
  useResourceTypeShortcuts(state.cycleResourceType);

  if (state.choices.phase === "idle" || state.choices.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (state.choices.phase === "failed") {
    return <ResourcesFailure failure={state.choices.failure} onRetry={state.refresh} />;
  }
  if (state.choices.data.clusters.length === 0) {
    return <ProductStateScreen kind="empty" placement="content" />;
  }
  if (state.denied) {
    return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
  }

  const selectedCluster = state.choices.data.clusters.find(
    (cluster) => cluster.id === state.selectedClusterId,
  );
  const refreshing = [state.choices, state.catalog, state.list, state.detail].some(
    (resource) => resource.phase === "ready" && resource.refreshing,
  );

  return (
    <div className="mx-auto grid w-full max-w-[100rem] gap-4 p-4 sm:p-6">
      <header className="flex min-w-0 flex-col justify-between gap-3 xl:flex-row xl:items-center">
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold tracking-tight">Resources</h2>
            <Badge variant="outline">실 API · 30초 자동 갱신</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            관측된 리소스 종류를 탐색하고 같은 화면에서 서버 계산 관계와 이벤트를 확인합니다.
          </p>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 xl:w-auto">
          <Select
            items={state.choices.data.clusters.map((cluster) => ({
              label: `${cluster.name} · ${cluster.environment} · ${cluster.id}`,
              value: cluster.id,
            }))}
            onValueChange={(value) => { if (value) state.selectCluster(value); }}
            value={selectedCluster?.id ?? null}
          >
            <SelectTrigger aria-label="클러스터 선택" className="min-w-0 flex-1 xl:w-80 xl:flex-none">
              <Server aria-hidden="true" />
              <SelectValue placeholder="클러스터 선택" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectLabel>조회 가능한 클러스터</SelectLabel>
                {state.choices.data.clusters.map((cluster) => (
                  <SelectItem key={cluster.id} value={cluster.id}>
                    {cluster.name} · {cluster.environment} · {cluster.id}
                  </SelectItem>
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
            />
          </Button>
        </div>
      </header>

      {!state.selectedClusterExists ? (
        <UnknownSelection value={state.selectedClusterId} variant="cluster" />
      ) : state.catalog.phase === "loading" || state.catalog.phase === "idle" ? (
        <ProductStateScreen kind="loading" placement="content" />
      ) : state.catalog.phase === "failed" ? (
        <ResourcesFailure failure={state.catalog.failure} onRetry={state.refresh} />
      ) : state.catalog.data.items.length === 0 ? (
        <ProductStateScreen kind="empty" placement="content" />
      ) : (
        <>
          <ResourcesRefreshFeedback state={state} />
          <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <ResourcesCatalog
              items={state.catalog.data.items}
              onSelect={state.selectResourceType}
              selectedResourceType={state.selectedResourceType}
            />
            {state.resourceTypeInvalid || !state.selectedResourceType ? (
              <UnknownSelection value={state.selectedResourceType} variant="resource" />
            ) : !state.catalog.data.items.some(
              (item) => item.resourceType === state.selectedResourceType,
            ) ? (
              <UnknownSelection value={state.selectedResourceType} variant="resource" />
            ) : (
              <ResourcesListSurface state={state} />
            )}
          </div>
        </>
      )}

      <ResourceDetailSheet
        detail={state.detail}
        full={state.fullDetail}
        identity={state.detailIdentity}
        onClose={state.closeDetail}
        onTabChange={state.setDetailTab}
        open={state.detailRequested}
        tab={state.detailTab}
      />
    </div>
  );
}

function ResourcesListSurface({ state }: { state: ReturnType<typeof useResourcesPageState> }) {
  return (
    <Surface aria-labelledby="resources-list-title" className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h3 className="font-medium" id="resources-list-title">{state.selectedResourceType}</h3>
          <p className="text-xs text-muted-foreground">현재 cluster inventory의 정제된 read model</p>
        </div>
        {state.catalog.phase === "ready" ? (
          <Badge variant="secondary">
            snapshot 집계 {state.catalog.data.items.find(
              (item) => item.resourceType === state.selectedResourceType,
            )?.count.toLocaleString() ?? "미확인"}
          </Badge>
        ) : null}
      </div>
      <ResourcesToolbar
        includeDeleted={state.includeDeleted}
        namespace={state.namespace}
        onIncludeDeletedChange={state.setIncludeDeleted}
        onNamespaceChange={state.setNamespace}
        onSearchChange={state.setSearch}
        search={state.search}
      />
      <ResourcesListBody state={state} />
    </Surface>
  );
}

function ResourcesListBody({ state }: { state: ReturnType<typeof useResourcesPageState> }) {
  if (state.list.phase === "idle" || state.list.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (state.list.phase === "failed") {
    return <ResourcesFailure failure={state.list.failure} onRetry={state.refresh} />;
  }
  if (state.list.data.items.length === 0) {
    return <ProductStateScreen kind="empty" placement="content" />;
  }
  const filtered = filterResourceRows(state.list.data.items, state.search);
  return (
    <div className="min-w-0">
      <ListScopeStatus filtered={filtered.length} list={state.list.data} />
      {filtered.length === 0 ? (
        <div className="grid min-h-48 place-items-center p-6 text-sm text-muted-foreground">
          표시된 응답 범위에서 검색 결과가 없습니다.
        </div>
      ) : (
        <ResourcesTable
          items={filtered}
          onOpen={state.openDetail}
          registerRowButton={state.registerRowButton}
        />
      )}
    </div>
  );
}

function ListScopeStatus({ filtered, list }: { filtered: number; list: ResourceList }) {
  const filteredText = filtered === list.returned ? "" : ` · 검색 결과 ${filtered}개`;
  return (
    <div
      aria-label="목록 범위"
      className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
      role="status"
    >
      표시된 {list.returned}개{filteredText} · 전체 수 미확인 · 최대 {list.limit}개 응답
      {list.limitReached ? " · 조회 한도 도달" : ""}
    </div>
  );
}

function ResourcesRefreshFeedback({ state }: { state: ReturnType<typeof useResourcesPageState> }) {
  const listFailure = state.list.phase === "ready" ? state.list.refreshFailure : null;
  const catalogFailure = state.catalog.phase === "ready" ? state.catalog.refreshFailure : null;
  if (!listFailure && !catalogFailure) return null;
  return (
    <Alert>
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{listFailure ? "목록을 갱신하지 못했습니다" : "종류 정보를 갱신하지 못했습니다"}</AlertTitle>
      <AlertDescription>마지막으로 검증된 실 API 응답을 유지합니다.</AlertDescription>
    </Alert>
  );
}

function UnknownSelection({ value, variant }: { value: string | null; variant: "cluster" | "resource" }) {
  const title = variant === "cluster"
    ? "현재 조회 목록에서 확인할 수 없습니다"
    : "관측된 리소스 종류가 아닙니다";
  return (
    <Surface aria-labelledby="unknown-selection-title" className="grid min-h-72 place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <CircleAlert aria-hidden="true" className="size-8 text-muted-foreground" />
        <h3 className="text-lg font-semibold" id="unknown-selection-title">{title}</h3>
        <p className="text-sm text-muted-foreground">
          {value ? <code className="font-mono">{value}</code> : "URL 범위"}를 자동으로 다른 값으로
          바꾸지 않았습니다. 실제 API에서 확인 가능한 항목을 선택하세요.
        </p>
      </div>
    </Surface>
  );
}

function ResourcesFailure({ failure, onRetry }: { failure: ResourcesPortFailure; onRetry: () => void }) {
  if (failure.code === "forbidden") {
    return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
  }
  if (failure.code === "offline") {
    return (
      <ProductStateScreen
        issue={{ code: "network" }}
        kind="offline"
        placement="content"
        retry={{ label: "다시 불러오기", onRetry, pending: false }}
      />
    );
  }
  return (
    <ProductStateScreen
      issue={{ code: failure.code === "invalid-response" ? "invalid-response" : "server" }}
      kind="error"
      placement="content"
      retry={{ label: "다시 불러오기", onRetry, pending: false }}
    />
  );
}

function useResourceTypeShortcuts(cycle: (direction: -1 | 1) => void) {
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey ||
        isEditingTarget(event.target) || document.querySelector('[role="dialog"]')) return;
      if (event.key !== "[" && event.key !== "]") return;
      event.preventDefault();
      cycle(event.key === "]" ? 1 : -1);
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [cycle]);
}

function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement &&
    target.matches("input, textarea, select, [contenteditable=true]");
}
