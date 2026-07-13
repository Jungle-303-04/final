import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import { useApplications, useRunsAll, repoKeys } from '@/features/repo/api';
import { useIsAdmin } from '@/features/auth/api';
import { encodeChatContext } from '@/features/chat/context';
import { FlowCanvas, useAutoLayout, type FlowEdgeData } from '@/shared/flow';
import { post } from '@/shared/lib/api';
import { shortSha } from '@/shared/lib/format';
import type { PlanChange, RunStep, Tone, WorkflowRun } from '@/shared/lib/types';
import { useConsolePath } from '@/features/console/ui';
import { Badge, Breadcrumb, Button, Card, CodeBlock, Collapsible, EmptyState, KeyValueList, PageHeader, Skeleton, Tooltip, cx, useToast } from '@/ui';

const ORDER = ['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING', 'SUCCEEDED'];
const ACTIVE = new Set(['STARTED', 'RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL', 'APPLYING', 'ROLLOUT_WAITING']);
const TERMINAL = new Set(['SUCCEEDED', 'FAILED']);

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
type FlowEdge = Edge<FlowEdgeData>;
type WorkflowWithApp = WorkflowRun & { appId: string };

function StepNode({ data }: NodeProps<Node<{ step: RunStep; active: boolean }>>) {
  const { step, active } = data;
  const meta = workflowStatusMeta(step.status === 'PENDING' ? 'PENDING' : step.status);
  const pending = step.status === 'PENDING';
  return (
    <div className={cx(
      'inline-flex min-w-28 items-center justify-center gap-2 whitespace-nowrap rounded-panel border bg-surface px-3 py-2 text-center text-label font-semibold shadow-soft',
      pending ? 'border-border text-text-muted' : flowToneClass(badgeToneToFlowTone(meta.tone)),
      active && 'flow-node--pulse',
    )}>
      <Handle type="target" position={Position.Left} className="opacity-0" />
      {meta.tone === 'success' && <span className="text-success">✓</span>}
      <span className="min-w-0 truncate">{workflowStatusLabel(step.name)}</span>
      <Handle type="source" position={Position.Right} className="opacity-0" />
    </div>
  );
}

const nodeTypes = { step: StepNode };

export default function WorkflowGraphView() {
  const { runId = '' } = useParams();
  const pathFor = useConsolePath();
  const apps = useApplications();
  const all = useRunsAll(apps.data ?? []);
  const found = all.items
    .flatMap(({ appId, runs }) => runs.map((run) => ({ ...run, appId })))
    .find((run) => run.run_id === runId);
  const [selected, setSelected] = useState<string | null>(null);
  const loading = apps.isPending || ((apps.data ?? []).length > 0 && all.pending);

  const raw = useMemo(() => buildGraph(found), [found]);
  const { nodes, edges } = useAutoLayout(raw.nodes, raw.edges, 'LR');

  if (!found) {
    return (
      <div className="grid gap-6">
        <PageHeader
          title="워크플로우 상세"
          breadcrumb={<Breadcrumb items={[{ label: '워크플로우', href: pathFor('/workflows') }, { label: shortSha(runId) }]} />}
        />
        <Card>
          {apps.isError || all.failed ? (
            <EmptyState
              title="워크플로우 조회 실패"
              description={((apps.error ?? all.error) as Error | undefined)?.message ?? '실행 정보를 불러오지 못했습니다'}
              action={<Button size="sm" onClick={() => apps.refetch()}>다시 시도</Button>}
            />
          ) : loading ? (
            <Skeleton lines={6} />
          ) : (
            <EmptyState
              title="워크플로우 없음"
              description={<>이미 정리됐거나 접근 권한이 없는 실행입니다. 요청한 run: <CodeText>{runId}</CodeText></>}
              action={<Link to={pathFor('/workflows')}><Button size="sm">목록 보기</Button></Link>}
            />
          )}
        </Card>
      </div>
    );
  }

  const currentStep = found.steps.find((step) => step.name === found.status)
    ?? found.steps.find((step) => step.status !== 'SUCCEEDED')
    ?? found.steps[found.steps.length - 1]
    ?? null;
  const selectedStep = selected ? found.steps.find((step) => step.name === selected) ?? null : currentStep;
  const diffStep = found.steps.find((step) => step.name === 'DIFFING');

  return (
    <div className="grid gap-6">
      <PageHeader
        title={found.appId}
        description={`${shortSha(found.commit_sha)} 배포 실행`}
        breadcrumb={<Breadcrumb items={[{ label: '워크플로우', href: pathFor('/workflows') }, { label: `${found.appId} · ${shortSha(found.commit_sha)}` }]} />}
        actions={<WorkflowStatusBadge status={found.status} />}
      />

      {found.status === 'WAITING_FOR_APPROVAL' && found.approval_id && (
        <ApprovalPanel
          run={found}
          approvalId={found.approval_id}
          diffStep={diffStep}
        />
      )}
      {found.status === 'WAITING_FOR_APPROVAL' && !found.approval_id && (
        <ApprovalReferenceMissingPanel
          run={found}
          onRetry={() => all.refetchAll()}
        />
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(22rem,0.75fr)]">
        <Card title="실행 흐름">
          <div className="max-w-full overflow-x-auto">
            <div className="h-96 min-w-[42rem] overflow-hidden rounded-panel border border-border bg-bg">
              <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={setSelected} />
            </div>
          </div>
        </Card>

        <Card title={selectedStep ? workflowStatusLabel(selectedStep.name) : '단계 상세'}>
          {selectedStep ? (
            <StepDetail step={selectedStep} />
          ) : (
            <EmptyState title="선택된 단계 없음" description="그래프에서 단계를 선택하면 상세 정보가 표시됩니다" />
          )}
        </Card>
      </section>
    </div>
  );
}

function buildGraph(found?: WorkflowWithApp) {
  if (!found) return { nodes: [] as Node[], edges: [] as FlowEdge[] };
  const running = !TERMINAL.has(found.status);
  const statusIndex = ORDER.indexOf(found.status);
  const visibleOrder = running && statusIndex >= 0 ? ORDER.slice(0, statusIndex + 1) : ORDER;
  const nodes: Node[] = visibleOrder.map((name) => {
    const step = found.steps.find((item) => item.name === name) ?? { name, status: 'PENDING' };
    return { id: name, type: 'step', position: { x: 0, y: 0 }, data: { step, active: running && step.name === found.status } };
  });
  const edges: FlowEdge[] = visibleOrder.slice(1).map((name, index) => {
    const targetIndex = index + 1;
    const done = found.status === 'SUCCEEDED'
      || (statusIndex >= 0 && targetIndex < statusIndex)
      || found.steps.find((step) => step.name === name)?.status === 'SUCCEEDED';
    const active = running && statusIndex >= 0 && targetIndex === statusIndex;
    return {
      id: `e${index}`,
      source: visibleOrder[index],
      target: name,
      type: 'animated',
      data: { active, tone: done ? 'ok' : undefined },
    };
  });
  if (found.status === 'FAILED') {
    const failedAt = found.steps.find((step) => step.status === 'FAILED')?.name ?? 'POLICY_CHECKING';
    nodes.push({ id: 'FAILED', type: 'step', position: { x: 0, y: 0 }, data: { step: { name: 'FAILED', status: 'FAILED' }, active: false } });
    edges.push({ id: 'ef', source: failedAt, target: 'FAILED', type: 'animated', data: { active: false, tone: 'danger' } });
  }
  return { nodes, edges };
}

function ApprovalReferenceMissingPanel({ run, onRetry }: { run: WorkflowWithApp; onRetry: () => void }) {
  const diffStep = run.steps.find((step) => step.name === 'DIFFING');
  const pathFor = useConsolePath();
  const reason = diffStep?.detail || '승인 요청 식별자가 실행 정보에 연결되지 않았습니다';
  return (
    <Card
      title="승인 요청 확인 필요"
      actions={<Badge tone="danger">승인 불가</Badge>}
    >
      <div className="grid gap-4">
        <KeyValueList items={[
          { label: '앱', value: <CodeText>{run.appId}</CodeText> },
          { label: '커밋', value: <CodeText>{shortSha(run.commit_sha)}</CodeText> },
          { label: '상태', value: <WorkflowStatusBadge status={run.status} /> },
          { label: '사유', value: reason },
        ]} />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onRetry}>새로고침</Button>
          <Link to={pathFor(`/repos/${run.application_id}`)}>
            <Button variant="primary">배포 보기</Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}

function ApprovalPanel({ run, approvalId, diffStep }: { run: WorkflowWithApp; approvalId: string; diffStep?: RunStep }) {
  const [previewOpen, setPreviewOpen] = useState(true);
  const canApprove = useIsAdmin();
  const approval = useWorkflowApproval();
  const pathFor = useConsolePath();
  const pendingAction = approval.variables?.action;
  const approveDisabled = !canApprove || approval.isPending;
  const summary = `${shortSha(run.commit_sha)} 배포 승인`;
  const aiParams = new URLSearchParams({ prefill: '이 GitOps diff 위험도를 설명해줘' });
  const aiContext = encodeChatContext({
    diff_source: 'gitops',
    workflow_run_id: run.run_id,
    approval_id: approvalId,
    application_id: run.application_id,
  });
  if (aiContext) aiParams.set('context', aiContext);

  return (
    <Card
      title="승인 요청"
      description="실행 내용 검토 후 승인하거나 거절합니다"
      actions={<Badge tone="warning">승인 대기</Badge>}
    >
      <div className="grid gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <CodeText>{run.appId}</CodeText>
          <CodeText>{shortSha(run.commit_sha)}</CodeText>
          {run.safe_pr?.pr_url && <a className="text-brand hover:text-brand-hover" href={run.safe_pr.pr_url} target="_blank" rel="noreferrer">PR 보기</a>}
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-between gap-4 rounded-control border border-border bg-raised px-3 py-2 text-left text-body font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => setPreviewOpen((open) => !open)}
          aria-expanded={previewOpen}
        >
          <span>실행 내용 미리보기</span>
          <span className="text-text-muted">{previewOpen ? '접기' : '펼치기'}</span>
        </button>
        <Collapsible open={previewOpen}>
          <div className="grid gap-3 rounded-panel border border-border bg-bg p-4">
            <p className="text-body text-text-secondary">{summary}{diffStep?.detail ? ` · ${diffStep.detail}` : ''}</p>
            {diffStep?.changes && diffStep.changes.length > 0 ? (
              <PlanDiffPanel changes={diffStep.changes} resource={diffStep.resource} />
            ) : (
              <EmptyState title="변경 미리보기 없음" description="서버가 적용 계획을 아직 제공하지 않았습니다" />
            )}
          </div>
        </Collapsible>

        <div className="flex flex-wrap justify-end gap-2">
          <Link to={pathFor(`/ai?${aiParams.toString()}`)}>
            <Button variant="secondary">AI 설명</Button>
          </Link>
          <ActionButtonTooltip enabled={canApprove}>
            <Button
              variant="secondary"
              disabled={approveDisabled}
              loading={approval.isPending && pendingAction === 'reject'}
              onClick={() => approval.mutate({ approvalId, action: 'reject' })}
            >
              거절
            </Button>
          </ActionButtonTooltip>
          <ActionButtonTooltip enabled={canApprove}>
            <Button
              variant="primary"
              disabled={approveDisabled}
              loading={approval.isPending && pendingAction === 'grant'}
              onClick={() => approval.mutate({ approvalId, action: 'grant' })}
            >
              승인
            </Button>
          </ActionButtonTooltip>
        </div>
      </div>
    </Card>
  );
}

function ActionButtonTooltip({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  if (enabled) return <>{children}</>;
  return (
    <Tooltip label="release-operator 권한 필요">
      <span className="inline-flex">{children}</span>
    </Tooltip>
  );
}

function StepDetail({ step }: { step: RunStep }) {
  return (
    <div className="grid gap-4">
      <KeyValueList items={[
        { label: '상태', value: <WorkflowStatusBadge status={step.status === 'PENDING' ? 'PENDING' : step.status} /> },
        { label: '단계', value: workflowStatusLabel(step.name) },
        { label: '상세', value: step.detail || '없음' },
      ]} />
      {step.changes && step.changes.length > 0 ? (
        <PlanDiffPanel changes={step.changes} resource={step.resource} />
      ) : step.name === 'DIFFING' && step.detail ? (
        <CodeBlock label="변경 계산" code={step.detail} />
      ) : (
        <EmptyState title="변경 사항 없음" description="이 단계에 표시할 추가 계획이 없습니다" />
      )}
    </div>
  );
}

function PlanDiffPanel({ changes, resource }: { changes: PlanChange[]; resource?: string }) {
  const actionable = changes.filter((change) => change.classification !== 'already_converged');
  const converged = changes.length - actionable.length;

  if (changes.length === 0) return <EmptyState title="변경 없음" description="적용할 변경이 없습니다" />;

  return (
    <div className="grid gap-3 rounded-panel border border-border bg-bg p-3" data-testid="plan-diff">
      {resource && <CodeText>{resource}</CodeText>}
      <div className="max-w-full overflow-x-auto">
        <div className="grid min-w-[40rem] gap-1 font-mono text-caption">
          {actionable.map((change) => {
            const meta = planChangeMeta(change.classification);
            return (
              <div key={change.field_path} className="grid grid-cols-[2rem_minmax(8rem,1fr)_minmax(8rem,1fr)_2rem_minmax(8rem,1fr)_7rem] items-baseline gap-2 rounded-control px-2 py-1 hover:bg-raised">
                <span className={cx('text-center font-bold', meta.className)}>{meta.symbol}</span>
                <span className="truncate text-text-primary">{change.field_path}</span>
                <span className="truncate text-text-muted">{shortValue(change.before)}</span>
                <span className="text-text-muted">-&gt;</span>
                <span className={cx('truncate', meta.className)}>{shortValue(change.after)}</span>
                <span className="text-right text-text-muted">{meta.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      {converged > 0 && <p className="text-caption text-text-muted">이미 일치 {converged}건은 적용 대상에서 제외됩니다</p>}
    </div>
  );
}

function useWorkflowApproval() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ approvalId, action }: { approvalId: string; action: 'grant' | 'reject' }) => post(`/approvals/${approvalId}/${action}`, {}),
    onSuccess: (_data, variables) => {
      toast.push({
        tone: variables.action === 'grant' ? 'success' : 'warning',
        title: variables.action === 'grant' ? '승인 완료' : '거절 완료',
        description: variables.action === 'grant' ? '배포가 이어서 진행됩니다' : '워크플로우가 거절 상태로 정리됩니다',
      });
      queryClient.invalidateQueries({ queryKey: repoKeys.apps() });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'applications' });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'ai' });
    },
    onError: (error, variables) => {
      const action = variables.action === 'grant' ? '승인' : '거절';
      toast.push({ tone: 'danger', title: `${action} 실패`, description: approvalFailureMessage(error) });
      queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] === 'applications' });
    },
  });
}

function approvalFailureMessage(error: unknown) {
  const detail = (error as { kind?: string; detail?: string; message?: string }) ?? {};
  if (detail.kind === 'forbidden') return 'release-operator 권한이 필요합니다';
  if (detail.kind === 'invalid') return detail.detail ?? '이미 처리된 승인입니다';
  return detail.detail ?? detail.message ?? '잠시 후 다시 시도해주세요';
}

function WorkflowStatusBadge({ status }: { status: string }) {
  const meta = workflowStatusMeta(status);
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}

function workflowStatusMeta(status: string): { label: string; tone: BadgeTone } {
  const key = status.toUpperCase();
  if (['SUCCEEDED', 'COMPLETED', 'DONE', 'APPROVED', 'GRANTED'].includes(key)) return { label: '완료', tone: 'success' };
  if (['FAILED', 'REJECTED', 'ERROR'].includes(key)) return { label: '실패', tone: 'danger' };
  if (key === 'WAITING_FOR_APPROVAL') return { label: '승인 대기', tone: 'warning' };
  if (ACTIVE.has(key)) return { label: workflowStatusLabel(key), tone: 'info' };
  if (key === 'PENDING') return { label: '대기', tone: 'neutral' };
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
  }[key] ?? (status || '미확인');
}

function planChangeMeta(classification: string): { symbol: string; className: string; label: string } {
  return {
    adoption_required: { symbol: '+', className: 'text-success', label: '신규 관리' },
    intended_change: { symbol: '~', className: 'text-info', label: '의도 변경' },
    drift: { symbol: '!', className: 'text-warning', label: '드리프트' },
    conflict_or_manual_change: { symbol: '!', className: 'text-danger', label: '충돌' },
    already_converged: { symbol: '=', className: 'text-text-muted', label: '일치' },
  }[classification] ?? { symbol: '~', className: 'text-text-secondary', label: '변경' };
}

function shortValue(value: unknown): string {
  if (value === undefined || value === null) return '없음';
  if (value === '__missing__') return '없음';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function badgeToneToFlowTone(tone: BadgeTone): Tone {
  if (tone === 'success') return 'ok';
  if (tone === 'warning') return 'warn';
  if (tone === 'danger') return 'danger';
  if (tone === 'info') return 'info';
  return 'neutral';
}

function flowToneClass(tone: Tone) {
  return {
    ok: 'border-success/50 text-text-primary',
    warn: 'border-warning/50 text-text-primary',
    danger: 'border-danger/50 text-text-primary',
    info: 'border-info/50 text-text-primary',
    neutral: 'border-border text-text-secondary',
  }[tone];
}

function CodeText({ children }: { children: string }) {
  return <code className="inline-flex max-w-full truncate rounded-control border border-border bg-raised px-2 py-1 font-mono text-caption text-text-secondary">{children}</code>;
}
