import { useMemo, useState } from 'react';
import { AlertCircleIcon, GitBranchIcon, PlusIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useClusters } from '@/features/cluster/api';
import { useConsolePath } from '@/features/console/ui';
import { useApplications, useDeploymentsAll } from '@/features/repo/api';
import { ConnectRepoWizard } from '@/features/resources/ConnectRepoWizard';
import { timeAgo } from '@/shared/lib/format';
import type { Application, Cluster, Deployment } from '@/shared/lib/types';

export default function RepoListView() {
  const appsQ = useApplications();
  const clustersQ = useClusters();
  const apps = appsQ.data ?? [];
  const deploymentsQ = useDeploymentsAll(apps);
  const deploymentsByApp = useMemo(
    () => new Map(deploymentsQ.items.map((item) => [item.appId, item.deployments])),
    [deploymentsQ.items],
  );
  const clustersById = useMemo(
    () => new Map((clustersQ.data ?? []).map((cluster) => [cluster.cluster_id, cluster])),
    [clustersQ.data],
  );
  const pathFor = useConsolePath();
  const [wizard, setWizard] = useState(false);
  const loadError = appsQ.isError
    ? appsQ.error
    : deploymentsQ.failed
      ? deploymentsQ.error
      : null;

  return (
    <div className="grid gap-6">
      <header className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-page font-semibold text-text-primary">배포</h1>
          <p className="mt-1 max-w-3xl text-body text-text-secondary">
            레포, 브랜치, manifest, 대상 클러스터를 묶은 배포 정의입니다
          </p>
        </div>
        <Button type="button" onClick={() => setWizard(true)}>
          <PlusIcon data-icon="inline-start" aria-hidden="true" />
          배포 정의 추가
        </Button>
      </header>

      <Card
        className="rounded-panel border border-border bg-surface shadow-soft ring-0"
        aria-busy={appsQ.isPending || deploymentsQ.pending}
      >
        <CardHeader className="border-b border-border">
          <CardTitle><h2 className="text-title font-semibold text-text-primary">배포 정의</h2></CardTitle>
          <CardDescription className="text-body text-text-secondary">
            카드를 선택하면 run, 배포 대상, Safe PR 이력을 확인합니다
          </CardDescription>
        </CardHeader>

        <CardContent>
          {appsQ.isPending ? (
            <DeploymentListSkeleton />
          ) : loadError ? (
            <Alert variant="destructive">
              <AlertCircleIcon aria-hidden="true" />
              <AlertTitle>불러오기 실패</AlertTitle>
              <AlertDescription>{errorMessage(loadError)}</AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void appsQ.refetch();
                    void clustersQ.refetch();
                  }}
                >
                  다시 시도
                </Button>
              </AlertAction>
            </Alert>
          ) : apps.length === 0 ? (
            <div
              className="grid min-h-64 place-items-center gap-3 py-10 text-center"
              role="status"
              aria-live="polite"
            >
              <span className="grid size-10 place-items-center rounded-full bg-raised text-text-muted">
                <GitBranchIcon className="size-5" aria-hidden="true" />
              </span>
              <div className="grid gap-1">
                <h3 className="text-title font-semibold text-text-primary">배포 정의 없음</h3>
                <p className="text-body text-text-muted">
                  레포와 연결된 클러스터를 선택해 첫 배포 정의를 만듭니다
                </p>
              </div>
              <Button type="button" size="sm" onClick={() => setWizard(true)}>
                배포 정의 추가
              </Button>
            </div>
          ) : (
            <div className="grid gap-2" role="list">
              {apps.map((app) => (
                <DeploymentCard
                  key={app.application_id}
                  app={app}
                  deployments={deploymentsByApp.get(app.application_id) ?? []}
                  clustersById={clustersById}
                  loadingDeployments={deploymentsQ.pending}
                  detailPath={pathFor(`/repos/${app.application_id}`)}
                  pathFor={pathFor}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ConnectRepoWizard open={wizard} onClose={() => setWizard(false)} />
    </div>
  );
}

function DeploymentListSkeleton() {
  return (
    <div className="grid gap-2" role="status" aria-live="polite">
      <span className="sr-only">배포 정의 불러오는 중</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="grid min-h-28 gap-4 rounded-panel border border-border bg-bg p-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,auto)]"
          aria-hidden="true"
        >
          <div className="grid content-start gap-3">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-4 w-48 max-w-full" />
          </div>
          <div className="grid content-start gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DeploymentCard({
  app,
  deployments,
  clustersById,
  loadingDeployments,
  detailPath,
  pathFor,
}: {
  app: Application;
  deployments: Deployment[];
  clustersById: Map<string, Cluster>;
  loadingDeployments: boolean;
  detailPath: string;
  pathFor: (to: string) => string;
}) {
  const clusterIds = deployments.length
    ? [...new Set(deployments.map((deployment) => deployment.cluster_id))]
    : app.cluster_id
      ? [app.cluster_id]
      : [];

  return (
    <article className="group relative min-w-0" role="listitem">
      <Link
        to={detailPath}
        aria-label={`${app.name} 배포 정의 열기`}
        className="absolute inset-0 z-10 rounded-panel outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      />
      <Card className="rounded-panel border border-border bg-bg py-0 shadow-none ring-0 transition-colors group-hover:bg-raised">
        <CardContent className="grid min-w-0 gap-4 p-4 text-left lg:grid-cols-[minmax(0,1fr)_minmax(16rem,auto)]">
          <div className="grid min-w-0 content-start gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate text-title font-semibold text-text-primary">{app.name}</span>
              {app.last_run_status ? (
                <StatusBadge status={app.last_run_status} />
              ) : (
                <Badge variant="outline" className="border-border bg-raised text-text-muted">run 없음</Badge>
              )}
            </div>
            <span className="min-w-0 truncate font-mono text-caption text-text-secondary">
              {app.repo_ref}@{app.branch}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-2 text-caption text-text-muted">
              <span className="min-w-0 truncate">manifest {app.manifest_path}</span>
              {app.last_deployed_at ? (
                <time dateTime={app.last_deployed_at}>{timeAgo(app.last_deployed_at)}</time>
              ) : (
                <span>배포 이력 없음</span>
              )}
            </span>
          </div>

          <div className="grid min-w-0 content-start gap-2">
            <span className="text-label font-semibold text-text-muted">연결 클러스터</span>
            {loadingDeployments ? (
              <Skeleton className="h-5 w-32" aria-hidden="true" />
            ) : clusterIds.length === 0 ? (
              <span className="text-body text-text-muted">없음</span>
            ) : (
              <span className="relative z-20 flex min-w-0 flex-wrap gap-2">
                {clusterIds.map((clusterId) => {
                  const cluster = clustersById.get(clusterId);
                  const clusterName = cluster?.name ?? clusterId;
                  return (
                    <Link
                      key={clusterId}
                      to={pathFor(`/clusters/${clusterId}`)}
                      className="inline-flex rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                      aria-label={`${clusterName} 클러스터 열기`}
                    >
                      <Badge variant="outline" className={clusterBadgeClass(cluster?.connection_status)}>
                        {clusterName}
                      </Badge>
                    </Link>
                  );
                })}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  return (
    <Badge variant="outline" className={statusBadgeClass(key)}>
      {status}
    </Badge>
  );
}

function statusBadgeClass(status: string) {
  if (['succeeded', 'success', 'healthy', 'running'].includes(status)) {
    return 'border-success/40 bg-success/10 text-success';
  }
  if (['failed', 'error', 'critical'].includes(status)) {
    return 'border-danger/40 bg-danger/10 text-danger';
  }
  if (['waiting_for_approval', 'pending', 'applying'].includes(status)) {
    return 'border-warning/40 bg-warning/10 text-warning';
  }
  return 'border-info/40 bg-info/10 text-info';
}

function clusterBadgeClass(status: string | undefined) {
  return status === 'connected' || status === 'online'
    ? 'border-success/40 bg-success/10 text-success'
    : 'border-warning/40 bg-warning/10 text-warning';
}

function errorMessage(error: unknown) {
  if (typeof error === 'string') return error;
  return error instanceof Error ? error.message : '요청을 완료하지 못했습니다.';
}
