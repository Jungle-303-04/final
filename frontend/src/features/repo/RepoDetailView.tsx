import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { useApplication, useDeployments, useRuns } from '@/features/repo/api';
import { ApprovalCard } from '@/features/repo/ApprovalCard';
import { useConsolePath } from '@/features/console/ui';
import { shortSha, timeAgo } from '@/shared/lib/format';
import type { Deployment, GitOpsPoll, PlanChange, WorkflowRun } from '@/shared/lib/types';
import { Badge, Breadcrumb, Button, Card, CodeBlock, EmptyState, KeyValueList, PageHeader, Skeleton, Table, Tabs, type TableColumn, cx } from '@/ui';
import { listItem, listStagger } from '@/ui/motion';

const STEP_ORDER = ['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING', 'SUCCEEDED'];
const TAB_VALUES = ['runs', 'deployments', 'safe-pr', 'settings'] as const;

type DetailTab = typeof TAB_VALUES[number];
type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export default function RepoDetailView() {
  const { applicationId = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const tab = normalizeTab(sp.get('tab'));
  const navigate = useNavigate();
  const pathFor = useConsolePath();
  const appQ = useApplication(applicationId);
  const runsQ = useRuns(applicationId);
  const deploymentsQ = useDeployments(applicationId);
  const runs = runsQ.data ?? [];
  const safePrRun = runs.find((run) => run.safe_pr);

  if (appQ.isPending) {
    return (
      <div className="grid gap-6">
        <PageHeader title="배포 정의" breadcrumb={<RepoBreadcrumb pathFor={pathFor} current={applicationId} />} />
        <Card><Skeleton lines={6} /></Card>
      </div>
    );
  }

  if (appQ.isError || !appQ.data) {
    const message = appQ.isError ? appQ.error.message : '배포 정의를 찾을 수 없습니다';
    return (
      <div className="grid gap-6">
        <PageHeader title="배포 정의 조회 실패" breadcrumb={<RepoBreadcrumb pathFor={pathFor} current={applicationId} />} />
        <Card>
          <EmptyState
            title="배포 정의 조회 실패"
            description={message}
            action={(
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => appQ.refetch()}>다시 시도</Button>
                <Button size="sm" variant="ghost" onClick={() => navigate(pathFor('/repos'))}>목록 보기</Button>
              </div>
            )}
          />
        </Card>
      </div>
    );
  }

  const app = appQ.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={app.name}
        description={(
          <span className="inline-flex max-w-full flex-wrap items-center gap-2">
            <CodeText>{`${app.repo_ref}@${app.branch}`}</CodeText>
            <span className="text-muted">manifest</span>
            <CodeText>{app.manifest_path}</CodeText>
          </span>
        )}
        breadcrumb={<RepoBreadcrumb pathFor={pathFor} current={app.name || applicationId} />}
        actions={(
          <>
            <Button onClick={() => openExternal(manifestUrl(app.repo_ref, app.branch, app.manifest_path))}>manifest 수정</Button>
            <Button onClick={() => openExternal(githubUrl(app.repo_ref))}>GitHub</Button>
          </>
        )}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setSp({ tab: normalizeTab(value) }, { preventScrollReset: true })}
        items={[
          { value: 'runs', label: '실행', count: runs.length },
          { value: 'deployments', label: '배포 대상', count: deploymentsQ.data?.length },
          { value: 'safe-pr', label: 'Safe PR', count: safePrRun?.safe_pr ? 1 : 0 },
          { value: 'settings', label: '설정' },
        ]}
      />

      {tab === 'runs' && (
        <RunHistory
          runs={runs}
          loading={runsQ.isPending}
          error={runsQ.isError ? runsQ.error : null}
          onRetry={() => runsQ.refetch()}
          onOpenRun={() => navigate(pathFor('/release-flows'))}
        />
      )}

      {tab === 'deployments' && (
        <DeploymentsCard
          deployments={deploymentsQ.data ?? []}
          loading={deploymentsQ.isPending}
          error={deploymentsQ.isError ? deploymentsQ.error : null}
          onRetry={() => deploymentsQ.refetch()}
          pathFor={pathFor}
        />
      )}

      {tab === 'safe-pr' && (
        <SafePrCard
          run={safePrRun}
          loading={runsQ.isPending}
          error={runsQ.isError ? runsQ.error : null}
          onRetry={() => runsQ.refetch()}
          onAiAnalyze={(error) => navigate(pathFor(`/ai?prefill=${encodeURIComponent(`Safe PR 실패 원인 분석: ${error}`)}`))}
        />
      )}

      {tab === 'settings' && (
        <Card title="설정" description="배포 정의의 기준 레포, 브랜치, manifest, 기본 대상입니다">
          <KeyValueList items={[
            { label: 'application_id', value: <CodeText>{app.application_id}</CodeText> },
            { label: '레포', value: <CodeText>{app.repo_ref}</CodeText> },
            { label: '브랜치', value: <CodeText>{app.branch}</CodeText> },
            { label: 'manifest', value: <CodeText>{app.manifest_path}</CodeText> },
            { label: '기본 클러스터', value: app.cluster_id ? <CodeText>{app.cluster_id}</CodeText> : '없음' },
          ]} />
        </Card>
      )}
    </div>
  );
}

function RepoBreadcrumb({ pathFor, current }: { pathFor: (to: string) => string; current: string }) {
  return <Breadcrumb items={[{ label: '배포', href: pathFor('/repos') }, { label: current || '상세' }]} />;
}

function RunHistory({
  runs,
  loading,
  error,
  onRetry,
  onOpenRun,
}: {
  runs: WorkflowRun[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onOpenRun: (runId: string) => void;
}) {
  return (
    <Card
      title="실행 이력"
      description="커밋별 렌더링, 정책 검증, 승인, 적용 단계를 추적합니다"
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={runs.length === 0 ? <EmptyState icon={<ClockIcon />} title="실행 이력 없음" description="첫 커밋이 감지되면 실행 이력이 표시됩니다" /> : undefined}
    >
      <motion.div variants={listStagger} initial="initial" animate="animate" className="grid gap-3">
        {runs.map((run) => (
          <motion.article key={run.run_id} variants={listItem} layout className="grid gap-3 rounded-panel border border-border bg-bg p-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <CodeText>{shortSha(run.commit_sha)}</CodeText>
              <StatusBadge status={run.status} />
              <span className="text-caption text-muted">{timeAgo(run.started_at) || '시간 없음'}</span>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <Button size="sm" onClick={() => onOpenRun(run.run_id)}>그래프 보기</Button>
              </div>
            </div>
            <StepRail run={run} />
            {run.status === 'WAITING_FOR_APPROVAL' && run.approval_id && (
              <ApprovalPreview run={run} />
            )}
          </motion.article>
        ))}
      </motion.div>
    </Card>
  );
}

function ApprovalPreview({ run }: { run: WorkflowRun }) {
  const diffStep = run.steps.find((step) => step.name === 'DIFFING');
  return (
    <div className="grid gap-3 rounded-panel border border-border bg-surface p-3">
      <ApprovalCard approvalId={run.approval_id ?? ''} summary={`${shortSha(run.commit_sha)} 배포 승인`} compact />
      {diffStep?.changes && diffStep.changes.length > 0 ? (
        <PlanDiffPanel changes={diffStep.changes} resource={diffStep.resource} />
      ) : (
        <EmptyState title="변경 미리보기 없음" description="승인 전에 표시할 적용 계획이 아직 없습니다" />
      )}
    </div>
  );
}

function StepRail({ run }: { run: WorkflowRun }) {
  return (
    <div className="grid gap-2">
      <div className="flex min-w-0 gap-1 overflow-x-auto" aria-label="실행 단계">
        {STEP_ORDER.map((name) => {
          const step = run.steps.find((item) => item.name === name);
          const status = step?.status ?? 'PENDING';
          return (
            <span
              key={name}
              title={`${workflowStatusLabel(name)}: ${workflowStatusMeta(status).label}`}
              className={cx('h-2 w-8 shrink-0 rounded-full border', stepToneClass(status))}
            />
          );
        })}
      </div>
      <div className="flex min-w-0 flex-wrap gap-2 text-caption text-muted">
        <span>현재 단계</span>
        <span className="font-semibold text-secondary">{workflowStatusLabel(run.current_step || run.status)}</span>
      </div>
    </div>
  );
}

function DeploymentsCard({
  deployments,
  loading,
  error,
  onRetry,
  pathFor,
}: {
  deployments: Deployment[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  pathFor: (to: string) => string;
}) {
  const columns: TableColumn<Deployment>[] = [
    {
      id: 'cluster',
      header: '클러스터',
      sortValue: (row) => row.cluster_id,
      cell: (row) => <Link className="font-semibold text-accent hover:text-accent-hover" to={pathFor(`/clusters/${row.cluster_id}?tab=workloads`)}>{row.cluster_id}</Link>,
    },
    { id: 'namespace', header: '네임스페이스', sortValue: (row) => row.namespace, cell: (row) => row.namespace || '미지정' },
    { id: 'name', header: '이름', sortValue: (row) => row.name, cell: (row) => <span className="font-semibold text-primary">{row.name}</span>, width: 'md' },
    { id: 'image', header: '이미지', sortValue: (row) => row.image, cell: (row) => <CodeText>{row.image || '없음'}</CodeText>, width: 'lg' },
    { id: 'replicas', header: 'Replicas', sortValue: (row) => row.replicas, align: 'right', cell: (row) => <span className="tabular-nums text-primary">{row.replicas.toLocaleString()}</span> },
    { id: 'status', header: '상태', sortValue: (row) => row.status, cell: (row) => <StatusBadge status={row.status} /> },
    {
      id: 'gitops',
      header: 'GitOps 감시',
      sortValue: (row) => row.gitops_poll?.last_polled_at ?? '',
      width: 'lg',
      cell: (row) => <GitOpsPollCell poll={row.gitops_poll} />,
    },
  ];
  return (
    <Card title="배포 대상" description="각 대상의 워크로드 상태와 GitOps 감시 연결 상태를 함께 확인합니다">
      <Table
        rows={deployments}
        columns={columns}
        rowKey={(row) => `${row.cluster_id}/${row.namespace}/${row.name}`}
        loading={loading}
        error={error}
        onRetry={onRetry}
        empty={<EmptyState icon={<RepoIcon />} title="배포 대상 없음" description="아직 연결된 클러스터 배포가 없습니다" />}
      />
    </Card>
  );
}

function GitOpsPollCell({ poll }: { poll?: GitOpsPoll }) {
  if (!poll) return <span className="text-caption text-muted">확인 전</span>;
  const meta = gitOpsPollMeta(poll.status);
  const error = poll.error || poll.error_kind;
  return (
    <div className="grid min-w-44 gap-1">
      <span><Badge tone={meta.tone}>{meta.label}</Badge></span>
      <span className="text-caption text-secondary">
        {poll.last_seen_commit_sha ? `커밋 ${shortSha(poll.last_seen_commit_sha)}` : '확인된 커밋 없음'}
        {poll.last_polled_at ? ` · ${timeAgo(poll.last_polled_at) || '방금 확인'}` : ''}
      </span>
      {error && <span className="line-clamp-2 text-caption font-medium text-danger" title={error}>{error}</span>}
    </div>
  );
}

function gitOpsPollMeta(status: string): { label: string; tone: BadgeTone } {
  const key = status.toLowerCase();
  if (key === 'ok') return { label: '정상 감시', tone: 'success' };
  if (key === 'failed') return { label: '감시 실패', tone: 'danger' };
  return { label: '감시 대기', tone: 'warning' };
}

function SafePrCard({
  run,
  loading,
  error,
  onRetry,
  onAiAnalyze,
}: {
  run?: WorkflowRun;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  onAiAnalyze: (error: string) => void;
}) {
  const safePr = run?.safe_pr;
  return (
    <Card
      title="Safe PR"
      description="자동 복구가 PR로 제안된 이력을 확인합니다"
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!safePr ? <EmptyState icon={<FileIcon />} title="Safe PR 이력 없음" description="아직 생성된 Safe PR이 없습니다" /> : undefined}
    >
      {safePr && (
        <div className="grid gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge status={safePr.status} />
            {run?.commit_sha && <CodeText>{shortSha(run.commit_sha)}</CodeText>}
            {safePr.pr_url && (
              <a className="font-semibold text-accent hover:text-accent-hover" href={safePr.pr_url} target="_blank" rel="noreferrer">PR 열기</a>
            )}
          </div>
          {safePr.explanation && <p className="text-body text-secondary">{safePr.explanation}</p>}
          {safePr.diff_before && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-2">
                <Badge tone="danger">before</Badge>
                <CodeBlock label="before diff" code={safePr.diff_before} />
              </div>
              <div className="grid gap-2">
                <Badge tone="success">after</Badge>
                <CodeBlock label="after diff" code={safePr.diff_after ?? ''} />
              </div>
            </div>
          )}
          {safePr.error && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-danger/40 bg-bg p-3">
              <p className="min-w-0 text-body text-secondary">Safe PR 실패 사유: <span className="font-semibold text-danger">{safePr.error}</span></p>
              <Button size="sm" variant="primary" leadingIcon={<SendIcon />} onClick={() => onAiAnalyze(safePr.error ?? '')}>AI 분석</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PlanDiffPanel({ changes, resource }: { changes: PlanChange[]; resource?: string }) {
  const actionable = changes.filter((change) => change.classification !== 'already_converged');
  const converged = changes.length - actionable.length;
  if (changes.length === 0) return <EmptyState title="변경 없음" description="적용할 변경이 없습니다" />;
  return (
    <div className="grid gap-3 rounded-panel border border-border bg-bg p-3">
      {resource && <CodeText>{resource}</CodeText>}
      <div className="max-w-full overflow-x-auto">
        <div className="grid min-w-full gap-1 font-mono text-caption">
          {actionable.map((change) => {
            const meta = planChangeMeta(change.classification);
            return (
              <div key={change.field_path} className="grid gap-2 rounded-control px-2 py-1 hover:bg-raised md:grid-cols-6 md:items-baseline">
                <span className={cx('font-bold', meta.className)}>{meta.symbol}</span>
                <span className="truncate text-primary md:col-span-2">{change.field_path}</span>
                <span className="truncate text-muted">{shortValue(change.before)}</span>
                <span className={cx('truncate', meta.className)}>{shortValue(change.after)}</span>
                <span className="text-muted md:text-right">{meta.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      {converged > 0 && <p className="text-caption text-muted">이미 일치 {converged.toLocaleString()}건은 적용 대상에서 제외됩니다</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = workflowStatusMeta(status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function workflowStatusMeta(status: string): { label: string; tone: BadgeTone } {
  const key = status.toUpperCase();
  if (['SUCCEEDED', 'SUCCESS', 'COMPLETED', 'DONE', 'APPROVED', 'GRANTED'].includes(key)) return { label: '완료', tone: 'success' };
  if (['FAILED', 'ERROR', 'REJECTED'].includes(key)) return { label: '실패', tone: 'danger' };
  if (key === 'WAITING_FOR_APPROVAL') return { label: '승인 대기', tone: 'warning' };
  if (['PENDING', 'QUEUED'].includes(key)) return { label: '대기', tone: 'neutral' };
  if (STEP_ORDER.includes(key) || ['RUNNING', 'APPLYING'].includes(key)) return { label: workflowStatusLabel(key), tone: 'info' };
  return { label: status || '미확인', tone: 'neutral' };
}

function workflowStatusLabel(status: string) {
  const key = status.toUpperCase();
  return {
    STARTED: '시작',
    RENDERING: '렌더링',
    DIFFING: '변경 계산',
    POLICY_CHECKING: '정책 검증',
    WAITING_FOR_APPROVAL: '승인 대기',
    APPLYING: '적용 중',
    ROLLOUT_WAITING: '롤아웃 확인',
    SUCCEEDED: '완료',
    FAILED: '실패',
    PENDING: '대기',
    RUNNING: '실행 중',
  }[key] ?? (status || '미확인');
}

function stepToneClass(status: string) {
  const key = status.toUpperCase();
  if (['SUCCEEDED', 'SUCCESS', 'COMPLETED'].includes(key)) return 'border-success/40 bg-success';
  if (['FAILED', 'ERROR', 'REJECTED'].includes(key)) return 'border-danger/40 bg-danger';
  if (key === 'PENDING') return 'border-border bg-raised';
  if (key === 'WAITING_FOR_APPROVAL') return 'border-warning/40 bg-warning';
  return 'border-info/40 bg-info';
}

function planChangeMeta(classification: string): { symbol: string; className: string; label: string } {
  return {
    adoption_required: { symbol: '+', className: 'text-success', label: '신규 관리' },
    intended_change: { symbol: '~', className: 'text-info', label: '의도 변경' },
    drift: { symbol: '!', className: 'text-warning', label: '드리프트' },
    conflict_or_manual_change: { symbol: '!', className: 'text-danger', label: '충돌' },
    already_converged: { symbol: '=', className: 'text-muted', label: '일치' },
  }[classification] ?? { symbol: '~', className: 'text-secondary', label: '변경' };
}

function shortValue(value: unknown): string {
  if (value === undefined || value === null || value === '__missing__') return '없음';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function CodeText({ children }: { children: string }) {
  return <code className="inline-flex max-w-full truncate rounded-control border border-border bg-raised px-2 py-1 font-mono text-caption text-secondary">{children}</code>;
}

function normalizeTab(value: string | null): DetailTab {
  return TAB_VALUES.includes(value as DetailTab) ? (value as DetailTab) : 'runs';
}

function githubUrl(repoRef: string) {
  return `https://github.com/${repoRef}`;
}

function manifestUrl(repoRef: string, branch: string, manifestPath: string) {
  return `${githubUrl(repoRef)}/blob/${branch}/${manifestPath}`;
}

function openExternal(url: string) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M8 3.2a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Zm0 2.2v3l2 1.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M4.5 2.5h4.2l2.8 2.8v8.2h-7a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Zm4 0v3h3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function RepoIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-5 w-5" aria-hidden="true">
      <path d="M4 3.5h8A1.5 1.5 0 0 1 13.5 5v8H4A1.5 1.5 0 0 1 2.5 11.5v-7A1 1 0 0 1 3.5 3.5H4zM4 3.5v8M5 6h5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path d="M2.5 8 13 3.5 10.2 13 7.5 9.2 2.5 8Zm5 1.2L13 3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
    </svg>
  );
}
