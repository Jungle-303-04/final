import { Activity } from "lucide-react";

import type { CostNodeItem, CostPort } from "../../features/cost/costContract";
import { RefreshAction } from "../../motion/RefreshAction";
import { useI18n } from "../../shared/i18n";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../shared/ui/primitives/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Skeleton } from "../../shared/ui/primitives/skeleton";
import { useCostNodes } from "./useCostNodesData";

export function CostNodesPanel({
  clusterIds,
  namespaces,
  port,
  visible = true,
}: {
  clusterIds: readonly string[];
  namespaces: readonly string[];
  port: CostPort;
  visible?: boolean;
}) {
  const { t } = useI18n();
  const state = useCostNodes(port, { clusterIds, namespaces });
  const frame = state.frame;
  if (!visible) return null;
  if (frame.phase === "idle" || frame.phase === "loading") {
    return (
      <Card aria-label={t("cost.nodes.title")} aria-busy="true">
        <CardHeader className="border-b">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent className="grid gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (frame.phase === "failed") {
    if (frame.failure.code === "forbidden") {
      return <ProductStateScreen kind="forbidden" issue={{ code: "forbidden", safeDetail: t("cost.nodes.loadFailed") }} placement="content" />;
    }
    if (frame.failure.code === "offline") {
      return <ProductStateScreen kind="offline" issue={{ code: "network", safeDetail: t("cost.nodes.loadFailed") }} placement="content" retry={{ pending: false, onRetry: state.refresh }} />;
    }
    return <ProductStateScreen kind="error" issue={{ code: frame.failure.code === "invalid-response" ? "invalid-response" : "unknown", safeDetail: t("cost.nodes.loadFailed") }} placement="content" retry={{ pending: false, onRetry: state.refresh }} />;
  }
  const page = frame.data;
  return (
    <Card aria-labelledby="cost-nodes-title">
      <CardHeader className="flex-row items-start justify-between gap-3 border-b">
        <div className="min-w-0">
          <CardTitle id="cost-nodes-title">{t("cost.nodes.title")}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("cost.nodes.count", { count: page.total })}
          </p>
        </div>
        <RefreshAction
          hasFailed={frame.refreshFailure !== null}
          isRefreshing={frame.refreshing}
          label={t("common.action.refresh")}
          onRefresh={state.refresh}
          statusCopy={{
            cancelled: t("cost.refresh.cancelled"),
            failed: t("cost.refresh.failed"),
            pending: t("cost.refresh.pending"),
            reconnecting: t("cost.refresh.reconnecting"),
            succeeded: t("cost.refresh.succeeded"),
          }}
        />
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        <Alert>
          <Activity aria-hidden="true" />
          <AlertTitle>{t("cost.nodes.pricing.title")}</AlertTitle>
          <AlertDescription>{t("cost.nodes.pricing.unavailable")}</AlertDescription>
        </Alert>
        {page.items.length === 0 ? (
          <ProductStateScreen kind="empty" placement="content" />
        ) : (
          <Table scrollAreaLabel={t("cost.nodes.title")}>
            <TableHeader>
              <TableRow>
                <TableHead>{t("cost.nodes.node")}</TableHead>
                <TableHead>{t("cost.nodes.cluster")}</TableHead>
                <TableHead>{t("cost.nodes.instance")}</TableHead>
                <TableHead>{t("cost.nodes.capacity")}</TableHead>
                <TableHead>{t("cost.nodes.usage")}</TableHead>
                <TableHead>{t("cost.nodes.rate")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((item) => <CostNodeRow item={item} key={`${item.clusterId}:${item.resource.uid}`} />)}
            </TableBody>
          </Table>
        )}
        {state.loadMoreFailure === null ? null : (
          <p role="alert" className="text-sm text-destructive">{t("cost.nodes.loadMoreFailed")}</p>
        )}
        {page.hasMore ? (
          <Button
            className="justify-self-center"
            disabled={state.loadingMore}
            onClick={() => void state.loadMore()}
            variant="outline"
          >
            {state.loadingMore ? t("cost.nodes.loadingMore") : t("cost.nodes.loadMore")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CostNodeRow({ item }: { item: CostNodeItem }) {
  const { t } = useI18n();
  return (
    <TableRow>
      <TableCell className="max-w-56">
        <p className="truncate font-medium" title={item.resource.name}>{item.resource.name}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <Badge variant={item.status === "Ready" ? "secondary" : "outline"}>{item.status}</Badge>
          {item.capacityType === null ? null : <Badge variant="outline">{item.capacityType}</Badge>}
        </div>
      </TableCell>
      <TableCell className="max-w-48">
        <p className="truncate" title={item.clusterName}>{item.clusterName}</p>
        <p className="text-xs text-muted-foreground">{item.provider}</p>
      </TableCell>
      <TableCell>
        <p>{item.instanceType ?? t("cost.value.notObserved")}</p>
        <p className="text-xs text-muted-foreground">{item.zone ?? t("cost.value.notObserved")}</p>
      </TableCell>
      <TableCell>{formatCapacity(item, t("cost.value.notObserved"))}</TableCell>
      <TableCell>{formatUsage(
        item,
        t("cost.nodes.usageUnavailable"),
        t("cost.workload.cpu"),
        t("cost.workload.memory"),
      )}</TableCell>
      <TableCell>{t("cost.value.notObserved")}</TableCell>
    </TableRow>
  );
}

function formatCapacity(item: CostNodeItem, unavailable: string): string {
  const values = [
    item.capacity.cpuMillicores === null ? null : `${formatNumber(item.capacity.cpuMillicores)} mCPU`,
    item.capacity.memoryMib === null ? null : `${formatNumber(item.capacity.memoryMib)} MiB`,
  ].filter((value): value is string => value !== null);
  return values.join(" · ") || unavailable;
}

function formatUsage(
  item: CostNodeItem,
  unavailable: string,
  cpuLabel: string,
  memoryLabel: string,
): string {
  const values = [
    item.usage.cpuUtilizationPercent === null ? null : `${cpuLabel} ${formatNumber(item.usage.cpuUtilizationPercent)}%`,
    item.usage.memoryUtilizationPercent === null ? null : `${memoryLabel} ${formatNumber(item.usage.memoryUtilizationPercent)}%`,
  ].filter((value): value is string => value !== null);
  return values.join(" · ") || unavailable;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}
