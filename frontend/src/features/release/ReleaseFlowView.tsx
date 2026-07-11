import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction, type SVGProps } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import type { editor as MonacoEditor } from 'monaco-editor/esm/vs/editor/editor.api';
import { motion } from 'motion/react';
import { Link, useSearchParams } from 'react-router-dom';
import { useConsolePath } from '@/features/console/ui';
import { useApplications } from '@/features/repo/api';
import { ApprovalCard } from '@/features/repo/ApprovalCard';
import { type AlertChannel, useAlertChannels } from '@/features/notifications/api';
import {
  type ReleaseRunFilter,
  useAdvanceReleaseRun,
  useDiagnostics,
  useDispatchReleasePlan,
  useCancelReleaseRun,
  useNotifyReleaseRun,
  usePauseReleaseRun,
  useReleasePlans,
  useReleasePreview,
  useReleaseGeneratedManifest,
  useSubmitReleaseGeneratedManifestSafePr,
  useReleaseAudit,
  useReleaseAuditExport,
  useReleaseRunHandoff,
  useReleaseRunReport,
  useReleaseRunReportExport,
  useReleaseRunSummary,
  useDeleteReleasePlan,
  useArchiveReleasePlan,
  useDeleteReleaseRun,
  useReleaseRuns,
  useResumeReleaseRun,
  useReleaseReadiness,
  useRetryReleaseRun,
  useRollbackReleaseRun,
  useSaveReleasePlan,
  useStartReleasePlan,
} from '@/features/release/api';
import { Badge, Breadcrumb, Button, Card, EmptyState, Field } from '@/ui';
import { FlowCanvas, useAutoLayout, type FlowEdgeData } from '@/shared/flow';
import type {
  Application,
  Diagnostic,
  ReleaseAuditEvent,
  ReleaseGeneratedManifest,
  ReleaseManifestSafePr,
  ReleasePlan,
  ReleasePlanPreview,
  ReleaseReadiness,
  ReleasePlanStep,
  ReleaseRun,
  ReleaseRunHandoff,
  ReleaseRunSummary,
  Tone as ReleaseFlowTone,
} from '@/shared/lib/types';
import { fadeInUp } from '@/ui/motion';
import './ReleaseFlowView.css';

const DEFAULT_POLICY: Record<string, unknown> = {
  runtime_mode: 'demo',
  execution_mode: 'sequential_apply',
  approval_policy: 'manual_each_step',
  failure_policy: 'pause_for_operator',
  rollback_policy: 'safe_pr',
  default_strategy: 'rolling',
  environment_order: ['sandbox', 'staging', 'production'],
  concurrency: 1,
  health_timeout_seconds: 600,
  retry_attempts: 1,
  require_diagnostics_pass: true,
};

const RUNTIME_MODES = [
  ['demo', '데모 모드'],
  ['live', '라이브 모드'],
];
const EXECUTION_MODES = [
  ['preview_only', '미리보기만'],
  ['manual_dispatch', '수동 실행'],
  ['sequential_apply', '순차 배포'],
  ['promotion', '승격 경로'],
];
const APPROVAL_POLICIES = [
  ['auto_safe', '안전한 변경은 자동 승인'],
  ['manual_each_step', '모든 단계 수동 승인'],
  ['production_only', '운영 환경만 수동 승인'],
  ['external_change_ticket', '외부 변경 티켓 필요'],
];
const FAILURE_POLICIES = [
  ['stop_on_failure', '실패 시 중단'],
  ['pause_for_operator', '운영자 확인까지 일시정지'],
  ['continue_independent', '독립 wave 계속 진행'],
];
const ROLLBACK_POLICIES = [
  ['manual', '수동 롤백'],
  ['safe_pr', 'Safe PR 롤백'],
  ['restart_last_successful', '마지막 정상 상태 재시작'],
  ['disabled', '비활성화'],
];
const STRATEGIES = [
  ['rolling', '롤링'],
  ['canary', '카나리'],
  ['blue_green', '블루/그린'],
];
const STEP_GATES = [
  ['inherit', '플랜 정책 따르기'],
  ['auto', '자동'],
  ['manual', '수동 승인'],
  ['safe_pr', 'Safe PR'],
];
const AUDIT_EVENT_FILTERS = [
  ['', '모든 감사 이벤트'],
  ['workflow.run.failed', '워크플로 실패'],
  ['approval.requested', '승인 요청'],
  ['approval.rejected', '승인 거절'],
  ['rollback.requested', '롤백 요청'],
  ['release.*', '릴리즈 운영자 작업'],
  ['release.notify.*', '릴리즈 알림'],
  ['release.retry.*', '재시도'],
  ['release.cancelled', '취소됨'],
  ['wave.dispatched', 'Wave 실행됨'],
  ['evidence.queued', '증거 수집 대기'],
];

type ReleaseNodeData = {
  id: string;
  step: ReleasePlanStep;
  app?: Application;
  index: number;
  selected: boolean;
  relation: 'selected' | 'upstream' | 'downstream' | 'dimmed' | 'normal';
  tone: ReleaseFlowTone;
  diagnostics: number;
  nodeType: 'application' | 'precheck' | 'approval' | 'verification';
  executionStatus: string;
  healthStatus: string;
  wave?: number | null;
  gate: string;
  strategy: string;
  environment: string;
  namespace: string;
  version: string;
  commitSha: string;
  cluster: string;
  duration: string;
  warningCount: number;
  evidenceCount: number;
  failureReason: string;
};

type GraphFilterField = 'namespace' | 'cluster';
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function buildIconProps({ size, ...props }: IconProps): IconProps {
  const iconSize = size ?? 16;
  return {
    width: iconSize,
    height: iconSize,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: 'shrink-0',
    ...props,
  };
}

function IconPlus(props: IconProps) {
  return (
    <svg {...buildIconProps(props)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconSave(props: IconProps) {
  return (
    <svg {...buildIconProps(props)}>
      <path d="M5 3h9l5 5v13H5z" />
      <path d="M9 3v6h6" />
      <path d="M9 17h6" />
    </svg>
  );
}

function IconAlertTriangle(props: IconProps) {
  return (
    <svg {...buildIconProps(props)}>
      <path d="M12 3L3 20h18L12 3z" />
      <path d="M12 9v6" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function IconArrowUp(props: IconProps) {
  return (
    <svg {...buildIconProps(props)}>
      <path d="M12 19V7" />
      <path d="M6 13l6-6 6 6" />
    </svg>
  );
}

function IconArrowDown(props: IconProps) {
  return (
    <svg {...buildIconProps(props)}>
      <path d="M12 5v12" />
      <path d="M6 11l6 6 6-6" />
    </svg>
  );
}

function IconTrash(props: IconProps) {
  return (
    <svg {...buildIconProps(props)}>
      <path d="M5 7h14" />
      <path d="M8 7v11a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V7" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function ReleaseStepNode({ data }: NodeProps<Node<ReleaseNodeData>>) {
  const borderClass = data.tone === 'danger' ? 'release-node--error' : data.tone === 'warn' ? 'release-node--warn' : '';
  const isApplication = data.nodeType === 'application';
  const attentionText = data.failureReason || (data.warningCount > 0 ? `${data.warningCount}개 경고` : '');
  return (
    <div className={`release-node release-node--${data.nodeType} release-node--${data.relation} ${data.selected ? 'release-node--selected' : ''} ${borderClass}`} title={releaseNodeTooltip(data)}>
      <Handle type="target" position={Position.Left} className="release-node__handle release-node__handle--target" />
      <div className="release-node__main-row">
        <span className={`release-node__state-dot release-node__state-dot--${statusClass(data.executionStatus)}`} aria-hidden="true" />
        <span className="release-node__name">{data.step.name || data.app?.name || data.step.application_id}</span>
        {isApplication ? <span className="release-node__duration">{valueLabel(data.duration)}</span> : <span className="release-node__kind">{releaseNodeTypeLabel(data.nodeType)}</span>}
        {data.diagnostics > 0 && <Badge tone={toUiTone(data.tone)}>{data.diagnostics}</Badge>}
      </div>
      <div className="release-node__meta-line">
        <span>{statusLabel(data.executionStatus)}</span>
        <span>{data.wave != null ? `Wave ${data.wave}` : 'Wave 대기'}</span>
      </div>
      {attentionText && <p className="release-node__attention">{attentionText}</p>}
      <Handle type="source" position={Position.Right} className="release-node__handle release-node__handle--source" />
    </div>
  );
}

const nodeTypes = { release_step: ReleaseStepNode };
type ReleaseEdge = Edge<FlowEdgeData>;
type GraphMode = 'plan' | 'demo';
type ReleaseTab = 'overview' | 'edit' | 'run' | 'yaml';
type NewPlanStage = 'basics' | 'apps' | 'global' | 'steps' | 'review';
const RELEASE_NODE_WIDTH = 270;
const RELEASE_NODE_HEIGHT = 82;
const LAST_VIEWED_RELEASE_PLAN_KEY = 'myjob.releaseFlow.lastViewedPlanId';

export default function ReleaseFlowView() {
  const pathFor = useConsolePath();
  const [sp, setSp] = useSearchParams();
  const runIdParam = sp.get('run_id') ?? '';
  const appsQ = useApplications();
  const plansQ = useReleasePlans();
  const alertChannelsQ = useAlertChannels();
  const [plan, setPlan] = useState<ReleasePlan | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tab, setTab] = useState<ReleaseTab>(runIdParam ? 'run' : 'overview');
  const [planPickerOpen, setPlanPickerOpen] = useState(!runIdParam);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [newPlan, setNewPlan] = useState<ReleasePlan | null>(null);
  const [newPlanStage, setNewPlanStage] = useState<NewPlanStage>('basics');
  const [newPlanSelectedIndex, setNewPlanSelectedIndex] = useState(0);
  const [runFilter, setRunFilter] = useState<ReleaseRunFilter>('all');
  const [selectedRunId, setSelectedRunId] = useState(runIdParam);
  const [auditEventType, setAuditEventType] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [graphMode] = useState<GraphMode>('plan');
  const [collapsedWaveIds] = useState<Set<number>>(() => new Set());
  const [graphSearch] = useState('');
  const [graphStatusFilter] = useState('all');
  const [graphClusterFilter] = useState('all');
  const [graphNamespaceFilter] = useState('all');
  const [, setInspectorTab] = useState('overview');
  const { data: planDiagnosticsData, mutate: diagnosePlan } = useDiagnostics();
  const { data: releasePreviewData, isPending: releasePreviewPending, mutate: previewRelease } = useReleasePreview();
  const {
    data: generatedManifestData,
    isPending: generatedManifestPending,
    mutate: generateManifest,
    reset: resetGeneratedManifest,
  } = useReleaseGeneratedManifest();
  const {
    data: generatedManifestSafePrData,
    isPending: generatedManifestSafePrPending,
    mutate: submitGeneratedManifestSafePr,
    reset: resetGeneratedManifestSafePr,
  } = useSubmitReleaseGeneratedManifestSafePr();
  const { data: releaseReadinessData, isPending: releaseReadinessPending, mutate: checkReadiness } = useReleaseReadiness();
  const runsQ = useReleaseRuns(plan?.plan_id, runFilter);
  const summaryQ = useReleaseRunSummary(plan?.plan_id);
  const auditQ = useReleaseAudit(plan?.plan_id, selectedRunId, auditEventType);
  const exportAudit = useReleaseAuditExport(plan?.plan_id, selectedRunId, auditEventType);
  const dispatchRelease = useDispatchReleasePlan();
  const startRelease = useStartReleasePlan();
  const advanceRun = useAdvanceReleaseRun();
  const pauseRun = usePauseReleaseRun();
  const resumeRun = useResumeReleaseRun();
  const retryRun = useRetryReleaseRun();
  const rollbackRun = useRollbackReleaseRun();
  const cancelRun = useCancelReleaseRun();
  const notifyRun = useNotifyReleaseRun();
  const save = useSaveReleasePlan(plan?.plan_id);
  const createPlan = useSaveReleasePlan();
  const archivePlan = useArchiveReleasePlan(plan?.plan_id ?? '');
  const deletePlan = useDeleteReleasePlan(plan?.plan_id ?? '');
  const deleteRun = useDeleteReleaseRun();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const previousRunIdParamRef = useRef(runIdParam);

  const selectRunId = useCallback((runId: string) => {
    setSelectedRunId(runId);
    const next = new URLSearchParams(sp);
    if (runId) next.set('run_id', runId);
    else next.delete('run_id');
    setSp(next, { replace: true, preventScrollReset: true });
  }, [setSp, sp]);

  const apps = useMemo(() => appsQ.data ?? [], [appsQ.data]);
  const appById = useMemo(() => new Map(apps.map(app => [app.application_id, app])), [apps]);
  const pickerPlans = useMemo(() => {
    const persisted = (plansQ.data ?? []).map(item => normalizePlan(item));
    if (persisted.length > 0) return persisted;
    return [plan ? normalizePlan(plan) : draftPlan(apps)];
  }, [apps, plan, plansQ.data]);
  const selected = selectedStep(plan, selectedIndex);
  const diagnosticPlan = useMemo(() => withDiagnosticDefaults(plan, apps), [apps, plan]);
  const settingsBaselines = useMemo(() => settingsBaselinesFor(apps), [apps]);

  useEffect(() => {
    if (previousRunIdParamRef.current === runIdParam) return;
    previousRunIdParamRef.current = runIdParam;
    setSelectedRunId(runIdParam);
    if (runIdParam) {
      setRunFilter('all');
      setTab('run');
      setPlanPickerOpen(false);
    }
  }, [runIdParam]);

  useEffect(() => {
    if (plan || plansQ.isPending || appsQ.isPending) return;
    const lastViewedPlanId = readLastViewedReleasePlanId();
    const existing = plansQ.data?.find(item => item.plan_id === lastViewedPlanId) ?? plansQ.data?.[0];
    setPlan(existing ? normalizePlan(existing) : draftPlan(apps));
  }, [apps, appsQ.isPending, plan, plansQ.data, plansQ.isPending]);

  useEffect(() => {
    if (!diagnosticPlan) return;
    const timer = window.setTimeout(() => {
      diagnosePlan({
        mode: 'release_plan',
        settings: diagnosticPlan,
        context: { previous_settings_by_application: settingsBaselines },
      });
      previewRelease(diagnosticPlan);
      checkReadiness(diagnosticPlan);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [checkReadiness, diagnosePlan, diagnosticPlan, previewRelease, settingsBaselines]);

  useEffect(() => {
    resetGeneratedManifestSafePr();
    resetGeneratedManifest();
    if (!diagnosticPlan || !selected) return;
    const timer = window.setTimeout(() => {
      generateManifest({ plan: diagnosticPlan, stepIndex: selectedIndex });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [diagnosticPlan, generateManifest, resetGeneratedManifest, resetGeneratedManifestSafePr, selected, selectedIndex]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'myjob-yaml', markersFor(monaco, generatedManifestData?.diagnostics ?? []));
  }, [generatedManifestData]);

  const preview = releasePreviewData?.preview;
  const planLiveSideEffects = releasePlanHasLiveSideEffects(plan);
  const raw = useMemo(
    () => graphMode === 'demo'
      ? buildMockFlow(selectedNodeId, collapsedWaveIds)
      : buildFlow(plan, apps, selectedNodeId, planDiagnosticsData?.diagnostics ?? [], preview),
    [apps, collapsedWaveIds, graphMode, plan, planDiagnosticsData, preview, selectedNodeId],
  );
  const filteredRaw = useMemo(
    () => filterFlow(raw, graphSearch, graphStatusFilter, graphClusterFilter, graphNamespaceFilter),
    [graphClusterFilter, graphNamespaceFilter, graphSearch, graphStatusFilter, raw],
  );
  const { nodes, edges } = useAutoLayout(filteredRaw.nodes, filteredRaw.edges, 'LR');
  const selectGraphNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setInspectorTab('overview');
    const match = /^step-(\d+)$/.exec(id);
    if (match) setSelectedIndex(Number(match[1]));
  }, []);

  const clearGraphSelection = useCallback(() => {
    setSelectedNodeId('');
  }, []);

  useEffect(() => {
    if (tab !== 'overview') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clearGraphSelection();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [clearGraphSelection, tab]);

  const selectPlanFromPicker = useCallback((nextPlan: ReleasePlan) => {
    const normalized = normalizePlan(nextPlan);
    setPlan(normalized);
    rememberLastViewedReleasePlan(normalized);
    setSelectedIndex(0);
    setSelectedNodeId('');
    setInspectorTab('overview');
    setTab('edit');
    setPlanPickerOpen(false);
  }, []);

  const setPlanValue = (patch: Partial<ReleasePlan>) => setPlan(current => current ? { ...current, ...patch } : current);
  const setPolicy = (patch: Record<string, unknown>) =>
    setPlan(current => current ? { ...current, settings: { ...DEFAULT_POLICY, ...current.settings, ...patch } } : current);
  const setStep = (index: number, patch: Partial<ReleasePlanStep>) =>
    setPlan(current => current ? {
      ...current,
      steps: normalizeSteps(current.steps.map((step, i) => i === index ? { ...step, ...patch } : step)),
    } : current);
  const openNewPlanBuilder = () => {
    setNewPlan(current => current ?? emptyDraftPlan(apps));
    setNewPlanStage('basics');
    setNewPlanSelectedIndex(0);
    setPlanPickerOpen(false);
    setCreatingPlan(true);
  };
  const setNewPlanValue = (patch: Partial<ReleasePlan>) => setNewPlan(current => current ? { ...current, ...patch } : current);
  const setNewPlanPolicy = (patch: Record<string, unknown>) =>
    setNewPlan(current => current ? { ...current, settings: { ...DEFAULT_POLICY, ...current.settings, ...patch } } : current);
  const setNewPlanStep = (index: number, patch: Partial<ReleasePlanStep>) =>
    setNewPlan(current => current ? {
      ...current,
      steps: normalizeSteps(current.steps.map((step, i) => i === index ? { ...step, ...patch } : step)),
    } : current);
  const saveCurrentPlan = () => {
    if (!plan) return;
    save.mutate(normalizePlan(plan), {
      onSuccess: d => {
        const saved = normalizePlan(d.plan);
        setPlan(saved);
        rememberLastViewedReleasePlan(saved);
      },
    });
  };
  const saveNewPlan = () => {
    if (!newPlan) return;
    createPlan.mutate(normalizePlan(newPlan), {
      onSuccess: d => {
        const saved = normalizePlan(d.plan);
        setPlan(saved);
        rememberLastViewedReleasePlan(saved);
        setNewPlan(null);
        setCreatingPlan(false);
        setSelectedIndex(0);
        setSelectedNodeId('sys-precheck');
        setTab('edit');
      },
    });
  };
  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  if (creatingPlan) {
    return (
      <motion.div variants={fadeInUp} initial="initial" animate="animate">
        <Breadcrumb items={[{ label: '릴리즈 플로우' }, { label: '새 플랜' }]} />
        <div className="release-flow__header release-flow__header--separate">
          <div>
            <h1>새 릴리즈 플랜</h1>
            <p className="release-flow__hint">현재 플랜과 섞지 않고 새 배포 순서와 정책을 따로 작성합니다.</p>
          </div>
          <div className="release-flow__toolbar release-flow__toolbar--header">
            <Button onClick={() => { setCreatingPlan(false); setPlanPickerOpen(true); setTab('overview'); }}>플랜 선택으로 돌아가기</Button>
          </div>
        </div>
        {appsQ.isPending ? (
          <Card title="새 플랜" loading>
            <p className="release-flow__hint">애플리케이션과 레포 정보를 불러오는 중입니다...</p>
          </Card>
        ) : appsQ.error ? (
          <EmptyState title="새 플랜에 사용할 정보를 불러오지 못했습니다" description={(appsQ.error as Error).message ?? '잠시 후 다시 시도해주세요.'} />
        ) : (
          <NewPlanWizard
            draft={newPlan ?? emptyDraftPlan(apps)}
            stage={newPlanStage}
            selectedIndex={newPlanSelectedIndex}
            apps={apps}
            appById={appById}
            saving={createPlan.isPending}
            onEnsureDraft={() => setNewPlan(current => current ?? emptyDraftPlan(apps))}
            onStage={setNewPlanStage}
            onSelectedIndex={setNewPlanSelectedIndex}
            onPlanValue={setNewPlanValue}
            onPolicy={setNewPlanPolicy}
            onStep={setNewPlanStep}
            onPlan={setNewPlan}
            onCancel={() => { setCreatingPlan(false); setPlanPickerOpen(true); setTab('overview'); }}
            onSave={saveNewPlan}
          />
        )}
      </motion.div>
    );
  }

  return (
    <motion.div variants={fadeInUp} initial="initial" animate="animate">
      {tab !== 'overview' && (
        <div className="release-flow__workspace-header">
          <div className="release-flow__workspace-title">
            <Button size="sm" variant="ghost" title="릴리즈 플랜 선택 화면으로 돌아갑니다" onClick={() => { setPlanPickerOpen(true); setTab('overview'); }}>플랜 선택</Button>
            <div>
              <span>Release Flow</span>
              <h1>{releaseWorkspaceTitle(tab)}</h1>
              <p className="release-flow__hint">{releaseWorkspaceDescription(tab)}</p>
            </div>
          </div>
          <div className="release-flow__toolbar release-flow__toolbar--header">
            <label className="release-flow__control">
              <span>플랜</span>
              <select
                className="input"
                value={plan?.plan_id ?? '__draft__'}
                onChange={e => {
                  const next = plansQ.data?.find(item => item.plan_id === e.target.value);
                  const selectedPlan = next ? normalizePlan(next) : draftPlan(apps);
                  setPlan(selectedPlan);
                  rememberLastViewedReleasePlan(selectedPlan);
                  setSelectedIndex(0);
                  setSelectedNodeId('sys-precheck');
                  setTab('edit');
                }}
              >
                <option value="__draft__">임시 플랜</option>
                {(plansQ.data ?? []).map(item => <option key={item.plan_id} value={item.plan_id}>{item.name}</option>)}
              </select>
            </label>
            <Button title="현재 선택한 플랜과 별개로 새 릴리즈 플랜을 만듭니다" onClick={openNewPlanBuilder}><IconPlus size={14} />새 플랜</Button>
            {tab === 'edit' && (
              <Button title="선택한 릴리즈 플랜을 저장합니다" variant="primary" loading={save.isPending} disabled={!plan} onClick={saveCurrentPlan}><IconSave size={14} />플랜 저장</Button>
            )}
            <details className="release-flow__more-menu">
              <summary>관리</summary>
              <div>
                <Button
                  size="sm"
                  variant="ghost"
                  title="기록은 남기고 플랜만 보관 처리합니다"
                  disabled={!plan?.plan_id || archivePlan.isPending}
                  onClick={() => plan?.plan_id && archivePlan.mutate('Archived manually')}
                >
                  플랜 보관
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  title="이 플랜을 삭제합니다"
                  disabled={!plan?.plan_id || deletePlan.isPending}
                  onClick={() => {
                    if (!plan?.plan_id) return;
                    if (!window.confirm(`"${plan.name}" 플랜을 삭제할까요?`)) return;
                    deletePlan.mutate(false, {
                      onSuccess: () => {
                        const nextPlan = draftPlan(apps);
                        setPlan(nextPlan);
                        rememberLastViewedReleasePlan(nextPlan);
                        setSelectedIndex(0);
                        setSelectedNodeId('sys-precheck');
                        setPlanPickerOpen(true);
                        setTab('overview');
                      },
                    });
                  }}
                >
                  플랜 삭제
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  title="이 플랜과 연결된 릴리즈 실행 기록을 모두 삭제합니다"
                  disabled={!plan?.plan_id || deletePlan.isPending}
                  onClick={() => {
                    if (!plan?.plan_id) return;
                    if (!window.confirm(`"${plan.name}" 플랜을 강제 삭제할까요? 연결된 릴리즈 실행 기록도 함께 삭제됩니다.`)) return;
                    deletePlan.mutate(true, {
                      onSuccess: () => {
                        const nextPlan = draftPlan(apps);
                        setPlan(nextPlan);
                        rememberLastViewedReleasePlan(nextPlan);
                        setSelectedIndex(0);
                        setSelectedNodeId('sys-precheck');
                        setPlanPickerOpen(true);
                        setTab('overview');
                      },
                    });
                  }}
                >
                  강제 삭제
                </Button>
              </div>
            </details>
          </div>
          <nav className="release-flow__workspace-nav" aria-label="Release Flow 작업 이동">
            {(['edit', 'run', 'yaml'] as const).map(item => (
              <button key={item} type="button" aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>
                <strong>{releaseWorkspaceTitle(item)}</strong>
                <span>{releaseWorkspaceShortDescription(item)}</span>
              </button>
            ))}
          </nav>
        </div>
      )}

      {appsQ.isPending ? (
        <Card title="릴리즈 플랜" loading>
          <p className="release-flow__hint">애플리케이션과 플랜을 불러오는 중입니다...</p>
        </Card>
      ) : appsQ.error ? (
        <EmptyState title="릴리즈 플랜 정보를 불러오지 못했습니다" description={(appsQ.error as Error).message ?? '잠시 후 다시 시도해주세요.'} />
      ) : plan ? (
        tab === 'overview' || planPickerOpen ? (
          <ReleasePlanPickerScreen
            plans={pickerPlans}
            currentPlanId={plan.plan_id ?? '__draft__'}
            onSelect={selectPlanFromPicker}
            onCreate={openNewPlanBuilder}
          />
        ) : (
          <>
          {tab === 'edit' && (
            <div className="release-flow__builder-shell">
              <div className="release-flow__builder-hero">
                <div>
                  <span className="release-flow__builder-kicker">현재 플랜 수정</span>
                  <h2>{plan.name}</h2>
                  <div className="release-flow__builder-meta">
                    <span>{statusLabel(plan.status)}</span>
                    <span>{plan.steps.length}개 단계</span>
                    <span>{selected ? `선택: ${selected.name || selected.application_id}` : '단계 선택 대기'}</span>
                  </div>
                </div>
                <div className="release-flow__builder-actions">
                  <Button title="릴리즈 플랜 선택 화면으로 이동합니다" onClick={() => { setPlanPickerOpen(true); setTab('overview'); }}>플랜 선택</Button>
                  <Button title="선택한 릴리즈 플랜을 저장합니다" variant="primary" loading={save.isPending} disabled={!plan} onClick={saveCurrentPlan}><IconSave size={14} />플랜 저장</Button>
                </div>
              </div>

              <div className="release-flow__builder-steps">
                <span className="release-flow__builder-step release-flow__builder-step--active">1 현재 플랜</span>
                <span className="release-flow__builder-step release-flow__builder-step--active">2 전체 정책</span>
                <span className="release-flow__builder-step release-flow__builder-step--active">3 앱별 설정</span>
                <span className="release-flow__builder-step">4 저장 후 실행</span>
              </div>

              <div className="release-flow release-flow--builder">
                <Card title="플랜 기본 정보">
                  <Field label="이름"><input className="input" value={plan.name} onChange={e => setPlanValue({ name: e.target.value })} /></Field>
                  <Field label="설명"><textarea className="input" rows={3} value={plan.description} onChange={e => setPlanValue({ description: e.target.value })} /></Field>
                  <Field label="상태">
                    <select className="input" value={plan.status} onChange={e => setPlanValue({ status: e.target.value as ReleasePlan['status'] })}>
                      <option value="draft">초안</option>
                      <option value="active">활성</option>
                      <option value="paused">일시정지</option>
                      <option value="archived">보관됨</option>
                    </select>
                  </Field>
                  <div className="release-flow__toolbar">
                    <Button size="sm" title="이 플랜에 애플리케이션 단계를 추가합니다" onClick={() => addStep(plan, apps, setPlan)} disabled={apps.length === 0}><IconPlus size={13} />단계 추가</Button>
                  </div>
                  <div className="release-flow__step-list">
                    {plan.steps.map((step, i) => (
                      <div key={`${step.application_id}-${i}`} className={`release-flow__step-row ${i === selectedIndex ? 'release-flow__step-row--selected' : ''}`}>
                        <button
                          className="btn btn--ghost btn--sm"
                          title={`${step.name || appById.get(step.application_id)?.name || step.application_id} 수정`}
                          aria-pressed={i === selectedIndex}
                          onClick={() => { setSelectedIndex(i); setSelectedNodeId(`step-${i}`); }}
                        >
                          {i + 1}. {step.name || appById.get(step.application_id)?.name || step.application_id}
                        </button>
                        <div className="release-flow__step-actions">
                          <Button size="sm" variant="ghost" title="단계를 앞으로 이동" disabled={i === 0} onClick={() => moveStep(plan, i, -1, setPlan, setSelectedIndex)} aria-label="단계를 앞으로 이동"><IconArrowUp size={13} /></Button>
                          <Button size="sm" variant="ghost" title="단계를 뒤로 이동" disabled={i === plan.steps.length - 1} onClick={() => moveStep(plan, i, 1, setPlan, setSelectedIndex)} aria-label="단계를 뒤로 이동"><IconArrowDown size={13} /></Button>
                          <Button size="sm" variant="ghost" title="단계 삭제" onClick={() => removeStep(plan, i, setPlan, setSelectedIndex)} aria-label="단계 삭제"><IconTrash size={13} /></Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                <div className="release-flow__stack">
                  <PlanGlobalSettingsCard plan={plan} setPolicy={setPolicy} />
                  <OverviewDisclosure title="고급 전역 설정" hint="릴리즈 시간, 온콜, 예외 사유">
                    <PolicyEditor plan={plan} setPolicy={setPolicy} />
                  </OverviewDisclosure>
                  <Card title="릴리즈 순서" className="p-0">
                    <div className="release-flow__canvas">
                      <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} interactive scrollBehavior="zoom" onNodeClick={selectGraphNode} onPaneClick={clearGraphSelection} />
                    </div>
                  </Card>
                </div>

                <div className="release-flow__stack">
                  <StepEditor
                    title="앱별 설정"
                    plan={plan}
                    selected={selected}
                    selectedIndex={selectedIndex}
                    apps={apps}
                    appById={appById}
                    setStep={setStep}
                    setPlan={setPlan}
                  />
                  <DiagnosticsPanel diagnostics={planDiagnosticsData?.diagnostics ?? []} />
                </div>
              </div>
            </div>
          )}

          {tab === 'run' && (
            <div className="release-flow__policy">
              <ReleasePlanSettingsSummary plan={plan} onEdit={() => setTab('edit')} />
              <PreviewPanel
                preview={preview}
                loading={releasePreviewPending}
                dispatching={dispatchRelease.isPending || startRelease.isPending}
                liveSideEffects={planLiveSideEffects}
                onDispatch={wave => dispatchRelease.mutate({ plan: normalizePlan(plan), wave })}
                onStart={() => startRelease.mutate(normalizePlan(plan))}
              />
              <ReadinessPanel readiness={releaseReadinessData} loading={releaseReadinessPending} />
              <AlertChannelsPanel
                channels={alertChannelsQ.data ?? []}
                loading={alertChannelsQ.isPending}
                error={alertChannelsQ.isError ? alertChannelsQ.error : null}
                settingsHref={pathFor('/settings/alerts')}
              />
              <RunPanel
                plan={plan}
                runs={runsQ.data ?? []}
                summary={summaryQ.data}
                runFilter={runFilter}
                onRunFilterChange={setRunFilter}
                selectedRunId={selectedRunId}
                onSelectedRunIdChange={selectRunId}
                loading={runsQ.isPending}
                busy={advanceRun.isPending || pauseRun.isPending || resumeRun.isPending || retryRun.isPending || rollbackRun.isPending || cancelRun.isPending || notifyRun.isPending || deleteRun.isPending}
                onAdvance={runId => advanceRun.mutate({ runId })}
                onPause={(runId, reason) => pauseRun.mutate({ runId, reason })}
                onResume={(runId, reason) => resumeRun.mutate({ runId, reason })}
                onRetry={(runId, reason) => retryRun.mutate({ runId, reason })}
                onRollback={(runId, reason) => rollbackRun.mutate({ runId, reason })}
                onCancel={(runId, reason) => cancelRun.mutate({ runId, reason })}
                onNotify={(runId, reason) => notifyRun.mutate({ runId, reason })}
                onDelete={(runId, force) => deleteRun.mutate({ runId, force })}
              />
              <AuditPanel
                events={auditQ.data ?? []}
                loading={auditQ.isPending}
                exporting={exportAudit.isPending}
                scopedRunId={selectedRunId}
                eventType={auditEventType}
                onEventTypeChange={setAuditEventType}
                onExport={() => exportAudit.mutate()}
              />
              <DiagnosticsPanel diagnostics={planDiagnosticsData?.diagnostics ?? []} />
            </div>
          )}

          {tab === 'yaml' && (
            <div className="release-flow__yaml">
              <GeneratedManifestSummary
                generated={generatedManifestData}
                safePr={generatedManifestSafePrData}
                loading={generatedManifestPending}
                creatingSafePr={generatedManifestSafePrPending}
                onCreateSafePr={() => diagnosticPlan && submitGeneratedManifestSafePr({ plan: diagnosticPlan, stepIndex: selectedIndex })}
              />
              <Card title="YAML 편집기" className="p-0">
                <div className="release-flow__editor">
                  <Editor
                    height="460px"
                    language="yaml"
                    theme="vs-dark"
                    value={generatedManifestData?.manifest ?? '# 릴리즈 단계를 선택하면 생성된 매니페스트가 여기에 표시됩니다.\n'}
                    onMount={onMount}
                    options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbersMinChars: 3, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2 }}
                  />
                </div>
              </Card>
              <DiagnosticsPanel diagnostics={generatedManifestData?.diagnostics ?? []} />
            </div>
          )}
          </>
        )
      ) : <EmptyState title="릴리즈 플랜 준비 중" />}
    </motion.div>
  );
}

function GeneratedManifestSummary({
  generated,
  safePr,
  loading,
  creatingSafePr,
  onCreateSafePr,
}: {
  generated?: ReleaseGeneratedManifest;
  safePr?: ReleaseManifestSafePr;
  loading: boolean;
  creatingSafePr: boolean;
  onCreateSafePr: () => void;
}) {
  if (loading && !generated) {
    return <Card title="생성된 매니페스트" loading><p className="release-flow__hint">릴리즈 옵션으로 매니페스트를 생성하는 중입니다...</p></Card>;
  }
  if (!generated) {
    return <Card title="생성된 매니페스트"><p className="release-flow__hint">매니페스트를 생성할 릴리즈 단계를 선택하세요.</p></Card>;
  }
  const file = generated.files[0];
  const blocking = generated.diagnostics.filter(diag => diag.severity === 'error').length;
  const canCreateSafePr = blocking === 0 && generated.files.length > 0;
  return (
    <Card
      title="생성된 매니페스트"
      actions={
        <>
          <Badge tone={blocking > 0 ? 'danger' : generated.diagnostics.length > 0 ? 'warning' : 'success'}>{blocking > 0 ? '막힘' : '준비됨'}</Badge>
          <Button size="sm" variant="primary" loading={creatingSafePr} disabled={!canCreateSafePr} onClick={onCreateSafePr}>Safe PR</Button>
        </>
      }
    >
      <p className="release-flow__hint">{generated.summary}</p>
      {file && <p className="release-flow__hint">파일: <code>{file.path}</code></p>}
      {safePr?.workflow_run_id && (
        <div className="release-flow__field-section">
          <span className="release-flow__field-section-title">Safe PR 증거</span>
          <div className="release-flow__field-grid">
            <FieldValue label="레포" value={safePr.repo_ref || '-'} />
            <FieldValue label="기준 브랜치" value={safePr.base_branch || '-'} />
            <FieldValue label="실행" value={safePr.workflow_run_id} mono />
            <FieldValue label="패치" value={safePr.patch_sha256 ? safePr.patch_sha256.slice(0, 12) : '-'} mono />
          </div>
        </div>
      )}
      {generated.resources.length > 0 && (
        <div className="release-flow__preview-list">
          {generated.resources.map(resource => (
            <div key={`${resource.kind}-${resource.namespace}-${resource.name}`} className="release-flow__preview-row">
              <FieldValue label="종류" value={resource.kind} />
              <FieldValue label="네임스페이스" value={resource.namespace || '-'} />
              <FieldValue label="이름" value={resource.name} />
            </div>
          ))}
        </div>
      )}
      {generated.warnings.map(warning => (
        <div key={warning} className="release-flow__diag release-flow__diag--warning">{warning}</div>
      ))}
    </Card>
  );
}

function FieldValue({
  label,
  value,
  mono = false,
  emphasis = false,
  wrap = false,
  wide = false,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  emphasis?: boolean;
  wrap?: boolean;
  wide?: boolean;
}) {
  const textValue = String(value);
  return (
    <div
      className={`release-flow__field-value ${emphasis ? 'release-flow__field-value--emphasis' : ''} ${wrap ? 'release-flow__field-value--wrap' : ''} ${wide ? 'release-flow__field-value--wide' : ''}`}
      title={textValue}
    >
      <span className="release-flow__field-label">{label}</span>
      {mono ? <code className="release-flow__field-content">{textValue}</code> : <strong className="release-flow__field-content">{textValue}</strong>}
    </div>
  );
}

function FieldSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="release-flow__field-section release-flow__field-section--framed">
      <div className="release-flow__field-section-head">
        <span className="release-flow__field-section-title">{title}</span>
      </div>
      {children}
    </section>
  );
}

function releaseWorkspaceTitle(tab: ReleaseTab): string {
  const labels: Record<ReleaseTab, string> = {
    overview: '현재 상황',
    edit: '플랜 편집',
    run: '실행 관리',
    yaml: 'YAML/PR 검토',
  };
  return labels[tab];
  return {
    overview: '현재 상황',
    edit: '현재 플랜 수정',
    run: '미리보기와 실행',
    yaml: 'YAML과 PR',
  }[tab];
}

function releaseWorkspaceDescription(tab: ReleaseTab): string {
  const descriptions: Record<ReleaseTab, string> = {
    overview: 'Release DAG에서 wave, 의존성, 실행 상태를 확인합니다.',
    edit: '플랜 이름, 정책, 단계, 브랜치, 매니페스트 경로를 수정합니다.',
    run: '릴리즈 실행 기록, 승인 상태, 재시도와 롤백 작업을 관리합니다.',
    yaml: '생성된 매니페스트와 Safe PR 요청 결과를 검토합니다.',
  };
  return descriptions[tab];
  return {
    overview: '자동 정렬 Release DAG에서 wave, 의존성, 실행 상태를 확인합니다.',
    edit: '플랜 이름, 정책, 앱별 브랜치와 매니페스트 경로를 수정합니다.',
    run: '릴리즈 실행 전 검증 결과를 보고 실행, 승인, 재시도 흐름을 관리합니다.',
    yaml: '생성된 매니페스트와 Safe PR 제출 결과를 확인합니다.',
  }[tab];
}

function releaseWorkspaceShortDescription(tab: ReleaseTab): string {
  const descriptions: Record<ReleaseTab, string> = {
    overview: 'DAG',
    edit: '정책과 단계 편집',
    run: '실행 기록과 승인',
    yaml: '생성물과 PR',
  };
  return descriptions[tab];
  return {
    overview: 'DAG',
    edit: '정책과 단계 편집',
    run: '검증 및 실행',
    yaml: '생성물과 PR',
  }[tab];
}

function ReleaseDagContext({ plan, selected, graphMode }: { plan: ReleasePlan; selected: ReleaseNodeData | null; graphMode: GraphMode }) {
  const runtimeMode = getString(plan.settings.runtime_mode, 'demo');
  const target = selected
    ? `${selected.cluster} / ${selected.namespace || selected.environment}`
    : Array.from(new Set(plan.steps.map(step => getString(step.config.namespace)).filter(Boolean))).join(', ') || firstEnvironment(plan);
  return (
    <div className="release-flow__dag-context">
      <span><strong>대상</strong>{target || '대상 미지정'}</span>
      <span><strong>실행 모드</strong>{runtimeMode === 'live' ? '라이브' : '데모'}</span>
      <span><strong>보기</strong>{graphMode === 'demo' ? '데모 DAG' : '현재 플랜'}</span>
      <span><strong>데이터</strong>{runtimeMode === 'live' ? '연결된 실행 기준' : '시뮬레이션 기준'}</span>
    </div>
  );
}

function ReleaseStudioHeader({
  plan,
  plans,
  selectedPlanId,
  preview,
  summary,
  diagnostics,
  selected,
  onPlanSelect,
  onEdit,
  onRun,
  onYaml,
  onCreate,
}: {
  plan: ReleasePlan;
  plans: ReleasePlan[];
  selectedPlanId: string;
  preview?: ReleasePlanPreview;
  summary?: ReleaseRunSummary;
  diagnostics: Diagnostic[];
  selected: ReleaseNodeData | null;
  onPlanSelect: (value: string) => void;
  onEdit: () => void;
  onRun: () => void;
  onYaml: () => void;
  onCreate: () => void;
}) {
  const errors = diagnostics.filter(item => item.severity === 'error').length;
  const warnings = diagnostics.filter(item => item.severity === 'warning').length;
  const completed = preview?.steps.filter(step => step.wave !== null && step.wave <= 1).length ?? 0;
  const target = selected ? `${selected.cluster} / ${selected.namespace || selected.environment}` : firstEnvironment(plan);
  return (
    <section className="release-flow__studio-header">
      <div className="release-flow__studio-title">
        <div className="release-flow__studio-crumb">
          <span>Release Flow</span>
          <span>Pipelines</span>
        </div>
        <div className="release-flow__studio-plan-select">
          <select className="input" value={selectedPlanId} onChange={event => onPlanSelect(event.target.value)}>
            <option value="__draft__">임시 플랜</option>
            {plans.map(item => <option key={item.plan_id ?? item.name} value={item.plan_id ?? '__draft__'}>{item.name}</option>)}
          </select>
        </div>
      </div>
      <div className="release-flow__studio-metrics">
        <span>{completed}/{plan.steps.length || 0} 완료</span>
        <span>{target || '-'}</span>
        <span className={errors > 0 ? 'release-flow__metric--danger' : warnings > 0 ? 'release-flow__metric--warn' : ''}>
          {errors + warnings > 0 ? `${errors + warnings}개 진단` : '진단 정상'}
        </span>
        {summary?.active_runs ? <span>실행 중</span> : null}
      </div>
      <div className="release-flow__studio-actions">
        <Button size="sm" title="생성된 매니페스트와 Safe PR 요청 상태를 검토합니다" onClick={onYaml}>YAML/PR 검토</Button>
        <Button size="sm" variant="primary" title="릴리즈 실행 기록과 승인 상태를 확인합니다" onClick={onRun}>실행 관리</Button>
        <Button size="sm" onClick={onCreate}><IconPlus size={13} />새 플랜</Button>
        <Button size="sm" onClick={onEdit}>현재 플랜 수정</Button>
        <Button size="sm" onClick={onYaml}>YAML과 PR</Button>
        <Button size="sm" variant="primary" onClick={onRun}>미리보기와 실행</Button>
      </div>
      <ReleasePlanTiles
        currentPlan={plan}
        plans={plans}
        selectedPlanId={selectedPlanId}
        onPlanSelect={onPlanSelect}
        onCreate={onCreate}
      />
    </section>
  );
}

function ReleasePlanTiles({
  currentPlan,
  plans,
  selectedPlanId,
  onPlanSelect,
  onCreate,
}: {
  currentPlan: ReleasePlan;
  plans: ReleasePlan[];
  selectedPlanId: string;
  onPlanSelect: (value: string) => void;
  onCreate: () => void;
}) {
  const showDraft = selectedPlanId === '__draft__' || plans.length === 0;
  const draftName = currentPlan.plan_id ? 'Draft plan' : currentPlan.name || 'Draft plan';
  const selectedPlanInList = plans.some(item => (item.plan_id ?? '__draft__') === selectedPlanId);
  const visiblePlans = currentPlan.plan_id && !selectedPlanInList ? [currentPlan, ...plans] : plans;
  return (
    <div className="release-flow__plan-tiles" aria-label="Release plans">
      {showDraft && (
        <button
          type="button"
          className={`release-flow__plan-tile ${selectedPlanId === '__draft__' ? 'release-flow__plan-tile--selected' : ''}`}
          aria-pressed={selectedPlanId === '__draft__'}
          onClick={() => onPlanSelect('__draft__')}
        >
          <span>{draftName}</span>
        </button>
      )}
      {visiblePlans.map(item => {
        const id = item.plan_id ?? '__draft__';
        const selected = selectedPlanId === id;
        return (
          <button
            key={item.plan_id ?? item.name}
            type="button"
            className={`release-flow__plan-tile ${selected ? 'release-flow__plan-tile--selected' : ''}`}
            aria-pressed={selected}
            onClick={() => onPlanSelect(id)}
          >
            <span>{item.name || 'Untitled release plan'}</span>
          </button>
        );
      })}
      <button type="button" className="release-flow__plan-tile release-flow__plan-tile--add" aria-label="Create release plan" onClick={onCreate}>
        <IconPlus size={30} />
      </button>
    </div>
  );
}

function ReleasePlanPickerScreen({
  plans,
  currentPlanId,
  onSelect,
  onCreate,
}: {
  plans: ReleasePlan[];
  currentPlanId?: string;
  onSelect: (plan: ReleasePlan) => void;
  onCreate: () => void;
}) {
  return (
    <section className="release-flow__plan-picker-screen" aria-labelledby="release-plan-picker-title">
      <div className="release-flow__plan-picker-head">
        <div>
          <span className="release-flow__plan-picker-kicker">Release Flow</span>
          <h2 id="release-plan-picker-title">릴리즈 플랜 선택</h2>
        </div>
        <p>여러 플랜 중 지금 확인하거나 실행할 워크플로우를 고르세요.</p>
      </div>
      <div className="release-flow__plan-card-grid">
        {plans.map((item, index) => (
          <ReleasePlanPickerCard
            key={item.plan_id ?? `${item.name}-${index}`}
            plan={item}
            index={index}
            selected={(item.plan_id ?? '__draft__') === currentPlanId}
            onSelect={onSelect}
          />
        ))}
        <button type="button" className="release-flow__plan-card release-flow__plan-card--create" onClick={onCreate}>
          <span className="release-flow__plan-create-icon" aria-hidden="true"><IconPlus size={34} /></span>
          <strong>새 플랜 만들기</strong>
          <small>앱과 단계를 고르는 빌더로 이동</small>
        </button>
      </div>
    </section>
  );
}

function ReleasePlanPickerCard({
  plan,
  index,
  selected,
  onSelect,
}: {
  plan: ReleasePlan;
  index: number;
  selected: boolean;
  onSelect: (plan: ReleasePlan) => void;
}) {
  const steps = plan.steps ?? [];
  const previewSteps = steps.length ? steps.slice(0, 4) : demoReleasePlanSteps().slice(0, 3);
  const environments = Array.from(new Set(steps.map(step => getString(step.config.environment)).filter(Boolean)));
  const namespaces = Array.from(new Set(steps.map(step => getString(step.config.namespace)).filter(Boolean)));
  const strategy = valueLabel(getString(plan.settings.default_strategy, 'rolling'));
  const approval = valueLabel(getString(plan.settings.approval_policy, 'manual_each_step'));
  const runtime = valueLabel(getString(plan.settings.runtime_mode, 'demo'));
  const target = environments[0] || namespaces[0] || firstEnvironment(plan);
  const updated = plan.updated_at ? plan.updated_at.slice(0, 10) : '저장 전';

  return (
    <button
      type="button"
      className={`release-flow__plan-card ${selected ? 'release-flow__plan-card--selected' : ''}`}
      aria-pressed={selected}
      onClick={() => onSelect(plan)}
    >
      <div className="release-flow__plan-card-preview" aria-hidden="true">
        <span className="release-flow__plan-card-rank">{index + 1}</span>
        <div className="release-flow__plan-mini-flow">
          {previewSteps.map((step, stepIndex) => (
            <span key={step.step_id || `${step.name}-${stepIndex}`} className="release-flow__plan-mini-node">
              <i>{stepIndex + 1}</i>
              <b>{step.name || step.application_id || `Step ${stepIndex + 1}`}</b>
            </span>
          ))}
        </div>
      </div>
      <div className="release-flow__plan-card-body">
        <div className="release-flow__plan-card-title-row">
          <h3>{plan.name || '이름 없는 릴리즈 플랜'}</h3>
          <Badge tone={toneForStatus(plan.status)}>{statusLabel(plan.status)}</Badge>
        </div>
        <p>{plan.description || `${steps.length || previewSteps.length}개 단계로 구성된 릴리즈 워크플로우입니다.`}</p>
        <div className="release-flow__plan-card-meta">
          <span>{steps.length || previewSteps.length} 단계</span>
          <span>{target || '대상 미정'}</span>
          <span>{runtime}</span>
        </div>
        <div className="release-flow__plan-card-footer">
          <span>{strategy}</span>
          <span>{approval}</span>
          <span>{updated}</span>
        </div>
      </div>
    </button>
  );
}

function OverviewDisclosure({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <details className="release-flow__overview-disclosure">
      <summary>
        <span>{title}</span>
        <small>{hint}</small>
      </summary>
      <div className="release-flow__overview-disclosure-body">{children}</div>
    </details>
  );
}

function StatusValue({ label, value, kind }: { label: string; value: string; kind: 'deploy' | 'health' }) {
  const className = kind === 'deploy' ? statusClass(value) : healthClass(value);
  const displayValue = kind === 'deploy' ? statusLabel(value) : healthLabel(value);
  return (
    <div className="release-flow__field-value release-flow__field-value--status">
      <span className="release-flow__field-label">{label}</span>
      <strong className={`release-node__status release-node__status--${className}`}>{displayValue}</strong>
    </div>
  );
}

function demoReleaseRunId(plan: ReleasePlan): string {
  return `demo-run-${plan.plan_id || safeId(plan.name) || 'draft'}`;
}

function safeId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
}

function readLastViewedReleasePlanId(): string {
  try {
    return typeof window === 'undefined' ? '' : window.localStorage.getItem(LAST_VIEWED_RELEASE_PLAN_KEY) ?? '';
  } catch {
    return '';
  }
}

function rememberLastViewedReleasePlan(plan: ReleasePlan): void {
  try {
    if (typeof window === 'undefined') return;
    if (plan.plan_id) window.localStorage.setItem(LAST_VIEWED_RELEASE_PLAN_KEY, plan.plan_id);
    else window.localStorage.removeItem(LAST_VIEWED_RELEASE_PLAN_KEY);
  } catch {
    // Best-effort UI memory; storage failures should not block release work.
  }
}

function demoReleaseRun(plan: ReleasePlan): ReleaseRun {
  const steps = (plan.steps.length ? plan.steps : demoReleasePlanSteps()).slice(0, 4);
  const runSteps = steps.map((step, index) => {
    const status = index === 0 ? 'succeeded' : index === 1 ? 'running' : index === 2 ? 'waiting_for_approval' : 'queued';
    const healthStatus = status === 'succeeded' ? 'healthy' : status === 'running' ? 'progressing' : 'pending';
    const wave = index + 1;
    return {
      run_step_id: `demo-step-${index + 1}`,
      application_id: step.application_id || `demo-app-${index + 1}`,
      name: step.name || `Demo step ${index + 1}`,
      wave,
      status,
      workflow_run_id: index < 2 ? `wf-demo-${index + 1}a7c9e4` : undefined,
      event_id: `evt-demo-${index + 1}`,
      correlation_id: `corr-demo-${index + 1}`,
      approval_id: status === 'waiting_for_approval' ? 'approval-demo-manual-gate' : null,
      health: { status: healthStatus, message: status === 'running' ? 'Rollout is still progressing.' : healthStatus },
      rollback: { available: index > 0, policy: getString(plan.settings.rollback_policy, 'safe_pr') },
      details: {
        environment: getString(step.config.environment, firstEnvironment(plan) || 'staging'),
        namespace: getString(step.config.namespace, 'demo-prod'),
        strategy: getString(step.config.strategy, getString(plan.settings.default_strategy, 'rolling')),
        gate: getString(step.config.approval_gate, index === 2 ? 'manual' : 'auto'),
        side_effects: false,
        image: getString(step.config.image, `ghcr.io/myjob/${step.application_id || `demo-app-${index + 1}`}:sample`),
        commit_sha: getString(step.config.commit_sha, `demo${index + 1}c0ffee`),
      },
      workflow: { status, source: 'demo' },
    };
  });
  const totalWaves = Math.max(1, ...runSteps.map(step => step.wave));
  return {
    run_id: demoReleaseRunId(plan),
    plan_id: plan.plan_id || 'demo-plan',
    plan_name: plan.name || '샘플 릴리즈 플랜',
    status: 'running',
    derived_status: 'waiting_for_approval',
    current_wave: Math.min(2, totalWaves),
    total_waves: totalWaves,
    started_by: 'demo.operator',
    settings: { ...DEFAULT_POLICY, ...plan.settings, runtime_mode: 'demo', provider_mode: 'dry_run' },
    github: { release_url: '', source: 'demo' },
    rollback: { policy: getString(plan.settings.rollback_policy, 'safe_pr'), available: true },
    health: { status: 'progressing', message: 'Demo run is waiting for the current wave to finish.' },
    attention: {
      required: true,
      reasons: ['샘플 실행입니다. 실제 레포 첫 커밋이 감지되면 이 영역에 실제 실행 기록이 표시됩니다.'],
      stale: false,
    },
    steps: runSteps,
    events: [
      {
        audit_id: 'demo-audit-1',
        event_type: 'release.run.started',
        message: '샘플 릴리즈 실행이 시작되었습니다.',
        actor: 'demo.operator',
        details: { source: 'demo' },
        created_at: 'demo',
      },
      {
        audit_id: 'demo-audit-2',
        event_type: 'wave.dispatched',
        message: 'Wave 1이 성공했고 Wave 2가 진행 중입니다.',
        actor: 'release-flow',
        details: { wave: 2 },
        created_at: 'demo',
      },
      {
        audit_id: 'demo-audit-3',
        event_type: 'approval.requested',
        message: '다음 단계 진행 전 수동 승인이 필요합니다.',
        actor: 'release-flow',
        details: { approval_id: 'approval-demo-manual-gate' },
        created_at: 'demo',
      },
    ],
    created_at: 'demo',
    updated_at: 'demo',
  };
}

function demoReleasePlanSteps(): ReleasePlanStep[] {
  return [
    {
      step_id: 'demo-step-storefront',
      application_id: 'demo-storefront',
      name: 'Storefront Web',
      position: 0,
      depends_on: [],
      config: {
        environment: 'staging',
        namespace: 'demo-prod',
        strategy: 'rolling',
        approval_gate: 'auto',
        image: 'ghcr.io/myjob/storefront:1.4.2',
        commit_sha: 'demo1c0ffee',
      },
    },
    {
      step_id: 'demo-step-orders',
      application_id: 'demo-orders-api',
      name: 'Orders API',
      position: 1,
      depends_on: ['demo-storefront'],
      config: {
        environment: 'staging',
        namespace: 'demo-prod',
        strategy: 'canary',
        approval_gate: 'auto',
        image: 'ghcr.io/myjob/orders-api:2.1.0',
        commit_sha: 'demo2c0ffee',
      },
    },
    {
      step_id: 'demo-step-approval',
      application_id: 'demo-payment-api',
      name: 'Payment API',
      position: 2,
      depends_on: ['demo-orders-api'],
      config: {
        environment: 'production',
        namespace: 'demo-prod',
        strategy: 'rolling',
        approval_gate: 'manual',
        image: 'ghcr.io/myjob/payment-api:3.0.0',
        commit_sha: 'demo3c0ffee',
      },
    },
  ];
}

function LogRow({ time, source, message, tone = 'default' }: { time: string; source: string; message: string; tone?: 'default' | 'warning' }) {
  return (
    <div className={`release-flow__log-row release-flow__log-row--${tone}`}>
      <span className="release-flow__log-time">{time}</span>
      <span className="release-flow__log-source">{source}</span>
      <code>{message}</code>
    </div>
  );
}

function ReleaseGraphToolbar({
  search,
  mode,
  status,
  cluster,
  namespace,
  collapsedWaves,
  waveGroups,
  clusters,
  namespaces,
  followActiveStep,
  onMode,
  onSearch,
  onStatus,
  onCluster,
  onNamespace,
  onFollow,
  onToggleWave,
  onFit,
}: {
  search: string;
  mode: GraphMode;
  status: string;
  cluster: string;
  namespace: string;
  collapsedWaves: Set<number>;
  waveGroups: { wave: number; label: string }[];
  clusters: string[];
  namespaces: string[];
  followActiveStep: boolean;
  onMode: (value: GraphMode) => void;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onCluster: (value: string) => void;
  onNamespace: (value: string) => void;
  onFollow: (value: boolean) => void;
  onToggleWave: (wave: number) => void;
  onFit: () => void;
}) {
  return (
    <details className="release-flow__dag-options">
      <summary>
        <span>DAG 옵션</span>
        <small>보기, 필터, 접기</small>
      </summary>
      <div className="release-flow__graph-control-groups">
        <div className="release-flow__control-group release-flow__control-group--mode">
          <span>보기 시나리오</span>
          <div className="release-flow__segmented">
            <button type="button" aria-pressed={mode === 'plan'} onClick={() => onMode('plan')}>현재 플랜</button>
            <button type="button" aria-pressed={mode === 'demo'} onClick={() => onMode('demo')}>데모 DAG</button>
          </div>
        </div>
        <div className="release-flow__control-group release-flow__control-group--search">
          <span>찾기</span>
          <Field label="애플리케이션 또는 레포">
            <input className="input" value={search} placeholder="coupon, inventory..." onChange={e => onSearch(e.target.value)} />
          </Field>
        </div>
        <div className="release-flow__control-group">
          <span>필터</span>
          <div className="release-flow__graph-toolbar">
            <SelectField label="배포 상태" value={status} options={[['all', '모든 상태'], ['queued', '대기'], ['running', '진행 중'], ['succeeded', '성공'], ['blocked', '막힘'], ['failed', '실패']]} onChange={onStatus} />
            <SelectField label="클러스터" value={cluster} options={[['all', '모든 클러스터'], ...clusters.map(value => [value, value])]} onChange={onCluster} />
            <SelectField label="네임스페이스" value={namespace} options={[['all', '모든 네임스페이스'], ...namespaces.map(value => [value, value])]} onChange={onNamespace} />
          </div>
        </div>
        <div className="release-flow__control-group release-flow__control-group--view">
          <span>화면</span>
          <label className="release-flow__check release-flow__check--compact">
            <input type="checkbox" checked={followActiveStep} onChange={e => onFollow(e.target.checked)} />
            진행 중인 단계 따라가기
          </label>
          <div className="release-flow__wave-toggles">
            {waveGroups.map(group => (
              <button key={group.wave} type="button" aria-pressed={collapsedWaves.has(group.wave)} onClick={() => onToggleWave(group.wave)}>
                {collapsedWaves.has(group.wave) ? '펼치기' : '접기'} {group.label}
              </button>
            ))}
          </div>
          <Button size="sm" title="첫 릴리즈 단계를 선택합니다" onClick={onFit}>처음으로</Button>
        </div>
      </div>
    </details>
  );
}

function ReleaseFlowLegend() {
  return (
    <div className="release-flow__legend">
      {['queued', 'running', 'succeeded', 'failed', 'blocked', 'paused', 'skipped'].map(status => (
        <span key={status} className={`release-node__status release-node__status--${status}`}>{statusLabel(status)}</span>
      ))}
      {['healthy', 'progressing', 'degraded', 'unknown'].map(status => (
        <span key={status} className={`release-node__status release-node__status--${status}`}>상태 {healthLabel(status)}</span>
      ))}
    </div>
  );
}

function ReleaseNodeSidePanel({
  node,
  tab,
  onTab,
  onOpenRuns,
  onOpenYaml,
}: {
  node: ReleaseNodeData | null;
  tab: string;
  onTab: (value: string) => void;
  onOpenRuns: () => void;
  onOpenYaml: () => void;
}) {
  if (!node) {
    return (
      <section className="release-flow__side-panel release-flow__side-panel--empty" aria-label="Selected node details">
        <span className="release-flow__field-section-title">캔버스 요소를 선택하세요</span>
        <p className="release-flow__hint">노드를 누르면 대상, 상태, 로그, YAML 미리보기와 실행 이동 버튼이 이 사이드바에 표시됩니다.</p>
      </section>
    );
  }

  const isApplication = node.nodeType === 'application';
  return (
    <aside className="release-flow__side-panel" aria-label="Selected node details">
      <div className="release-flow__side-panel-head">
        <div>
          <span>{node.wave != null ? `Wave ${node.wave}` : '대기'}</span>
          <h3>{node.step.name || node.step.application_id}</h3>
        </div>
        <Badge tone={toUiTone(node.tone)}>{releaseNodeTypeLabel(node.nodeType)}</Badge>
      </div>
      <div className="release-flow__side-panel-status">
        <span className={`release-node__status release-node__status--${statusClass(node.executionStatus)}`}>배포 {statusLabel(node.executionStatus)}</span>
        <span className={`release-node__status release-node__status--${healthClass(node.healthStatus)}`}>상태 {healthLabel(node.healthStatus)}</span>
      </div>
      <div className="release-flow__inspector-tabs">
        {[
          ['overview', '개요'],
          ['kubernetes', 'Kubernetes'],
          ['logs', '로그'],
          ['yaml', 'YAML'],
          ['actions', '작업'],
        ].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={tab === value} onClick={() => onTab(value)}>{label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="release-flow__side-panel-body">
          <FieldSection title={isApplication ? '선택한 애플리케이션' : '선택한 릴리즈 단계'}>
            <div className="release-flow__field-grid">
              <FieldValue label="이름" value={node.step.name || node.step.application_id} emphasis />
              <FieldValue label="유형" value={releaseNodeTypeLabel(node.nodeType)} />
              <FieldValue label="클러스터" value={node.cluster || '-'} />
              <FieldValue label="네임스페이스" value={node.namespace || '-'} />
              <FieldValue label="버전" value={node.version || '-'} />
              <FieldValue label="커밋" value={node.commitSha || '-'} mono />
              <FieldValue label="게이트" value={valueLabel(node.gate)} wide />
            </div>
          </FieldSection>
          <FieldSection title="현재 상태">
            <div className="release-flow__field-grid">
              <StatusValue label="배포 상태" value={node.executionStatus} kind="deploy" />
              <StatusValue label="헬스 상태" value={node.healthStatus} kind="health" />
              <FieldValue label="Wave" value={node.wave != null ? `Wave ${node.wave}` : '대기'} />
              <FieldValue label="진행 시간" value={valueLabel(node.duration)} />
              <FieldValue label="주의 사항" value={node.failureReason || '없음'} wrap wide />
            </div>
          </FieldSection>
        </div>
      )}

      {tab === 'kubernetes' && (
        <FieldSection title="Kubernetes 리소스">
          <div className="release-flow__field-grid">
            <FieldValue label="Kind" value={isApplication ? 'Deployment' : releaseNodeTypeLabel(node.nodeType)} />
            <FieldValue label="Name" value={node.step.application_id || node.id} mono />
            <FieldValue label="Namespace" value={node.namespace || '-'} />
            <FieldValue label="Cluster" value={node.cluster || '-'} />
            <FieldValue label="Sync" value={node.executionStatus === 'succeeded' ? 'Synced' : 'Pending'} />
            <FieldValue label="Health" value={healthLabel(node.healthStatus)} />
            <FieldValue label="Events" value={`${node.evidenceCount}개`} />
            <FieldValue label="Warnings" value={`${node.warningCount}개`} />
          </div>
        </FieldSection>
      )}

      {tab === 'logs' && (
        <div className="release-flow__log-list">
          {node.failureReason && <LogRow time="00:02" source="warning" tone="warning" message={node.failureReason} />}
          <LogRow time="00:01" source="deploy" message={`${node.step.name || node.step.application_id} 단계가 ${valueLabel(node.gate)} 게이트에 진입했습니다. 현재 상태는 ${statusLabel(node.executionStatus)}입니다.`} />
          <LogRow time="00:00" source="health" message={`헬스 상태는 ${healthLabel(node.healthStatus)}입니다.`} />
        </div>
      )}

      {tab === 'yaml' && (
        <FieldSection title="YAML Preview">
          <pre className="release-flow__side-panel-yaml">{yamlPreviewForNode(node)}</pre>
        </FieldSection>
      )}

      {tab === 'actions' && (
        <div className="release-flow__side-panel-actions">
          <Button size="sm" variant="primary" onClick={onOpenRuns}>실행 보기</Button>
          <Button size="sm" onClick={onOpenYaml}>YAML과 PR 열기</Button>
          <Button size="sm" variant="ghost" onClick={onOpenRuns}>일시정지</Button>
          <Button size="sm" variant="ghost" onClick={onOpenRuns}>재개</Button>
          <Button size="sm" variant="danger" onClick={onOpenRuns}>롤백</Button>
        </div>
      )}
    </aside>
  );
}

function ReleaseNodeLegacyPanel({
  node,
  tab,
  onTab,
  onOpenRuns,
  onOpenYaml,
}: {
  node: ReleaseNodeData | null;
  tab: string;
  onTab: (value: string) => void;
  onOpenRuns: () => void;
  onOpenYaml: () => void;
}) {
  void onOpenYaml;
  if (!node) {
    return (
      <section className="release-flow__bottom-dock release-flow__bottom-dock--empty" aria-label="선택 노드 상태">
        <span className="release-flow__field-section-title">블록을 선택하면 상태와 설정이 여기에 표시됩니다</span>
        <p className="release-flow__hint">캔버스는 그대로 넓게 유지하고, Kubernetes 리소스, 로그, YAML은 하단 패널에서 확인합니다.</p>
      </section>
    );
  }
  const isApplication = node.nodeType === 'application';
  return (
    <section className="release-flow__bottom-dock" aria-label="선택 노드 상태">
      <div className="release-flow__bottom-dock-head">
        <div>
          <span>{node.wave != null ? `Wave ${node.wave}` : 'Wave 대기'}</span>
          <h3>{node.step.name || node.step.application_id}</h3>
        </div>
      </div>
      <div className="release-flow__bottom-dock-status">
        <span className={`release-node__status release-node__status--${statusClass(node.executionStatus)}`}>배포 {statusLabel(node.executionStatus)}</span>
        <span className={`release-node__status release-node__status--${healthClass(node.healthStatus)}`}>상태 {healthLabel(node.healthStatus)}</span>
      </div>
      <div className="release-flow__inspector-tabs">
        {[
          ['overview', 'Overview'],
          ['kubernetes', 'Kubernetes'],
          ['logs', 'Logs'],
          ['yaml', 'YAML'],
          ['actions', 'Actions'],
        ].map(([value, label]) => (
          <button key={value} type="button" aria-pressed={tab === value} onClick={() => onTab(value)}>{label}</button>
        ))}
      </div>
      {tab === 'overview' && (
        <>
          <FieldSection title={isApplication ? '선택한 애플리케이션' : '선택한 릴리즈 단계'}>
            <div className="release-flow__field-grid">
              <FieldValue label={isApplication ? '애플리케이션' : '노드'} value={node.step.name || node.step.application_id} emphasis />
              <FieldValue label="노드 유형" value={releaseNodeTypeLabel(node.nodeType)} />
              <FieldValue label="클러스터" value={node.cluster} />
              <FieldValue label="네임스페이스" value={node.namespace || '-'} />
              <FieldValue label="버전" value={node.version} />
              <FieldValue label="커밋" value={node.commitSha || '-'} mono />
              <FieldValue label="게이트" value={valueLabel(node.gate)} />
            </div>
          </FieldSection>
          <FieldSection title="런타임 상태">
            <div className="release-flow__field-grid">
              <StatusValue label="배포 상태" value={node.executionStatus} kind="deploy" />
              <StatusValue label="헬스 상태" value={node.healthStatus} kind="health" />
              <FieldValue label="Wave" value={node.wave != null ? `Wave ${node.wave}` : '대기'} />
              <FieldValue label="실패 요약" value={node.failureReason || '없음'} wrap wide />
            </div>
          </FieldSection>
        </>
      )}
      {tab === 'kubernetes' && (
        <FieldSection title="Kubernetes 리소스">
          <div className="release-flow__field-grid">
            <FieldValue label="Kind" value={isApplication ? 'Deployment' : releaseNodeTypeLabel(node.nodeType)} />
            <FieldValue label="Name" value={node.step.application_id || node.id} mono />
            <FieldValue label="Namespace" value={node.namespace || '-'} />
            <FieldValue label="Cluster" value={node.cluster} />
            <FieldValue label="Sync" value={node.executionStatus === 'succeeded' ? 'Synced' : 'Pending'} />
            <FieldValue label="Health" value={healthLabel(node.healthStatus)} />
            <FieldValue label="Events" value={`${node.evidenceCount}개`} />
            <FieldValue label="Warnings" value={`${node.warningCount}개`} />
          </div>
        </FieldSection>
      )}
      {tab === 'logs' && (
        <div className="release-flow__log-list">
          {node.failureReason && <LogRow time="00:02" source="경고" tone="warning" message={node.failureReason} />}
          <LogRow time="00:01" source="배포" message={`${node.step.name || node.step.application_id} 단계가 ${valueLabel(node.gate)} 게이트에 진입했습니다. 현재 배포 상태는 ${statusLabel(node.executionStatus)}입니다.`} />
          <LogRow time="00:00" source="헬스" message={`런타임 헬스 상태는 ${healthLabel(node.healthStatus)}입니다.`} />
        </div>
      )}
      {tab === 'yaml' && (
        <FieldSection title="YAML Preview">
          <pre className="release-flow__bottom-dock-yaml">{yamlPreviewForNode(node)}</pre>
        </FieldSection>
      )}
      {tab === 'actions' && (
        <div className="release-flow__action-grid">
          <Button size="sm" onClick={onOpenRuns}>재시도</Button>
          <Button size="sm" onClick={onOpenRuns}>일시정지</Button>
          <Button size="sm" onClick={onOpenRuns}>재개</Button>
          <Button size="sm" variant="ghost" onClick={() => window.confirm(`${node.step.name || node.step.application_id} 단계를 건너뛸까요?`) && onOpenRuns()}>건너뛰기</Button>
          <Button size="sm" variant="danger" onClick={() => window.confirm(`${node.step.name || node.step.application_id} 단계를 롤백할까요?`) && onOpenRuns()}>롤백</Button>
        </div>
      )}
    </section>
  );
}

void ReleaseNodeLegacyPanel;

const NEW_PLAN_STAGES: Array<{ value: NewPlanStage; label: string; help: string }> = [
  { value: 'basics', label: '기본 정보', help: '플랜 이름과 목적' },
  { value: 'apps', label: '앱/레포 선택', help: '배포에 포함할 레포' },
  { value: 'global', label: '전역 정책', help: '플랜 전체 규칙' },
  { value: 'steps', label: '앱별 설정', help: '각 앱의 브랜치와 배포값' },
  { value: 'review', label: '검토/저장', help: '저장 전 확인' },
];

function PlanGlobalSettingsCard({ plan, setPolicy, title = '전체 플랜 전역 설정' }: { plan: ReleasePlan; setPolicy: (patch: Record<string, unknown>) => void; title?: string }) {
  const settings = { ...DEFAULT_POLICY, ...plan.settings };
  return (
    <Card title={title}>
      <div className="release-flow__scope-note">
        <strong>플랜 전체에 적용</strong>
        <span>실행 방식, 승인/실패 정책, 기본 전략처럼 모든 앱 단계가 기본으로 따르는 값입니다.</span>
      </div>
      <div className="release-flow__form-grid release-flow__form-grid--compact">
        <SelectField label="런타임 모드" value={getString(settings.runtime_mode, 'demo')} options={RUNTIME_MODES} onChange={value => setPolicy({ runtime_mode: value, provider_mode: value === 'live' ? 'live' : 'dry_run' })} />
        <SelectField label="실행 모드" value={getString(settings.execution_mode)} options={EXECUTION_MODES} onChange={value => setPolicy({ execution_mode: value })} />
        <SelectField label="승인 정책" value={getString(settings.approval_policy)} options={APPROVAL_POLICIES} onChange={value => setPolicy({ approval_policy: value })} />
        <SelectField label="실패 정책" value={getString(settings.failure_policy)} options={FAILURE_POLICIES} onChange={value => setPolicy({ failure_policy: value })} />
        <SelectField label="기본 전략" value={getString(settings.default_strategy)} options={STRATEGIES} onChange={value => setPolicy({ default_strategy: value })} />
        <Field label="동시 실행 수"><input className="input" type="number" min={1} max={20} value={getNumber(settings.concurrency, 1)} onChange={e => setPolicy({ concurrency: Number(e.target.value) })} /></Field>
        <Field label="승격 경로">
          <input className="input" value={getStringArray(settings.environment_order).join(', ')} onChange={e => setPolicy({ environment_order: splitList(e.target.value) })} />
        </Field>
        <Field label="변경 티켓"><input className="input" value={getString(settings.change_ticket)} onChange={e => setPolicy({ change_ticket: e.target.value })} /></Field>
        <label className="release-flow__check">
          <input type="checkbox" checked={Boolean(settings.require_diagnostics_pass)} onChange={e => setPolicy({ require_diagnostics_pass: e.target.checked })} />
          실행 전에 진단 통과 필요
        </label>
      </div>
    </Card>
  );
}

function NewPlanWizard({
  draft,
  stage,
  selectedIndex,
  apps,
  appById,
  saving,
  onEnsureDraft,
  onStage,
  onSelectedIndex,
  onPlanValue,
  onPolicy,
  onStep,
  onPlan,
  onCancel,
  onSave,
}: {
  draft: ReleasePlan;
  stage: NewPlanStage;
  selectedIndex: number;
  apps: Application[];
  appById: Map<string, Application>;
  saving: boolean;
  onEnsureDraft: () => void;
  onStage: (stage: NewPlanStage) => void;
  onSelectedIndex: Dispatch<SetStateAction<number>>;
  onPlanValue: (patch: Partial<ReleasePlan>) => void;
  onPolicy: (patch: Record<string, unknown>) => void;
  onStep: (index: number, patch: Partial<ReleasePlanStep>) => void;
  onPlan: Dispatch<SetStateAction<ReleasePlan | null>>;
  onCancel: () => void;
  onSave: () => void;
}) {
  useEffect(() => onEnsureDraft(), [onEnsureDraft]);
  const [extraApps, setExtraApps] = useState<Application[]>([]);
  const [repoDraft, setRepoDraft] = useState({
    name: 'Demo Payments API',
    repo_ref: 'JEONWOOHYUN-hydromel/demo-payments-api',
    branch: 'main',
    manifest_path: 'k8s/deployment.yaml',
    cluster_id: 'demo-target-cluster',
  });
  const stageIndex = NEW_PLAN_STAGES.findIndex(item => item.value === stage);
  const demoApps = useMemo(() => apps.length > 0 ? [] : demoReleaseApplications(), [apps.length]);
  const availableApps = useMemo(() => [...apps, ...demoApps, ...extraApps], [apps, demoApps, extraApps]);
  const availableAppById = useMemo(() => new Map([...appById, ...availableApps.map(app => [app.application_id, app] as const)]), [appById, availableApps]);
  const selected = selectedStep(draft, selectedIndex);
  const selectedApplicationIds = new Set(draft.steps.map(step => step.application_id));
  const canGoNext = stage === 'basics' ? Boolean(draft.name.trim()) : stage === 'apps' ? draft.steps.length > 0 : true;
  const previousStage = NEW_PLAN_STAGES[Math.max(0, stageIndex - 1)]?.value ?? 'basics';
  const nextStage = NEW_PLAN_STAGES[Math.min(NEW_PLAN_STAGES.length - 1, stageIndex + 1)]?.value ?? 'review';

  const toggleApp = (app: Application) => {
    const selectedNow = selectedApplicationIds.has(app.application_id);
    onPlan(current => current ? setPlanApplicationSelected(current, app, !selectedNow) : current);
    if (!selectedNow) onSelectedIndex(draft.steps.length);
    else onSelectedIndex(index => Math.max(0, Math.min(index, draft.steps.length - 2)));
  };
  const registerRepo = () => {
    const repoRef = repoDraft.repo_ref.trim();
    if (!repoRef) return;
    const app: Application = {
      application_id: uniqueApplicationId(repoRef, [...availableApps, ...draft.steps.map(step => availableAppById.get(step.application_id)).filter((item): item is Application => Boolean(item))]),
      name: repoDraft.name.trim() || repoRef.split('/').pop() || repoRef,
      repo_ref: repoRef,
      branch: repoDraft.branch.trim() || 'main',
      manifest_path: repoDraft.manifest_path.trim() || 'k8s/deployment.yaml',
      cluster_id: repoDraft.cluster_id.trim() || 'demo-target-cluster',
      last_run_status: 'registered',
    };
    setExtraApps(current => [...current, app]);
    onPlan(current => current ? setPlanApplicationSelected(current, app, true) : current);
    onSelectedIndex(draft.steps.length);
    setRepoDraft({
      name: '',
      repo_ref: '',
      branch: 'main',
      manifest_path: 'k8s/deployment.yaml',
      cluster_id: app.cluster_id,
    });
  };

  return (
    <div className="release-flow__builder-shell release-flow__builder-shell--new">
      <div className="release-flow__builder-hero">
        <div>
          <span className="release-flow__builder-kicker">새 플랜 작성</span>
          <h2>새 릴리즈 플랜</h2>
          <div className="release-flow__builder-meta">
            <span>{draft.steps.length}개 앱 선택</span>
            <span>{stageIndex + 1}/{NEW_PLAN_STAGES.length}</span>
            <span>현재 플랜과 별도 작성</span>
          </div>
        </div>
        <div className="release-flow__builder-actions">
          <Button title="현재 상황 화면으로 돌아갑니다" onClick={onCancel}>나가기</Button>
          <Button title="새 릴리즈 플랜을 저장합니다" variant="primary" loading={saving} disabled={saving || !draft.name.trim() || draft.steps.length === 0} onClick={onSave}><IconSave size={14} />새 플랜 저장</Button>
        </div>
      </div>

      <div className="release-flow__wizard-steps">
        {NEW_PLAN_STAGES.map((item, index) => (
          <button
            key={item.value}
            type="button"
            className={`release-flow__wizard-step ${item.value === stage ? 'release-flow__wizard-step--current' : ''} ${index < stageIndex ? 'release-flow__wizard-step--done' : ''}`}
            onClick={() => onStage(item.value)}
          >
            <span>{index + 1}. {item.label}</span>
            <small>{item.help}</small>
          </button>
        ))}
      </div>

      {stage === 'basics' && (
        <div className="release-flow__wizard-page">
          <Card title="기본 정보">
            <div className="release-flow__scope-note">
              <strong>먼저 플랜의 이름과 목적만 정합니다</strong>
              <span>앱과 레포는 다음 단계에서 고릅니다.</span>
            </div>
            <Field label="이름"><input className="input" value={draft.name} onChange={e => onPlanValue({ name: e.target.value })} /></Field>
            <Field label="설명"><textarea className="input" rows={4} value={draft.description} onChange={e => onPlanValue({ description: e.target.value })} /></Field>
            <Field label="상태">
              <select className="input" value={draft.status} onChange={e => onPlanValue({ status: e.target.value as ReleasePlan['status'] })}>
                <option value="draft">초안</option>
                <option value="active">활성</option>
                <option value="paused">일시정지</option>
              </select>
            </Field>
          </Card>
        </div>
      )}

      {stage === 'apps' && (
        <div className="release-flow__wizard-page">
          <Card title="앱/레포 선택">
            <div className="release-flow__scope-note">
              <strong>플랜에 들어갈 레포를 선택합니다</strong>
              <span>선택한 앱은 아래 순서대로 릴리즈 단계가 됩니다. 브랜치와 매니페스트 경로는 다음 단계에서 앱별로 조정합니다.</span>
            </div>
            <div className="release-flow__repo-register">
              <Field label="레포 이름"><input className="input" value={repoDraft.name} onChange={e => setRepoDraft(current => ({ ...current, name: e.target.value }))} /></Field>
              <Field label="GitHub 레포"><input className="input" placeholder="owner/repo" value={repoDraft.repo_ref} onChange={e => setRepoDraft(current => ({ ...current, repo_ref: e.target.value }))} /></Field>
              <Field label="브랜치"><input className="input" value={repoDraft.branch} onChange={e => setRepoDraft(current => ({ ...current, branch: e.target.value }))} /></Field>
              <Field label="매니페스트 경로"><input className="input" value={repoDraft.manifest_path} onChange={e => setRepoDraft(current => ({ ...current, manifest_path: e.target.value }))} /></Field>
              <Field label="클러스터"><input className="input" value={repoDraft.cluster_id} onChange={e => setRepoDraft(current => ({ ...current, cluster_id: e.target.value }))} /></Field>
              <Button type="button" size="sm" disabled={!repoDraft.repo_ref.trim()} onClick={registerRepo}><IconPlus size={13} />레포 등록</Button>
            </div>
            {apps.length === 0 && extraApps.length === 0 && (
              <p className="release-flow__hint">등록된 레포가 없어 예시 레포를 먼저 보여줍니다. 그대로 선택해도 다음 단계로 진행할 수 있습니다.</p>
            )}
            {availableApps.length === 0 ? (
              <EmptyState title="선택할 앱/레포가 없습니다" description="위 등록 폼에서 레포를 추가하면 바로 플랜에 포함할 수 있습니다." />
            ) : (
              <div className="release-flow__repo-picker">
                {availableApps.map(app => {
                  const checked = selectedApplicationIds.has(app.application_id);
                  return (
                    <button key={app.application_id} type="button" className={`release-flow__repo-option ${checked ? 'release-flow__repo-option--selected' : ''}`} onClick={() => toggleApp(app)}>
                      <span className="release-flow__repo-option-title">
                        <strong>{app.name}</strong>
                        <Badge tone={checked ? 'success' : 'neutral'}>{checked ? '선택됨' : '추가'}</Badge>
                      </span>
                      <span>{app.repo_ref}</span>
                      <small>{app.branch} / {app.manifest_path} / {app.cluster_id}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}

      {stage === 'global' && (
        <div className="release-flow__wizard-page">
          <PlanGlobalSettingsCard plan={draft} setPolicy={onPolicy} />
        </div>
      )}

      {stage === 'steps' && (
        <div className="release-flow release-flow--builder release-flow--wizard-steps">
          <Card title="선택한 앱 순서">
            <div className="release-flow__step-list">
              {draft.steps.map((step, index) => (
                <div key={`${step.application_id}-${index}`} className={`release-flow__step-row ${index === selectedIndex ? 'release-flow__step-row--selected' : ''}`}>
                  <button className="btn btn--ghost btn--sm" aria-pressed={index === selectedIndex} onClick={() => onSelectedIndex(index)}>
                    {index + 1}. {step.name || appById.get(step.application_id)?.name || step.application_id}
                  </button>
                  <div className="release-flow__step-actions">
                    <Button size="sm" variant="ghost" title="단계를 앞으로 이동" disabled={index === 0} onClick={() => moveStep(draft, index, -1, onPlan, onSelectedIndex)} aria-label="단계를 앞으로 이동"><IconArrowUp size={13} /></Button>
                    <Button size="sm" variant="ghost" title="단계를 뒤로 이동" disabled={index === draft.steps.length - 1} onClick={() => moveStep(draft, index, 1, onPlan, onSelectedIndex)} aria-label="단계를 뒤로 이동"><IconArrowDown size={13} /></Button>
                    <Button size="sm" variant="ghost" title="단계 삭제" onClick={() => removeStep(draft, index, onPlan, onSelectedIndex)} aria-label="단계 삭제"><IconTrash size={13} /></Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <StepEditor
            title="앱별 설정"
            plan={draft}
            selected={selected}
            selectedIndex={selectedIndex}
            apps={availableApps}
            appById={availableAppById}
            setStep={onStep}
            setPlan={onPlan}
          />
        </div>
      )}

      {stage === 'review' && (
        <div className="release-flow__wizard-page">
          <Card title="검토 후 저장">
            <div className="release-flow__review-grid">
              <FieldValue label="플랜 이름" value={draft.name || '이름 없음'} emphasis />
              <FieldValue label="상태" value={statusLabel(draft.status)} />
              <FieldValue label="앱/레포" value={`${draft.steps.length}개`} />
              <FieldValue label="런타임" value={valueLabel(getString(draft.settings.runtime_mode, 'demo'))} />
              <FieldValue label="승인 정책" value={valueLabel(getString(draft.settings.approval_policy))} />
              <FieldValue label="기본 전략" value={valueLabel(getString(draft.settings.default_strategy))} />
            </div>
            <div className="release-flow__review-list">
              {draft.steps.map((step, index) => {
                const app = availableAppById.get(step.application_id);
                return (
                  <div key={`${step.application_id}-${index}`}>
                    <strong>{index + 1}. {step.name || app?.name || step.application_id}</strong>
                    <span>{app?.repo_ref || getString(step.config.repo_ref) || '-'}</span>
                    <small>{getString(step.config.branch, app?.branch || 'main')} / {getString(step.config.manifest_path, app?.manifest_path || 'deploy.yaml')} / {getString(step.config.namespace, 'sandbox')}</small>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      <div className="release-flow__wizard-actions">
        <Button disabled={stageIndex === 0} onClick={() => onStage(previousStage)}>이전</Button>
        {stage === 'review' ? (
          <Button variant="primary" loading={saving} disabled={saving || !draft.name.trim() || draft.steps.length === 0} onClick={onSave}><IconSave size={14} />저장</Button>
        ) : (
          <Button variant="primary" disabled={!canGoNext} onClick={() => onStage(nextStage)}>다음</Button>
        )}
      </div>
    </div>
  );
}

function PolicyEditor({ plan, setPolicy }: { plan: ReleasePlan; setPolicy: (patch: Record<string, unknown>) => void }) {
  const settings = { ...DEFAULT_POLICY, ...plan.settings };
  return (
    <Card title="실행 정책">
      <div className="release-flow__form-grid">
        <SelectField label="런타임 모드" value={getString(settings.runtime_mode, 'demo')} options={RUNTIME_MODES} onChange={value => setPolicy({ runtime_mode: value, provider_mode: value === 'live' ? 'live' : 'dry_run' })} />
        <SelectField label="실행 모드" value={getString(settings.execution_mode)} options={EXECUTION_MODES} onChange={value => setPolicy({ execution_mode: value })} />
        <SelectField label="승인 정책" value={getString(settings.approval_policy)} options={APPROVAL_POLICIES} onChange={value => setPolicy({ approval_policy: value })} />
        <SelectField label="실패 정책" value={getString(settings.failure_policy)} options={FAILURE_POLICIES} onChange={value => setPolicy({ failure_policy: value })} />
        <SelectField label="롤백 정책" value={getString(settings.rollback_policy)} options={ROLLBACK_POLICIES} onChange={value => setPolicy({ rollback_policy: value })} />
        {getString(settings.rollback_policy) === 'disabled' && (
          <Field label="롤백 예외 사유">
            <input className="input" value={getString(settings.rollback_override_reason)} onChange={e => setPolicy({ rollback_override_reason: e.target.value })} />
          </Field>
        )}
        <SelectField label="기본 전략" value={getString(settings.default_strategy)} options={STRATEGIES} onChange={value => setPolicy({ default_strategy: value })} />
        <Field label="동시 실행 수"><input className="input" type="number" min={1} max={20} value={getNumber(settings.concurrency, 1)} onChange={e => setPolicy({ concurrency: Number(e.target.value) })} /></Field>
        <Field label="헬스 타임아웃 초"><input className="input" type="number" min={30} max={3600} value={getNumber(settings.health_timeout_seconds, 600)} onChange={e => setPolicy({ health_timeout_seconds: Number(e.target.value) })} /></Field>
        <Field label="재시도 횟수"><input className="input" type="number" min={0} max={10} value={getNumber(settings.retry_attempts, 1)} onChange={e => setPolicy({ retry_attempts: Number(e.target.value) })} /></Field>
        <Field label="승격 경로">
          <input className="input" value={getStringArray(settings.environment_order).join(', ')} onChange={e => setPolicy({ environment_order: splitList(e.target.value) })} />
        </Field>
        <Field label="변경 티켓"><input className="input" value={getString(settings.change_ticket)} onChange={e => setPolicy({ change_ticket: e.target.value })} /></Field>
        {getString(settings.runtime_mode, 'demo') === 'live' && !getString(settings.change_ticket).trim() && (
          <Field label="운영 변경 예외 사유">
            <input className="input" value={getString(settings.production_change_override_reason)} onChange={e => setPolicy({ production_change_override_reason: e.target.value })} />
          </Field>
        )}
        {getString(settings.runtime_mode, 'demo') === 'live' && (
          <>
            <Field label="릴리즈 가능 시간 시작">
              <input className="input" placeholder="2026-07-10T09:00:00Z" value={getString(settings.release_window_start)} onChange={e => setPolicy({ release_window_start: e.target.value })} />
            </Field>
            <Field label="릴리즈 가능 시간 종료">
              <input className="input" placeholder="2026-07-10T11:00:00Z" value={getString(settings.release_window_end)} onChange={e => setPolicy({ release_window_end: e.target.value })} />
            </Field>
            <Field label="릴리즈 시간 예외 사유">
              <input className="input" value={getString(settings.release_window_override_reason)} onChange={e => setPolicy({ release_window_override_reason: e.target.value })} />
            </Field>
            <Field label="변경 동결 시작">
              <input className="input" placeholder="2026-07-10T18:00:00Z" value={getString(settings.change_freeze_start)} onChange={e => setPolicy({ change_freeze_start: e.target.value })} />
            </Field>
            <Field label="변경 동결 종료">
              <input className="input" placeholder="2026-07-11T02:00:00Z" value={getString(settings.change_freeze_end)} onChange={e => setPolicy({ change_freeze_end: e.target.value })} />
            </Field>
            {(getString(settings.change_freeze_start).trim() || getString(settings.change_freeze_end).trim()) && (
              <Field label="변경 동결 예외 사유">
                <input className="input" value={getString(settings.change_freeze_override_reason)} onChange={e => setPolicy({ change_freeze_override_reason: e.target.value })} />
              </Field>
            )}
            <Field label="런북 URL">
              <input className="input" placeholder="https://wiki.example.com/release-runbook" value={getString(settings.runbook_url)} onChange={e => setPolicy({ runbook_url: e.target.value })} />
            </Field>
            {!getString(settings.runbook_url).trim() && (
              <Field label="런북 예외 사유">
                <input className="input" value={getString(settings.runbook_override_reason)} onChange={e => setPolicy({ runbook_override_reason: e.target.value })} />
              </Field>
            )}
            <Field label="릴리즈 담당자">
              <input className="input" placeholder="릴리즈 리드 또는 팀" value={getString(settings.release_owner)} onChange={e => setPolicy({ release_owner: e.target.value })} />
            </Field>
            <Field label="온콜 연락처">
              <input className="input" placeholder="oncall@example.com or #release-oncall" value={getString(settings.oncall_contact)} onChange={e => setPolicy({ oncall_contact: e.target.value })} />
            </Field>
            <Field label="검증 예외 사유">
              <input className="input" value={getString(settings.verification_override_reason)} onChange={e => setPolicy({ verification_override_reason: e.target.value })} />
            </Field>
            <Field label="중단 기준">
              <input className="input" placeholder="에러율이 5분 동안 5%를 넘으면 롤백" value={getString(settings.abort_criteria)} onChange={e => setPolicy({ abort_criteria: e.target.value })} />
            </Field>
            {!getString(settings.abort_criteria).trim() && (
              <Field label="중단 기준 예외 사유">
                <input className="input" value={getString(settings.abort_criteria_override_reason)} onChange={e => setPolicy({ abort_criteria_override_reason: e.target.value })} />
              </Field>
            )}
          </>
        )}
        <Field label="Safe PR URL"><input className="input" value={getString(settings.safe_pr_url)} onChange={e => setPolicy({ safe_pr_url: e.target.value })} /></Field>
        <label className="release-flow__check">
          <input type="checkbox" checked={Boolean(settings.require_diagnostics_pass)} onChange={e => setPolicy({ require_diagnostics_pass: e.target.checked })} />
          실행 전에 진단 통과 필요
        </label>
        {!settings.require_diagnostics_pass && (
          <Field label="진단 예외 사유">
            <input className="input" value={getString(settings.diagnostics_override_reason)} onChange={e => setPolicy({ diagnostics_override_reason: e.target.value })} />
          </Field>
        )}
        <label className="release-flow__check">
          <input type="checkbox" checked={Boolean(settings.approval_granted)} onChange={e => setPolicy({ approval_granted: e.target.checked })} />
          이 플랜 승인 완료
        </label>
        {Boolean(settings.approval_granted) && (
          <>
            <Field label="승인자">
              <input className="input" value={getString(settings.approval_granted_by)} onChange={e => setPolicy({ approval_granted_by: e.target.value })} />
            </Field>
            <Field label="승인 사유">
              <input className="input" value={getString(settings.approval_reason)} onChange={e => setPolicy({ approval_reason: e.target.value })} />
            </Field>
            <Field label="승인 시각 (UTC)">
              <input className="input" type="datetime-local" value={toDateTimeLocalValue(getString(settings.approval_granted_at))} onChange={e => setPolicy({ approval_granted_at: fromDateTimeLocalValue(e.target.value) })} />
            </Field>
          </>
        )}
      </div>
    </Card>
  );
}

function StepEditor({
  title = '선택한 단계',
  plan,
  selected,
  selectedIndex,
  apps,
  appById,
  setStep,
  setPlan,
}: {
  title?: string;
  plan: ReleasePlan;
  selected?: ReleasePlanStep;
  selectedIndex: number;
  apps: Application[];
  appById: Map<string, Application>;
  setStep: (index: number, patch: Partial<ReleasePlanStep>) => void;
  setPlan: Dispatch<SetStateAction<ReleasePlan | null>>;
}) {
  if (!selected) {
    return <Card title={title}><EmptyState icon={<IconAlertTriangle size={24} />} title="선택된 단계가 없습니다" /></Card>;
  }
  const config = selected.config;
  const strategy = getString(config.strategy, getString(plan.settings.default_strategy, 'rolling'));
  return (
    <Card title={title}>
      <Field label="애플리케이션">
        <select className="input" value={selected.application_id} onChange={e => setStep(selectedIndex, { application_id: e.target.value, name: appById.get(e.target.value)?.name ?? e.target.value })}>
          {apps.map(app => <option key={app.application_id} value={app.application_id}>{app.name} / {app.repo_ref}</option>)}
        </select>
      </Field>
      <Field label="단계 이름"><input className="input" value={selected.name} onChange={e => setStep(selectedIndex, { name: e.target.value })} /></Field>
      <div className="release-flow__form-grid release-flow__form-grid--compact">
        <Field label="브랜치"><input className="input" value={getString(config.branch, appById.get(selected.application_id)?.branch ?? 'main')} onChange={e => setStepConfig(selectedIndex, { branch: e.target.value }, setPlan)} /></Field>
        <Field label="매니페스트 경로"><input className="input" value={getString(config.manifest_path, appById.get(selected.application_id)?.manifest_path ?? 'deploy.yaml')} onChange={e => setStepConfig(selectedIndex, { manifest_path: e.target.value }, setPlan)} /></Field>
        <Field label="커밋 SHA"><input className="input" value={getString(config.commit_sha)} onChange={e => setStepConfig(selectedIndex, { commit_sha: e.target.value }, setPlan)} /></Field>
        <Field label="이미지"><input className="input" value={getString(config.image)} onChange={e => setStepConfig(selectedIndex, { image: e.target.value }, setPlan)} /></Field>
        <Field label="환경"><input className="input" value={getString(config.environment, firstEnvironment(plan))} onChange={e => setStepConfig(selectedIndex, { environment: e.target.value }, setPlan)} /></Field>
        <Field label="네임스페이스"><input className="input" value={getString(config.namespace, 'sandbox')} onChange={e => setStepConfig(selectedIndex, { namespace: e.target.value }, setPlan)} /></Field>
        <Field label="레플리카"><input className="input" type="number" min={0} value={getNumber(config.replicas, 2)} onChange={e => setStepConfig(selectedIndex, { replicas: Number(e.target.value) }, setPlan)} /></Field>
        <SelectField label="전략" value={strategy} options={STRATEGIES} onChange={value => setStepConfig(selectedIndex, { strategy: value }, setPlan)} />
        <SelectField label="승인 게이트" value={getString(config.approval_gate, 'inherit')} options={STEP_GATES} onChange={value => setStepConfig(selectedIndex, { approval_gate: value }, setPlan)} />
        <Field label="변경 티켓"><input className="input" value={getString(config.change_ticket)} onChange={e => setStepConfig(selectedIndex, { change_ticket: e.target.value }, setPlan)} /></Field>
        <Field label="Safe PR URL"><input className="input" value={getString(config.safe_pr_url)} onChange={e => setStepConfig(selectedIndex, { safe_pr_url: e.target.value }, setPlan)} /></Field>
        <label className="release-flow__check">
          <input type="checkbox" checked={Boolean(config.approval_granted)} onChange={e => setStepConfig(selectedIndex, { approval_granted: e.target.checked }, setPlan)} />
          이 단계 승인 완료
        </label>
        <Field label="카나리 비율"><input className="input" type="number" min={1} max={99} value={getNumber(config.canary_percent, strategy === 'canary' ? 20 : 0)} onChange={e => setStepConfig(selectedIndex, { canary_percent: Number(e.target.value) }, setPlan)} /></Field>
        <Field label="서비스 이름"><input className="input" value={getString(config.service_name)} onChange={e => setStepConfig(selectedIndex, { service_name: e.target.value }, setPlan)} /></Field>
        <Field label="헬스 체크 경로"><input className="input" value={getString(config.health_check_path, '/readyz')} onChange={e => setStepConfig(selectedIndex, { health_check_path: e.target.value }, setPlan)} /></Field>
        <Field label="검증 URL"><input className="input" placeholder="https://status.example.com/checkout" value={getString(config.post_deploy_verification_url)} onChange={e => setStepConfig(selectedIndex, { post_deploy_verification_url: e.target.value }, setPlan)} /></Field>
        <Field label="롤백 트리거"><input className="input" placeholder="p95 지연 시간이 10분 동안 2배가 되면 롤백" value={getString(config.rollback_trigger)} onChange={e => setStepConfig(selectedIndex, { rollback_trigger: e.target.value }, setPlan)} /></Field>
        <Field label="타임아웃 초"><input className="input" type="number" min={30} max={3600} value={getNumber(config.timeout_seconds, 600)} onChange={e => setStepConfig(selectedIndex, { timeout_seconds: Number(e.target.value) }, setPlan)} /></Field>
        <Field label="재시도 횟수"><input className="input" type="number" min={0} max={10} value={getNumber(config.retry_attempts, getNumber(plan.settings.retry_attempts, 1))} onChange={e => setStepConfig(selectedIndex, { retry_attempts: Number(e.target.value) }, setPlan)} /></Field>
      </div>
      <Field label="의존 단계">
        <div className="release-flow__checkboxes">
          {plan.steps.filter((_, i) => i !== selectedIndex).map(step => (
            <label key={step.application_id}>
              <input type="checkbox" checked={selected.depends_on.includes(step.application_id)} onChange={e => toggleDependency(selectedIndex, step.application_id, e.target.checked, setPlan)} />
              {step.name || appById.get(step.application_id)?.name || step.application_id}
            </label>
          ))}
        </div>
      </Field>
    </Card>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        {options.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </Field>
  );
}

function ReleasePlanSettingsSummary({ plan, onEdit }: { plan: ReleasePlan; onEdit: () => void }) {
  const settings = { ...DEFAULT_POLICY, ...plan.settings };
  return (
    <Card title="실행 기준" actions={<Button size="sm" onClick={onEdit}>설정 수정</Button>}>
      <div className="release-flow__scope-note">
        <strong>이 탭은 실행 전 확인과 실행 제어 공간입니다</strong>
        <span>플랜 전체 정책이나 앱별 브랜치/매니페스트 변경은 현재 플랜 수정 탭에서 관리합니다.</span>
      </div>
      <div className="release-flow__review-grid">
        <FieldValue label="런타임" value={valueLabel(getString(settings.runtime_mode, 'demo'))} />
        <FieldValue label="실행 모드" value={valueLabel(getString(settings.execution_mode))} />
        <FieldValue label="승인 정책" value={valueLabel(getString(settings.approval_policy))} />
        <FieldValue label="실패 정책" value={valueLabel(getString(settings.failure_policy))} />
        <FieldValue label="기본 전략" value={valueLabel(getString(settings.default_strategy))} />
        <FieldValue label="대상 앱" value={`${plan.steps.length}개`} />
      </div>
    </Card>
  );
}

function PreviewPanel({
  preview,
  loading,
  dispatching,
  liveSideEffects,
  onDispatch,
  onStart,
}: {
  preview?: ReleasePlanPreview;
  loading: boolean;
  dispatching: boolean;
  liveSideEffects: boolean;
  onDispatch: (wave: number) => void;
  onStart: () => void;
}) {
  if (loading && !preview) return <Card title="실행 미리보기"><p className="release-flow__hint">미리보기를 계산하는 중입니다...</p></Card>;
  if (!preview) return <Card title="실행 미리보기"><p className="release-flow__hint">아직 미리보기가 없습니다.</p></Card>;
  const firstWave = preview.waves[0]?.wave ?? 1;
  const previewBlockedReason = firstReason(
    dispatching ? '릴리즈 실행 또는 시작 작업이 이미 진행 중입니다.' : '',
    preview.waves.length === 0 ? '실행 가능한 wave가 없습니다.' : '',
    !preview.executable ? `실행 전에 막힌 항목을 해결하세요: ${preview.blockers[0] ?? '미리보기가 막혀 있습니다'}` : '',
  );
  const liveActionHint = liveSideEffects ? '이 플랜은 실제 GitOps 이벤트를 발행할 수 있어 확인창이 표시됩니다.' : undefined;
  const previewActionHint = previewBlockedReason ?? liveActionHint;
  return (
    <Card
      title="실행 미리보기"
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => copyPreviewMarkdown(preview, liveSideEffects)}>미리보기 복사</Button>
          <Badge tone={preview.executable ? 'success' : 'warning'}>{preview.executable ? '준비됨' : '막힘'}</Badge>
        </>
      }
    >
      <p className="release-flow__hint">{preview.summary}</p>
      <div className="release-flow__toolbar release-flow__toolbar--preview">
        <Button
          size="sm"
          variant="primary"
          loading={dispatching}
          disabled={!preview.executable || preview.waves.length === 0}
          title={previewActionHint}
          onClick={() => {
            if (liveSideEffects && !window.confirm(`라이브 릴리즈 Wave ${firstWave}를 실행할까요? 실제 GitOps 이벤트가 발행될 수 있습니다.`)) return;
            onDispatch(firstWave);
          }}
        >
          Wave {firstWave} 실행
        </Button>
        <Button
          size="sm"
          loading={dispatching}
          disabled={!preview.executable || preview.waves.length === 0}
          title={previewActionHint}
          onClick={() => {
            if (liveSideEffects && !window.confirm('추적 가능한 라이브 릴리즈 실행을 시작할까요? 이 플랜의 실제 GitOps 실행이 시작될 수 있습니다.')) return;
            onStart();
          }}
        >
          추적 실행 시작
        </Button>
      </div>
      {preview.blockers.length > 0 && (
        <div className="release-flow__diag-list">
          {preview.blockers.map(blocker => <div key={blocker} className="release-flow__diag release-flow__diag--warning">{blocker}</div>)}
        </div>
      )}
      <div className="release-flow__waves">
        {preview.waves.map(wave => (
          <div key={wave.wave} className="release-flow__wave">
            <strong>Wave {wave.wave}</strong>
            <span>{wave.applications.join(' -> ')}</span>
          </div>
        ))}
      </div>
      <div className="release-flow__preview-list">
        {preview.steps.map(step => (
          <div key={step.step_id} className="release-flow__preview-row">
            <FieldValue label="단계" value={step.name} />
            <FieldValue label="환경" value={step.environment} />
            <FieldValue label="전략" value={valueLabel(step.strategy)} />
            <FieldValue label="게이트" value={valueLabel(step.gate)} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReadinessPanel({ readiness, loading }: { readiness?: ReleaseReadiness; loading: boolean }) {
  if (loading && !readiness) {
    return <Card title="준비 상태"><p className="release-flow__hint">릴리즈 준비 상태를 확인하는 중입니다...</p></Card>;
  }
  if (!readiness) {
    return <Card title="준비 상태"><p className="release-flow__hint">아직 준비 상태 확인 결과가 없습니다.</p></Card>;
  }
  const badgeTone = readiness.ready ? (readiness.warnings.length ? 'warning' : 'success') : 'danger';
  const impact = readiness.impact;
  const nextActions = readiness.next_actions ?? [];
  return (
    <Card
      title="준비 상태"
      actions={
        <>
          <Button size="sm" variant="ghost" onClick={() => copyReadinessMarkdown(readiness)}>준비 상태 복사</Button>
          <Badge tone={readiness.mode === 'live' ? 'danger' : 'info'}>{readiness.mode}</Badge>
          <Badge tone={badgeTone}>{readiness.ready ? '준비됨' : '막힘'}</Badge>
        </>
      }
    >
      <p className="release-flow__hint">{readiness.summary}</p>
      {impact && (
        <div className="release-flow__impact">
          <div className="release-flow__impact-grid">
            <div>
              <span>애플리케이션</span>
              <strong>{impact.applications.length || impact.total_steps}</strong>
            </div>
            <div>
              <span>환경</span>
              <strong>{impact.environments.join(', ') || '-'}</strong>
            </div>
            <div>
              <span>Wave</span>
              <strong>{impact.total_waves}</strong>
            </div>
            <div>
              <span>운영 대상</span>
              <strong>{impact.production_target_count}</strong>
            </div>
          </div>
          <p>{impact.summary}</p>
          {impact.first_wave_steps.length > 0 && (
            <div className="release-flow__impact-steps">
              {impact.first_wave_steps.slice(0, 4).map(step => (
                <span key={step.step_id || `${step.application_id}-${step.name}`}>{step.name || step.application_id}</span>
              ))}
            </div>
          )}
        </div>
      )}
      {nextActions.length > 0 && (
        <div className="release-flow__next-actions">
          {nextActions.map(action => (
            <div key={action.action_id} className={`release-flow__next-action release-flow__next-action--${readinessStatusClass(action.severity)}`}>
              <div>
                <strong>{action.label}</strong>
                <p>{action.blockers[0] ?? action.message}</p>
              </div>
              <Badge tone={readinessStatusTone(action.severity)}>{readinessStatusLabel(action.severity)}</Badge>
            </div>
          ))}
        </div>
      )}
      <div className="release-flow__readiness">
        {readiness.checks.map(check => (
          <div key={check.check_id} className={`release-flow__readiness-row release-flow__readiness-row--${readinessStatusClass(check.status)}`}>
            <div>
              <strong>{check.name}</strong>
              <p>{check.message}</p>
            </div>
            <Badge tone={readinessStatusTone(check.status)}>{readinessStatusLabel(check.status)}</Badge>
            {check.blockers.length > 0 && (
              <ul>
                {check.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function AlertChannelsPanel({
  channels,
  loading,
  error,
  settingsHref,
}: {
  channels: AlertChannel[];
  loading: boolean;
  error: Error | null;
  settingsHref: string;
}) {
  if (loading && channels.length === 0) {
    return <Card title="릴리즈 알림"><p className="release-flow__hint">알림 채널을 불러오는 중입니다...</p></Card>;
  }
  const enabled = channels.filter(channel => channel.enabled);
  const critical = enabled.filter(channel => channel.min_severity === 'critical');
  const warningOrLower = enabled.filter(channel => channel.min_severity !== 'critical');
  const summaryTone = error ? 'warning' : enabled.length > 0 ? 'success' : 'warning';
  return (
    <Card
      title="릴리즈 알림"
      actions={<Badge tone={summaryTone}>{error ? '사용 불가' : enabled.length > 0 ? `${enabled.length}개 활성` : '설정 안 됨'}</Badge>}
    >
      {error ? (
        <p className="release-flow__hint">알림 채널 설정은 관리자 권한이 필요하거나 일시적으로 사용할 수 없습니다.</p>
      ) : (
        <>
          <div className="release-flow__summary">
            <div>
              <span>전체 채널</span>
              <strong>{channels.length}</strong>
            </div>
            <div>
              <span>활성</span>
              <strong>{enabled.length}</strong>
            </div>
            <div>
              <span>치명만</span>
              <strong>{critical.length}</strong>
            </div>
            <div>
              <span>정보/경고</span>
              <strong>{warningOrLower.length}</strong>
            </div>
          </div>
          {enabled.length > 0 ? (
            <div className="release-flow__alert-list">
              {enabled.slice(0, 4).map(channel => (
                <div key={channel.channel_id} className="release-flow__alert-row">
                  <div>
                    <strong>{channel.name}</strong>
                    <p>{channel.kind} / {channel.min_severity}</p>
                  </div>
                  <Badge tone={channel.min_severity === 'critical' ? 'danger' : channel.min_severity === 'warning' ? 'warning' : 'info'}>{channel.enabled ? '활성' : '비활성'}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="release-flow__hint">릴리즈 실패나 승인 이벤트를 받을 활성 알림 채널이 없습니다.</p>
          )}
        </>
      )}
      <div className="release-flow__toolbar release-flow__toolbar--preview">
        <Link to={settingsHref}><Button size="sm" variant={enabled.length > 0 ? 'ghost' : 'primary'}>알림 설정</Button></Link>
      </div>
    </Card>
  );
}

function RunPanel({
  plan,
  runs,
  summary,
  runFilter,
  onRunFilterChange,
  selectedRunId,
  onSelectedRunIdChange,
  loading,
  busy,
  onAdvance,
  onPause,
  onResume,
  onRetry,
  onRollback,
  onCancel,
  onNotify,
  onDelete,
}: {
  plan: ReleasePlan;
  runs: ReleaseRun[];
  summary?: ReleaseRunSummary;
  runFilter: ReleaseRunFilter;
  onRunFilterChange: (filter: ReleaseRunFilter) => void;
  selectedRunId: string;
  onSelectedRunIdChange: (runId: string) => void;
  loading: boolean;
  busy: boolean;
  onAdvance: (runId: string) => void;
  onPause: (runId: string, reason: string) => void;
  onResume: (runId: string, reason: string) => void;
  onRetry: (runId: string, reason: string) => void;
  onRollback: (runId: string, reason: string) => void;
  onCancel: (runId: string, reason: string) => void;
  onNotify: (runId: string, reason: string) => void;
  onDelete: (runId: string, force?: boolean) => void;
}) {
  const demoRuns = useMemo(() => (runs.length === 0 && runFilter === 'all' ? [demoReleaseRun(plan)] : runs), [plan, runFilter, runs]);
  const recentRunIds = useMemo(() => new Set((summary?.recent_runs ?? []).map(run => run.run_id)), [summary?.recent_runs]);
  useEffect(() => {
    if (loading && demoRuns.length === 0) return;
    if (demoRuns.length === 0) {
      if (selectedRunId && runFilter === 'all' && !recentRunIds.has(selectedRunId)) onSelectedRunIdChange('');
      return;
    }
    if (!selectedRunId) {
      onSelectedRunIdChange(demoRuns[0].run_id);
      return;
    }
    if (runFilter === 'all' && !demoRuns.some(run => run.run_id === selectedRunId) && !recentRunIds.has(selectedRunId)) {
      onSelectedRunIdChange(demoRuns[0].run_id);
    }
  }, [demoRuns, loading, onSelectedRunIdChange, recentRunIds, runFilter, selectedRunId]);
  const selectRecentRun = (runId: string) => {
    onRunFilterChange('all');
    onSelectedRunIdChange(runId);
  };
  const selectedRun = selectedRunId ? demoRuns.find(run => run.run_id === selectedRunId) : undefined;
  const run = selectedRun ?? demoRuns[0];
  const isDemoRun = run?.run_id === demoReleaseRunId(plan);
  const handoffQ = useReleaseRunHandoff(isDemoRun ? undefined : run?.run_id);
  const reportM = useReleaseRunReport();
  const reportExportM = useReleaseRunReportExport();
  if (loading && !run) return <Card title="릴리즈 실행"><p className="release-flow__hint">릴리즈 실행 기록을 불러오는 중입니다...</p></Card>;
  if (!run) {
    return (
      <Card title="릴리즈 실행">
        <RunSummary summary={summary} runFilter={runFilter} onRunFilterChange={onRunFilterChange} />
        <RunFilterField runFilter={runFilter} onRunFilterChange={onRunFilterChange} />
        <RecentRunShortcuts summary={summary} selectedRunId={selectedRunId} onSelect={selectRecentRun} />
        <p className="release-flow__hint">
          {runFilter === 'all' ? '아직 추적 중인 릴리즈 실행이 없습니다.' : '이 필터에 맞는 릴리즈 실행이 없습니다.'}
        </p>
      </Card>
    );
  }
  const status = run.derived_status ?? run.status;
  const isTerminal = ['succeeded', 'failed', 'cancelled', 'rollback_requested'].includes(status);
  const githubUrl = getString(run.github.release_url);
  const runtimeMode = getString(run.settings.runtime_mode, getString(run.settings.provider_mode, 'demo'));
  const sideEffects = runtimeMode === 'live';
  const sampleRunReason = isDemoRun ? '샘플 실행 기록입니다. 실제 레포 커밋으로 생성된 run에서 사용할 수 있습니다.' : '';
  const rollbackPolicy = getString(run.rollback.policy, getString(run.settings.rollback_policy));
  const canForceDelete = ['running', 'paused', 'rollback_requested', 'waiting_for_approval'].includes(status);
  const canRetry = status === 'failed' || run.steps.some(step => step.health.status === 'unhealthy' || step.status === 'failed');
  const attention = recordValue(run.attention);
  const attentionReasons = getStringArray(attention.reasons);
  const attentionRequired = Boolean(attention.required) || attentionReasons.length > 0;
  const stale = Boolean(attention.stale);
  const alertable = attentionRequired || stale;
  const notifyAction = handoffQ.data?.next_actions.find(action => action.action === 'notify');
  const notifyBlockedReason = notifyAction?.enabled === false ? getString(notifyAction.reason) : '';
  const busyReason = busy ? '다른 릴리즈 작업이 이미 진행 중입니다.' : '';
  const terminalReason = isTerminal ? `이미 ${statusLabel(status)} 상태인 실행입니다.` : '';
  const advanceBlockedReason = firstReason(busyReason, status === 'paused' ? '진행하기 전에 일시정지된 실행을 재개하세요.' : '', terminalReason);
  const retryBlockedReason = firstReason(busyReason, !canRetry ? '재시도는 실행 또는 단계가 실패했거나 헬스 상태가 비정상일 때만 가능합니다.' : '');
  const pauseBlockedReason = firstReason(busyReason, terminalReason);
  const rollbackBlockedReason = firstReason(
    busyReason,
    terminalReason,
    rollbackPolicy === 'disabled' ? '이 릴리즈 실행은 롤백 정책이 비활성화되어 있습니다.' : '',
  );
  const cancelBlockedReason = firstReason(busyReason, terminalReason);
  const notifyDisabledReason = firstReason(
    busyReason,
    notifyBlockedReason,
    !alertable ? '알림은 확인이 필요하거나 오래된 실행에만 사용할 수 있습니다.' : '',
  );
  const deleteBlockedReason = firstReason(busyReason);
  return (
    <Card
      title="릴리즈 실행"
      actions={
        <>
          {stale && <Badge tone="danger">오래됨</Badge>}
          {attentionRequired && <Badge tone="warning">확인 필요</Badge>}
          <Badge tone={sideEffects ? 'danger' : 'info'}>{sideEffects ? '라이브 모드' : '데모 모드'}</Badge>
          {isDemoRun && <Badge tone="info">샘플 실행</Badge>}
          <Badge tone={toneForStatus(status)}>{statusLabel(status)}</Badge>
        </>
      }
    >
      <RunSummary summary={summary} runFilter={runFilter} onRunFilterChange={onRunFilterChange} />
      <RunFilterField runFilter={runFilter} onRunFilterChange={onRunFilterChange} />
      <RecentRunShortcuts summary={summary} selectedRunId={run.run_id} onSelect={selectRecentRun} />
      {isDemoRun && (
        <div className="release-flow__sample-run-note">
          <strong>샘플 실행 기록</strong>
          <span>아직 실제 워크플로우 실행이 없어, 첫 커밋 감지 후 표시될 실행 카드 형태를 미리 보여줍니다.</span>
        </div>
      )}
      {demoRuns.length > 1 && (
        <Field label="실행 선택">
          <select className="input" value={run.run_id} onChange={e => onSelectedRunIdChange(e.target.value)}>
            {demoRuns.map(item => (
              <option key={item.run_id} value={item.run_id}>
                {shortId(item.run_id)} / {statusLabel(item.derived_status ?? item.status)} / Wave {item.current_wave}{recordValue(item.attention).required ? ' / 확인 필요' : ''}
              </option>
            ))}
          </select>
        </Field>
      )}
      {attentionReasons.length > 0 && (
        <div className="release-flow__diag-list">
          {attentionReasons.map(reason => (
            <div key={reason} className="release-flow__diag release-flow__diag--warning">
              {reason}
            </div>
          ))}
        </div>
      )}
      <RunHandoffPanel handoff={handoffQ.data} loading={handoffQ.isPending} />
      <div className="release-flow__run-head">
        <div>
          <strong>{run.plan_name}</strong>
          <p className="release-flow__hint">
            Wave {run.current_wave} / {run.total_waves} | 헬스 {healthLabel(getString(run.health.status, 'pending'))} | {sideEffects ? '실제 GitOps 실행' : 'dry-run 이벤트만'}
          </p>
        </div>
        <div className="release-flow__toolbar release-flow__toolbar--preview">
          {githubUrl && <a href={githubUrl} target="_blank" rel="noreferrer"><Button size="sm">GitHub 릴리즈</Button></a>}
          <Button size="sm" variant="ghost" onClick={() => copyReleaseRunLink(run.run_id)}>링크 복사</Button>
          <Button
            size="sm"
            variant="ghost"
            loading={reportM.isPending}
            disabled={reportM.isPending}
            onClick={() => {
              if (isDemoRun) copyReleaseRunReport(run, handoffQ.data);
              else {
                reportM.mutate(run.run_id, {
                  onSuccess: data => copyReleaseRunReport(run, handoffQ.data, data.report.markdown),
                  onError: () => copyReleaseRunReport(run, handoffQ.data),
                });
              }
            }}
          >
            리포트 복사
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={reportExportM.isPending}
            disabled={reportExportM.isPending || isDemoRun}
            title={sampleRunReason || undefined}
            onClick={() => reportExportM.mutate(run.run_id)}
          >
            리포트 다운로드
          </Button>
          <Button
            size="sm"
            loading={busy}
            disabled={busy || isDemoRun || status === 'paused' || isTerminal}
            title={sampleRunReason || advanceBlockedReason}
            onClick={() => {
              if (sideEffects && !window.confirm(`라이브 릴리즈 실행 ${shortId(run.run_id)}을 다음 단계로 진행할까요? 다음 GitOps wave가 실행될 수 있습니다.`)) return;
              onAdvance(run.run_id);
            }}
          >
            진행
          </Button>
          <Button
            size="sm"
            loading={busy}
            disabled={busy || isDemoRun || !canRetry}
            title={sampleRunReason || retryBlockedReason}
            onClick={() => {
              const confirmation = sideEffects
                ? `라이브 릴리즈 실행 ${shortId(run.run_id)}을 재시도할까요? 실패했거나 비정상인 GitOps 단계를 다시 실행할 수 있습니다.`
                : '';
              const submit = (reason: string) => onRetry(run.run_id, reason);
              if (confirmation) withConfirmedOperatorReason('릴리즈 wave 재시도', operatorActionReason('retry', run, status, attentionReasons), confirmation, submit);
              else withOperatorReason('릴리즈 wave 재시도', operatorActionReason('retry', run, status, attentionReasons), submit);
            }}
          >
            재시도
          </Button>
          {status === 'paused'
            ? (
              <Button
                size="sm"
                loading={busy}
                disabled={isDemoRun}
                title={sampleRunReason || busyReason || undefined}
                onClick={() => withOperatorReason('릴리즈 실행 재개', operatorActionReason('resume', run, status, attentionReasons), reason => onResume(run.run_id, reason))}
              >
                재개
              </Button>
            )
            : (
              <Button
                size="sm"
                loading={busy}
                disabled={busy || isDemoRun || isTerminal}
                title={sampleRunReason || pauseBlockedReason}
                onClick={() => withOperatorReason('릴리즈 실행 일시정지', operatorActionReason('pause', run, status, attentionReasons), reason => onPause(run.run_id, reason))}
              >
                일시정지
              </Button>
            )}
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || isDemoRun || isTerminal || rollbackPolicy === 'disabled'}
            title={sampleRunReason || rollbackBlockedReason}
            onClick={() => withConfirmedOperatorReason(
              '롤백 요청',
              operatorActionReason('rollback', run, status, attentionReasons),
              `실행 ${shortId(run.run_id)}에 롤백을 요청할까요? 사용자 영향이나 롤백 기준이 확인된 경우에만 사용해야 합니다.`,
              reason => onRollback(run.run_id, reason),
            )}
          >
            롤백
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || isDemoRun || isTerminal}
            title={sampleRunReason || cancelBlockedReason}
            onClick={() => withConfirmedOperatorReason(
              '릴리즈 실행 취소',
              operatorActionReason('cancel', run, status, attentionReasons),
              `실행 ${shortId(run.run_id)}을 취소할까요? 이 실행의 추가 릴리즈 진행이 중단됩니다.`,
              reason => onCancel(run.run_id, reason),
            )}
          >
            취소
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || isDemoRun || !alertable || Boolean(notifyBlockedReason)}
            title={sampleRunReason || notifyDisabledReason}
            onClick={() => withOperatorReason('릴리즈 담당자 알림', operatorActionReason('notify', run, status, attentionReasons), reason => onNotify(run.run_id, reason))}
          >
            알림
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || isDemoRun}
            title={sampleRunReason || deleteBlockedReason}
            onClick={() => {
              if (!window.confirm(`실행 ${shortId(run.run_id)}을 삭제할까요?`)) return;
              onDelete(run.run_id, canForceDelete ? window.confirm('실행이 아직 활성 상태입니다. 강제로 삭제할까요?') : false);
            }}
          >
            삭제
          </Button>
        </div>
        {notifyBlockedReason && <p className="release-flow__hint">{notifyBlockedReason}</p>}
      </div>

      <div className="release-flow__run-grid">
        {run.steps.map(step => (
          <div key={step.run_step_id} className="release-flow__run-step">
            <div>
              <strong>Wave {step.wave} - {step.name}</strong>
              <p className="release-flow__hint">{getString(step.details.environment)} / {getString(step.details.strategy)} / {getString(step.details.gate)}</p>
            </div>
            <Badge tone={toneForStatus(step.status)}>{statusLabel(step.status)}</Badge>
            <div className="release-flow__run-meta">
              {step.workflow_run_id && <span>워크플로 {shortId(step.workflow_run_id)}</span>}
              {getString(step.health.status) && <span>헬스 {healthLabel(getString(step.health.status))}</span>}
              {step.details.side_effects === false && <span>dry-run</span>}
              {releaseStepMeta(step).map(item => <span key={item}>{item}</span>)}
              {commitUrl(step) && <a href={commitUrl(step)} target="_blank" rel="noreferrer">커밋</a>}
            </div>
            {approvalIdForStep(step) && (
              <div className="release-flow__approval">
                <ApprovalCard
                  approvalId={approvalIdForStep(step)}
                  summary={approvalSummaryForStep(step)}
                  resolved={approvalDecisionForStep(step)}
                  compact
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="release-flow__timeline">
        {run.events.slice(-6).map(event => {
          const meta = releaseEventMeta(event);
          return (
            <div key={event.audit_id} className="release-flow__timeline-row">
              <span>{event.event_type}</span>
              <strong>{event.message}</strong>
              {(meta || event.actor) && <small>{meta || event.actor}</small>}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RunHandoffPanel({ handoff, loading }: { handoff?: ReleaseRunHandoff; loading: boolean }) {
  if (loading && !handoff) {
    return <p className="release-flow__hint">운영자 handoff를 불러오는 중입니다...</p>;
  }
  if (!handoff) return null;
  return (
    <div className="release-flow__handoff">
      <div className="release-flow__handoff-head">
        <div>
          <strong>{handoff.headline}</strong>
          <p className="release-flow__hint">
            Wave {handoff.current_wave} / {handoff.total_waves} | {handoff.live_side_effects ? '라이브 영향 있음' : '데모/dry-run'}
          </p>
        </div>
        <div className="release-flow__handoff-actions">
          <Badge tone={handoffTone(handoff.severity)}>{handoff.severity}</Badge>
          <Button size="sm" variant="ghost" onClick={() => copyHandoffMarkdown(handoff)}>handoff 복사</Button>
        </div>
      </div>
      <div className="release-flow__handoff-grid">
        <div>
          <span className="release-flow__handoff-label">다음 작업</span>
          <div className="release-flow__handoff-list">
            {handoff.next_actions.slice(0, 4).map(action => (
              <span
                key={action.action}
                className={action.enabled ? '' : 'release-flow__handoff-disabled'}
                title={action.reason}
              >
                {action.label}
                {action.reason ? ` - ${action.reason}` : ''}
              </span>
            ))}
          </div>
        </div>
        <div>
          <span className="release-flow__handoff-label">체크</span>
          <div className="release-flow__handoff-list">
            {handoff.checks.slice(0, 6).map(check => (
              <span key={check.name}>
                {check.name}: {check.status}
              </span>
            ))}
          </div>
        </div>
        {handoff.verification && (
          <div>
            <span className="release-flow__handoff-label">검증</span>
            <div className="release-flow__handoff-list">
              <span>{handoff.verification.status}: {handoff.verification.message}</span>
              {handoff.verification.evidence.slice(0, 2).map(item => <span key={item}>{item}</span>)}
              {Number(handoff.verification.job_count ?? 0) > 0 && <span>검증 작업 {handoff.verification.job_count}개 대기 중</span>}
              {handoff.verification.jobs?.slice(0, 2).map(job => (
                <span key={job.job_id}>{verificationJobSummary(job)}</span>
              ))}
              {handoff.verification.override_reason && <span>{handoff.verification.override_reason}</span>}
            </div>
          </div>
        )}
        {handoff.abort_criteria && (
          <div>
            <span className="release-flow__handoff-label">롤백 기준</span>
            <div className="release-flow__handoff-list">
              <span>{handoff.abort_criteria.status}: {handoff.abort_criteria.message}</span>
              {handoff.abort_criteria.criteria.slice(0, 2).map(item => <span key={item}>{item}</span>)}
              {handoff.abort_criteria.override_reason && <span>{handoff.abort_criteria.override_reason}</span>}
            </div>
          </div>
        )}
        {handoff.change_freeze && (
          <div>
            <span className="release-flow__handoff-label">변경 동결</span>
            <div className="release-flow__handoff-list">
              <span>{handoff.change_freeze.status}: {handoff.change_freeze.message}</span>
              {(handoff.change_freeze.start || handoff.change_freeze.end) && <span>{handoff.change_freeze.start || '?'}부터 {handoff.change_freeze.end || '?'}까지</span>}
              {handoff.change_freeze.production_targets.slice(0, 2).map(item => <span key={item}>{item}</span>)}
              {handoff.change_freeze.override_reason && <span>{handoff.change_freeze.override_reason}</span>}
            </div>
          </div>
        )}
        {handoff.policy_overrides.length > 0 && (
          <div>
            <span className="release-flow__handoff-label">정책 예외</span>
            <div className="release-flow__handoff-list">
              {handoff.policy_overrides.slice(0, 4).map(override => (
                <span key={`${override.source}-${override.reason}`}>
                  {override.source}: {override.reason}
                  {override.production_targets.length > 0 ? ` (${override.production_targets.slice(0, 2).join(', ')})` : ''}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {handoff.last_event && (
        <p className="release-flow__hint">
          마지막 이벤트: {getString(handoff.last_event.event_type)} {getString(handoff.last_event.message) && `- ${getString(handoff.last_event.message)}`}
        </p>
      )}
    </div>
  );
}

function handoffTone(value?: string) {
  if (value === 'danger') return 'danger' as const;
  if (value === 'warning') return 'warning' as const;
  if (value === 'success') return 'success' as const;
  if (value === 'neutral') return 'neutral' as const;
  return 'info' as const;
}

function verificationJobTarget(target: Record<string, unknown>) {
  return getString(target.url) || getString(target.path) || getString(target.service_name) || 'verification target';
}

function verificationJobSummary(job: { kind: string; status: string; target: Record<string, unknown>; result?: Record<string, unknown>; error?: string }) {
  const target = verificationJobTarget(job.target);
  const error = getString(job.error);
  const result = job.result || {};
  const statusCode = getString(result.status_code);
  const resultSuffix = error || (statusCode ? `HTTP ${statusCode}` : '');
  return `${job.kind} ${job.status}: ${target}${resultSuffix ? ` - ${resultSuffix}` : ''}`;
}

function copyPreviewMarkdown(preview: ReleasePlanPreview, liveSideEffects: boolean) {
  copyText(formatPreviewMarkdown(preview, liveSideEffects), '릴리즈 미리보기를 복사했습니다.', '릴리즈 미리보기 복사');
}

function formatPreviewMarkdown(preview: ReleasePlanPreview, liveSideEffects: boolean): string {
  const lines = [
    `## 릴리즈 실행 미리보기: ${preview.executable ? '준비됨' : '막힘'}`,
    '',
    `- 모드: ${liveSideEffects ? '라이브 영향 있음' : '데모/dry-run'}`,
    `- 요약: ${preview.summary}`,
    `- Wave: ${preview.waves.length}`,
    `- 단계: ${preview.steps.length}`,
  ];
  if (preview.blockers.length > 0) {
    lines.push('', '막힌 항목:', ...preview.blockers.slice(0, 8).map(blocker => `- ${blocker}`));
  }
  if (preview.waves.length > 0) {
    lines.push('', 'Wave:');
    lines.push(...preview.waves.map(wave => `- Wave ${wave.wave}: ${wave.applications.join(' -> ') || '-'}`));
  }
  if (preview.steps.length > 0) {
    lines.push('', '단계:');
    lines.push(...preview.steps.slice(0, 12).map(step => `- ${step.name || step.application_id}: ${step.environment}, ${valueLabel(step.strategy)}, 게이트 ${valueLabel(step.gate)}`));
  }
  return lines.join('\n');
}

function copyAuditMarkdown(events: ReleaseAuditEvent[], scopeLabel: string, eventType: string) {
  copyText(formatAuditMarkdown(events, scopeLabel, eventType), '릴리즈 감사 로그를 복사했습니다.', '릴리즈 감사 로그 복사');
}

function formatAuditMarkdown(events: ReleaseAuditEvent[], scopeLabel: string, eventType: string): string {
  const lines = [
    `## 릴리즈 감사 로그: ${auditScopeText(scopeLabel, eventType)}`,
    '',
    `- 이벤트: ${events.length}`,
    `- 필터: ${eventType || '전체'}`,
  ];
  const first = events[0];
  if (first) {
    lines.push(`- 플랜: ${first.plan_name}`, `- 최근 실행: ${shortId(first.run_id)} / ${statusLabel(first.run_status || 'unknown')}`);
  }
  lines.push('', '최근 이벤트:');
  lines.push(...events.slice(0, 12).map(event => {
    const meta = releaseEventMeta(event);
    return `- ${event.event_type}: ${event.message} (${shortId(event.run_id)} / ${event.run_status || 'unknown'}${meta ? ` / ${meta}` : ''})`;
  }));
  return lines.join('\n');
}

function copyReadinessMarkdown(readiness: ReleaseReadiness) {
  copyText(formatReadinessMarkdown(readiness), '릴리즈 준비 상태를 복사했습니다.', '릴리즈 준비 상태 복사');
}

function formatReadinessMarkdown(readiness: ReleaseReadiness): string {
  const impact = readiness.impact;
  const lines = [
    `## 릴리즈 준비 상태: ${readiness.ready ? '준비됨' : '막힘'}`,
    '',
    `- 모드: ${readiness.mode}`,
    `- 요약: ${readiness.summary}`,
  ];
  if (impact) {
    lines.push(
      `- 애플리케이션: ${impact.applications.join(', ') || impact.total_steps}`,
      `- 환경: ${impact.environments.join(', ') || '-'}`,
      `- Wave: ${impact.total_waves}`,
      `- 운영 대상: ${impact.production_target_count}`,
      `- 영향: ${impact.summary}`,
    );
    if (impact.first_wave_steps.length > 0) {
      lines.push('', '첫 Wave:', ...impact.first_wave_steps.slice(0, 6).map(step => `- ${step.name || step.application_id} (${step.environment}, ${valueLabel(step.strategy)})`));
    }
  }
  if (readiness.next_actions.length > 0) {
    lines.push('', '다음 작업:');
    lines.push(...readiness.next_actions.slice(0, 8).map(action => `- ${readinessStatusLabel(action.severity)}: ${action.label} - ${action.blockers[0] ?? action.message}`));
  }
  lines.push('', '체크:');
  lines.push(...readiness.checks.slice(0, 12).map(check => `- ${check.name}: ${readinessStatusLabel(check.status)} - ${check.blockers[0] ?? check.message}`));
  return lines.join('\n');
}

function copyHandoffMarkdown(handoff: ReleaseRunHandoff) {
  copyText(formatHandoffMarkdown(handoff), '운영자 handoff를 복사했습니다.', '운영자 handoff 복사');
}

function copyReleaseRunReport(run: ReleaseRun, handoff?: ReleaseRunHandoff, serverMarkdown?: string) {
  copyText(serverMarkdown || formatReleaseRunReport(run, handoff), '릴리즈 실행 리포트를 복사했습니다.', '릴리즈 실행 리포트 복사');
}

function formatReleaseRunReport(run: ReleaseRun, handoff?: ReleaseRunHandoff): string {
  const url = new URL(window.location.href);
  url.searchParams.set('run_id', run.run_id);
  const status = run.derived_status ?? run.status;
  const attention = recordValue(run.attention);
  const attentionReasons = getStringArray(attention.reasons);
  const lines = [
    `## 릴리즈 실행 리포트: ${run.plan_name}`,
    '',
    `- 실행: ${run.run_id}`,
    `- 상태: ${statusLabel(status)}`,
    `- Wave: ${run.current_wave} / ${run.total_waves}`,
    `- 모드: ${releaseRunModeLabel(run)}`,
    `- 헬스: ${healthLabel(getString(run.health.status, 'pending'))}`,
    `- 링크: ${url.toString()}`,
  ];
  if (attentionReasons.length > 0) {
    lines.push('', '확인 필요:', ...attentionReasons.map(reason => `- ${reason}`));
  }
  const targetLines = releaseRunTargetLines(run);
  if (targetLines.length > 0) {
    lines.push('', '대상:', ...targetLines);
  }
  const approvalLines = releaseRunApprovalLines(run);
  if (approvalLines.length > 0) {
    lines.push('', '승인:', ...approvalLines);
  }
  if (handoff) {
    lines.push('', '운영자 handoff:', `- ${handoff.headline}`, `- 심각도: ${handoff.severity}`);
    lines.push(...handoff.next_actions.slice(0, 5).map(action => `- ${action.enabled ? '[ ]' : '[blocked]'} ${action.label}${action.reason ? `: ${action.reason}` : ''}`));
    lines.push('', '체크:');
    lines.push(...handoff.checks.slice(0, 8).map(check => `- ${check.name}: ${check.status} (${check.message})`));
    lines.push(...policyOverrideMarkdownLines(handoff));
    if (handoff.verification) {
      lines.push('', '검증:', `- ${handoff.verification.status}: ${handoff.verification.message}`);
      lines.push(...handoff.verification.evidence.slice(0, 3).map(item => `- 증거: ${item}`));
      lines.push(...(handoff.verification.jobs ?? []).slice(0, 3).map(job => `- 작업: ${verificationJobSummary(job)}`));
      if (handoff.verification.override_reason) lines.push(`- 예외: ${handoff.verification.override_reason}`);
    }
    if (handoff.abort_criteria) {
      lines.push('', '롤백 기준:', `- ${handoff.abort_criteria.status}: ${handoff.abort_criteria.message}`);
      lines.push(...handoff.abort_criteria.criteria.slice(0, 3).map(item => `- ${item}`));
      if (handoff.abort_criteria.override_reason) lines.push(`- 예외: ${handoff.abort_criteria.override_reason}`);
    }
    if (handoff.change_freeze) {
      lines.push('', '변경 동결:', `- ${handoff.change_freeze.status}: ${handoff.change_freeze.message}`);
      if (handoff.change_freeze.start || handoff.change_freeze.end) lines.push(`- 기간: ${handoff.change_freeze.start || '?'}부터 ${handoff.change_freeze.end || '?'}까지`);
      if (handoff.change_freeze.production_targets.length > 0) lines.push(`- 대상: ${handoff.change_freeze.production_targets.slice(0, 5).join(', ')}`);
      if (handoff.change_freeze.override_reason) lines.push(`- 예외: ${handoff.change_freeze.override_reason}`);
    }
  }
  const timelineSummary = releaseRunTimelineSummaryLines(run.events);
  if (timelineSummary.length > 0) {
    lines.push('', '타임라인 요약:', ...timelineSummary);
  }
  lines.push('', '단계:');
  lines.push(...run.steps.slice(0, 12).map(step => {
    const health = getString(recordValue(step.health).status);
    const details = [getString(step.details.environment), getString(step.details.strategy), getString(step.details.gate)]
      .filter(Boolean)
      .join(' / ');
    return `- Wave ${step.wave} ${step.name}: ${statusLabel(step.status)}${health ? `, 헬스 ${healthLabel(health)}` : ''}${details ? ` (${details})` : ''}`;
  }));
  if (run.events.length > 0) {
    lines.push('', '최근 타임라인:');
    lines.push(...run.events.slice(0, 8).map(event => `- ${event.event_type}: ${event.message || '기록됨'}${event.created_at ? ` (${event.created_at})` : ''}`));
  }
  return lines.join('\n');
}

function releaseRunApprovalLines(run: ReleaseRun): string[] {
  return run.steps
    .map(step => {
      const approvalId = approvalIdForStep(step);
      if (!approvalId) return '';
      const details = recordValue(step.details);
      const approval = recordValue(details.approval);
      const decision = approvalDecisionForStep(step) ?? getString(approval.status, 'pending');
      const reason = getString(approval.reason);
      const gate = getString(details.gate, getString(approval.gate));
      const suffix = [gate ? `gate ${gate}` : '', reason ? `reason ${reason}` : ''].filter(Boolean).join(' / ');
      return `- ${step.name || step.application_id}: ${approvalId} / ${decision}${suffix ? ` / ${suffix}` : ''}`;
    })
    .filter(Boolean)
    .slice(0, 12);
}

function releaseRunTimelineSummaryLines(events: ReleaseRun['events']): string[] {
  if (events.length === 0) return [];
  const counts = events.reduce<Record<string, number>>((acc, event) => {
    const eventType = event.event_type || 'event';
    acc[eventType] = (acc[eventType] ?? 0) + 1;
    return acc;
  }, {});
  const latest = events[0];
  const lines = [
    `- Events in report: ${events.length}`,
    `- Latest: ${latest.event_type || 'event'} - ${latest.message || 'recorded'}`,
  ];
  lines.push(...Object.entries(counts)
    .sort(([aType, aCount], [bType, bCount]) => bCount - aCount || aType.localeCompare(bType))
    .slice(0, 6)
    .map(([eventType, count]) => `- ${eventType}: ${count}`));
  return lines;
}

function policyOverrideMarkdownLines(handoff: ReleaseRunHandoff): string[] {
  if (handoff.policy_overrides.length === 0) return [];
  return [
    '',
    '정책 예외:',
    ...handoff.policy_overrides.slice(0, 8).map(override => {
      const targets = override.production_targets.length > 0 ? ` / 대상: ${override.production_targets.slice(0, 5).join(', ')}` : '';
      return `- ${override.source}: ${override.reason}${targets}`;
    }),
  ];
}

function releaseRunTargetLines(run: ReleaseRun): string[] {
  return run.steps.slice(0, 12).map(step => {
    const details = recordValue(step.details);
    const config = recordValue(details.config);
    const dispatch = recordValue(details.dispatch);
    const workflow = recordValue(step.workflow);
    const values = [
      step.application_id || step.name || 'application',
      firstLabel('클러스터', getString(details.cluster_id), getString(config.cluster_id), getString(dispatch.cluster_id)),
      firstLabel('네임스페이스', getString(details.namespace), getString(config.namespace), getString(dispatch.namespace)),
      firstLabel('워크플로', getString(step.workflow_run_id), getString(workflow.workflow_run_id), getString(dispatch.workflow_run_id)),
      firstLabel('레포', getString(config.repo_ref), getString(dispatch.repo_ref)),
      firstLabel('커밋', getString(config.commit_sha), getString(dispatch.commit_sha)),
      firstLabel('매니페스트', getString(config.manifest_path), getString(dispatch.manifest_path)),
    ].filter(Boolean);
    return `- ${values.join(' / ')}`;
  });
}

function formatHandoffMarkdown(handoff: ReleaseRunHandoff): string {
  const url = new URL(window.location.href);
  url.searchParams.set('run_id', handoff.run_id);
  const lines = [
    `## 릴리즈 handoff: ${handoff.plan_name}`,
    '',
    `- 실행: ${handoff.run_id}`,
    `- 상태: ${statusLabel(handoff.status)} / 심각도 ${handoff.severity}`,
    `- Wave: ${handoff.current_wave} / ${handoff.total_waves}`,
    `- 모드: ${handoff.live_side_effects ? '라이브 영향 있음' : '데모/dry-run'}`,
    `- 링크: ${url.toString()}`,
    '',
    `헤드라인: ${handoff.headline}`,
  ];
  if (handoff.attention_reasons.length > 0) {
    lines.push('', '확인 필요:', ...handoff.attention_reasons.map(reason => `- ${reason}`));
  }
  lines.push('', '다음 작업:');
  lines.push(...handoff.next_actions.slice(0, 6).map(action => `- ${action.enabled ? '[ ]' : '[blocked]'} ${action.label}${action.reason ? `: ${action.reason}` : ''}`));
  lines.push('', '체크:');
  lines.push(...handoff.checks.slice(0, 8).map(check => `- ${check.name}: ${check.status} (${check.message})`));
  lines.push(...policyOverrideMarkdownLines(handoff));
  if (handoff.verification) {
    lines.push('', '검증:', `- ${handoff.verification.status}: ${handoff.verification.message}`);
    lines.push(...handoff.verification.evidence.slice(0, 3).map(item => `- 증거: ${item}`));
    lines.push(...(handoff.verification.jobs ?? []).slice(0, 3).map(job => `- 작업: ${verificationJobSummary(job)}`));
    if (handoff.verification.override_reason) lines.push(`- 예외: ${handoff.verification.override_reason}`);
  }
  if (handoff.abort_criteria) {
    lines.push('', '롤백 기준:', `- ${handoff.abort_criteria.status}: ${handoff.abort_criteria.message}`);
    lines.push(...handoff.abort_criteria.criteria.slice(0, 3).map(item => `- ${item}`));
    if (handoff.abort_criteria.override_reason) lines.push(`- 예외: ${handoff.abort_criteria.override_reason}`);
  }
  if (handoff.change_freeze) {
    lines.push('', '변경 동결:', `- ${handoff.change_freeze.status}: ${handoff.change_freeze.message}`);
    if (handoff.change_freeze.start || handoff.change_freeze.end) lines.push(`- 기간: ${handoff.change_freeze.start || '?'}부터 ${handoff.change_freeze.end || '?'}까지`);
    if (handoff.change_freeze.production_targets.length > 0) lines.push(`- 대상: ${handoff.change_freeze.production_targets.slice(0, 5).join(', ')}`);
    if (handoff.change_freeze.override_reason) lines.push(`- 예외: ${handoff.change_freeze.override_reason}`);
  }
  if (handoff.last_event) {
    const eventType = getString(handoff.last_event.event_type, 'event');
    const message = getString(handoff.last_event.message);
    lines.push('', `마지막 이벤트: ${eventType}${message ? ` - ${message}` : ''}`);
  }
  return lines.join('\n');
}

function copyReleaseRunLink(runId: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('run_id', runId);
  copyText(url.toString(), '릴리즈 실행 링크를 복사했습니다.', '릴리즈 실행 링크 복사');
}

function releaseRunModeLabel(run: ReleaseRun): string {
  const runtimeMode = getString(run.settings.runtime_mode, getString(run.settings.provider_mode, 'demo'));
  return runtimeMode === 'live' ? '라이브 영향 있음' : '데모/dry-run';
}

function copyText(value: string, successMessage: string, fallbackTitle: string) {
  const clipboard = window.navigator.clipboard;
  if (clipboard?.writeText) {
    void clipboard.writeText(value).then(
      () => window.alert(successMessage),
      () => window.prompt(fallbackTitle, value),
    );
    return;
  }
  window.prompt(fallbackTitle, value);
}

function RecentRunShortcuts({
  summary,
  selectedRunId,
  onSelect,
}: {
  summary?: ReleaseRunSummary;
  selectedRunId: string;
  onSelect: (runId: string) => void;
}) {
  const recentRuns = (summary?.recent_runs ?? []).slice(0, 5);
  if (recentRuns.length === 0) return null;
  return (
    <div className="release-flow__recent-runs" aria-label="최근 릴리즈 실행">
      {recentRuns.map(run => {
        const reason = run.attention_reasons?.[0];
        return (
          <button
            key={run.run_id}
            type="button"
            className="release-flow__recent-run"
            aria-pressed={selectedRunId === run.run_id}
            onClick={() => onSelect(run.run_id)}
          >
            <span>
              <strong>{shortId(run.run_id)}</strong>
              <small>{statusLabel(run.status)}</small>
            </span>
            {reason && <em>{reason}</em>}
          </button>
        );
      })}
    </div>
  );
}

function RunFilterField({
  runFilter,
  onRunFilterChange,
}: {
  runFilter: ReleaseRunFilter;
  onRunFilterChange: (filter: ReleaseRunFilter) => void;
}) {
  return (
    <Field label="실행 필터">
      <select className="input" value={runFilter} onChange={e => onRunFilterChange(e.target.value as ReleaseRunFilter)}>
        <option value="all">모든 실행</option>
        <option value="attention">확인 필요</option>
        <option value="stale">오래됨</option>
        <option value="active">활성</option>
        <option value="live">라이브</option>
        <option value="succeeded">성공</option>
        <option value="failed">실패</option>
        <option value="paused">일시정지</option>
        <option value="cancelled">취소됨</option>
        <option value="rollback_requested">롤백 요청</option>
        <option value="unhealthy">비정상</option>
        <option value="verification_failed">검증 실패</option>
        <option value="verification_pending_timeout">검증 타임아웃</option>
        <option value="policy_override">정책 예외</option>
        <option value="active_change_freeze">변경 동결 활성</option>
        <option value="change_freeze_override">변경 동결 예외</option>
        <option value="waiting_for_approval">승인 대기</option>
      </select>
    </Field>
  );
}

type RunSummarySignal = {
  label: string;
  count: number;
  filter?: ReleaseRunFilter;
};

function RunSummary({
  summary,
  runFilter,
  onRunFilterChange,
}: {
  summary?: ReleaseRunSummary;
  runFilter: ReleaseRunFilter;
  onRunFilterChange: (filter: ReleaseRunFilter) => void;
}) {
  if (!summary) return null;
  const statuses = Object.entries(summary.status_breakdown).sort(([left], [right]) => left.localeCompare(right));
  const policyOverrideSources = Object.entries(summary.policy_override_breakdown ?? {})
    .sort(([leftSource, leftCount], [rightSource, rightCount]) => rightCount - leftCount || leftSource.localeCompare(rightSource))
    .slice(0, 6);
  const opsSignals: RunSummarySignal[] = [
    { label: '확인 필요', count: summary.attention_required_runs ?? 0, filter: 'attention' },
    { label: '활성', count: summary.active_runs ?? 0, filter: 'active' },
    { label: '라이브', count: summary.live_runs ?? 0, filter: 'live' },
    { label: '성공', count: summary.succeeded_runs ?? 0, filter: 'succeeded' },
    { label: '실패', count: summary.failed_runs ?? 0, filter: 'failed' },
    { label: '일시정지', count: summary.paused_runs ?? 0, filter: 'paused' },
    { label: '취소됨', count: summary.cancelled_runs ?? 0, filter: 'cancelled' },
    { label: '롤백', count: summary.rollback_requested_runs ?? 0, filter: 'rollback_requested' },
    { label: '승인 대기', count: summary.waiting_for_approval_runs ?? 0, filter: 'waiting_for_approval' },
    { label: '비정상', count: summary.unhealthy_runs ?? 0, filter: 'unhealthy' },
    { label: '검증 실패', count: summary.verification_failed_runs ?? 0, filter: 'verification_failed' },
    { label: '검증 타임아웃', count: summary.verification_pending_timeout_runs ?? 0, filter: 'verification_pending_timeout' },
    { label: '정책 예외', count: summary.policy_override_runs ?? 0, filter: 'policy_override' },
    { label: '동결 예외', count: summary.change_freeze_override_runs ?? 0, filter: 'change_freeze_override' },
    { label: '동결 활성', count: summary.active_change_freeze_runs ?? 0, filter: 'active_change_freeze' },
    { label: '오래됨', count: summary.stale_runs ?? 0, filter: 'stale' },
  ];
  return (
    <div className="release-flow__summary">
      <button
        type="button"
        className="release-flow__summary-card"
        aria-pressed={runFilter === 'all'}
        onClick={() => onRunFilterChange('all')}
      >
        <span>전체 실행</span>
        <strong>{summary.total_runs}</strong>
      </button>
      {opsSignals.map(signal => {
        const filter = signal.filter;
        if (!filter) {
          return (
            <div key={signal.label} className="release-flow__summary-card">
              <span>{signal.label}</span>
              <strong>{signal.count}</strong>
            </div>
          );
        }
        return (
          <button
            key={signal.label}
            type="button"
            className="release-flow__summary-card"
            aria-pressed={runFilter === filter}
            onClick={() => onRunFilterChange(filter)}
          >
            <span>{signal.label}</span>
            <strong>{signal.count}</strong>
          </button>
        );
      })}
      {policyOverrideSources.map(([source, count]) => {
        const filter = `policy_override_source:${source}` as ReleaseRunFilter;
        return (
          <button
            key={`policy-override-${source}`}
            type="button"
            className="release-flow__summary-card"
            aria-pressed={runFilter === filter}
            onClick={() => onRunFilterChange(filter)}
          >
            <span>{source}</span>
            <strong>{count}</strong>
          </button>
        );
      })}
      {summary.last_run_status && (
        <div className="release-flow__summary-card">
          <span>최근 상태</span>
          <strong>{statusLabel(summary.last_run_status)}</strong>
        </div>
      )}
      {statuses.length > 0 ? statuses.map(([status, count]) => (
        <div key={status} className="release-flow__summary-card">
          <span>{statusLabel(status)}</span>
          <strong>{count}</strong>
        </div>
      )) : (
        <div className="release-flow__summary-card">
          <span>상태</span>
          <strong>없음</strong>
        </div>
      )}
    </div>
  );
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) {
    return <Card title="진단"><p className="release-flow__hint">현재 경고나 오류가 없습니다.</p></Card>;
  }
  return (
    <Card title={`진단 ${diagnostics.length}`}>
      <div className="release-flow__diag-list">
        {diagnostics.map((diag, i) => (
          <div key={`${diag.code}-${i}`} className={`release-flow__diag release-flow__diag--${diag.severity}`}>
            <strong>{diag.message}</strong>
            <div className="release-flow__diag-meta">
              <span className="release-flow__hint">{diag.path ?? `${diag.line}:${diag.column}`}</span>
              {diag.action && <span className="release-flow__action">{actionLabel(diag.action)}</span>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AuditPanel({
  events,
  loading,
  exporting,
  scopedRunId,
  eventType,
  onEventTypeChange,
  onExport,
}: {
  events: ReleaseAuditEvent[];
  loading: boolean;
  exporting: boolean;
  scopedRunId: string;
  eventType: string;
  onEventTypeChange: (eventType: string) => void;
  onExport: () => void;
}) {
  const scopeLabel = scopedRunId ? `실행 ${shortId(scopedRunId)}` : '현재 플랜';
  const actions = (
    <>
      <Badge tone="info">{scopeLabel}</Badge>
      {eventType && <Badge tone="warning">{eventType}</Badge>}
      <Button size="sm" variant="ghost" disabled={events.length === 0} onClick={() => copyAuditMarkdown(events, scopeLabel, eventType)}>감사 로그 복사</Button>
      <Button size="sm" loading={exporting} disabled={exporting} onClick={onExport}>CSV 내보내기</Button>
    </>
  );
  if (loading && events.length === 0) {
    return (
      <Card
        title="감사 로그"
        actions={actions}
      >
        <AuditEventFilter value={eventType} onChange={onEventTypeChange} />
        <p className="release-flow__hint">감사 이벤트를 불러오는 중입니다...</p>
      </Card>
    );
  }
  if (events.length === 0) {
    return (
      <Card
        title="감사 로그"
        actions={actions}
      >
        <AuditEventFilter value={eventType} onChange={onEventTypeChange} />
        <p className="release-flow__hint">{auditScopeText(scopeLabel, eventType)}에 대한 감사 이벤트가 아직 없습니다.</p>
      </Card>
    );
  }
  return (
    <Card
      title="감사 로그"
      actions={actions}
    >
      <AuditEventFilter value={eventType} onChange={onEventTypeChange} />
      <div className="release-flow__timeline">
        {events.slice(0, 8).map(event => {
          const meta = releaseEventMeta(event);
          return (
            <div key={event.audit_id} className="release-flow__timeline-row">
              <span>{event.event_type}</span>
              <strong>{event.message}</strong>
              <small>
                {shortId(event.run_id)} / {statusLabel(event.run_status || 'unknown')}
                {event.application_ids.length > 0 ? ` / ${event.application_ids.join(', ')}` : ''}
                {meta ? ` / ${meta}` : ''}
              </small>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AuditEventFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (eventType: string) => void;
}) {
  return (
    <Field label="감사 이벤트">
      <select className="input" value={value} onChange={event => onChange(event.target.value)}>
        {AUDIT_EVENT_FILTERS.map(([key, label]) => (
          <option key={key || 'all'} value={key}>{label}</option>
        ))}
      </select>
    </Field>
  );
}

function auditScopeText(scopeLabel: string, eventType: string): string {
  return eventType ? `${scopeLabel} / ${eventType}` : scopeLabel;
}

function draftPlan(apps: Application[]): ReleasePlan {
  const steps = apps.slice(0, 3).map((app, index) => releaseStepFromApp(app, index, index === 0 ? [] : [apps[index - 1].application_id]));
  return {
    name: '서비스 릴리즈 플로우',
    description: '실행 전에 여러 레포 변경, 게이트, 롤아웃 정책 순서를 정합니다.',
    status: 'draft',
    settings: { ...DEFAULT_POLICY },
    steps,
  };
}

function emptyDraftPlan(apps: Application[]): ReleasePlan {
  return {
    name: '새 릴리즈 플랜',
    description: '',
    status: 'draft',
    settings: { ...DEFAULT_POLICY },
    steps: apps.length === 1 ? [releaseStepFromApp(apps[0], 0)] : [],
  };
}

function demoReleaseApplications(): Application[] {
  return [
    {
      application_id: 'demo-storefront-web',
      name: 'Storefront Web',
      repo_ref: 'JEONWOOHYUN-hydromel/demo-storefront-web',
      branch: 'main',
      cluster_id: 'demo-target-cluster',
      manifest_path: 'k8s/storefront/deployment.yaml',
      last_run_status: 'succeeded',
    },
    {
      application_id: 'demo-orders-api',
      name: 'Orders API',
      repo_ref: 'JEONWOOHYUN-hydromel/demo-orders-api',
      branch: 'main',
      cluster_id: 'demo-target-cluster',
      manifest_path: 'k8s/orders/deployment.yaml',
      last_run_status: 'running',
    },
    {
      application_id: 'demo-release-manifests',
      name: 'Release Manifests',
      repo_ref: 'JEONWOOHYUN-hydromel/demo-release-manifests',
      branch: 'main',
      cluster_id: 'demo-target-cluster',
      manifest_path: 'release-plan.yaml',
      last_run_status: 'waiting_for_approval',
    },
  ];
}

function uniqueApplicationId(repoRef: string, apps: Application[]): string {
  const base = (repoRef.split('/').pop() || repoRef || 'repo')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'repo';
  const existing = new Set(apps.map(app => app.application_id));
  if (!existing.has(base)) return base;
  let index = 2;
  while (existing.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function releaseStepFromApp(app: Application, index: number, dependsOn: string[] = []): ReleasePlanStep {
  return {
    application_id: app.application_id,
    name: app.name,
    position: index,
    depends_on: dependsOn,
    config: defaultStepConfig(app, index),
  };
}

function setPlanApplicationSelected(plan: ReleasePlan, app: Application, selected: boolean): ReleasePlan {
  const exists = plan.steps.some(step => step.application_id === app.application_id);
  if (selected && exists) return plan;
  if (selected) {
    const dependsOn = plan.steps.length ? [plan.steps[plan.steps.length - 1].application_id] : [];
    return { ...plan, steps: normalizeSteps([...plan.steps, releaseStepFromApp(app, plan.steps.length, dependsOn)]) };
  }
  const steps = plan.steps
    .filter(step => step.application_id !== app.application_id)
    .map(step => ({ ...step, depends_on: step.depends_on.filter(id => id !== app.application_id) }));
  return { ...plan, steps: normalizeSteps(steps) };
}

function defaultStepConfig(app: Application, index: number): Record<string, unknown> {
  return {
    branch: app.branch,
    manifest_path: app.manifest_path,
    environment: index === 0 ? 'sandbox' : 'staging',
    namespace: 'sandbox',
    replicas: 2,
    commit_sha: index === 0 ? 'abc1234' : 'def5678',
    image: index === 0 ? 'ghcr.io/example/checkout-api:v1.4.3' : 'ghcr.io/example/cart-api:v2.1.0',
    strategy: 'rolling',
    approval_gate: 'inherit',
    health_check_path: '/readyz',
    timeout_seconds: 600,
    retry_attempts: 1,
  };
}

function selectedStep(plan: ReleasePlan | null, index = 0): ReleasePlanStep | undefined {
  return plan?.steps[index] ?? plan?.steps[0];
}

function normalizePlan(plan: ReleasePlan): ReleasePlan {
  return {
    ...plan,
    settings: { ...DEFAULT_POLICY, ...plan.settings },
    steps: normalizeSteps(plan.steps.map((step, index) => ({
      ...step,
      name: step.name || step.application_id,
      depends_on: step.depends_on ?? [],
      config: { ...defaultStepConfigFromStep(step, index), ...step.config },
    }))),
  };
}

function defaultStepConfigFromStep(step: ReleasePlanStep, index: number): Record<string, unknown> {
  return {
    environment: index === 0 ? 'sandbox' : 'staging',
    namespace: 'sandbox',
    replicas: 2,
    strategy: 'rolling',
    approval_gate: 'inherit',
    health_check_path: '/readyz',
    timeout_seconds: 600,
    retry_attempts: 1,
    manifest_path: getString(step.config.manifest_path, 'deploy.yaml'),
    branch: getString(step.config.branch, 'main'),
    commit_sha: getString(step.config.commit_sha),
    image: getString(step.config.image),
  };
}

function normalizeSteps(steps: ReleasePlanStep[]): ReleasePlanStep[] {
  return steps.map((step, index) => ({ ...step, position: index }));
}

function addStep(plan: ReleasePlan, apps: Application[], setPlan: Dispatch<SetStateAction<ReleasePlan | null>>) {
  const existing = new Set(plan.steps.map(step => step.application_id));
  const app = apps.find(candidate => !existing.has(candidate.application_id)) ?? apps[0];
  if (!app) return;
  setPlan({
    ...plan,
    steps: normalizeSteps([
      ...plan.steps,
      {
        application_id: app.application_id,
        name: app.name,
        position: plan.steps.length,
        depends_on: plan.steps.length ? [plan.steps[plan.steps.length - 1].application_id] : [],
        config: defaultStepConfig(app, plan.steps.length),
      },
    ]),
  });
}

function removeStep(plan: ReleasePlan, index: number, setPlan: Dispatch<SetStateAction<ReleasePlan | null>>, setSelectedIndex: Dispatch<SetStateAction<number>>) {
  const removed = plan.steps[index]?.application_id;
  const steps = plan.steps
    .filter((_, i) => i !== index)
    .map(step => ({ ...step, depends_on: step.depends_on.filter(dep => dep !== removed) }));
  setPlan({ ...plan, steps: normalizeSteps(steps) });
  setSelectedIndex(Math.max(0, index - 1));
}

function moveStep(plan: ReleasePlan, index: number, delta: number, setPlan: Dispatch<SetStateAction<ReleasePlan | null>>, setSelectedIndex: Dispatch<SetStateAction<number>>) {
  const next = [...plan.steps];
  const target = index + delta;
  [next[index], next[target]] = [next[target], next[index]];
  setPlan({ ...plan, steps: normalizeSteps(next) });
  setSelectedIndex(target);
}

function setStepConfig(index: number, patch: Record<string, unknown>, setPlan: Dispatch<SetStateAction<ReleasePlan | null>>) {
  setPlan(current => current ? {
    ...current,
    steps: current.steps.map((step, i) => i === index ? { ...step, config: { ...step.config, ...patch } } : step),
  } : current);
}

function toggleDependency(index: number, dependency: string, checked: boolean, setPlan: Dispatch<SetStateAction<ReleasePlan | null>>) {
  setPlan(current => current ? {
    ...current,
    steps: current.steps.map((step, i) => {
      if (i !== index) return step;
      const deps = new Set(step.depends_on);
      if (checked) deps.add(dependency); else deps.delete(dependency);
      return { ...step, depends_on: [...deps] };
    }),
  } : current);
}

function withDiagnosticDefaults(plan: ReleasePlan | null, apps: Application[]): ReleasePlan | null {
  if (!plan) return null;
  const appById = new Map(apps.map(app => [app.application_id, app]));
  return normalizePlan({
    ...plan,
    steps: plan.steps.map(step => {
      const app = appById.get(step.application_id);
      return {
        ...step,
        config: {
          repo_ref: app?.repo_ref,
          branch: app?.branch,
          manifest_path: app?.manifest_path,
          ...step.config,
        },
      };
    }),
  });
}

function settingsBaselinesFor(apps: Application[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(apps.map(app => [app.application_id, {
    repo_ref: app.repo_ref,
    branch: app.branch,
    manifest_path: app.manifest_path,
    namespace: 'sandbox',
    replicas: 2,
  }]));
}

function actionLabel(action: string) {
  if (action === 'approval_required') return '승인 필요';
  if (action === 'safe_pr') return 'Safe PR';
  if (action === 'confirm') return '확인';
  return action;
}

type ReleaseUiTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

function toUiTone(tone: ReleaseFlowTone): ReleaseUiTone {
  return tone === 'ok' ? 'success' : tone === 'warn' ? 'warning' : tone;
}

function toneForStatus(status: string): ReleaseUiTone {
  const normalized = status.toLowerCase();
  if (['succeeded', 'healthy', 'completed'].includes(normalized)) return 'success';
  if (['failed', 'unhealthy', 'rollback_requested'].includes(normalized)) return 'danger';
  if (['paused', 'pending', 'waiting_for_approval'].includes(normalized)) return 'warning';
  if (['running', 'dispatched', 'progressing'].includes(normalized)) return 'info';
  return 'neutral';
}

function readinessStatusTone(status: string): ReleaseUiTone {
  const normalized = status.toLowerCase();
  if (normalized === 'passed') return 'success';
  if (normalized === 'blocked') return 'danger';
  if (normalized === 'warning') return 'warning';
  return 'info';
}

function readinessStatusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'blocked') return 'blocked';
  if (normalized === 'warning') return 'warning';
  if (normalized === 'passed') return 'passed';
  return 'info';
}

function readinessStatusLabel(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'passed') return '통과';
  if (normalized === 'blocked') return '막힘';
  if (normalized === 'warning') return '경고';
  return status ? valueLabel(status) : '정보';
}

function statusLabel(status: string): string {
  const normalized = status.toLowerCase();
  return {
    active: '활성',
    archived: '보관됨',
    blocked: '막힘',
    cancelled: '취소됨',
    completed: '완료',
    deployed: '배포됨',
    dispatched: '실행됨',
    draft: '초안',
    failed: '실패',
    healthy: '정상',
    paused: '일시정지',
    pending: '대기',
    progressing: '진행 중',
    queued: '대기',
    rejected: '거절됨',
    rollback_requested: '롤백 요청',
    running: '진행 중',
    skipped: '건너뜀',
    succeeded: '성공',
    unhealthy: '비정상',
    unknown: '알 수 없음',
    waiting_for_approval: '승인 대기',
  }[normalized] ?? valueLabel(status);
}

function healthLabel(status: string): string {
  const normalized = status.toLowerCase();
  return {
    degraded: '저하',
    healthy: '정상',
    pending: '대기',
    progressing: '진행 중',
    unhealthy: '비정상',
    unknown: '알 수 없음',
  }[normalized] ?? valueLabel(status);
}

function valueLabel(value: string): string {
  const normalized = value.toLowerCase();
  return {
    all_upstream_complete: '상위 단계 완료',
    auto: '자동',
    blocked: '막힘',
    canary: '카나리',
    demo: '데모',
    dry_run: 'dry-run',
    inherit: '플랜 정책 따르기',
    live: '라이브',
    low: '낮음',
    manual: '수동',
    manual_each_step: '단계별 수동 승인',
    manual_approved: '수동 승인 완료',
    medium: '중간',
    pending: '대기',
    policy: '정책',
    post_deploy: '배포 후',
    queued: '대기',
    rolling: '롤링',
    sequential: '순차',
    waiting: '대기 중',
  }[normalized] ?? value;
}

function shortId(value: string): string {
  return value.replace(/^workflow-/, '').slice(0, 8);
}

function firstReason(...reasons: string[]): string | undefined {
  return reasons.find(reason => reason.trim().length > 0);
}

function firstLabel(label: string, ...values: string[]): string {
  const value = values.find(item => item.trim().length > 0);
  return value ? `${label} ${value}` : '';
}

function releasePlanHasLiveSideEffects(plan: ReleasePlan | null): boolean {
  if (!plan) return false;
  const settings = recordValue(plan.settings);
  if (getString(settings.runtime_mode, getString(settings.provider_mode)) === 'live') return true;
  return plan.steps.some(step => {
    const config = recordValue(step.config);
    return getString(config.runtime_mode, getString(config.provider_mode)) === 'live' || config.live_side_effects === true;
  });
}

type ReleaseOperatorAction = 'retry' | 'resume' | 'pause' | 'rollback' | 'cancel' | 'notify';

function operatorActionReason(action: ReleaseOperatorAction, run: ReleaseRun, status: string, attentionReasons: string[]): string {
  const runLabel = `run ${shortId(run.run_id)}`;
  const health = getString(run.health.status, 'unknown');
  const signal = attentionReasons[0] || `${status} / health ${health}`;
  switch (action) {
    case 'retry':
      return `${runLabel}: retry current wave after reviewing ${signal}`;
    case 'resume':
      return `${runLabel}: resume after operator confirmed blockers are cleared`;
    case 'pause':
      return `${runLabel}: pause before next release action to investigate ${signal}`;
    case 'rollback':
      return `${runLabel}: request rollback because user impact or rollback criteria were confirmed`;
    case 'cancel':
      return `${runLabel}: cancel release run to stop further automated progress`;
    case 'notify':
      return `${runLabel}: notify release owner about ${signal}`;
    default:
      return `${runLabel}: operator action requested`;
  }
}

function withOperatorReason(title: string, fallback: string, submit: (reason: string) => void) {
  const reason = promptOperatorReason(title, fallback);
  if (reason === null) return;
  submit(reason);
}

function withConfirmedOperatorReason(title: string, fallback: string, confirmation: string, submit: (reason: string) => void) {
  const reason = promptOperatorReason(title, fallback);
  if (reason === null) return;
  if (!window.confirm(`${confirmation}\n\nReason:\n${reason}`)) return;
  submit(reason);
}

function promptOperatorReason(title: string, fallback: string): string | null {
  const reason = window.prompt(`${title} reason`, fallback);
  if (reason === null) return null;
  const normalized = reason.trim();
  return normalized || fallback;
}

function releaseStepMeta(step: ReleaseRun['steps'][number]): string[] {
  const details = recordValue(step.details);
  const evidence = recordValue(details.evidence);
  const incident = recordValue(details.incident);
  const evidenceBundle = recordValue(details.evidence_bundle);
  const rca = recordValue(details.rca);
  const recovery = recordValue(details.recovery);
  const safePr = recordValue(details.safe_pr);
  const command = recordValue(details.command);
  const items: string[] = [];
  const evidenceKey = getString(evidence.evidence_key);
  const failedProviders = getStringArray(evidence.failed_providers);
  const pendingProviders = getStringArray(evidence.pending_providers);
  const symptom = getString(incident.symptom);
  const missingEvidence = arrayValue(evidenceBundle.missing_evidence);
  const rootCause = getString(rca.root_cause);
  const reasonCode = getString(rca.reason_code);
  if (evidenceKey) items.push(`evidence ${shortId(evidenceKey)}`);
  if (failedProviders.length) items.push(`collection failed ${failedProviders.join(', ')}`);
  if (pendingProviders.length) items.push(`collection pending ${pendingProviders.join(', ')}`);
  if (symptom) items.push(`incident ${symptom}`);
  if (typeof evidenceBundle.complete === 'boolean') {
    items.push(evidenceBundle.complete ? 'evidence complete' : `missing ${missingEvidence.length}`);
  }
  if (rootCause) items.push(`RCA ${rootCause}`);
  else if (reasonCode) items.push(`RCA ${reasonCode}`);
  const recoveryRoute = getString(recovery.selected_route, getString(recovery.execution_route));
  if (recoveryRoute) items.push(`recovery ${recoveryRoute}`);
  const safePrReason = getString(safePr.reason);
  const safePrRepo = getString(safePr.repo_ref);
  if (safePrReason) items.push(`Safe PR failed${safePrRepo ? ` ${safePrRepo}` : ''}`);
  else if (getString(safePr.pr_url)) items.push(`Safe PR created${safePrRepo ? ` ${safePrRepo}` : ''}`);
  else if (getString(safePr.title)) items.push(`Safe PR${safePrRepo ? ` ${safePrRepo}` : ''}`);
  const approvalId = approvalIdForStep(step);
  if (approvalId) items.push(`approval ${shortId(approvalId)}`);
  const commandStatus = getString(command.status);
  if (commandStatus) items.push(`command ${commandStatus}`);
  else if (getString(command.command_id)) items.push('command queued');
  return items;
}

function approvalIdForStep(step: ReleaseRun['steps'][number]): string {
  const approval = recordValue(recordValue(step.details).approval);
  return getString(step.approval_id, getString(approval.approval_id));
}

function approvalSummaryForStep(step: ReleaseRun['steps'][number]): string {
  const approval = recordValue(recordValue(step.details).approval);
  const reason = getString(approval.reason);
  const gate = getString(step.details.gate);
  const environment = getString(step.details.environment);
  if (reason) return `${step.name}: ${reason}`;
  return `${step.name} release approval${environment ? ` for ${environment}` : ''}${gate ? ` (${gate})` : ''}`;
}

function approvalDecisionForStep(step: ReleaseRun['steps'][number]): 'granted' | 'rejected' | undefined {
  const approval = recordValue(recordValue(step.details).approval);
  const decision = getString(approval.decision).toLowerCase();
  if (decision === 'granted' || decision === 'approved') return 'granted';
  if (decision === 'rejected' || decision === 'denied') return 'rejected';
  const status = getString(step.status).toLowerCase();
  if (status === 'rejected') return 'rejected';
  return undefined;
}

function releaseEventMeta(event: ReleaseRun['events'][number]): string {
  const details = recordValue(event.details);
  const actionReason = getString(details.reason);
  const alert = recordValue(details.alert);
  if (event.event_type.startsWith('release.notify')) {
    const severity = getString(alert.severity);
    const applicationId = getString(alert.application_id);
    const alertReason = getString(alert.reason);
    const pieces = [severity, 'notify', applicationId].filter(Boolean);
    return pieces.length ? pieces.join(' ') : alertReason || actionReason || 'release notification';
  }
  if (actionReason) return actionReason;
  const evidence = recordValue(details.evidence);
  const incident = recordValue(details.incident);
  const evidenceBundle = recordValue(details.evidence_bundle);
  const rca = recordValue(details.rca);
  const recovery = recordValue(details.recovery);
  const safePr = recordValue(details.safe_pr);
  const command = recordValue(details.command);
  const workflow = recordValue(details.workflow_projection);
  const retryAttempt = getNumber(details.attempt, -1);
  const retryWave = getNumber(details.wave, -1);
  if (event.event_type.startsWith('release.retry') && retryAttempt > 0) {
    return retryWave > 0 ? `retry ${retryAttempt} wave ${retryWave}` : `retry ${retryAttempt}`;
  }
  const rootCause = getString(rca.root_cause);
  if (rootCause) return `RCA ${rootCause}`;
  const reasonCode = getString(rca.reason_code);
  if (reasonCode) return `RCA ${reasonCode}`;
  const candidateCount = getNumber(rca.candidate_count, -1);
  if (candidateCount >= 0) return `${candidateCount} candidates`;
  const symptom = getString(incident.symptom);
  if (symptom) return `incident ${symptom}`;
  const failedProviders = getStringArray(evidence.failed_providers);
  if (failedProviders.length) return `collection failed ${failedProviders.join(', ')}`;
  const pendingProviders = getStringArray(evidence.pending_providers);
  if (pendingProviders.length) return `collection pending ${pendingProviders.join(', ')}`;
  if (typeof evidenceBundle.complete === 'boolean') {
    return evidenceBundle.complete ? 'evidence complete' : `missing ${arrayValue(evidenceBundle.missing_evidence).length}`;
  }
  const recoveryRoute = getString(recovery.selected_route, getString(recovery.execution_route));
  if (recoveryRoute) return `recovery ${recoveryRoute}`;
  const prUrl = getString(safePr.pr_url);
  const safePrRepo = getString(safePr.repo_ref);
  const safePrReason = getString(safePr.reason);
  const safePrReasonCode = getString(safePr.reason_code);
  const safePrStage = getString(safePr.stage);
  if (safePrReason) {
    const code = [safePrReasonCode, safePrStage].filter(Boolean).join('/');
    return `Safe PR failed${code ? ` ${code}` : ''}${safePrRepo ? ` ${safePrRepo}` : ''}`;
  }
  if (prUrl) return `Safe PR created${safePrRepo ? ` ${safePrRepo}` : ''}`;
  const safePrTitle = getString(safePr.title);
  if (safePrTitle) return `Safe PR requested${safePrRepo ? ` ${safePrRepo}` : ''}`;
  const commandStatus = getString(command.status);
  if (commandStatus) return `command ${commandStatus}`;
  const commandId = getString(command.command_id);
  if (commandId) return `command ${shortId(commandId)}`;
  const evidenceKey = getString(evidence.evidence_key);
  if (evidenceKey) return `evidence ${shortId(evidenceKey)}`;
  const workflowRunId = getString(evidence.workflow_run_id, getString(workflow.workflow_run_id));
  return workflowRunId ? `workflow ${shortId(workflowRunId)}` : '';
}

function commitUrl(step: ReleaseRun['steps'][number]): string {
  const details = step.details ?? {};
  const github = typeof details.github === 'object' && details.github ? details.github as Record<string, unknown> : {};
  const direct = getString(github.commit_url);
  if (direct) return direct;
  const dispatch = details as Record<string, unknown>;
  const repoRef = getString(dispatch.repo_ref);
  const commitSha = getString(dispatch.commit_sha);
  return repoRef && commitSha ? `https://github.com/${repoRef}/commit/${commitSha}` : '';
}

function buildFlow(
  plan: ReleasePlan | null,
  apps: Application[],
  selectedNodeId: string,
  diagnostics: Diagnostic[],
  preview?: ReleasePlanPreview,
): { nodes: Node[]; edges: ReleaseEdge[] } {
  if (!plan) return { nodes: [], edges: [] };
  const appById = new Map(apps.map(app => [app.application_id, app]));
  const stepByApp = new Map(plan.steps.map((step, i) => [step.application_id, `step-${i}`]));
  const previewByApp = new Map((preview?.steps ?? []).map(step => [step.application_id, step]));
  const defaultEnvironment = firstEnvironment(plan);
  const defaultNamespace = getString(plan.steps[0]?.config.namespace, defaultEnvironment);
  const defaultCluster = apps[0]?.cluster_id ?? 'target cluster';
  const applicationNodes: Node[] = plan.steps.map((step, index) => {
    const stepDiagnostics = diagnosticsForStep(diagnostics, index);
    const tone: ReleaseFlowTone = stepDiagnostics.some(d => d.severity === 'error') ? 'danger' : stepDiagnostics.length ? 'warn' : 'neutral';
    const previewStep = previewByApp.get(step.application_id);
    const executionStatus = executionStatusForStep(previewStep, stepDiagnostics, appById.get(step.application_id));
    return {
      id: `step-${index}`,
      type: 'release_step',
      position: { x: 0, y: 0 },
      width: RELEASE_NODE_WIDTH,
      height: RELEASE_NODE_HEIGHT,
      data: {
        step,
        app: appById.get(step.application_id),
        index,
        id: `step-${index}`,
        selected: selectedNodeId === `step-${index}`,
        relation: 'normal',
        tone,
        diagnostics: stepDiagnostics.length,
        nodeType: 'application',
        executionStatus,
        healthStatus: healthStatusForStep(previewStep, stepDiagnostics),
        wave: previewStep?.wave,
        gate: previewStep?.gate ?? getString(step.config.approval_gate, 'inherit'),
        strategy: previewStep?.strategy ?? getString(step.config.strategy, getString(plan.settings.default_strategy, 'rolling')),
        environment: previewStep?.environment ?? getString(step.config.environment, defaultEnvironment),
        namespace: getString(step.config.namespace, getString(step.config.environment, defaultEnvironment)),
        version: versionForStep(step),
        commitSha: shortId(getString(step.config.commit_sha)),
        cluster: appById.get(step.application_id)?.cluster_id ?? defaultCluster,
        duration: getString(step.config.duration, previewStep?.wave ? `wave ${previewStep.wave}` : 'pending'),
        warningCount: stepDiagnostics.filter(item => item.severity === 'warning').length,
        evidenceCount: Math.max(1, stepDiagnostics.length),
        failureReason: stepDiagnostics[0]?.message ?? '',
      },
    };
  });
  const appData = applicationNodes.map(node => node.data as ReleaseNodeData);
  const appStatuses = appData.map(node => node.executionStatus);
  const hasBlockedApplication = appStatuses.some(status => status === 'blocked' || status === 'failed');
  const hasIncompleteApplication = appStatuses.some(status => status !== 'succeeded' && status !== 'skipped');
  const maxWave = Math.max(0, ...appData.map(node => node.wave ?? 0));
  const systemNodes: Node[] = [
    systemReleaseNode({
      id: 'sys-precheck',
      name: '사전 점검',
      nodeType: 'precheck',
      selected: selectedNodeId === 'sys-precheck',
      wave: 0,
      executionStatus: 'succeeded',
      healthStatus: 'healthy',
      gate: 'policy',
      strategy: '진단과 준비 상태',
      environment: defaultEnvironment,
      namespace: defaultNamespace,
      cluster: defaultCluster,
      version: '정책 점검',
      duration: '18s',
      evidenceCount: 2,
    }),
    systemReleaseNode({
      id: 'sys-approval',
      name: '수동 승인',
      nodeType: 'approval',
      selected: selectedNodeId === 'sys-approval',
      wave: maxWave + 1,
      executionStatus: hasBlockedApplication || hasIncompleteApplication ? 'blocked' : 'queued',
      healthStatus: 'unknown',
      gate: 'manual',
      strategy: '운영자 확인',
      environment: defaultEnvironment,
      namespace: defaultNamespace,
      cluster: defaultCluster,
      version: '승인 게이트',
      duration: hasIncompleteApplication ? '대기 중' : '대기',
      warningCount: hasIncompleteApplication ? 1 : 0,
      evidenceCount: hasIncompleteApplication ? 1 : 0,
      failureReason: hasIncompleteApplication ? '모든 상위 배포 노드가 완료되기를 기다리는 중입니다.' : '',
    }),
    systemReleaseNode({
      id: 'sys-verification',
      name: '검증',
      nodeType: 'verification',
      selected: selectedNodeId === 'sys-verification',
      wave: maxWave + 2,
      executionStatus: 'queued',
      healthStatus: 'unknown',
      gate: '배포 후',
      strategy: '헬스 체크와 스모크 테스트',
      environment: defaultEnvironment,
      namespace: defaultNamespace,
      cluster: defaultCluster,
      version: '검증 묶음',
      duration: '대기',
      evidenceCount: 0,
    }),
  ];
  const nodes = [systemNodes[0], ...applicationNodes, systemNodes[1], systemNodes[2]];
  const dependencyEdges: ReleaseEdge[] = plan.steps.flatMap((step, index) =>
    step.depends_on.map(dep => ({
      id: `dep-${dep}-${index}`,
      source: stepByApp.get(dep) ?? `step-${Math.max(0, index - 1)}`,
      target: `step-${index}`,
      type: 'animated',
      data: { tone: 'info' as const, active: true },
    }))
  );
  const dependentSources = new Set(plan.steps.flatMap(step => step.depends_on));
  const rootStepEdges: ReleaseEdge[] = plan.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step, index }) => step.depends_on.length === 0 || (!dependencyEdges.length && index === 0))
    .map(({ index }) => ({
      id: `precheck-step-${index}`,
      source: 'sys-precheck',
      target: `step-${index}`,
      type: 'animated',
      data: { tone: 'ok' as const, active: false },
    }));
  const sequenceEdges: ReleaseEdge[] = dependencyEdges.length ? [] : plan.steps.slice(1).map((_, index) => ({
    id: `seq-${index}`,
    source: `step-${index}`,
    target: `step-${index + 1}`,
    type: 'animated',
    data: { tone: 'neutral' as const },
  }));
  const terminalEdges: ReleaseEdge[] = plan.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step, index }) => !dependentSources.has(step.application_id) || index === plan.steps.length - 1)
    .map(({ index }) => ({
      id: `step-${index}-approval`,
      source: `step-${index}`,
      target: 'sys-approval',
      type: 'animated',
      data: { tone: hasBlockedApplication ? 'warn' as const : 'info' as const, active: hasIncompleteApplication },
    }));
  const systemEdges: ReleaseEdge[] = [
    {
      id: 'approval-verification',
      source: 'sys-approval',
      target: 'sys-verification',
      type: 'animated',
      data: { tone: 'neutral' as const, active: false },
    },
  ];
  const allEdges = [...rootStepEdges, ...dependencyEdges, ...sequenceEdges, ...terminalEdges, ...systemEdges];
  const focus = graphFocus(selectedNodeId, allEdges);
  return {
    nodes: nodes.map(node => {
      const data = node.data as ReleaseNodeData;
      const relation = focus.relationFor(node.id);
      return {
        ...node,
        data: {
          ...data,
          selected: relation === 'selected',
          relation,
        },
      };
    }),
    edges: allEdges.map(edge => ({
      ...edge,
      data: {
        ...edge.data,
        active: focus.edgeIsActive(edge),
      },
    })),
  };
}

function buildMockFlow(selectedNodeId: string, collapsedWaveIds: Set<number>): { nodes: Node[]; edges: ReleaseEdge[] } {
  const cluster = 'release-demo-cluster';
  const namespace = 'demo-prod';
  const environment = 'prod';
  const collapsedParallel = collapsedWaveIds.has(2);
  const baseNodes = [
    mockNode({ id: 'sys-precheck', name: '사전 점검', nodeType: 'precheck', wave: 0, executionStatus: 'succeeded', healthStatus: 'healthy', strategy: '정책과 매니페스트 점검', gate: 'policy', version: '사전 점검', duration: '18s', evidenceCount: 2, cluster, namespace, environment }),
    mockNode({ id: 'step-auth', index: 0, name: 'Auth API', nodeType: 'application', wave: 1, executionStatus: 'succeeded', healthStatus: 'healthy', strategy: 'rolling', gate: 'auto', version: 'auth:1.8.2', commitSha: 'a17c9e4', duration: '1m 12s', evidenceCount: 3, repoRef: 'demo/auth-api', cluster, namespace, environment }),
    ...(collapsedParallel ? [
      mockNode({ id: 'group-wave-2', index: 1, name: 'Coupon + Inventory', nodeType: 'application', wave: 2, executionStatus: 'running', healthStatus: 'progressing', strategy: '병렬 wave', gate: '상위 단계 완료', version: '2개 앱 묶음', commitSha: 'mixed', duration: '진행 중 2분', warningCount: 1, evidenceCount: 5, failureReason: 'Coupon API가 아직 배포 중이라 승인이 막혀 있습니다.', repoRef: '병렬 배포 그룹', cluster, namespace, environment }),
    ] : [
      mockNode({ id: 'step-coupon', index: 1, name: 'Coupon API', nodeType: 'application', wave: 2, executionStatus: 'running', healthStatus: 'progressing', strategy: 'canary', gate: 'auto', version: 'coupon:2.4.1', commitSha: 'c44f91b', duration: '진행 중 2분', warningCount: 1, evidenceCount: 3, failureReason: '카나리 롤아웃이 아직 진행 중입니다.', repoRef: 'demo/coupon-api', cluster, namespace, environment }),
      mockNode({ id: 'step-inventory', index: 2, name: 'Inventory API', nodeType: 'application', wave: 2, executionStatus: 'succeeded', healthStatus: 'healthy', strategy: 'rolling', gate: 'auto', version: 'inventory:3.1.0', commitSha: '91bd22a', duration: '1m 34s', evidenceCount: 2, repoRef: 'demo/inventory-api', cluster, namespace, environment }),
    ]),
    mockNode({ id: 'sys-approval', name: '수동 승인', nodeType: 'approval', wave: 3, executionStatus: 'blocked', healthStatus: 'unknown', strategy: '운영자 확인', gate: 'manual', version: '승인 게이트', duration: '대기 중', warningCount: 1, evidenceCount: 1, failureReason: '승인을 진행하기 전에 Coupon API 완료를 기다리고 있습니다.', cluster, namespace, environment }),
    mockNode({ id: 'step-order', index: 3, name: 'Order API', nodeType: 'application', wave: 4, executionStatus: 'queued', healthStatus: 'unknown', strategy: 'rolling', gate: '수동 승인 완료', version: 'order:5.0.0', commitSha: 'fd9210c', duration: '대기', evidenceCount: 0, repoRef: 'demo/order-api', cluster, namespace, environment }),
    mockNode({ id: 'step-payment', index: 4, name: 'Payment API', nodeType: 'application', wave: 5, executionStatus: 'queued', healthStatus: 'unknown', strategy: 'rolling', gate: '순차', version: 'payment:4.6.3', commitSha: 'b019f77', duration: '대기', evidenceCount: 0, repoRef: 'demo/payment-api', cluster, namespace, environment }),
    mockNode({ id: 'sys-verification', name: '검증', nodeType: 'verification', wave: 6, executionStatus: 'queued', healthStatus: 'unknown', strategy: '스모크 테스트와 헬스 체크', gate: '배포 후', version: '검증 묶음', duration: '대기', evidenceCount: 0, cluster, namespace, environment }),
  ];
  const parallelTargetIds = collapsedParallel ? ['group-wave-2'] : ['step-coupon', 'step-inventory'];
  const edges: ReleaseEdge[] = [
    mockEdge('precheck-auth', 'sys-precheck', 'step-auth', 'ok'),
    ...parallelTargetIds.map(id => mockEdge(`auth-${id}`, 'step-auth', id, id === 'step-coupon' || id === 'group-wave-2' ? 'info' : 'ok')),
    ...parallelTargetIds.map(id => mockEdge(`${id}-approval`, id, 'sys-approval', id === 'step-coupon' || id === 'group-wave-2' ? 'warn' : 'ok')),
    mockEdge('approval-order', 'sys-approval', 'step-order', 'neutral'),
    mockEdge('order-payment', 'step-order', 'step-payment', 'neutral'),
    mockEdge('payment-verification', 'step-payment', 'sys-verification', 'neutral'),
  ];
  const focus = graphFocus(selectedNodeId, edges);
  return {
    nodes: baseNodes.map(node => {
      const data = node.data as ReleaseNodeData;
      const relation = focus.relationFor(node.id);
      return { ...node, data: { ...data, selected: relation === 'selected', relation } };
    }),
    edges: edges.map(edge => ({ ...edge, data: { ...edge.data, active: focus.edgeIsActive(edge) } })),
  };
}

function mockNode(input: {
  id: string;
  index?: number;
  name: string;
  nodeType: ReleaseNodeData['nodeType'];
  wave: number;
  executionStatus: string;
  healthStatus: string;
  strategy: string;
  gate: string;
  version: string;
  duration: string;
  cluster: string;
  namespace: string;
  environment: string;
  repoRef?: string;
  commitSha?: string;
  warningCount?: number;
  evidenceCount?: number;
  failureReason?: string;
}): Node<ReleaseNodeData> {
  const node = systemReleaseNode({
    id: input.id,
    name: input.name,
    nodeType: input.nodeType,
    selected: false,
    wave: input.wave,
    executionStatus: input.executionStatus,
    healthStatus: input.healthStatus,
    gate: input.gate,
    strategy: input.strategy,
    environment: input.environment,
    namespace: input.namespace,
    cluster: input.cluster,
    version: input.version,
    duration: input.duration,
    warningCount: input.warningCount ?? 0,
    evidenceCount: input.evidenceCount ?? 0,
    failureReason: input.failureReason ?? '',
  });
  return {
    ...node,
    data: {
      ...node.data,
      index: input.index ?? input.wave,
      commitSha: input.commitSha ?? '',
      step: {
        ...node.data.step,
        config: {
          ...node.data.step.config,
          repo_ref: input.repoRef ?? '',
          commit_sha: input.commitSha ?? '',
          image: input.version,
        },
      },
    },
  };
}

function mockEdge(id: string, source: string, target: string, tone: ReleaseFlowTone): ReleaseEdge {
  return {
    id,
    source,
    target,
    type: 'animated',
    data: { tone, active: false },
  };
}

function systemReleaseNode({
  id,
  name,
  nodeType,
  selected,
  wave,
  executionStatus,
  healthStatus,
  gate,
  strategy,
  environment,
  namespace,
  cluster,
  version,
  duration,
  warningCount = 0,
  evidenceCount = 0,
  failureReason = '',
}: {
  id: string;
  name: string;
  nodeType: ReleaseNodeData['nodeType'];
  selected: boolean;
  wave: number;
  executionStatus: string;
  healthStatus: string;
  gate: string;
  strategy: string;
  environment: string;
  namespace: string;
  cluster: string;
  version: string;
  duration: string;
  warningCount?: number;
  evidenceCount?: number;
  failureReason?: string;
}): Node<ReleaseNodeData> {
  const step: ReleasePlanStep = {
    step_id: id,
    application_id: id,
    name,
    position: wave,
    depends_on: [],
    config: {
      environment,
      namespace,
      strategy,
      approval_gate: gate,
      image: version,
    },
  };
  const tone: ReleaseFlowTone = executionStatus === 'failed' ? 'danger' : executionStatus === 'blocked' ? 'warn' : nodeType === 'precheck' ? 'ok' : 'neutral';
  return {
    id,
    type: 'release_step',
    position: { x: 0, y: 0 },
    width: RELEASE_NODE_WIDTH,
    height: RELEASE_NODE_HEIGHT,
    data: {
      id,
      step,
      index: wave,
      selected,
      relation: selected ? 'selected' : 'normal',
      tone,
      diagnostics: warningCount,
      nodeType,
      executionStatus,
      healthStatus,
      wave,
      gate,
      strategy,
      environment,
      namespace,
      version,
      commitSha: '',
      cluster,
      duration,
      warningCount,
      evidenceCount,
      failureReason,
    },
  };
}

function graphFocus(selectedNodeId: string, edges: ReleaseEdge[]) {
  const upstream = walkGraph(selectedNodeId, edges, 'upstream');
  const downstream = walkGraph(selectedNodeId, edges, 'downstream');
  return {
    relationFor(id: string): ReleaseNodeData['relation'] {
      if (id === selectedNodeId) return 'selected';
      if (upstream.has(id)) return 'upstream';
      if (downstream.has(id)) return 'downstream';
      return selectedNodeId ? 'dimmed' : 'normal';
    },
    edgeIsActive(edge: ReleaseEdge): boolean {
      const sourceRelated = edge.source === selectedNodeId || upstream.has(edge.source) || downstream.has(edge.source);
      const targetRelated = edge.target === selectedNodeId || upstream.has(edge.target) || downstream.has(edge.target);
      return sourceRelated && targetRelated;
    },
  };
}

function walkGraph(selectedNodeId: string, edges: ReleaseEdge[], direction: 'upstream' | 'downstream'): Set<string> {
  const result = new Set<string>();
  const next = [selectedNodeId];
  while (next.length) {
    const current = next.pop();
    if (!current) continue;
    for (const edge of edges) {
      const candidate = direction === 'upstream' && edge.target === current
        ? edge.source
        : direction === 'downstream' && edge.source === current
          ? edge.target
          : '';
      if (candidate && !result.has(candidate)) {
        result.add(candidate);
        next.push(candidate);
      }
    }
  }
  return result;
}

function filterFlow(
  flow: { nodes: Node[]; edges: ReleaseEdge[] },
  search: string,
  status: string,
  cluster: string,
  namespace: string,
): { nodes: Node[]; edges: ReleaseEdge[] } {
  const q = search.trim().toLowerCase();
  const nodes = flow.nodes.filter(node => {
    const data = node.data as ReleaseNodeData;
    const label = `${data.step.name} ${data.step.application_id} ${data.nodeType} ${data.cluster} ${data.namespace} ${data.app?.repo_ref ?? ''}`.toLowerCase();
    const searchOk = !q || label.includes(q);
    const statusOk = status === 'all' || data.executionStatus === status;
    const clusterOk = cluster === 'all' || data.cluster === cluster;
    const namespaceOk = namespace === 'all' || data.namespace === namespace;
    return searchOk && statusOk && clusterOk && namespaceOk;
  });
  const visibleIds = new Set(nodes.map(node => node.id));
  const edges = flow.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  return { nodes, edges };
}

function graphFilterOptions(nodes: Node[], field: GraphFilterField): string[] {
  const values = nodes
    .map(node => (node.data as ReleaseNodeData)[field])
    .filter(value => typeof value === 'string' && value.length > 0);
  return Array.from(new Set(values)).sort();
}

function firstActiveNodeId(nodes: Node[]): string | null {
  const running = nodes.find(node => (node.data as ReleaseNodeData).executionStatus === 'running');
  if (running) return running.id;
  const blocked = nodes.find(node => (node.data as ReleaseNodeData).executionStatus === 'blocked');
  return blocked?.id ?? null;
}

function waveGroupsFromNodes(nodes: Node[]): { wave: number; label: string }[] {
  const groups = new Map<number, number>();
  nodes.forEach(node => {
    const data = node.data as ReleaseNodeData;
    if (data.nodeType !== 'application' || data.wave == null) return;
    groups.set(data.wave, (groups.get(data.wave) ?? 0) + 1);
  });
  return Array.from(groups.entries())
    .filter(([, count]) => count > 1)
    .map(([wave, count]) => ({ wave, label: `Wave ${wave} (${count}개 앱)` }));
}

const legacyReleaseOverviewReferences = [
  ReleaseDagContext,
  ReleaseStudioHeader,
  ReleaseGraphToolbar,
  ReleaseFlowLegend,
  ReleaseNodeSidePanel,
  graphFilterOptions,
  firstActiveNodeId,
  waveGroupsFromNodes,
] as const;
void legacyReleaseOverviewReferences;

function executionStatusForStep(previewStep: ReleasePlanPreview['steps'][number] | undefined, diagnostics: Diagnostic[], app?: Application): string {
  if (diagnostics.some(item => item.severity === 'error')) return 'blocked';
  if (previewStep?.blocked_by?.length) return 'blocked';
  if (app?.last_run_status === 'succeeded') return 'succeeded';
  if (app?.last_run_status === 'failed') return 'failed';
  if (app?.last_run_status === 'waiting_for_approval') return 'blocked';
  if (app?.last_run_status === 'paused') return 'paused';
  if (previewStep?.wave === 1) return 'running';
  if (previewStep?.wave && previewStep.wave > 1) return 'queued';
  return 'queued';
}

function healthStatusForStep(previewStep: ReleasePlanPreview['steps'][number] | undefined, diagnostics: Diagnostic[]): string {
  if (diagnostics.some(item => item.severity === 'error')) return 'degraded';
  if (diagnostics.some(item => item.severity === 'warning')) return 'progressing';
  if (previewStep?.wave === 1) return 'progressing';
  return 'unknown';
}

function versionForStep(step: ReleasePlanStep): string {
  const image = getString(step.config.image);
  if (!image) return 'not set';
  const tag = image.includes(':') ? image.split(':').pop() : image;
  return tag || image;
}

function yamlPreviewForNode(node: ReleaseNodeData): string {
  const name = node.step.application_id || node.id;
  const image = getString(node.step.config.image, node.version);
  const replicas = getNumber(node.step.config.replicas, 2);
  if (node.nodeType !== 'application') {
    return [
      'apiVersion: myjob.dev/v1',
      'kind: ReleaseGate',
      'metadata:',
      `  name: ${name}`,
      `  namespace: ${node.namespace || 'default'}`,
      'spec:',
      `  type: ${node.nodeType}`,
      `  gate: ${node.gate}`,
      `  wave: ${node.wave ?? 0}`,
      `  strategy: ${node.strategy}`,
    ].join('\n');
  }
  return [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    `  name: ${name}`,
    `  namespace: ${node.namespace || 'default'}`,
    'spec:',
    `  replicas: ${replicas}`,
    '  selector:',
    '    matchLabels:',
    `      app: ${name}`,
    '  template:',
    '    metadata:',
    '      labels:',
    `        app: ${name}`,
    '    spec:',
    '      containers:',
    `        - name: ${name}`,
    `          image: ${image || 'not-set'}`,
  ].join('\n');
}

function statusClass(status: string): string {
  return ['succeeded', 'running', 'failed', 'blocked', 'paused', 'skipped', 'queued'].includes(status) ? status : 'queued';
}

function healthClass(status: string): string {
  return ['healthy', 'degraded', 'progressing', 'unknown'].includes(status) ? status : 'unknown';
}

function releaseNodeTypeLabel(type: ReleaseNodeData['nodeType']): string {
  return {
    precheck: '사전 점검',
    application: '앱 배포',
    approval: '승인',
    verification: '검증',
  }[type];
}

function releaseNodeTooltip(data: ReleaseNodeData): string {
  return [
    `애플리케이션: ${data.step.name || data.step.application_id}`,
    `대상: ${data.cluster} / ${data.namespace || data.environment}`,
    `버전: ${data.version}`,
    `배포: ${statusLabel(data.executionStatus)}`,
    `헬스: ${healthLabel(data.healthStatus)}`,
    `경과: ${valueLabel(data.duration)}`,
  ].join('\n');
}

function diagnosticsForStep(diagnostics: Diagnostic[], index: number): Diagnostic[] {
  return diagnostics.filter(diag => diag.path?.includes(`steps[${index}]`) || diag.path === 'steps');
}

function markersFor(monaco: Monaco, diagnostics: Diagnostic[]): MonacoEditor.IMarkerData[] {
  const severity = (diag: Diagnostic) => {
    if (diag.severity === 'error') return monaco.MarkerSeverity.Error;
    if (diag.severity === 'warning') return monaco.MarkerSeverity.Warning;
    return monaco.MarkerSeverity.Info;
  };
  return diagnostics.map(diag => ({
    severity: severity(diag),
    message: diag.message,
    code: diag.code,
    source: diag.source,
    startLineNumber: diag.line,
    startColumn: diag.column,
    endLineNumber: diag.end_line,
    endColumn: diag.end_column,
  }));
}

function getString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length ? value : fallback;
}

function toDateTimeLocalValue(value: string): string {
  if (!value) return '';
  return value.replace(/Z$/, '').slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string {
  if (!value) return '';
  return `${value.length === 16 ? `${value}:00` : value}Z`;
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function splitList(value: string): string[] {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function firstEnvironment(plan: ReleasePlan): string {
  return getStringArray(plan.settings.environment_order)[0] ?? 'sandbox';
}
