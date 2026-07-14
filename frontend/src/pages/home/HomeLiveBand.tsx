import { ArrowLeft, Boxes, Cpu, MemoryStick, RotateCcw, Server } from "lucide-react";
import type {
  HomeNodeSummary,
  HomePodCollection,
  HomePodSummary,
} from "../../features/home/homeContract";
import { useI18n } from "../../shared/i18n/I18nProvider";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Surface } from "../../shared/ui/Surface";
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
  const { t } = useI18n();
  const resource = state.selectedNodeName ? state.pods : state.nodes;
  const busy = resource.phase === "loading" || resource.phase === "idle" ||
    (resource.phase === "ready" && resource.refreshing);
  return (
    <Surface
      aria-busy={busy || undefined}
      aria-labelledby="home-live-title"
      className="grid min-w-0 overflow-hidden"
    >
      <div className="border-b p-4">
        <h2 className="text-base font-semibold" id="home-live-title">
          {t("home.section.nodeAndPod")}
        </h2>
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
  const { formatNumber, t } = useI18n();
  const { nodes } = state;
  if (nodes.phase === "loading" || nodes.phase === "idle") {
    return <HomeSectionLoading label={t("home.node.list")} />;
  }
  if (nodes.phase === "failed") {
    return <HomeSectionFailure failure={nodes.failure} label={t("home.node.list")} onRetry={state.refresh} />;
  }
  if (nodes.data.nodes.length === 0) {
    return (
      <>
        <HomeRefreshFailure failure={nodes.refreshFailure} label={t("home.node.list")} onRetry={state.refresh} />
        <div className="grid min-h-48 place-items-center p-6 text-sm text-muted-foreground">
          {t("home.node.empty")}
        </div>
      </>
    );
  }
  return (
    <section aria-labelledby="node-list-title" className="grid gap-3 p-4">
      <HomeRefreshFailure failure={nodes.refreshFailure} label={t("home.node.list")} onRetry={state.refresh} />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-sm font-medium" id="node-list-title">{t("home.node.label")}</h3>
        <span className="text-xs text-muted-foreground">
          {t("home.node.count", { count: formatNumber(nodes.data.nodes.length) })}
        </span>
      </div>
      <ul
        aria-label={t("home.node.list")}
        className="flex min-w-0 snap-x list-none gap-3 overflow-x-auto pb-2"
        data-render-strategy="content-visibility"
        data-slot="home-server-band"
      >
        {nodes.data.nodes.map((node) => (
          <li
            className="min-w-[17rem] flex-1 snap-start [contain-intrinsic-size:auto_7rem] [content-visibility:auto]"
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
  const { formatNumber, t } = useI18n();
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
          {t("home.node.description", {
            capacity: formatNumber(node.podsCapacity),
            restarts: formatNumber(node.restartCount),
            running: formatNumber(node.podsRunning),
          })}
        </ItemDescription>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Cpu aria-hidden="true" className="size-3" />
            <span className="sr-only">{t("home.metric.cpu")} </span>
            {formatPercent(node.cpuPercent, formatNumber, t("common.state.unavailable"))}
          </span>
          <span className="inline-flex items-center gap-1">
            <MemoryStick aria-hidden="true" className="size-3" />
            <span className="sr-only">{t("home.metric.memory")} </span>
            {formatPercent(node.memoryPercent, formatNumber, t("common.state.unavailable"))}
          </span>
        </div>
      </ItemContent>
      <ItemActions>
        <StatusMark
          label={node.ready ? t("home.node.ready") : t("home.node.notReady")}
          tone={node.ready || node.health === "critical" ? node.health : "warning"}
        />
      </ItemActions>
    </Item>
  );
}

function PodPanel({ state }: { state: HomePageState }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="pod-list-title" className="grid gap-3 p-4">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button onClick={state.closeNode} size="sm" type="button" variant="outline">
          <ArrowLeft aria-hidden="true" />{t("home.node.back")}
        </Button>
        <div className="min-w-0">
          <h3
            className="truncate text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
            id="pod-list-title"
            tabIndex={-1}
          >
            {t("home.pod.heading", { node: state.selectedNodeName ?? "" })}
          </h3>
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
  const { formatNumber, t } = useI18n();
  if (state.phase === "loading" || state.phase === "idle") {
    return <HomeSectionLoading label={t("home.pod.list")} />;
  }
  if (state.phase === "failed") {
    return <HomeSectionFailure failure={state.failure} label={t("home.pod.list")} onRetry={onRefresh} />;
  }
  if (state.data.pods.length === 0) {
    return (
      <>
        <HomeRefreshFailure failure={state.refreshFailure} label={t("home.pod.list")} onRetry={onRefresh} />
        <div className="grid min-h-40 place-items-center p-6 text-sm text-muted-foreground">
          {t("home.pod.empty")}
        </div>
      </>
    );
  }
  return (
    <>
      <HomeRefreshFailure failure={state.refreshFailure} label={t("home.pod.list")} onRetry={onRefresh} />
      <p className="text-xs text-muted-foreground">
        {t("home.pod.count", { count: formatNumber(state.data.pods.length) })}
      </p>
      <div className="grid min-w-0 gap-2 md:grid-cols-2">
        {state.data.pods.map((pod) => <PodItem key={pod.id} pod={pod} />)}
      </div>
    </>
  );
}

function PodItem({ pod }: { pod: HomePodSummary }) {
  const { formatNumber, t } = useI18n();
  return (
    <Item variant="outline">
      <ItemMedia variant="icon"><Boxes aria-hidden="true" /></ItemMedia>
      <ItemContent>
        <ItemTitle className="max-w-full break-all">{pod.name}</ItemTitle>
        <ItemDescription>
          {t("home.pod.description", {
            namespace: pod.namespace,
            phase: pod.phase,
            ready: formatNumber(pod.readiness.ready),
            total: formatNumber(pod.readiness.total),
          })}
        </ItemDescription>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>
            {t("home.metric.cpu")} {pod.cpuMillicores === null
              ? t("common.value.unavailable")
              : `${formatNumber(pod.cpuMillicores, { maximumFractionDigits: 2 })}m`}
          </span>
          <span>
            {t("home.metric.memory")} {pod.memoryMebibytes === null
              ? t("common.value.unavailable")
              : `${formatNumber(pod.memoryMebibytes, { maximumFractionDigits: 2 })} MiB`}
          </span>
          <span className="inline-flex items-center gap-1">
            <RotateCcw aria-hidden="true" className="size-3" />
            <span className="sr-only">{t("home.metric.restarts")} </span>
            {formatNumber(pod.restartCount)}
          </span>
        </div>
      </ItemContent>
      <ItemActions><StatusMark tone={pod.health} /></ItemActions>
    </Item>
  );
}

function formatPercent(
  value: number | null,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
  unavailable: string,
) {
  return value === null
    ? unavailable
    : `${formatNumber(value, { maximumFractionDigits: 2 })}%`;
}
