import { RefreshCw } from "lucide-react";

import {
  type HelmChartSource,
  type HelmPort,
  HelmPortFailure,
} from "../../features/helm/helmContract";
import { HELM_COPY } from "../../features/helm/helmCopy";
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
import { useHelmChartSources } from "./useHelmChartSources";

export function HelmChartSourcesPanel({ port }: { port: HelmPort }) {
  const data = useHelmChartSources(port);
  return (
    <Card>
      <CardHeader>
        <CardTitle><h2>{HELM_COPY.chartSources}</h2></CardTitle>
        <CardDescription>{HELM_COPY.chartSourcesDescription}</CardDescription>
        <CardAction>
          <HelmChartSourceRegistrationDialog onRegistered={data.refresh} port={port} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-3">
        <ChartSourceListBoundary data={data} />
      </CardContent>
    </Card>
  );
}

function ChartSourceListBoundary({ data }: { data: ReturnType<typeof useHelmChartSources> }) {
  if (data.state.phase === "loading") {
    return (
      <div aria-label={HELM_COPY.chartSourcesLoading} className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Spinner decorative />
        {HELM_COPY.chartSourcesLoading}
      </div>
    );
  }
  if (data.state.phase === "failed") {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{sourceFailureCopy(data.state.failure)}</span>
          <Button onClick={data.refresh} size="sm" type="button" variant="outline">
            <RefreshCw aria-hidden="true" />
            {HELM_COPY.chartSourcesRetry}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (data.state.items.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">{HELM_COPY.chartSourcesEmpty}</p>;
  }
  return (
    <>
      <ChartSourceTable items={data.state.items} />
      {data.state.loadMoreFailure ? (
        <Alert variant="destructive"><AlertDescription>{HELM_COPY.chartSourcesLoadMoreFailed}</AlertDescription></Alert>
      ) : null}
      {data.state.hasMore ? (
        <Button aria-busy={data.state.loadingMore} className="w-fit" disabled={data.state.loadingMore} onClick={data.loadMore} size="sm" type="button" variant="outline">
          {data.state.loadingMore ? <Spinner decorative /> : null}
          {HELM_COPY.chartSourcesLoadMore}
        </Button>
      ) : null}
      {data.state.refreshing ? (
        <span aria-label={HELM_COPY.chartSourcesLoading} className="sr-only" role="status">{HELM_COPY.chartSourcesLoading}</span>
      ) : null}
    </>
  );
}

function ChartSourceTable({ items }: { items: readonly HelmChartSource[] }) {
  return (
    <Table scrollAreaLabel={HELM_COPY.chartSources}>
      <TableHeader>
        <TableRow>
          <TableHead>{HELM_COPY.chartSourceName}</TableHead>
          <TableHead>{HELM_COPY.chartSourceType}</TableHead>
          <TableHead>{HELM_COPY.chartSourceReference}</TableHead>
          <TableHead>{HELM_COPY.chartSourceCredentials}</TableHead>
          <TableHead>{HELM_COPY.chartSourceStatus}</TableHead>
          <TableHead>{HELM_COPY.chartSourceObserved}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((source) => (
          <TableRow key={source.id}>
            <TableCell className="max-w-48 truncate font-medium" title={source.name}>{source.name}</TableCell>
            <TableCell>{source.provider === "oci" ? HELM_COPY.chartSourceOci : HELM_COPY.chartSourceRepository}</TableCell>
            <TableCell className="max-w-96 break-all text-muted-foreground">{source.reference}</TableCell>
            <TableCell>{source.credentialsConfigured ? HELM_COPY.chartSourceCredentialsConfigured : HELM_COPY.chartSourceCredentialsNone}</TableCell>
            <TableCell><Badge variant="outline">{source.status}</Badge></TableCell>
            <TableCell className="text-muted-foreground">{formatObservedAt(source.observedAt)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function sourceFailureCopy(failure: HelmPortFailure): string {
  if (failure.code === "forbidden" || failure.code === "unauthorized") return HELM_COPY.chartSourcesForbidden;
  if (failure.code === "offline") return HELM_COPY.chartSourcesUnavailable;
  return HELM_COPY.chartSourcesFailed;
}

function formatObservedAt(value: string | null): string {
  if (value === null) return HELM_COPY.unavailableValue;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}
