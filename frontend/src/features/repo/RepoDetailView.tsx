import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useApplication, useDeployments, useRuns } from '@/features/repo/api';
import { ApprovalCard } from '@/features/repo/ApprovalCard';
import { Badge, Breadcrumbs, Button, Card, CodeBlock, EmptyState, KeyValue, QueryBoundary, ResourceTable, Tabs } from '@/shared/ui';
import { PlanDiff } from '@/shared/ui/plan-diff';
import { shortSha, timeAgo } from '@/shared/lib/format';
import { FadeSlideIn, Stagger } from '@/shared/motion';
import { IconClock } from '@/shared/ui/icons';

const STEP_ORDER = ['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING', 'SUCCEEDED'];

export default function RepoDetailView() {
  const { applicationId = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') ?? 'runs';
  const nav = useNavigate();
  const appQ = useApplication(applicationId);
  const runsQ = useRuns(applicationId);
  const depsQ = useDeployments(applicationId);
  const runs = runsQ.data ?? [];
  const safePrRun = runs.find(r => r.safe_pr);

  return (
    <FadeSlideIn>
      <Breadcrumbs items={[{ label: '레포', to: '/repos' }, { label: appQ.data?.name ?? applicationId }]} />
      <QueryBoundary query={appQ}>{app => (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 16px' }}>
          <h1 style={{ margin: 0, fontSize: 'var(--fs-xl)' }}>{app.name} <code style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-2)' }}>{app.repo_ref}@{app.branch}</code></h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`https://github.com/${app.repo_ref}/blob/${app.branch}/${app.manifest_path}`} target="_blank" rel="noreferrer"><Button>manifest 수정 ↗</Button></a>
            <a href={`https://github.com/${app.repo_ref}`} target="_blank" rel="noreferrer"><Button>GitHub ↗</Button></a>
          </div>
        </div>
      )}</QueryBoundary>
      <QueryBoundary query={appQ}>{app => (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-3)', margin: '-8px 0 12px' }}>
          manifest(<code>{app.manifest_path}</code>)는 Git 이 원본입니다 — GitHub 에서 수정해 커밋하면
          webhook/poller 가 감지해 자동으로 run 이 생성됩니다. 콘솔에서는 직접 수정하지 않습니다.
        </p>
      )}</QueryBoundary>
      <Tabs current={tab} onChange={k => setSp({ tab: k })} items={[
        { key: 'runs', label: 'Runs', badge: runs.length },
        { key: 'deployments', label: '배포' },
        { key: 'safe-pr', label: 'Safe PR' },
        { key: 'settings', label: '설정' },
      ]} />
      {tab === 'runs' && (
        <QueryBoundary query={runsQ}>{rs => rs.length === 0
          ? <EmptyState icon={<IconClock size={26} />} title="첫 커밋 감지 대기 중" description="webhook/poller 가 변경을 감지하면 run 이 생성됩니다" />
          : <Stagger>{rs.map(r => (
              <Card key={r.run_id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <code>{shortSha(r.commit_sha)}</code>
                  <Badge status={r.status} />
                  <span style={{ display: 'flex', gap: 3 }}>
                    {STEP_ORDER.map(s => {
                      const st = r.steps.find(x => x.name === s)?.status ?? 'PENDING';
                      const color = st === 'SUCCEEDED' ? 'var(--ok)' : st === 'FAILED' ? 'var(--danger)' : st === 'PENDING' ? 'var(--surface-3)' : 'var(--info)';
                      return <span key={s} title={s} style={{ width: 14, height: 5, borderRadius: 2, background: color }} />;
                    })}
                  </span>
                  <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{timeAgo(r.started_at)}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <Button size="sm" onClick={() => nav(`/workflows/${r.run_id}`)}>그래프 보기</Button>
                  </span>
                </div>
                {r.status === 'WAITING_FOR_APPROVAL' && r.approval_id && (() => {
                  const diffStep = r.steps.find(s => s.name === 'DIFFING');
                  return (
                    <div style={{ marginTop: 10 }}>
                      <ApprovalCard approvalId={r.approval_id} summary={`${shortSha(r.commit_sha)} 배포 승인`} compact />
                      {diffStep?.changes && diffStep.changes.length > 0 && (
                        <div style={{ marginTop: 8 }}><PlanDiff changes={diffStep.changes} resource={diffStep.resource} /></div>
                      )}
                    </div>
                  );
                })()}
              </Card>
            ))}</Stagger>
        }</QueryBoundary>
      )}
      {tab === 'deployments' && (
        <Card><QueryBoundary query={depsQ}>{deps => (
          <ResourceTable rows={deps} rowKey={d => `${d.cluster_id}/${d.namespace}/${d.name}`}
            columns={[
              { key: 'cluster', label: '클러스터', render: d => <Link to={`/clusters/${d.cluster_id}?tab=workloads`} style={{ color: 'var(--brand)' }}>{d.cluster_id}</Link> },
              { key: 'ns', label: '네임스페이스', render: d => d.namespace },
              { key: 'name', label: '이름', render: d => <b>{d.name}</b> },
              { key: 'image', label: '이미지', render: d => <code>{d.image}</code> },
              { key: 'replicas', label: 'Replicas', render: d => d.replicas },
              { key: 'status', label: '상태', render: d => <Badge status={d.status} /> },
            ]} />
        )}</QueryBoundary></Card>
      )}
      {tab === 'safe-pr' && (
        !safePrRun?.safe_pr
          ? <EmptyState icon="🤖" title="Safe PR 이력이 없습니다" description="AI 가 수정을 준비하면 여기 표시됩니다" />
          : <Card title={`Safe PR — ${shortSha(safePrRun.commit_sha)}`}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                <Badge status={safePrRun.safe_pr.status} />
                {safePrRun.safe_pr.pr_url && <a href={safePrRun.safe_pr.pr_url} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)' }}>PR 열기 ↗</a>}
              </div>
              {safePrRun.safe_pr.explanation && <p style={{ fontSize: 'var(--fs-sm)' }}>{safePrRun.safe_pr.explanation}</p>}
              {safePrRun.safe_pr.diff_before && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div><Badge tone="danger">before</Badge><CodeBlock code={safePrRun.safe_pr.diff_before} /></div>
                  <div><Badge tone="ok">after</Badge><CodeBlock code={safePrRun.safe_pr.diff_after ?? ''} /></div>
                </div>
              )}
              {safePrRun.safe_pr.error && (
                <Link to={`/ai?prefill=${encodeURIComponent(`Safe PR 실패 원인 분석: ${safePrRun.safe_pr.error}`)}`}><Button>✦ AI에게 원인 묻기</Button></Link>
              )}
            </Card>
      )}
      {tab === 'settings' && (
        <Card><QueryBoundary query={appQ}>{app => (
          <KeyValue pairs={[
            ['application_id', <code key="i">{app.application_id}</code>],
            ['manifest_path', <code key="m">{app.manifest_path}</code>],
            ['대상 클러스터', app.cluster_id], ['브랜치', app.branch],
          ]} />
        )}</QueryBoundary></Card>
      )}
    </FadeSlideIn>
  );
}
