import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useClusters } from '@/features/cluster/api';
import { useApplications, useDeploymentsAll } from '@/features/repo/api';
import { ConnectRepoWizard } from '@/features/resources/ConnectRepoWizard';
import { useConsolePath } from '@/features/console/ui';
import { timeAgo } from '@/shared/lib/format';
import type { Application, Cluster, Deployment } from '@/shared/lib/types';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, cx } from '@/ui';

export default function RepoListView() {
  const appsQ = useApplications();
  const clustersQ = useClusters();
  const apps = appsQ.data ?? [];
  const deploymentsQ = useDeploymentsAll(apps);
  const deploymentsByApp = useMemo(() => new Map(deploymentsQ.items.map((item) => [item.appId, item.deployments])), [deploymentsQ.items]);
  const clustersById = useMemo(() => new Map((clustersQ.data ?? []).map((cluster) => [cluster.cluster_id, cluster])), [clustersQ.data]);
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const [wizard, setWizard] = useState(false);

  return (
    <div className="grid gap-6">
      <PageHeader
        title="배포"
        description="레포, 브랜치, manifest, 대상 클러스터를 묶은 배포 정의입니다"
        actions={<Button variant="primary" leadingIcon={<PlusIcon />} onClick={() => setWizard(true)}>배포 정의 추가</Button>}
      />

      <Card
        title="배포 정의"
        description="카드를 선택하면 run, 배포 대상, Safe PR 이력을 확인합니다"
        loading={appsQ.isPending}
        error={appsQ.isError ? appsQ.error : deploymentsQ.failed ? deploymentsQ.error : null}
        onRetry={() => {
          void appsQ.refetch();
          void clustersQ.refetch();
        }}
        empty={apps.length === 0 ? (
          <EmptyState
            icon={<RepoIcon />}
            title="배포 정의 없음"
            description="레포와 연결된 클러스터를 선택해 첫 배포 정의를 만듭니다"
            action={<Button variant="primary" onClick={() => setWizard(true)}>배포 정의 추가</Button>}
          />
        ) : undefined}
      >
        <div className="grid gap-2">
          {apps.map((app) => (
            <DeploymentCard
              key={app.application_id}
              app={app}
              deployments={deploymentsByApp.get(app.application_id) ?? []}
              clustersById={clustersById}
              loadingDeployments={deploymentsQ.pending}
              onOpen={() => nav(pathFor(`/repos/${app.application_id}`))}
              pathFor={pathFor}
            />
          ))}
        </div>
      </Card>

      <ConnectRepoWizard open={wizard} onClose={() => setWizard(false)} />
    </div>
  );
}

function DeploymentCard({
  app,
  deployments,
  clustersById,
  loadingDeployments,
  onOpen,
  pathFor,
}: {
  app: Application;
  deployments: Deployment[];
  clustersById: Map<string, Cluster>;
  loadingDeployments: boolean;
  onOpen: () => void;
  pathFor: (to: string) => string;
}) {
  const clusterIds = deployments.length ? [...new Set(deployments.map((deployment) => deployment.cluster_id))] : app.cluster_id ? [app.cluster_id] : [];
  return (
    <div
      role="button"
      tabIndex={0}
      className="grid min-w-0 gap-4 rounded-panel border border-border bg-bg p-4 text-left transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:grid-cols-[minmax(0,1fr)_minmax(16rem,auto)]"
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <span className="grid min-w-0 gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="min-w-0 truncate text-title font-semibold text-text-primary">{app.name}</span>
          {app.last_run_status ? <StatusBadge status={app.last_run_status} /> : <Badge>run 없음</Badge>}
        </span>
        <span className="min-w-0 truncate font-mono text-caption text-text-secondary">{app.repo_ref}@{app.branch}</span>
        <span className="flex min-w-0 flex-wrap items-center gap-2 text-caption text-text-muted">
          <span className="min-w-0 truncate">manifest {app.manifest_path}</span>
          <span>{app.last_deployed_at ? timeAgo(app.last_deployed_at) : '배포 이력 없음'}</span>
        </span>
      </span>
      <span className="grid content-start gap-2">
        <span className="text-label font-semibold text-text-muted">연결 클러스터</span>
        {loadingDeployments ? (
          <Skeleton lines={1} />
        ) : clusterIds.length === 0 ? (
          <span className="text-body text-text-muted">없음</span>
        ) : (
          <span className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
            {clusterIds.map((clusterId) => {
              const cluster = clustersById.get(clusterId);
              return (
                <Link key={clusterId} to={pathFor(`/clusters/${clusterId}`)} className="inline-flex">
                  <Badge tone={cluster?.connection_status === 'connected' || cluster?.connection_status === 'online' ? 'success' : 'warning'}>
                    {cluster?.name ?? clusterId}
                  </Badge>
                </Link>
              );
            })}
          </span>
        )}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase();
  if (['succeeded', 'success', 'healthy', 'running'].includes(key)) return <Badge tone="success">{status}</Badge>;
  if (['failed', 'error', 'critical'].includes(key)) return <Badge tone="danger">{status}</Badge>;
  if (['waiting_for_approval', 'pending', 'applying'].includes(key)) return <Badge tone="warning">{status}</Badge>;
  return <Badge tone="info">{status}</Badge>;
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function RepoIcon() {
  return (
    <svg viewBox="0 0 16 16" className={cx('h-5 w-5')} aria-hidden="true">
      <path d="M4 3.5h8A1.5 1.5 0 0 1 13.5 5v8H4A1.5 1.5 0 0 1 2.5 11.5v-7A1 1 0 0 1 3.5 3.5H4zM4 3.5v8M5 6h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}
