import { useEffect, useRef, useState } from 'react';
import { Activity, GitPullRequest, Pencil, Plus, Rocket, Workflow } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useApplications } from '@/features/repo/api';
import type { Application, ReleasePlan, ReleasePlanStep, ReleaseRun } from '@/shared/lib/types';
import { Badge, Button, Drawer, EmptyState, Field, Select, Skeleton, Tabs } from '@/ui';
import { useReleasePlans, useReleaseRuns } from './api';
import { ManifestPanel } from './ManifestPanel';
import { PlanEditor } from './PlanEditor';
import { PlanWizard } from './PlanWizard';
import { RunPanel } from './RunPanel';
import { WorkflowGraph } from './WorkflowGraph';
import {
  APPROVAL_POLICIES,
  STRATEGIES,
  WORKSPACE_VIEWS,
  clonePlan,
  configString,
  latestRun,
  optionLabel,
  releaseStatusLabel,
  releaseStatusTone,
  releaseWaves,
  settingString,
  stepKey,
  type WorkspaceView,
} from './model';
import './ReleaseFlowView.css';

export default function ReleaseFlowView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const plansQuery = useReleasePlans();
  const applicationsQuery = useApplications();
  const plans = plansQuery.data ?? [];
  const applications = applicationsQuery.data ?? [];
  const creating = searchParams.get('mode') === 'new';
  const requestedPlanId = searchParams.get('plan') ?? '';
  const requestedView = searchParams.get('view');
  const view: WorkspaceView = isWorkspaceView(requestedView) ? requestedView : 'overview';
  const selectedPlan = plans.find((plan) => plan.plan_id === requestedPlanId) ?? plans[0];
  const runsQuery = useReleaseRuns(selectedPlan?.plan_id);
  const runs = runsQuery.data ?? [];
  const recentRun = latestRun(runs);
  const [draft, setDraft] = useState<ReleasePlan>();
  const [selectedStepId, setSelectedStepId] = useState('');
  const loadedPlanId = useRef<string>();

  useEffect(() => {
    if (creating || plansQuery.isPending || plans.length === 0) return;
    if (!selectedPlan?.plan_id || selectedPlan.plan_id === requestedPlanId) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('plan', selectedPlan.plan_id!);
      return next;
    }, { replace: true });
  }, [creating, plans.length, plansQuery.isPending, requestedPlanId, selectedPlan?.plan_id, setSearchParams]);

  useEffect(() => {
    const nextPlanId = selectedPlan?.plan_id ?? '';
    if (loadedPlanId.current === nextPlanId) return;
    loadedPlanId.current = nextPlanId;
    if (!selectedPlan) {
      setDraft(undefined);
      setSelectedStepId('');
      return;
    }
    setDraft(clonePlan(selectedPlan));
    setSelectedStepId('');
  }, [selectedPlan]);

  useEffect(() => {
    if (view !== 'edit' || selectedStepId || !selectedPlan?.steps[0]) return;
    setSelectedStepId(stepKey(selectedPlan.steps[0], 0));
  }, [selectedPlan, selectedStepId, view]);

  const setView = (nextView: WorkspaceView) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('mode');
      next.set('view', nextView);
      return next;
    }, { replace: true });
    setSelectedStepId((current) => nextView === 'edit'
      ? current || (selectedPlan?.steps[0] ? stepKey(selectedPlan.steps[0], 0) : '')
      : '');
  };

  const selectPlan = (planId: string) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('mode');
      next.set('plan', planId);
      next.set('view', 'overview');
      return next;
    });
  };

  const openWizard = () => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('mode', 'new');
      return next;
    });
  };

  const closeWizard = (created?: ReleasePlan) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('mode');
      next.set('view', 'overview');
      if (created?.plan_id) next.set('plan', created.plan_id);
      return next;
    });
  };

  const graphPlan = view === 'edit' && draft ? draft : selectedPlan;
  const selectedStep = graphPlan?.steps.find((step, index) => stepKey(step, index) === selectedStepId);

  return (
    <div className="workflow-page">
      <header className="workflow-page__header">
        <div className="workflow-page__title">
          <span className="workflow-page__mark"><Workflow size={20} /></span>
          <div>
            <h1>{creating ? '새 워크플로우' : '워크플로우'}</h1>
            <p>{creating ? '새 플랜' : selectedPlan?.name || '릴리즈 플랜'}</p>
          </div>
        </div>
        <div className="workflow-page__actions">
          {!creating && plans.length > 0 && (
            <Field label="플랜">
              <Select
                className="workflow-plan-select"
                value={selectedPlan?.plan_id ?? ''}
                onChange={(event) => selectPlan(event.target.value)}
              >
                {plans.map((plan) => <option key={plan.plan_id} value={plan.plan_id}>{plan.name}</option>)}
              </Select>
            </Field>
          )}
          {!creating && <Button variant="primary" leadingIcon={<Plus size={16} />} onClick={openWizard}>새 플랜</Button>}
        </div>
      </header>

      {creating ? (
        <PlanWizard applications={applications} applicationsPending={applicationsQuery.isPending} onCancel={() => closeWizard()} onCreated={closeWizard} />
      ) : plansQuery.isPending ? (
        <Skeleton lines={8} className="workflow-page__loading" />
      ) : plansQuery.isError ? (
        <EmptyState title="워크플로우를 불러오지 못했습니다" description={(plansQuery.error as Error).message} action={<Button onClick={() => plansQuery.refetch()}>다시 시도</Button>} />
      ) : !selectedPlan ? (
        <EmptyState
          icon={<Workflow size={22} />}
          title="아직 플랜이 없습니다"
          description="첫 배포 플랜을 만들고 연결된 리포지토리의 실행 순서를 정하세요."
          action={<Button variant="primary" leadingIcon={<Plus size={16} />} onClick={openWizard}>새 플랜 만들기</Button>}
        />
      ) : (
        <>
          <div className="workflow-page__nav">
            <Tabs items={WORKSPACE_VIEWS} value={view} onValueChange={(value) => setView(value as WorkspaceView)} />
          </div>
          <PlanContextBar plan={selectedPlan} run={recentRun} />

          {view === 'overview' && (
            <OverviewPanel
              plan={selectedPlan}
              applications={applications}
              runs={runs}
              runsPending={runsQuery.isPending}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
              onEdit={() => setView('edit')}
              onRun={() => setView('runs')}
            />
          )}
          {view === 'edit' && draft && (
            <PlanEditor
              key={selectedPlan.plan_id}
              source={selectedPlan}
              plan={draft}
              applications={applications}
              applicationsPending={applicationsQuery.isPending}
              selectedStepId={selectedStepId}
              onSelectStep={setSelectedStepId}
              onChange={setDraft}
              onSaved={(saved) => setDraft(clonePlan(saved))}
              onDeleted={() => {
                void plansQuery.refetch();
                setSearchParams({ view: 'overview' });
              }}
            />
          )}
          {view === 'runs' && (
            <RunPanel plan={selectedPlan} runs={runs} pending={runsQuery.isPending} onRefresh={() => runsQuery.refetch()} />
          )}
          {view === 'yaml' && <ManifestPanel plan={selectedPlan} applications={applications} />}
        </>
      )}

      <NodeDetailDrawer
        open={!creating && view === 'overview' && Boolean(selectedStep)}
        step={selectedStep}
        application={applications.find((app) => app.application_id === selectedStep?.application_id)}
        plan={graphPlan}
        run={recentRun}
        onClose={() => setSelectedStepId('')}
        onEdit={() => setView('edit')}
      />
    </div>
  );
}

function PlanContextBar({ plan, run }: { plan: ReleasePlan; run?: ReleaseRun }) {
  return (
    <dl className="workflow-context-bar">
      <div><dt>플랜 상태</dt><dd><Badge tone={releaseStatusTone(plan.status)}>{releaseStatusLabel(plan.status)}</Badge></dd></div>
      <div><dt>배포 단계</dt><dd>{plan.steps.length}</dd></div>
      <div><dt>승인 정책</dt><dd>{optionLabel(APPROVAL_POLICIES, settingString(plan, 'approval_policy', 'manual_each_step'))}</dd></div>
      <div><dt>최근 실행</dt><dd>{run ? <Badge tone={releaseStatusTone(run.status)}>{releaseStatusLabel(run.status)}</Badge> : '없음'}</dd></div>
    </dl>
  );
}

function OverviewPanel({
  plan,
  applications,
  runs,
  runsPending,
  selectedStepId,
  onSelectStep,
  onEdit,
  onRun,
}: {
  plan: ReleasePlan;
  applications: Application[];
  runs: ReleaseRun[];
  runsPending: boolean;
  selectedStepId: string;
  onSelectStep: (stepId: string) => void;
  onEdit: () => void;
  onRun: () => void;
}) {
  const run = latestRun(runs);
  return (
    <div className="workflow-overview">
      <div className="workflow-action-band">
        <div>
          <span className="workflow-action-band__label">다음 작업</span>
          <strong>{run && ['running', 'paused', 'waiting_for_approval'].includes(run.status) ? `${releaseStatusLabel(run.status)} 실행 확인` : '실행 전 준비 상태 확인'}</strong>
          <p>{run ? `${run.current_wave}/${run.total_waves} Wave · ${formatDate(run.updated_at || run.created_at)}` : `${plan.steps.length}개 배포 단계`}</p>
        </div>
        <div className="workflow-action-band__actions">
          <Button leadingIcon={<Pencil size={16} />} onClick={onEdit}>플랜 편집</Button>
          <Button variant="primary" leadingIcon={<Rocket size={16} />} onClick={onRun}>{run ? '실행 보기' : '실행 준비'}</Button>
        </div>
      </div>

      <WorkflowGraph
        plan={plan}
        applications={applications}
        run={run}
        selectedStepId={selectedStepId}
        onSelectStep={onSelectStep}
        className="workflow-overview__graph"
      />

      <section className="workflow-overview__details">
        <div>
          <h2>플랜 정보</h2>
          <p>{plan.description || '설명이 없습니다.'}</p>
        </div>
        <dl>
          <div><dt>기본 전략</dt><dd>{optionLabel(STRATEGIES, settingString(plan, 'default_strategy', 'rolling'))}</dd></div>
          <div><dt>실행 모드</dt><dd>{settingString(plan, 'runtime_mode', 'demo') === 'live' ? '실제 배포' : '검증 모드'}</dd></div>
          <div><dt>동시 실행</dt><dd>{String(plan.settings.concurrency ?? 1)}</dd></div>
          <div><dt>마지막 수정</dt><dd>{formatDate(plan.updated_at)}</dd></div>
        </dl>
        {runsPending && <span className="workflow-muted">실행 상태 확인 중</span>}
      </section>
    </div>
  );
}

function NodeDetailDrawer({
  open,
  step,
  application,
  plan,
  run,
  onClose,
  onEdit,
}: {
  open: boolean;
  step?: ReleasePlanStep;
  application?: Application;
  plan?: ReleasePlan;
  run?: ReleaseRun;
  onClose: () => void;
  onEdit: () => void;
}) {
  if (!step || !plan) return null;
  const runStep = run?.steps.find((item) => item.application_id === step.application_id);
  const wave = releaseWaves(plan.steps).get(step.application_id) ?? 1;
  const dependencies = step.depends_on.map((dependency) => {
    const dependencyStep = plan.steps.find((item) => item.application_id === dependency);
    return dependencyStep?.name || dependencyStep?.application_id || dependency;
  });
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={step.name || application?.name || step.application_id}
      description={`Wave ${wave} · ${configString(step, 'environment', 'staging')}`}
      actions={<Button variant="primary" leadingIcon={<Pencil size={16} />} onClick={onEdit}>이 단계 편집</Button>}
    >
      <div className="workflow-drawer">
        <section>
          <div className="workflow-drawer__section-title"><Activity size={16} /><h3>현재 상태</h3></div>
          <Badge tone={releaseStatusTone(runStep?.status)}>{releaseStatusLabel(runStep?.status)}</Badge>
          {runStep?.workflow_run_id && <code>{runStep.workflow_run_id}</code>}
        </section>
        <section>
          <div className="workflow-drawer__section-title"><GitPullRequest size={16} /><h3>리포지토리</h3></div>
          <dl className="workflow-detail-list">
            <div><dt>주소</dt><dd>{application?.repo_ref || '-'}</dd></div>
            <div><dt>브랜치</dt><dd>{configString(step, 'branch', application?.branch || 'main')}</dd></div>
            <div><dt>매니페스트</dt><dd>{configString(step, 'manifest_path', application?.manifest_path || '-')}</dd></div>
          </dl>
        </section>
        <section>
          <div className="workflow-drawer__section-title"><Rocket size={16} /><h3>배포 설정</h3></div>
          <dl className="workflow-detail-list">
            <div><dt>환경</dt><dd>{configString(step, 'environment', 'staging')}</dd></div>
            <div><dt>클러스터</dt><dd>{configString(step, 'cluster_id', application?.cluster_id || '-')}</dd></div>
            <div><dt>네임스페이스</dt><dd>{configString(step, 'namespace', 'default')}</dd></div>
            <div><dt>전략</dt><dd>{optionLabel(STRATEGIES, configString(step, 'strategy', settingString(plan, 'default_strategy', 'rolling')))}</dd></div>
            <div><dt>선행 단계</dt><dd>{dependencies.length ? dependencies.join(', ') : '없음'}</dd></div>
          </dl>
        </section>
      </div>
    </Drawer>
  );
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function isWorkspaceView(value: string | null): value is WorkspaceView {
  return value === 'overview' || value === 'edit' || value === 'runs' || value === 'yaml';
}
