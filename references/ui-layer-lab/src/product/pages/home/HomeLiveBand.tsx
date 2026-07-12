import { ArrowLeft, Boxes, Cpu, MemoryStick, RotateCcw, Server } from "lucide-react";
import type {
  HomeNodeSummary,
  HomePodCollection,
  HomePodSummary,
} from "../../features/home/homeContract";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "../../shared/ui/primitives/item";
import { HomeRefreshFailure, HomeSectionFailure, HomeSectionLoading } from "./HomeSectionFeedback";
import type { HomePageState, HomeResourceState } from "./useHomePageState";

export function HomeLiveBand({ state }: { state: HomePageState }) {
  const resource = state.selectedNodeName ? state.pods : state.nodes;
  const busy = resource.phase === "loading" || resource.phase === "idle" ||
    (resource.phase === "ready" && resource.refreshing);
  return (
    <Surface
      aria-busy={busy || undefined}
      aria-labelledby="home-live-title"
      className="grid min-w-0 overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="grid gap-1">
          <p className="text-xs font-medium text-muted-foreground">RESOURCE SNAPSHOT</p>
          <h2 className="text-base font-semibold" id="home-live-title">Node와 Pod</h2>
        </div>
        <Badge variant="outline">
          {busy ? "실 API · 갱신 중" : "실 API · 30초 자동 갱신"}
        </Badge>
      </div>
      {state.selectedNodeName ? (
        <PodPanel state={state} />
      ) : (
        <NodePanel state={state} />
      )}
    </Surface>
  );
}

function NodePanel({ state }: { state: HomePageState }) {
  const { nodes } = state;
  if (nodes.phase === "loading" || nodes.phase === "idle") {
    return <HomeSectionLoading label="Node 목록" />;
  }
  if (nodes.phase === "failed") {
    return <HomeSectionFailure failure={nodes.failure} label="Node 목록" onRetry={state.refresh} />;
  }
  if (nodes.data.nodes.length === 0) {
    return (
      <>
        <HomeRefreshFailure failure={nodes.refreshFailure} label="Node 목록" onRetry={state.refresh} />
        <div className="grid min-h-48 place-items-center p-6 text-sm text-muted-foreground">
          현재 응답에 표시된 Node가 없습니다. 전체 수 미확인.
        </div>
      </>
    );
  }
  return (
    <section aria-labelledby="node-list-title" className="grid gap-3 p-4">
      <HomeRefreshFailure failure={nodes.refreshFailure} label="Node 목록" onRetry={state.refresh} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="grid gap-1">
          <h3 className="text-sm font-medium" id="node-list-title">Node</h3>
          <p className="text-xs text-muted-foreground">
            Node를 선택하면 같은 카드에서 해당 Node의 관측 대상 Pod를 표시합니다.
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          표시 {nodes.data.nodes.length}개 · 전체 수 미확인
        </span>
      </div>
      <ul
        aria-label="Node 목록"
        className="grid min-w-0 list-none gap-2 md:grid-cols-2 2xl:grid-cols-3"
        data-render-strategy="content-visibility"
      >
        {nodes.data.nodes.map((node) => (
          <li
            className="[contain-intrinsic-size:auto_7rem] [content-visibility:auto]"
            key={node.id}
          >
            <NodeItem node={node} state={state} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function NodeItem({ node, state }: { node: HomeNodeSummary; state: HomePageState }) {
  return (
    <Item
      as="button"
      className="min-h-28 items-start text-left"
      onClick={() => state.selectNode(node.name)}
      ref={(element) => state.registerNodeButton(node.name, element)}
      variant="outline"
    >
      <ItemMedia variant="icon">
        <Server aria-hidden="true" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className="max-w-full break-all">{node.name}</ItemTitle>
        <ItemDescription>
          Pod {node.podsRunning}/{node.podsCapacity} · 재시작 {node.restartCount}회
        </ItemDescription>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Cpu aria-hidden="true" className="size-3" />
            <span className="sr-only">CPU </span>
            {formatPercent(node.cpuPercent)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MemoryStick aria-hidden="true" className="size-3" />
            <span className="sr-only">메모리 </span>
            {formatPercent(node.memoryPercent)}
          </span>
        </div>
      </ItemContent>
      <ItemActions>
        <StatusMark
          label={node.ready ? "Ready" : "Not ready"}
          tone={node.ready || node.health === "critical" ? node.health : "warning"}
        />
      </ItemActions>
    </Item>
  );
}

function PodPanel({ state }: { state: HomePageState }) {
  return (
    <section aria-labelledby="pod-list-title" className="grid gap-3 p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button onClick={state.closeNode} size="sm" type="button" variant="outline">
          <ArrowLeft aria-hidden="true" />노드 목록으로
        </Button>
        <div className="min-w-0">
          <h3
            className="truncate text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="pod-list-title"
            tabIndex={-1}
          >
            {state.selectedNodeName}의 Pod
          </h3>
          <p className="text-xs text-muted-foreground">시스템·관측 에이전트를 제외한 워크로드 Pod입니다.</p>
        </div>
      </div>
      <PodState onRefresh={state.refresh} state={state.pods} />
    </section>
  );
}

function PodState({
  onRefresh,
  state,
}: {
  onRefresh: () => void;
  state: HomeResourceState<HomePodCollection>;
}) {
  if (state.phase === "loading" || state.phase === "idle") {
    return <HomeSectionLoading label="Pod 목록" />;
  }
  if (state.phase === "failed") {
    return <HomeSectionFailure failure={state.failure} label="Pod 목록" onRetry={onRefresh} />;
  }
  if (state.data.pods.length === 0) {
    return (
      <>
        <HomeRefreshFailure failure={state.refreshFailure} label="Pod 목록" onRetry={onRefresh} />
        <div className="grid min-h-40 place-items-center p-6 text-sm text-muted-foreground">
          현재 응답에 표시된 워크로드 Pod가 없습니다. 전체 수 미확인.
        </div>
      </>
    );
  }
  return (
    <>
      <HomeRefreshFailure failure={state.refreshFailure} label="Pod 목록" onRetry={onRefresh} />
      <p className="text-xs text-muted-foreground">
        표시 {state.data.pods.length}개 · 전체 수 미확인
      </p>
      <div className="grid min-w-0 gap-2 md:grid-cols-2">
        {state.data.pods.map((pod) => <PodItem key={pod.id} pod={pod} />)}
      </div>
    </>
  );
}

function PodItem({ pod }: { pod: HomePodSummary }) {
  return (
    <Item variant="outline">
      <ItemMedia variant="icon"><Boxes aria-hidden="true" /></ItemMedia>
      <ItemContent>
        <ItemTitle className="max-w-full break-all">{pod.name}</ItemTitle>
        <ItemDescription>
          {pod.namespace} · {pod.phase} · Ready {pod.readiness.ready}/{pod.readiness.total}
        </ItemDescription>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>CPU {pod.cpuMillicores === null ? "—" : `${pod.cpuMillicores}m`}</span>
          <span>메모리 {pod.memoryMebibytes === null ? "—" : `${pod.memoryMebibytes} MiB`}</span>
          <span className="inline-flex items-center gap-1">
            <RotateCcw aria-hidden="true" className="size-3" />{pod.restartCount}
          </span>
        </div>
      </ItemContent>
      <ItemActions><StatusMark tone={pod.health} /></ItemActions>
    </Item>
  );
}

function formatPercent(value: number | null) {
  return value === null ? "사용할 수 없음" : `${value}%`;
}
