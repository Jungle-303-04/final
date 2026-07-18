import { RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  type HelmChartSource,
  type HelmPort,
  HelmPortFailure,
} from "../../features/helm/helmContract";
import { useHelmCopy, type HelmCopy } from "../../features/helm/helmCopy";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import { Spinner } from "../../shared/ui/primitives/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../shared/ui/primitives/table";
import { HelmChartSourceRegistrationDialog } from "./HelmChartSourceRegistrationDialog";
import { HelmChartSourceDeleteDialog } from "./HelmChartSourceDeleteDialog";
import { useHelmChartSources } from "./useHelmChartSources";

export function HelmChartSourcesPanel({ port }: { port: HelmPort }) {
  const data = useHelmChartSources(port);
  return <HelmChartSourcesPanelContent data={data} port={port} />;
}

export function HelmChartSourcesPanelContent({
  data,
  port,
}: {
  data: ReturnType<typeof useHelmChartSources>;
  port: HelmPort;
}) {
  const copy = useHelmCopy();
  return (
    <Card>
      <CardHeader>
        <CardTitle><h2>{copy.chartSources}</h2></CardTitle>
        <CardDescription>{copy.chartSourcesDescription}</CardDescription>
        <CardAction>
          <HelmChartSourceRegistrationDialog onRegistered={data.refresh} port={port} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        <ChartSourceListBoundary data={data} port={port} />
      </CardContent>
    </Card>
  );
}

function ChartSourceListBoundary({
  data,
  port,
}: {
  data: ReturnType<typeof useHelmChartSources>;
  port: HelmPort;
}) {
  const copy = useHelmCopy();
  if (data.state.phase === "loading") {
    return (
      <div aria-label={copy.chartSourcesLoading} className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner decorative />
        {copy.chartSourcesLoading}
      </div>
    );
  }
  if (data.state.phase === "failed") {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{sourceFailureCopy(data.state.failure, copy)}</span>
          <Button onClick={data.refresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" />
            {copy.chartSourcesRetry}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (data.state.items.length === 0) {
    return <p className="border-y py-6 text-sm text-muted-foreground">{copy.chartSourcesEmpty}</p>;
  }
  return (
    <>
      <ChartSourceTable items={data.state.items} onDeleted={data.refresh} port={port} />
      {data.state.loadMoreFailure ? (
        <Alert variant="destructive"><AlertDescription>{copy.chartSourcesLoadMoreFailed}</AlertDescription></Alert>
      ) : null}
      {data.state.hasMore ? (
        <Button aria-busy={data.state.loadingMore} className="w-fit" disabled={data.state.loadingMore} onClick={data.loadMore} size="sm" type="button" variant="outline">
          {data.state.loadingMore ? <Spinner decorative /> : null}
          {copy.chartSourcesLoadMore}
        </Button>
      ) : null}
      {data.state.refreshing ? (
        <span aria-label={copy.chartSourcesLoading} className="sr-only" role="status">{copy.chartSourcesLoading}</span>
      ) : null}
    </>
  );
}

function ChartSourceTable({
  items,
  onDeleted,
  port,
}: {
  items: readonly HelmChartSource[];
  onDeleted: () => void;
  port: HelmPort;
}) {
  const copy = useHelmCopy();
  const [selected, setSelected] = useState<HelmChartSource | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [refreshFailure, setRefreshFailure] = useState(false);
  const hasActions = items.some((source) => source.actions.length > 0);
  const refresh = async (source: HelmChartSource) => {
    if (refreshingId !== null) return;
    setRefreshingId(source.id);
    setRefreshFailure(false);
    try {
      await port.refreshChartSource(source.name);
      onDeleted();
    } catch {
      setRefreshFailure(true);
    } finally {
      setRefreshingId(null);
    }
  };
  return (
    <>
      {refreshFailure ? (
        <Alert variant="destructive"><AlertDescription>{copy.chartSourceRefreshFailed}</AlertDescription></Alert>
      ) : null}
      <Table scrollAreaLabel={copy.chartSources}>
        <TableHeader>
          <TableRow>
            <TableHead>{copy.chartSourceName}</TableHead>
            <TableHead>{copy.chartSourceType}</TableHead>
            <TableHead>{copy.chartSourceReference}</TableHead>
            <TableHead>{copy.chartSourceCredentials}</TableHead>
            <TableHead>{copy.chartSourceStatus}</TableHead>
            <TableHead>{copy.chartSourceObserved}</TableHead>
            {hasActions ? <TableHead>{copy.chartSourceActions}</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((source) => (
            <TableRow key={source.id}>
              <TableCell className="max-w-48 truncate font-medium" title={source.name}>{source.name}</TableCell>
              <TableCell>{source.provider === "oci" ? copy.chartSourceOci : copy.chartSourceRepository}</TableCell>
              <TableCell className="max-w-96 break-all text-muted-foreground">{source.reference}</TableCell>
              <TableCell>{source.credentialsConfigured ? copy.chartSourceCredentialsConfigured : copy.chartSourceCredentialsNone}</TableCell>
              <TableCell><Badge variant="outline">{source.status}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{formatObservedAt(source.observedAt, copy)}</TableCell>
              {hasActions ? (
                <TableCell>
                  {source.actions.includes("refresh") ? (
                    <Button
                      aria-label={copy.chartSourceRefreshButton(source.name)}
                      disabled={refreshingId !== null}
                      onClick={() => void refresh(source)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      {refreshingId === source.id
                        ? <Spinner decorative />
                        : <RefreshCw aria-hidden="true" />}
                    </Button>
                  ) : null}
                  {source.actions.includes("delete") ? (
                    <Button
                      aria-label={copy.chartSourceDeleteButton(source.name)}
                      onClick={() => setSelected(source)}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  ) : null}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selected ? (
        <HelmChartSourceDeleteDialog
          onDeleted={onDeleted}
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          open
          port={port}
          source={selected}
        />
      ) : null}
    </>
  );
}

function sourceFailureCopy(failure: HelmPortFailure, copy: HelmCopy): string {
  if (failure.code === "forbidden" || failure.code === "unauthorized") return copy.chartSourcesForbidden;
  if (failure.code === "offline") return copy.chartSourcesUnavailable;
  return copy.chartSourcesFailed;
}

function formatObservedAt(value: string | null, copy: HelmCopy): string {
  if (value === null) return copy.unavailableValue;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
