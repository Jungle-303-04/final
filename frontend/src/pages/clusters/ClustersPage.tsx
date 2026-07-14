import { CircleAlert, Plus, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import type { ClustersPort } from "../../features/clusters/clustersContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { Alert, AlertDescription } from "../../shared/ui/primitives/alert";
import { Button } from "../../shared/ui/primitives/button";
import { Input } from "../../shared/ui/primitives/input";
import { ClusterCard } from "./ClusterCard";
import { ClusterConnectDialog } from "./ClusterConnectDialog";
import { clusterResourcesHref } from "./clusterNavigation";

export function ClustersPage({ port }: { port: ClustersPort }) {
  const { formatNumber, t } = useI18n();
  const filter = useUnifiedFilter();
  const scope = useClusterScope();
  const session = useOptionalProductSession();
  const [query, setQuery] = useState("");
  const [connectOpen, setConnectOpen] = useState(false);
  const canManageClusters = session?.roles.includes("service_admin") ?? false;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const clusters = useMemo(() => scope.collection.phase === "ready"
    ? scope.collection.data.clusters.filter((cluster) => normalizedQuery.length === 0 || [
      cluster.name,
      cluster.environment,
      cluster.provider,
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
    : [], [normalizedQuery, scope.collection]);

  if (scope.collection.phase === "loading" || scope.collection.phase === "idle") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (scope.collection.phase === "failed") {
    if (scope.collection.failure.code === "forbidden") {
      return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
    }
    if (scope.collection.failure.code === "offline") {
      return (
        <ProductStateScreen
          issue={{ code: "network" }}
          kind="offline"
          placement="content"
          retry={{ onRetry: scope.refresh, pending: false }}
        />
      );
    }
    return (
      <ProductStateScreen
        issue={{ code: "server" }}
        kind="error"
        placement="content"
        retry={{ onRetry: scope.refresh, pending: false }}
      />
    );
  }
  if (scope.collection.data.clusters.length === 0) {
    return <ProductStateScreen kind="empty" placement="content" />;
  }

  return (
    <ProductPageFrame className="gap-6">
      <header className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)] lg:items-end">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight">{t("clusters.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("clusters.description")}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">{t("clusters.search.aria")}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={t("clusters.search.aria")}
              className="pl-8"
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t("clusters.search.placeholder")}
              type="search"
              value={query}
            />
          </label>
          {canManageClusters ? (
            <Button onClick={() => setConnectOpen(true)} type="button">
              <Plus aria-hidden="true" />
              <span className="hidden sm:inline">{t("clusters.action.add")}</span>
            </Button>
          ) : null}
          <Button
            aria-label={t("common.action.refresh")}
            disabled={scope.collection.refreshing}
            onClick={scope.refresh}
            size="icon"
            type="button"
            variant="outline"
          >
            <RefreshCw aria-hidden="true" className={scope.collection.refreshing ? "motion-safe:animate-spin" : undefined} />
          </Button>
        </div>
      </header>

      {scope.collection.refreshFailure ? (
        <Alert>
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{t("clusters.refresh.failed")}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{t("clusters.list.shown", { count: formatNumber(clusters.length) })}</span>
        <span aria-hidden="true">·</span>
        <span>{t("clusters.list.totalUnknown")}</span>
      </div>

      {clusters.length === 0 ? (
        <div className="grid min-h-52 place-items-center rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("clusters.list.empty")}
        </div>
      ) : (
        <section
          aria-label={t("clusters.list.aria")}
          className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3"
        >
          {clusters.map((cluster, index) => (
            <ClusterCard
              cluster={cluster}
              href={clusterResourcesHref(filter.state, cluster.id)}
              index={index}
              key={cluster.id}
            />
          ))}
        </section>
      )}

      {canManageClusters ? (
        <ClusterConnectDialog
          onConnected={scope.refresh}
          onOpenChange={setConnectOpen}
          open={connectOpen}
          port={port}
        />
      ) : null}
    </ProductPageFrame>
  );
}
