import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction, type SVGProps } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import type { editor as MonacoEditor } from 'monaco-editor/esm/vs/editor/editor.api';
import { motion } from 'motion/react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useConsolePath } from '@/features/console/ui';
import { useApplications } from '@/features/repo/api';
import { ApprovalCard } from '@/features/repo/ApprovalCard';
import { ConnectRepoWizard } from '@/features/resources/ConnectRepoWizard';
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
  useRestoreReleasePlan,
  useDeleteReleaseRun,
  useReleaseRuns,
  useResumeReleaseRun,
  useReleaseReadiness,
  useRetryReleaseRun,
  useRollbackReleaseRun,
  useSaveReleasePlan,
  useStartReleasePlan,
} from '@/features/release/api';
import { Badge, Breadcrumb, Button, Card, Checkbox, EmptyState, Field, Modal, useToast } from '@/ui';
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

  if (!isApplication) {
    return (
      <div className={`release-node release-node--checkpoint release-node--${data.nodeType} release-node--${data.relation} ${data.selected ? 'release-node--selected' : ''} ${borderClass}`} title={releaseNodeTooltip(data)}>
        <Handle type="target" position={Position.Left} className="release-node__handle release-node__handle--target" />
        <span className={`release-node__checkpoint-icon release-node__checkpoint-icon--${statusClass(data.executionStatus)}`} aria-hidden="true" />
        <span className="release-node__checkpoint-copy">
          <small>{data.nodeType === 'approval' ? 'GATE' : data.nodeType === 'precheck' ? 'PRE-FLIGHT' : 'POST-DEPLOY'}</small>
          <strong>{data.step.name || data.step.application_id}</strong>
          <span>{data.nodeType === 'approval' ? valueLabel(data.gate) : statusLabel(data.executionStatus)}</span>
        </span>
        {data.nodeType === 'approval' && <span className="release-node__gate-state">{data.executionStatus === 'blocked' ? '대기' : '준비'}</span>}
        <Handle type="source" position={Position.Right} className="release-node__handle release-node__handle--source" />
      </div>
    );
  }

  return (
    <div className={`release-node release-node--${data.nodeType} release-node--${data.relation} ${data.selected ? 'release-node--selected' : ''} ${borderClass}`} title={releaseNodeTooltip(data)}>
      <Handle type="target" position={Position.Left} className="release-node__handle release-node__handle--target" />
      <div className="release-node__stage-head">
        <span className="release-node__wave">{data.wave != null ? `WAVE ${data.wave}` : 'WAVE 대기'}</span>
        <span className={`release-node__status release-node__status--${statusClass(data.executionStatus)}`}>{statusLabel(data.executionStatus)}</span>
      </div>
      <div className="release-node__main-row">
        <span className={`release-node__state-dot release-node__state-dot--${statusClass(data.executionStatus)}`} aria-hidden="true" />
        <span className="release-node__name">{data.step.name || data.app?.name || data.step.application_id}</span>
        <span className="release-node__duration">{valueLabel(data.duration)}</span>
        {data.diagnostics > 0 && <Badge tone={toUiTone(data.tone)}>{data.diagnostics}</Badge>}
      </div>
      <div className="release-node__target-line">
        <span>{data.cluster || '대상 클러스터'}</span>
        <span>{data.namespace || data.environment || 'namespace'}</span>
      </div>
      <div className="release-node__stage-footer">
        <span>{valueLabel(data.strategy)}</span>
        <strong>{data.version || '버전 대기'}</strong>
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
type ReleaseDetailTab = 'summary' | 'sequence' | 'policy' | 'diagnostics';
type ReleaseRunFocus = 'start' | 'recovery' | 'history';
type ReleaseEditModal = 'plan' | 'policy' | 'step' | null;
type NewPlanStage = 'basics' | 'apps' | 'global' | 'steps' | 'review';
type ReleaseDispatchIntent = { action: 'wave' | 'run'; wave: number };
type PlanDeletionMode = 'normal' | 'force';
type RunActionIntent = {
  title: string;
  description: string;
  confirmLabel: string;
  runId: string;
  status: string;
  wave: number;
  defaultReason?: string;
  requiresAcknowledgement?: boolean;
  requiresForce?: boolean;
  destructive?: boolean;
  onConfirm: (reason: string, force: boolean) => void;
};
const RELEASE_APP_NODE_WIDTH = 286;
const RELEASE_APP_NODE_HEIGHT = 138;
const RELEASE_CHECKPOINT_NODE_WIDTH = 176;
const RELEASE_CHECKPOINT_NODE_HEIGHT = 72;
const RELEASE_GATE_NODE_WIDTH = 164;
const RELEASE_GATE_NODE_HEIGHT = 64;
const LAST_VIEWED_RELEASE_PLAN_KEY = 'myjob.releaseFlow.lastViewedPlanId';
const DEMO_RELEASE_PLAN_PICKER_ID = '__feature_demo__';
const RELEASE_DETAIL_TABS: Array<{ value: ReleaseDetailTab; label: string; help: string }> = [
  { value: 'summary', label: '요약', help: '현재 상태와 다음 작업' },
  { value: 'sequence', label: '배포 순서', help: '단계와 의존성' },
  { value: 'policy', label: '정책', help: '승인과 실행 기준' },
  { value: 'diagnostics', label: '진단', help: '막힘과 경고' },
];
const RELEASE_WORKSPACE_TABS: ReleaseTab[] = ['overview', 'edit', 'run', 'yaml'];
const READINESS_POLICY_CHECKS = new Set([
  'live.dispatch_gate',
  'release.window',
  'change.freeze',
  'plan.diagnostics',
  'rollback.policy',
]);

export default function ReleaseFlowView() {
  const pathFor = useConsolePath();
  const navigate = useNavigate();
  const { push } = useToast();
  const [sp, setSp] = useSearchParams();
  const runIdParam = sp.get('run_id') ?? '';
  const planIdParam = sp.get('plan_id') ?? '';
  const nodeIdParam = sp.get('node') ?? '';
  const appsQ = useApplications();
  const plansQ = useReleasePlans();
  const alertChannelsQ = useAlertChannels();
  const [plan, setPlan] = useState<ReleasePlan | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [tab, setTab] = useState<ReleaseTab>(runIdParam ? 'run' : 'overview');
  const [detailTab, setDetailTab] = useState<ReleaseDetailTab>('summary');
  const [editModal, setEditModal] = useState<ReleaseEditModal>(null);
  const [planPickerOpen, setPlanPickerOpen] = useState(!runIdParam && !planIdParam);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [newPlan, setNewPlan] = useState<ReleasePlan | null>(null);
  const [newPlanStage, setNewPlanStage] = useState<NewPlanStage>('basics');
  const [newPlanSelectedIndex, setNewPlanSelectedIndex] = useState(0);
  const [runFilter, setRunFilter] = useState<ReleaseRunFilter>('all');
  const [selectedRunId, setSelectedRunId] = useState(runIdParam);
  const [runFocus, setRunFocus] = useState<ReleaseRunFocus>(runIdParam ? 'history' : 'start');
  const [auditEventType, setAuditEventType] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState(nodeIdParam);
  const [demoSafePr, setDemoSafePr] = useState<ReleaseManifestSafePr>();
  const [graphMode] = useState<GraphMode>('plan');
  const [collapsedWaveIds] = useState<Set<number>>(() => new Set());
  const [graphSearch, setGraphSearch] = useState(sp.get('q') ?? '');
  const [graphStatusFilter, setGraphStatusFilter] = useState(sp.get('status') ?? 'all');
  const [graphClusterFilter, setGraphClusterFilter] = useState(sp.get('cluster') ?? 'all');
  const [graphNamespaceFilter, setGraphNamespaceFilter] = useState(sp.get('namespace') ?? 'all');
  const [inspectorTab, setInspectorTab] = useState('overview');
  const [dispatchIntent, setDispatchIntent] = useState<ReleaseDispatchIntent | null>(null);
  const [planDeletionMode, setPlanDeletionMode] = useState<PlanDeletionMode | null>(null);
  const [archivePlanOpen, setArchivePlanOpen] = useState(false);
  const [restorePlanOpen, setRestorePlanOpen] = useState(false);
  const { data: planDiagnosticsData, mutate: diagnosePlan } = useDiagnostics();
  const { data: releasePreviewData, isPending: releasePreviewPending, mutate: previewRelease } = useReleasePreview();
  const {
    data: generatedManifestData,
    isPending: generatedManifestPending,
    error: generatedManifestError,
    mutate: generateManifest,
    reset: resetGeneratedManifest,
  } = useReleaseGeneratedManifest();
  const {
    data: generatedManifestSafePrData,
    isPending: generatedManifestSafePrPending,
    error: generatedManifestSafePrError,
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
  const restorePlan = useRestoreReleasePlan(plan?.plan_id ?? '');
  const deletePlan = useDeleteReleasePlan(plan?.plan_id ?? '');
  const deleteRun = useDeleteReleaseRun();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const previousRunIdParamRef = useRef(runIdParam);

  const selectRunId = useCallback((runId: string) => {
    setSelectedRunId(runId);
    previousRunIdParamRef.current = runId;
    const next = new URLSearchParams(sp);
    if (runId) next.set('run_id', runId);
    else next.delete('run_id');
    setSp(next, { replace: true, preventScrollReset: true });
  }, [setSp, sp]);

  const openRunWorkspace = useCallback((focus: ReleaseRunFocus = 'start') => {
    setRunFocus(focus);
    setTab('run');
  }, []);

  const apps = useMemo(() => appsQ.data ?? [], [appsQ.data]);
  const isDemoPlan = isFeatureDemoPlan(plan);
  const effectiveApps = useMemo(() => {
    if (!isDemoPlan) return apps;
    const demoApps = demoReleaseApplications();
    const demoIds = new Set(demoApps.map(app => app.application_id));
    return [...apps.filter(app => !demoIds.has(app.application_id)), ...demoApps];
  }, [apps, isDemoPlan]);
  const appById = useMemo(() => new Map(effectiveApps.map(app => [app.application_id, app])), [effectiveApps]);
  const pickerPlans = useMemo(() => {
    const persisted = (plansQ.data ?? []).map(item => normalizePlan(item));
    return [featureDemoReleasePlan(), ...persisted];
  }, [plansQ.data]);
  const persistedExecutionPlan = useMemo(() => {
    if (!plan?.plan_id) return null;
    const persisted = (plansQ.data ?? []).find(item => item.plan_id === plan.plan_id);
    return persisted ? normalizePlan(persisted) : null;
  }, [plan?.plan_id, plansQ.data]);
  const executionPlanHasUnsavedChanges = useMemo(() => {
    if (!plan || isDemoPlan) return false;
    if (!persistedExecutionPlan) return true;
    return releasePlanExecutionFingerprint(plan) !== releasePlanExecutionFingerprint(persistedExecutionPlan);
  }, [isDemoPlan, persistedExecutionPlan, plan]);
  const selected = selectedStep(plan, selectedIndex);
  const diagnosticPlan = useMemo(() => withDiagnosticDefaults(plan, effectiveApps), [effectiveApps, plan]);
  const settingsBaselines = useMemo(() => settingsBaselinesFor(effectiveApps), [effectiveApps]);
  const diagnostics = useMemo(
    () => isDemoPlan ? demoReleaseDiagnostics() : planDiagnosticsData?.diagnostics ?? [],
    [isDemoPlan, planDiagnosticsData],
  );
  const preview = useMemo(
    () => isDemoPlan && plan ? demoReleasePreview(plan) : releasePreviewData?.preview,
    [isDemoPlan, plan, releasePreviewData],
  );
  const readiness = useMemo(
    () => isDemoPlan && plan ? demoReleaseReadiness(plan) : releaseReadinessData,
    [isDemoPlan, plan, releaseReadinessData],
  );
  const runSummary = useMemo(
    () => isDemoPlan && plan ? demoReleaseRunSummary(plan) : summaryQ.data,
    [isDemoPlan, plan, summaryQ.data],
  );
  const auditEvents = useMemo(
    () => isDemoPlan && plan ? demoReleaseAuditEvents(plan) : auditQ.data ?? [],
    [auditQ.data, isDemoPlan, plan],
  );
  const generatedManifest = useMemo(
    () => isDemoPlan && plan ? demoReleaseGeneratedManifest(plan, selectedIndex) : generatedManifestData,
    [generatedManifestData, isDemoPlan, plan, selectedIndex],
  );
  const safePr = isDemoPlan ? demoSafePr : generatedManifestSafePrData;

  useEffect(() => {
    if (previousRunIdParamRef.current === runIdParam) return;
    previousRunIdParamRef.current = runIdParam;
    setSelectedRunId(runIdParam);
    if (runIdParam) {
      setRunFilter('all');
      setRunFocus('history');
      setTab('run');
      setPlanPickerOpen(false);
    }
  }, [runIdParam]);

  useEffect(() => {
    if (plan || plansQ.isPending || appsQ.isPending) return;
    if (planIdParam === DEMO_RELEASE_PLAN_PICKER_ID) {
      setPlan(featureDemoReleasePlan());
      setPlanPickerOpen(false);
      return;
    }
    const requestedPlan = plansQ.data?.find(item => item.plan_id === planIdParam);
    if (requestedPlan) {
      setPlan(normalizePlan(requestedPlan));
      setPlanPickerOpen(false);
      return;
    }
    const lastViewedPlanId = readLastViewedReleasePlanId();
    if (lastViewedPlanId === DEMO_RELEASE_PLAN_PICKER_ID) {
      setPlan(featureDemoReleasePlan());
      return;
    }
    const existing = plansQ.data?.find(item => item.plan_id === lastViewedPlanId) ?? plansQ.data?.[0];
    setPlan(existing ? normalizePlan(existing) : featureDemoReleasePlan());
  }, [apps, appsQ.isPending, plan, planIdParam, plansQ.data, plansQ.isPending]);

  useEffect(() => {
    if (!diagnosticPlan || isDemoPlan) return;
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
  }, [checkReadiness, diagnosePlan, diagnosticPlan, isDemoPlan, previewRelease, settingsBaselines]);

  useEffect(() => {
    setDemoSafePr(undefined);
    resetGeneratedManifestSafePr();
    resetGeneratedManifest();
    if (!diagnosticPlan || !selected || isDemoPlan) return;
    const timer = window.setTimeout(() => {
      generateManifest({ plan: diagnosticPlan, stepIndex: selectedIndex });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [diagnosticPlan, generateManifest, isDemoPlan, resetGeneratedManifest, resetGeneratedManifestSafePr, selected, selectedIndex]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'myjob-yaml', markersFor(monaco, generatedManifest?.diagnostics ?? []));
  }, [generatedManifest]);

  const planLiveSideEffects = releasePlanHasLiveSideEffects(plan);
  const requestReleaseExecution = useCallback((intent: ReleaseDispatchIntent) => {
    if (!plan) return;
    if (isDemoPlan) {
      openRunWorkspace('recovery');
      return;
    }
    if (executionPlanHasUnsavedChanges) {
      setTab('edit');
      push({
        tone: 'warning',
        title: '저장되지 않은 플랜 변경',
        description: '실행은 저장된 플랜 스냅샷만 사용합니다. 변경을 저장하고 준비 상태를 다시 확인하세요.',
      });
      return;
    }
    if (planLiveSideEffects) {
      checkReadiness(normalizePlan(plan), {
        onSuccess: () => setDispatchIntent(intent),
        onError: (error) => push({
          tone: 'danger',
          title: '라이브 실행 전 점검 실패',
          description: (error as Error).message || '준비 상태를 다시 확인한 뒤 실행하세요.',
        }),
      });
      return;
    }
    if (intent.action === 'wave') {
      dispatchRelease.mutate({ plan: normalizePlan(plan), wave: intent.wave });
      return;
    }
    startRelease.mutate(normalizePlan(plan));
  }, [checkReadiness, dispatchRelease, executionPlanHasUnsavedChanges, isDemoPlan, openRunWorkspace, plan, planLiveSideEffects, push, startRelease]);
  const confirmReleaseExecution = useCallback(() => {
    if (!plan || !dispatchIntent) return;
    if (executionPlanHasUnsavedChanges) {
      setDispatchIntent(null);
      setTab('edit');
      push({
        tone: 'warning',
        title: '저장되지 않은 플랜 변경',
        description: '확인 중 플랜이 변경되었습니다. 저장한 뒤 준비 상태를 다시 확인하세요.',
      });
      return;
    }
    const intent = dispatchIntent;
    setDispatchIntent(null);
    if (intent.action === 'wave') {
      dispatchRelease.mutate({ plan: normalizePlan(plan), wave: intent.wave });
      return;
    }
    startRelease.mutate(normalizePlan(plan));
  }, [dispatchIntent, dispatchRelease, executionPlanHasUnsavedChanges, plan, push, startRelease]);
  const resolveReadinessAction = useCallback((checkId: string) => {
    if (checkId === 'alerts.enabled_channels') {
      navigate(pathFor('/settings/alerts'));
      return;
    }
    if (checkId === 'plan.active_run_lock') {
      openRunWorkspace('recovery');
      return;
    }
    if (READINESS_POLICY_CHECKS.has(checkId)) {
      setDetailTab('policy');
      setEditModal('policy');
      setTab('edit');
      return;
    }
    setDetailTab('sequence');
    setTab('edit');
  }, [navigate, openRunWorkspace, pathFor]);
  const raw = useMemo(
    () => graphMode === 'demo'
      ? buildMockFlow(selectedNodeId, collapsedWaveIds)
      : buildFlow(plan, effectiveApps, selectedNodeId, diagnostics, preview),
    [collapsedWaveIds, diagnostics, effectiveApps, graphMode, plan, preview, selectedNodeId],
  );
  const filteredRaw = useMemo(
    () => filterFlow(raw, graphSearch, graphStatusFilter, graphClusterFilter, graphNamespaceFilter),
    [graphClusterFilter, graphNamespaceFilter, graphSearch, graphStatusFilter, raw],
  );
  const { nodes, edges } = useAutoLayout(filteredRaw.nodes, filteredRaw.edges, 'LR');
  const selectedGraphNode = useMemo(() => {
    const match = raw.nodes.find(node => node.id === selectedNodeId);
    return match ? match.data as ReleaseNodeData : null;
  }, [raw.nodes, selectedNodeId]);
  const selectGraphNode = useCallback((id: string) => {
    setSelectedNodeId(id);
    setInspectorTab('overview');
    const match = /^step-(\d+)$/.exec(id);
    if (match) setSelectedIndex(Number(match[1]));
    setSp(previous => {
      const next = new URLSearchParams(previous);
      next.set('node', id);
      return next;
    }, { replace: true, preventScrollReset: true });
  }, [setSp]);

  const clearGraphSelection = useCallback(() => {
    setSelectedNodeId('');
    setSp(previous => {
      const next = new URLSearchParams(previous);
      next.delete('node');
      return next;
    }, { replace: true, preventScrollReset: true });
  }, [setSp]);

  const updateGraphFilter = useCallback((key: string, value: string, emptyValue: string, update: (next: string) => void) => {
    update(value);
    setSp(previous => {
      const next = new URLSearchParams(previous);
      if (value && value !== emptyValue) next.set(key, value);
      else next.delete(key);
      return next;
    }, { replace: true, preventScrollReset: true });
  }, [setSp]);

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
    setDetailTab('sequence');
    setEditModal(null);
    setTab('overview');
    setPlanPickerOpen(false);
    setSp(previous => {
      const next = new URLSearchParams(previous);
      next.set('plan_id', releasePlanPickerId(normalized));
      next.delete('node');
      next.delete('run_id');
      return next;
    }, { replace: true, preventScrollReset: true });
  }, [setSp]);

  const setPlanValue = (patch: Partial<ReleasePlan>) => setPlan(current => current ? { ...current, ...patch } : current);
  const setPolicy = (patch: Record<string, unknown>) =>
    setPlan(current => current ? applyPolicyPatch(current, patch) : current);
  const setStep = (index: number, patch: Partial<ReleasePlanStep>) =>
    setPlan(current => current ? applyStepPatch(current, index, patch) : current);
  const openNewPlanBuilder = () => {
    setNewPlan(current => current ?? emptyDraftPlan(apps));
    setNewPlanStage('basics');
    setNewPlanSelectedIndex(0);
    setPlanPickerOpen(false);
    setCreatingPlan(true);
  };
  const setNewPlanValue = (patch: Partial<ReleasePlan>) => setNewPlan(current => current ? { ...current, ...patch } : current);
  const setNewPlanPolicy = (patch: Record<string, unknown>) =>
    setNewPlan(current => current ? applyPolicyPatch(current, patch) : current);
  const setNewPlanStep = (index: number, patch: Partial<ReleasePlanStep>) =>
    setNewPlan(current => current ? applyStepPatch(current, index, patch) : current);
  const saveCurrentPlan = () => {
    if (!plan) return;
    if (isDemoPlan) {
      setPlan(normalizePlan(plan));
      window.alert('데모 플랜 변경은 현재 화면에만 반영됩니다. 실제 플랜과 레포에는 저장되지 않습니다.');
      return;
    }
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
        setDetailTab('sequence');
        setEditModal(null);
        setTab('overview');
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
      {tab !== 'overview' && !planPickerOpen && (
        <div className="release-flow__workspace-bar">
          <div className="release-flow__workspace-bar-title">
            <span>{plan?.name || '릴리즈 플랜'}</span>
            <strong>{releaseWorkspaceTitle(tab)}</strong>
            {!isDemoPlan && executionPlanHasUnsavedChanges && <Badge tone="warning">저장 필요</Badge>}
          </div>
          <ReleaseWorkspaceNav
            active={tab}
            onChange={(item) => {
              if (item === 'overview') {
                setPlanPickerOpen(false);
                setTab('overview');
              } else if (item === 'edit') {
                setDetailTab('sequence');
                setTab('edit');
              } else if (item === 'run') {
                openRunWorkspace('start');
              } else {
                setTab('yaml');
              }
            }}
          />
          <div className="release-flow__workspace-bar-actions">
            {tab === 'edit' && <Button size="sm" variant="primary" loading={!isDemoPlan && save.isPending} disabled={!plan} onClick={saveCurrentPlan}><IconSave size={14} />{isDemoPlan ? '데모 반영' : '저장'}</Button>}
            <details className="release-flow__more-menu">
              <summary>더보기</summary>
              <div>
                <Button size="sm" variant="ghost" onClick={() => { setPlanPickerOpen(true); setTab('overview'); }}>플랜 선택</Button>
                {tab === 'edit' && <Button size="sm" variant="ghost" onClick={() => setEditModal('plan')}>플랜 정보 수정</Button>}
                <Button size="sm" variant="ghost" onClick={openNewPlanBuilder}><IconPlus size={13} />새 플랜</Button>
                {plan?.status === 'archived' ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="보관된 플랜을 이전 상태로 복구합니다"
                    disabled={!plan?.plan_id || restorePlan.isPending}
                    onClick={() => setRestorePlanOpen(true)}
                  >
                    플랜 복구
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    title={(runSummary?.active_runs ?? 0) > 0 ? '진행 중인 릴리즈를 먼저 종료하거나 취소하세요' : '기록은 남기고 플랜만 보관 처리합니다'}
                    disabled={!plan?.plan_id || archivePlan.isPending || (runSummary?.active_runs ?? 0) > 0}
                    onClick={() => setArchivePlanOpen(true)}
                  >
                    플랜 보관
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  title="이 플랜을 삭제합니다"
                  disabled={!plan?.plan_id || deletePlan.isPending}
                  onClick={() => setPlanDeletionMode('normal')}
                >
                  플랜 삭제
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  title="이 플랜과 연결된 릴리즈 실행 기록을 모두 삭제합니다"
                  disabled={!plan?.plan_id || deletePlan.isPending}
                  onClick={() => setPlanDeletionMode('force')}
                >
                  강제 삭제
                </Button>
              </div>
            </details>
          </div>
        </div>
      )}

      {appsQ.isPending ? (
        <Card title="릴리즈 플랜" loading>
          <p className="release-flow__hint">애플리케이션과 플랜을 불러오는 중입니다...</p>
        </Card>
      ) : appsQ.error ? (
        <EmptyState title="릴리즈 플랜 정보를 불러오지 못했습니다" description={(appsQ.error as Error).message ?? '잠시 후 다시 시도해주세요.'} />
      ) : plan ? (
        planPickerOpen ? (
          <ReleasePlanPickerScreen
            plans={pickerPlans}
            currentPlanId={releasePlanPickerId(plan)}
            onSelect={selectPlanFromPicker}
            onCreate={openNewPlanBuilder}
          />
        ) : (
          <>
          {tab === 'overview' && (
            <ReleaseCanvasWorkspace
              plan={plan}
              nodes={nodes}
              edges={edges}
              selectedNode={selectedGraphNode}
              diagnostics={diagnostics}
              preview={preview}
              summary={runSummary}
              isDemo={isDemoPlan}
              inspectorTab={inspectorTab}
              graphSearch={graphSearch}
              graphStatusFilter={graphStatusFilter}
              graphClusterFilter={graphClusterFilter}
              graphNamespaceFilter={graphNamespaceFilter}
              clusters={graphFilterOptions(raw.nodes, 'cluster')}
              namespaces={graphFilterOptions(raw.nodes, 'namespace')}
              clusterHref={selectedGraphNode?.cluster ? pathFor(`/clusters/${encodeURIComponent(selectedGraphNode.cluster)}`) : ''}
              applicationHref={selectedGraphNode?.nodeType === 'application' ? pathFor(`/repos/${encodeURIComponent(selectedGraphNode.step.application_id)}`) : ''}
              onInspectorTab={setInspectorTab}
              onGraphNodeClick={selectGraphNode}
              onGraphPaneClick={clearGraphSelection}
              onSearch={(value) => updateGraphFilter('q', value, '', setGraphSearch)}
              onStatus={(value) => updateGraphFilter('status', value, 'all', setGraphStatusFilter)}
              onCluster={(value) => updateGraphFilter('cluster', value, 'all', setGraphClusterFilter)}
              onNamespace={(value) => updateGraphFilter('namespace', value, 'all', setGraphNamespaceFilter)}
              onOpenPicker={() => { setPlanPickerOpen(true); setTab('overview'); }}
              onOpenEdit={(nextTab = 'sequence') => { setDetailTab(nextTab); setTab('edit'); }}
              onOpenRun={() => openRunWorkspace('start')}
              onOpenYaml={() => setTab('yaml')}
              onCreate={openNewPlanBuilder}
            />
          )}
          {tab === 'edit' && (
            <ReleasePlanDetailWorkspace
              plan={plan}
              selected={selected}
              selectedNode={selectedGraphNode}
              selectedIndex={selectedIndex}
              apps={effectiveApps}
              appById={appById}
              nodes={nodes}
              edges={edges}
              diagnostics={diagnostics}
              preview={preview}
              readiness={readiness}
              summary={runSummary}
              detailTab={detailTab}
              editModal={editModal}
              saving={!isDemoPlan && save.isPending}
              onDetailTab={setDetailTab}
              onEditModal={setEditModal}
              onPlanValue={setPlanValue}
              onPolicy={setPolicy}
              onStep={setStep}
              onPlan={setPlan}
              onSave={saveCurrentPlan}
              onSelectStep={(index) => { setSelectedIndex(index); setSelectedNodeId(`step-${index}`); }}
              onGraphNodeClick={selectGraphNode}
              onGraphPaneClick={clearGraphSelection}
              onAddStep={() => addStep(plan, effectiveApps, setPlan)}
              onMoveStep={(index, delta) => moveStep(plan, index, delta, setPlan, setSelectedIndex)}
              onRemoveStep={(index) => removeStep(plan, index, setPlan, setSelectedIndex)}
              onOpenRun={openRunWorkspace}
            />
          )}
          {tab === 'run' && (
            <div className="release-flow__run-workspace">
              <nav className="release-flow__run-shortcuts" aria-label="실행 작업 바로가기">
                {([
                  ['start', '실행 시작', '미리보기와 준비 상태'],
                  ['recovery', '재시도/롤백', '실패 복구와 실행 제어'],
                  ['history', '실행 기록', '최근 실행과 감사 로그'],
                ] as const).map(([value, label, help]) => (
                  <button key={value} type="button" aria-current={runFocus === value ? 'page' : undefined} onClick={() => setRunFocus(value)}>
                    <strong>{label}</strong>
                    <span>{help}</span>
                  </button>
                ))}
              </nav>

              {runFocus === 'start' && (
                <section id="release-flow-run-start" className="release-flow__run-section release-flow__run-section--start" aria-label="실행 시작">
                  <ReleasePlanSettingsSummary
                    plan={plan}
                    onEdit={() => { setTab('edit'); setDetailTab('policy'); setEditModal('policy'); }}
                  />
                  <PreviewPanel
                    preview={preview}
                    loading={!isDemoPlan && releasePreviewPending}
                    dispatching={!isDemoPlan && (dispatchRelease.isPending || startRelease.isPending || releaseReadinessPending)}
                    liveSideEffects={planLiveSideEffects}
                    onDispatch={wave => requestReleaseExecution({ action: 'wave', wave })}
                    onStart={() => requestReleaseExecution({ action: 'run', wave: preview?.waves[0]?.wave ?? 1 })}
                  />
                  <ReadinessPanel
                    readiness={readiness}
                    loading={!isDemoPlan && releaseReadinessPending}
                    onRefresh={() => !isDemoPlan && diagnosticPlan && checkReadiness(diagnosticPlan)}
                    onResolve={resolveReadinessAction}
                  />
                  <AlertChannelsPanel
                    channels={alertChannelsQ.data ?? []}
                    loading={alertChannelsQ.isPending}
                    error={alertChannelsQ.isError ? alertChannelsQ.error : null}
                    readiness={readiness}
                    settingsHref={pathFor('/settings/alerts')}
                  />
                </section>
              )}

              {runFocus === 'recovery' && (
                <section id="release-flow-run-recovery" className="release-flow__run-section" aria-label="재시도와 롤백">
                  <RunPanel
                    plan={plan}
                    runs={isDemoPlan ? [] : runsQ.data ?? []}
                    summary={runSummary}
                    runFilter={runFilter}
                    onRunFilterChange={setRunFilter}
                    selectedRunId={selectedRunId}
                    onSelectedRunIdChange={selectRunId}
                    loading={!isDemoPlan && runsQ.isPending}
                    busy={!isDemoPlan && (advanceRun.isPending || pauseRun.isPending || resumeRun.isPending || retryRun.isPending || rollbackRun.isPending || cancelRun.isPending || notifyRun.isPending || deleteRun.isPending)}
                    onAdvance={runId => advanceRun.mutate({ runId })}
                    onPause={(runId, reason) => pauseRun.mutate({ runId, reason })}
                    onResume={(runId, reason) => resumeRun.mutate({ runId, reason })}
                    onRetry={(runId, reason) => retryRun.mutate({ runId, reason })}
                    onRollback={(runId, reason) => rollbackRun.mutate({ runId, reason })}
                    onCancel={(runId, reason) => cancelRun.mutate({ runId, reason })}
                    onNotify={(runId, reason) => notifyRun.mutate({ runId, reason })}
                    onDelete={(runId, force) => deleteRun.mutate({ runId, force })}
                  />
                </section>
              )}

              {runFocus === 'history' && (
                <section id="release-flow-run-history" className="release-flow__run-section" aria-label="실행 기록과 감사 로그">
                  <AuditPanel
                    events={auditEvents}
                    loading={!isDemoPlan && auditQ.isPending}
                    exporting={!isDemoPlan && exportAudit.isPending}
                    scopedRunId={selectedRunId}
                    eventType={auditEventType}
                    onEventTypeChange={setAuditEventType}
                    onExport={() => isDemoPlan
                      ? downloadTextFile('demo-release-audit.csv', releaseAuditCsv(auditEvents))
                      : exportAudit.mutate()}
                  />
                  <DiagnosticsPanel diagnostics={diagnostics} />
                </section>
              )}
            </div>
          )}

          {tab === 'yaml' && (
            <ReleaseYamlPrWorkspace
              plan={plan}
              selected={selected}
              selectedIndex={selectedIndex}
              appById={appById}
              generated={generatedManifest}
              safePr={safePr}
              isDemo={isDemoPlan}
              generatedError={isDemoPlan ? null : generatedManifestError}
              safePrError={isDemoPlan ? null : generatedManifestSafePrError}
              loading={!isDemoPlan && generatedManifestPending}
              creatingSafePr={!isDemoPlan && generatedManifestSafePrPending}
              onMount={onMount}
              onSelectStep={(index) => { setSelectedIndex(index); setSelectedNodeId(`step-${index}`); }}
              onEditSteps={() => { setDetailTab('sequence'); setTab('edit'); }}
              onOpenRun={() => openRunWorkspace('history')}
              onRetryGenerate={() => !isDemoPlan && diagnosticPlan && selected && generateManifest({ plan: diagnosticPlan, stepIndex: selectedIndex })}
              onCreateSafePr={(title, body) => {
                if (!diagnosticPlan || !selected) return;
                if (isDemoPlan && generatedManifest) {
                  setDemoSafePr(demoReleaseSafePr(diagnosticPlan, selectedIndex, generatedManifest, title, body));
                  return;
                }
                submitGeneratedManifestSafePr({ plan: diagnosticPlan, stepIndex: selectedIndex, title, body });
              }}
            />
          )}
          </>
        )
      ) : <EmptyState title="릴리즈 플랜 준비 중" />}
      <ReleaseDispatchConfirmation
        open={dispatchIntent !== null}
        intent={dispatchIntent}
        plan={plan}
        preview={preview}
        readiness={readiness}
        pending={dispatchRelease.isPending || startRelease.isPending}
        onConfirm={confirmReleaseExecution}
        onOpenChange={(open) => {
          if (!open && !dispatchRelease.isPending && !startRelease.isPending) setDispatchIntent(null);
        }}
      />
      <PlanDeletionConfirmation
        plan={plan}
        mode={planDeletionMode}
        pending={deletePlan.isPending}
        onConfirm={(mode) => {
          if (!plan?.plan_id) return;
          deletePlan.mutate(mode === 'force', {
            onSuccess: () => {
              const nextPlan = draftPlan(apps);
              setPlan(nextPlan);
              rememberLastViewedReleasePlan(nextPlan);
              setSelectedIndex(0);
              setSelectedNodeId('sys-precheck');
              setPlanPickerOpen(true);
              setTab('overview');
              setPlanDeletionMode(null);
            },
          });
        }}
        onOpenChange={(open) => {
          if (!open && !deletePlan.isPending) setPlanDeletionMode(null);
        }}
      />
      <PlanArchiveConfirmation
        plan={plan}
        open={archivePlanOpen}
        pending={archivePlan.isPending}
        onConfirm={(reason) => {
          archivePlan.mutate(reason, {
            onSuccess: data => {
              const archived = normalizePlan(data.plan);
              setPlan(archived);
              rememberLastViewedReleasePlan(archived);
              setArchivePlanOpen(false);
              setPlanPickerOpen(true);
              setTab('overview');
            },
          });
        }}
        onOpenChange={(open) => {
          if (!open && !archivePlan.isPending) setArchivePlanOpen(false);
        }}
      />
      <PlanRestoreConfirmation
        plan={plan}
        open={restorePlanOpen}
        pending={restorePlan.isPending}
        onConfirm={(reason) => {
          restorePlan.mutate(reason, {
            onSuccess: data => {
              const restored = normalizePlan(data.plan);
              setPlan(restored);
              rememberLastViewedReleasePlan(restored);
              setRestorePlanOpen(false);
              setPlanPickerOpen(false);
              setTab('overview');
            },
          });
        }}
        onOpenChange={(open) => {
          if (!open && !restorePlan.isPending) setRestorePlanOpen(false);
        }}
      />
    </motion.div>
  );
}

function ReleaseCanvasWorkspace({
  plan,
  nodes,
  edges,
  selectedNode,
  diagnostics,
  preview,
  summary,
  isDemo,
  inspectorTab,
  graphSearch,
  graphStatusFilter,
  graphClusterFilter,
  graphNamespaceFilter,
  clusters,
  namespaces,
  clusterHref,
  applicationHref,
  onInspectorTab,
  onGraphNodeClick,
  onGraphPaneClick,
  onSearch,
  onStatus,
  onCluster,
  onNamespace,
  onOpenPicker,
  onOpenEdit,
  onOpenRun,
  onOpenYaml,
  onCreate,
}: {
  plan: ReleasePlan;
  nodes: Node[];
  edges: ReleaseEdge[];
  selectedNode: ReleaseNodeData | null;
  diagnostics: Diagnostic[];
  preview?: ReleasePlanPreview;
  summary?: ReleaseRunSummary;
  isDemo: boolean;
  inspectorTab: string;
  graphSearch: string;
  graphStatusFilter: string;
  graphClusterFilter: string;
  graphNamespaceFilter: string;
  clusters: string[];
  namespaces: string[];
  clusterHref: string;
  applicationHref: string;
  onInspectorTab: (value: string) => void;
  onGraphNodeClick: (id: string) => void;
  onGraphPaneClick: () => void;
  onSearch: (value: string) => void;
  onStatus: (value: string) => void;
  onCluster: (value: string) => void;
  onNamespace: (value: string) => void;
  onOpenPicker: () => void;
  onOpenEdit: (tab?: ReleaseDetailTab) => void;
  onOpenRun: () => void;
  onOpenYaml: () => void;
  onCreate: () => void;
}) {
  const errors = diagnostics.filter(item => item.severity === 'error').length;
  const warnings = diagnostics.filter(item => item.severity === 'warning').length;
  const activeRuns = summary?.active_runs ?? 0;
  const activeFilters = [graphSearch.trim(), graphStatusFilter !== 'all', graphClusterFilter !== 'all', graphNamespaceFilter !== 'all'].filter(Boolean).length;
  return (
    <section className="release-flow__overview-shell release-flow__overview-shell--studio" aria-label="릴리즈 흐름 캔버스">
      <div className="release-flow__studio-workbench">
        <div className={`release-flow__dag-card release-flow__dag-card--studio ${selectedNode ? 'release-flow__dag-card--inspecting' : ''}`}>
          <div className="release-flow__canvas release-flow__canvas--studio">
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              interactive
              scrollBehavior="zoom"
              fitViewPadding={0.07}
              fitViewMinZoom={0.72}
              onNodeClick={onGraphNodeClick}
              onPaneClick={onGraphPaneClick}
            />
          </div>

          <div className="release-flow__canvas-overlay release-flow__canvas-overlay--header">
            <header className="release-flow__canvas-topbar">
              <div className="release-flow__canvas-title">
                <span>릴리즈 흐름</span>
                <h1>{plan.name || '이름 없는 릴리즈 플랜'}</h1>
              </div>
              <div className="release-flow__canvas-status" aria-label="릴리즈 상태 요약">
                {isDemo && <span className="is-active is-demo">기능 데모</span>}
                <span className="is-count">{plan.steps.length}개 단계</span>
                <span className={errors > 0 ? 'is-danger' : warnings > 0 ? 'is-warning' : 'is-ok'}>
                  {errors > 0 ? `오류 ${errors}` : warnings > 0 ? `경고 ${warnings}` : '진단 정상'}
                </span>
                {activeRuns > 0 && <span className="is-active">실행 중 {activeRuns}</span>}
                {preview?.executable && <span className="is-ok">실행 가능</span>}
              </div>
              <ReleaseWorkspaceNav
                active="overview"
                className="release-flow__canvas-nav"
                onChange={(item) => {
                  if (item === 'edit') onOpenEdit('sequence');
                  else if (item === 'run') onOpenRun();
                  else if (item === 'yaml') onOpenYaml();
                }}
              />
              <div className="release-flow__canvas-actions">
                <Button size="sm" variant="ghost" onClick={onOpenPicker}>플랜 선택</Button>
                <details className="release-flow__canvas-more">
                  <summary>더보기</summary>
                  <div>
                    <button type="button" onClick={() => onOpenEdit('diagnostics')}>실행 전 진단</button>
                    <button type="button" onClick={() => onOpenEdit('policy')}>승인·정책</button>
                    <button type="button" onClick={onCreate}>새 플랜 만들기</button>
                  </div>
                </details>
              </div>
            </header>
          </div>

          <div className="release-flow__canvas-overlay release-flow__canvas-overlay--tools">
            <details className="release-flow__canvas-view-menu">
              <summary>보기 설정{activeFilters > 0 ? ` ${activeFilters}` : ''}</summary>
              <div>
                <Field label="앱 또는 레포 찾기">
                  <input className="input" value={graphSearch} placeholder="이름으로 필터" onChange={event => onSearch(event.target.value)} />
                </Field>
                <SelectField label="배포 상태" value={graphStatusFilter} options={[['all', '모든 상태'], ['queued', '대기'], ['running', '진행 중'], ['succeeded', '성공'], ['blocked', '막힘'], ['failed', '실패']]} onChange={onStatus} />
                <SelectField label="클러스터" value={graphClusterFilter} options={[['all', '모든 클러스터'], ...clusters.map(value => [value, value])]} onChange={onCluster} />
                <SelectField label="네임스페이스" value={graphNamespaceFilter} options={[['all', '모든 네임스페이스'], ...namespaces.map(value => [value, value])]} onChange={onNamespace} />
              </div>
            </details>
          </div>

          {selectedNode && (
            <div className="release-flow__canvas-overlay release-flow__canvas-overlay--dock">
              <ReleaseNodeSidePanel
                node={selectedNode}
                tab={inspectorTab}
                clusterHref={clusterHref}
                applicationHref={applicationHref}
                onTab={onInspectorTab}
                onClose={onGraphPaneClick}
                onOpenRuns={onOpenRun}
                onOpenYaml={onOpenYaml}
              />
            </div>
          )}

          {!selectedNode && (
            <div className="release-flow__canvas-overlay release-flow__canvas-overlay--legend">
              <ReleaseFlowLegend />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ReleaseYamlPrWorkspace({
  plan,
  selected,
  selectedIndex,
  appById,
  generated,
  safePr,
  isDemo,
  generatedError,
  safePrError,
  loading,
  creatingSafePr,
  onMount,
  onSelectStep,
  onEditSteps,
  onOpenRun,
  onRetryGenerate,
  onCreateSafePr,
}: {
  plan: ReleasePlan;
  selected?: ReleasePlanStep;
  selectedIndex: number;
  appById: Map<string, Application>;
  generated?: ReleaseGeneratedManifest;
  safePr?: ReleaseManifestSafePr;
  isDemo: boolean;
  generatedError?: Error | null;
  safePrError?: Error | null;
  loading: boolean;
  creatingSafePr: boolean;
  onMount: OnMount;
  onSelectStep: (index: number) => void;
  onEditSteps: () => void;
  onOpenRun: () => void;
  onRetryGenerate: () => void;
  onCreateSafePr: (title: string, body: string) => void;
}) {
  const [fileIndex, setFileIndex] = useState(0);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  useEffect(() => setFileIndex(0), [generated?.manifest, selectedIndex]);
  useEffect(() => {
    const stepName = selected?.name || selected?.application_id || 'release manifest';
    setPrTitle(`${plan.name}: ${stepName}`);
    setPrBody('');
  }, [plan.name, selected?.application_id, selected?.name, selectedIndex]);
  const app = selected ? appById.get(selected.application_id) : undefined;
  const files = generated?.files ?? [];
  const file = files[Math.min(fileIndex, Math.max(files.length - 1, 0))];
  const manifest = file?.content || generated?.manifest || '# 검토할 릴리즈 단계를 선택하세요.\n';
  const errors = generated?.diagnostics.filter(item => item.severity === 'error').length ?? 0;
  const warnings = generated?.diagnostics.filter(item => item.severity === 'warning').length ?? 0;
  const repoRef = safePr?.repo_ref || getString(selected?.config.repo_ref, app?.repo_ref ?? '');
  const branch = safePr?.base_branch || getString(selected?.config.branch, app?.branch ?? '');
  const manifestPath = safePr?.manifest_path || file?.path || getString(selected?.config.manifest_path, app?.manifest_path ?? '');
  const commitSha = safePr?.commit_sha || getString(selected?.config.commit_sha);
  const reviewChecks = [
    { label: '검토 단계 선택', ok: Boolean(selected) },
    { label: '생성 파일 존재', ok: files.length > 0 },
    { label: '차단 오류 없음', ok: Boolean(generated) && !generatedError && errors === 0 },
    { label: '레포와 기준 브랜치 확인', ok: Boolean(repoRef && branch) },
    { label: '매니페스트 경로 확인', ok: Boolean(manifestPath) },
  ];
  const canCreateSafePr = reviewChecks.every(item => item.ok) && !loading;
  return (
    <section className="release-flow__yaml-review" aria-labelledby="release-yaml-review-title">
      <header className="release-flow__yaml-review-head">
        <div>
          <span>Generated manifest review</span>
          <h1 id="release-yaml-review-title">YAML / PR 검토</h1>
          <p>{isDemo ? '샘플 YAML과 PR 접수 결과로 실제 검토 화면의 구성과 상태를 확인합니다.' : '단계별 생성 YAML을 확인하고 진단을 통과한 변경만 Safe PR로 요청합니다.'}</p>
        </div>
        <div className="release-flow__yaml-review-status">
          {isDemo && <Badge tone="info">기능 데모</Badge>}
          <Badge tone={generatedError || errors > 0 ? 'danger' : warnings > 0 ? 'warning' : generated ? 'success' : 'neutral'}>
            {loading ? 'YAML 생성 중' : generatedError ? '생성 실패' : errors > 0 ? `오류 ${errors}` : warnings > 0 ? `경고 ${warnings}` : generated ? '검토 가능' : '단계 필요'}
          </Badge>
          {generated && <span>{generated.resource_count}개 리소스</span>}
          {safePr?.accepted && <Badge tone="success">PR 요청 접수</Badge>}
        </div>
        <div className="release-flow__yaml-review-actions">
          <Button size="sm" variant="ghost" disabled={!generated} onClick={() => copyText(manifest, 'YAML을 복사했습니다.', 'YAML 복사')}>YAML 복사</Button>
          <Button size="sm" disabled={!generated} onClick={() => downloadTextFile(file?.path || 'release-manifest.yaml', manifest)}>파일 저장</Button>
          <Button size="sm" variant="primary" loading={creatingSafePr} disabled={!canCreateSafePr || creatingSafePr} onClick={() => onCreateSafePr(prTitle, prBody)}>Safe PR 요청</Button>
        </div>
      </header>

      <div className="release-flow__yaml-review-layout">
        <aside className="release-flow__yaml-step-panel" aria-label="검토할 릴리즈 단계">
          <div className="release-flow__yaml-panel-head">
            <strong>검토 단계</strong>
            <span>{plan.steps.length}개</span>
          </div>
          {plan.steps.length > 0 ? (
            <div className="release-flow__yaml-step-list">
              {plan.steps.map((step, index) => (
                <button key={step.step_id || `${step.application_id}-${index}`} type="button" aria-pressed={selectedIndex === index} onClick={() => onSelectStep(index)}>
                  <i>{index + 1}</i>
                  <span><strong>{step.name || step.application_id}</strong><small>{getString(step.config.manifest_path, appById.get(step.application_id)?.manifest_path ?? '경로 미정')}</small></span>
                </button>
              ))}
            </div>
          ) : (
            <div className="release-flow__yaml-step-empty">
              <p>검토할 단계가 없습니다.</p>
              <Button size="sm" variant="primary" onClick={onEditSteps}>단계 추가</Button>
            </div>
          )}
        </aside>

        <div className="release-flow__yaml-review-main">
          <div className="release-flow__yaml-filebar">
            <div className="release-flow__yaml-file-tabs" aria-label="생성 파일">
              {files.length > 0 ? files.map((item, index) => (
                <button key={`${item.path}-${index}`} type="button" aria-pressed={fileIndex === index} onClick={() => setFileIndex(index)}>{item.path}</button>
              )) : <span>생성된 파일 없음</span>}
            </div>
            {file && <span>{file.action || 'review'}</span>}
          </div>
          <div className="release-flow__editor release-flow__editor--review">
            <Editor
              height="560px"
              language="yaml"
              theme="vs-dark"
              value={manifest}
              onMount={onMount}
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbersMinChars: 3, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2, folding: true }}
            />
          </div>

          {generatedError && (
            <div className="release-flow__yaml-error" role="alert">
              <div>
                <strong>YAML을 생성하지 못했습니다.</strong>
                <span>{generatedError.message || '단계 설정과 레포 정보를 확인한 뒤 다시 시도하세요.'}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={onRetryGenerate}>다시 생성</Button>
            </div>
          )}

          <div className="release-flow__yaml-review-lower">
            <section className="release-flow__yaml-review-panel" aria-label="PR 제출 점검">
              <div className="release-flow__yaml-panel-head"><strong>PR 제출 점검</strong><span>{reviewChecks.filter(item => item.ok).length}/{reviewChecks.length}</span></div>
              <div className="release-flow__yaml-checklist">
                {reviewChecks.map(item => <div key={item.label} data-state={item.ok ? 'passed' : 'blocked'}><span>{item.ok ? '통과' : '필요'}</span><strong>{item.label}</strong></div>)}
              </div>
              <div className="release-flow__yaml-pr-compose">
                <Field label="PR 제목">
                  <input className="input" value={prTitle} maxLength={180} placeholder="생성 매니페스트 변경 제목" onChange={event => setPrTitle(event.target.value)} />
                </Field>
                <Field label="검토 메모">
                  <textarea value={prBody} maxLength={4000} rows={4} placeholder="검토자에게 전달할 변경 이유와 확인 사항" onChange={event => setPrBody(event.target.value)} />
                </Field>
              </div>
              <div className="release-flow__field-grid">
                <FieldValue label="레포" value={repoRef || '-'} wrap wide />
                <FieldValue label="기준 브랜치" value={branch || '-'} />
                <FieldValue label="경로" value={manifestPath || '-'} mono wrap wide />
                <FieldValue label="커밋" value={commitSha ? commitSha.slice(0, 12) : '-'} mono />
              </div>
              {safePr?.accepted && (
                <div className="release-flow__yaml-pr-result">
                  <strong>{isDemo ? 'Safe PR 샘플 요청이 접수되었습니다.' : 'Safe PR 워크플로가 접수되었습니다.'}</strong>
                  <span>실행 {safePr.workflow_run_id}</span>
                  <span>패치 {safePr.patch_sha256.slice(0, 16)}</span>
                  <span>상관 ID {safePr.correlation_id}</span>
                  <div className="release-flow__yaml-pr-result-actions">
                    <Button size="sm" variant="ghost" onClick={() => copyText(safePr.correlation_id, '상관 ID를 복사했습니다.', '상관 ID 복사')}>ID 복사</Button>
                    <Button size="sm" onClick={onOpenRun}>실행 기록 열기</Button>
                  </div>
                </div>
              )}
              {safePrError && (
                <div className="release-flow__yaml-error release-flow__yaml-error--safe-pr" role="alert">
                  <div>
                    <strong>Safe PR 요청이 차단되었습니다.</strong>
                    <span>{safePrError.message || '제출 조건을 다시 확인하세요.'}</span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={onEditSteps}>설정 수정</Button>
                </div>
              )}
              {!safePr?.accepted && !safePrError && reviewChecks.some(item => !item.ok) && (
                <div className="release-flow__yaml-review-next">
                  <span>필요 항목을 수정하면 Safe PR 요청이 활성화됩니다.</span>
                  <Button size="sm" variant="ghost" onClick={onEditSteps}>단계 설정 수정</Button>
                </div>
              )}
            </section>

            <section className="release-flow__yaml-review-panel" aria-label="생성 리소스">
              <div className="release-flow__yaml-panel-head"><strong>생성 리소스</strong><span>{generated?.resources.length ?? 0}개</span></div>
              <div className="release-flow__yaml-resource-list">
                {(generated?.resources ?? []).map(resource => (
                  <div key={`${resource.kind}-${resource.namespace}-${resource.name}`}><strong>{resource.kind}</strong><span>{resource.namespace || 'default'} / {resource.name}</span></div>
                ))}
                {generated && generated.resources.length === 0 && <p>생성된 Kubernetes 리소스가 없습니다.</p>}
                {!generated && <p>단계를 선택하면 생성 리소스가 표시됩니다.</p>}
              </div>
              {(generated?.warnings ?? []).map(warning => <div key={warning} className="release-flow__diag release-flow__diag--warning">{warning}</div>)}
            </section>
          </div>

          <DiagnosticsPanel diagnostics={generated?.diagnostics ?? []} />
        </div>
      </div>
    </section>
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

function ReleaseWorkspaceNav({ active, onChange, className = '' }: { active: ReleaseTab; onChange: (tab: ReleaseTab) => void; className?: string }) {
  return (
    <nav className={`release-flow__workspace-tabs ${className}`.trim()} aria-label="릴리즈 작업 화면">
      {RELEASE_WORKSPACE_TABS.map(item => (
        <button key={item} type="button" aria-current={active === item ? 'page' : undefined} onClick={() => onChange(item)}>
          {releaseWorkspaceTitle(item)}
        </button>
      ))}
    </nav>
  );
}

function releaseWorkspaceTitle(tab: ReleaseTab): string {
  const labels: Record<ReleaseTab, string> = {
    overview: '현재 상황',
    edit: '플랜 편집',
    run: '실행 관리',
    yaml: 'YAML/PR',
  };
  return labels[tab];
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
        <Button size="sm" title="생성된 매니페스트와 Safe PR 요청 상태를 검토합니다" onClick={onYaml}>YAML/PR</Button>
        <Button size="sm" variant="primary" title="릴리즈 실행 기록과 승인 상태를 확인합니다" onClick={onRun}>실행 관리</Button>
        <Button size="sm" onClick={onCreate}><IconPlus size={13} />새 플랜</Button>
        <Button size="sm" onClick={onEdit}>플랜 편집</Button>
        <Button size="sm" onClick={onYaml}>YAML/PR</Button>
        <Button size="sm" variant="primary" onClick={onRun}>실행 관리</Button>
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
            key={releasePlanPickerId(item)}
            plan={item}
            index={index}
            selected={releasePlanPickerId(item) === currentPlanId}
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
  const previewSteps = steps.slice(0, 4);
  const environments = Array.from(new Set(steps.map(step => getString(step.config.environment)).filter(Boolean)));
  const namespaces = Array.from(new Set(steps.map(step => getString(step.config.namespace)).filter(Boolean)));
  const strategy = valueLabel(getString(plan.settings.default_strategy, 'rolling'));
  const approval = valueLabel(getString(plan.settings.approval_policy, 'manual_each_step'));
  const runtime = valueLabel(getString(plan.settings.runtime_mode, 'demo'));
  const target = environments[0] || namespaces[0] || firstEnvironment(plan);
  const isDemo = isFeatureDemoPlan(plan);
  const updated = isDemo ? '샘플 데이터' : plan.updated_at ? plan.updated_at.slice(0, 10) : '저장 전';

  return (
    <button
      type="button"
      className={`release-flow__plan-card ${selected ? 'release-flow__plan-card--selected' : ''}`}
      data-demo={isDemo ? 'true' : undefined}
      aria-pressed={selected}
      onClick={() => onSelect(plan)}
    >
      <div className="release-flow__plan-card-preview" aria-hidden="true">
        <span className="release-flow__plan-card-rank">{index + 1}</span>
        <div className="release-flow__plan-mini-flow">
          {previewSteps.length > 0 ? previewSteps.map((step, stepIndex) => (
              <span key={step.step_id || `${step.name}-${stepIndex}`} className="release-flow__plan-mini-node">
                <i>{stepIndex + 1}</i>
                <b>{step.name || step.application_id || `Step ${stepIndex + 1}`}</b>
              </span>
            )) : (
              <span className="release-flow__plan-mini-empty">아직 등록된 단계가 없습니다.</span>
            )}
        </div>
      </div>
      <div className="release-flow__plan-card-body">
        <div className="release-flow__plan-card-title-row">
          <h3>{plan.name || '이름 없는 릴리즈 플랜'}</h3>
          <div className="release-flow__plan-card-badges">
            {isDemo && <Badge tone="info">기능 데모</Badge>}
            <Badge tone={toneForStatus(plan.status)}>{statusLabel(plan.status)}</Badge>
          </div>
        </div>
        <p>{plan.description || `${steps.length}개 단계로 구성된 릴리즈 워크플로우입니다.`}</p>
        <div className="release-flow__plan-card-meta">
          <span>{steps.length} 단계</span>
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

function ReleasePlanDetailWorkspace({
  plan,
  selected,
  selectedNode,
  selectedIndex,
  apps,
  appById,
  nodes,
  edges,
  diagnostics,
  preview,
  readiness,
  summary,
  detailTab,
  editModal,
  saving,
  onDetailTab,
  onEditModal,
  onPlanValue,
  onPolicy,
  onStep,
  onPlan,
  onSave,
  onSelectStep,
  onGraphNodeClick,
  onGraphPaneClick,
  onAddStep,
  onMoveStep,
  onRemoveStep,
  onOpenRun,
}: {
  plan: ReleasePlan;
  selected?: ReleasePlanStep;
  selectedNode: ReleaseNodeData | null;
  selectedIndex: number;
  apps: Application[];
  appById: Map<string, Application>;
  nodes: Node[];
  edges: ReleaseEdge[];
  diagnostics: Diagnostic[];
  preview?: ReleasePlanPreview;
  readiness?: ReleaseReadiness;
  summary?: ReleaseRunSummary;
  detailTab: ReleaseDetailTab;
  editModal: ReleaseEditModal;
  saving: boolean;
  onDetailTab: (tab: ReleaseDetailTab) => void;
  onEditModal: (modal: ReleaseEditModal) => void;
  onPlanValue: (patch: Partial<ReleasePlan>) => void;
  onPolicy: (patch: Record<string, unknown>) => void;
  onStep: (index: number, patch: Partial<ReleasePlanStep>) => void;
  onPlan: Dispatch<SetStateAction<ReleasePlan | null>>;
  onSave: () => void;
  onSelectStep: (index: number) => void;
  onGraphNodeClick: (id: string) => void;
  onGraphPaneClick: () => void;
  onAddStep: () => void;
  onMoveStep: (index: number, delta: number) => void;
  onRemoveStep: (index: number) => void;
  onOpenRun: (focus?: ReleaseRunFocus) => void;
}) {
  const saveLabel = isFeatureDemoPlan(plan) ? '데모 반영' : '저장';
  const settings = { ...DEFAULT_POLICY, ...plan.settings };
  const errors = diagnostics.filter(item => item.severity === 'error').length;
  const warnings = diagnostics.filter(item => item.severity === 'warning').length;
  const readyLabel = preview?.executable ? '실행 가능' : errors > 0 ? '수정 필요' : '검토 필요';
  const activeRuns = summary?.active_runs ?? 0;
  const selectedLabel = selected?.name || selected?.application_id || selectedNode?.step.name || '선택된 단계 없음';
  const nextAction = firstReason(
    errors > 0 ? '진단 탭에서 막힌 항목을 먼저 해결하세요.' : '',
    !preview?.executable ? '실행 전에 정책과 단계 설정을 검토하세요.' : '',
    activeRuns > 0 ? '실행 관리에서 진행 중인 릴리즈를 확인하세요.' : '',
    '변경 내용을 저장한 뒤 실행 관리에서 미리보기와 실행을 진행하세요.',
  ) ?? '변경 내용을 저장한 뒤 실행 관리에서 미리보기와 실행을 진행하세요.';
  return (
    <div className="release-flow__detail-shell">
      <section className="release-flow__detail-hero" aria-label="선택한 릴리즈 플랜">
        <div className="release-flow__detail-title">
          <span className="release-flow__builder-kicker">Release plan detail</span>
          <h2>{plan.name || '이름 없는 릴리즈 플랜'}</h2>
          <p>{plan.description || '플랜 설명을 추가하면 팀원이 릴리즈 목적과 범위를 빠르게 이해할 수 있습니다.'}</p>
          <div className="release-flow__builder-meta">
            <Badge tone={toneForStatus(plan.status)}>{statusLabel(plan.status)}</Badge>
            <span>{plan.steps.length}개 단계</span>
            <span>{valueLabel(getString(settings.runtime_mode, 'demo'))}</span>
            <span>{readyLabel}</span>
          </div>
        </div>
      </section>

      <nav className="release-flow__detail-tabs" aria-label="릴리즈 플랜 상세 탭">
        {RELEASE_DETAIL_TABS.map(item => (
          <button key={item.value} type="button" aria-pressed={detailTab === item.value} onClick={() => onDetailTab(item.value)}>
            <strong>{item.label}</strong>
            <span>{item.help}</span>
          </button>
        ))}
      </nav>

      {detailTab === 'summary' && (
        <div id="release-flow-detail-summary" className="release-flow__detail-grid release-flow__detail-grid--summary">
          <Card
            title="릴리즈 흐름"
            description="단계를 누르면 오른쪽 요약이 선택한 앱 기준으로 바뀝니다."
            actions={<Button size="sm" onClick={() => onDetailTab('sequence')}>순서 편집</Button>}
            className="release-flow__detail-graph-card"
          >
            <div className="release-flow__canvas release-flow__canvas--detail">
              <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} interactive scrollBehavior="zoom" onNodeClick={onGraphNodeClick} onPaneClick={onGraphPaneClick} />
            </div>
          </Card>

          <aside className="release-flow__detail-rail" aria-label="릴리즈 플랜 요약">
            <ReleaseDetailStatusPanel
              plan={plan}
              errors={errors}
              warnings={warnings}
              activeRuns={activeRuns}
              nextAction={nextAction}
              onRun={onOpenRun}
              onDiagnostics={() => onDetailTab('diagnostics')}
            />
            <ReleaseSelectedStepSummary
              selected={selected}
              selectedNode={selectedNode}
              selectedIndex={selectedIndex}
              appById={appById}
              onEdit={() => onEditModal('step')}
              onSequence={() => onDetailTab('sequence')}
            />
          </aside>
        </div>
      )}

      {detailTab === 'sequence' && (
        <div id="release-flow-detail-sequence" className="release-flow__detail-grid release-flow__detail-grid--sequence">
          <Card
            title="배포 단계"
            description="단계를 고르면 그래프와 단계 상세 모달이 같은 대상을 봅니다."
            actions={<Button size="sm" onClick={onAddStep} disabled={apps.length === 0}><IconPlus size={13} />단계 추가</Button>}
          >
            <ReleaseStepList
              plan={plan}
              selectedIndex={selectedIndex}
              appById={appById}
              onSelect={onSelectStep}
              onEdit={(index) => { onSelectStep(index); onEditModal('step'); }}
              onMove={onMoveStep}
              onRemove={onRemoveStep}
            />
          </Card>
          <Card title="흐름 미리보기" className="release-flow__detail-graph-card">
            <div className="release-flow__canvas release-flow__canvas--detail">
              <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} interactive scrollBehavior="zoom" onNodeClick={onGraphNodeClick} onPaneClick={onGraphPaneClick} />
            </div>
          </Card>
        </div>
      )}

      {detailTab === 'policy' && (
        <div id="release-flow-detail-policy" className="release-flow__detail-grid release-flow__detail-grid--policy">
          <ReleasePolicySummaryPanel plan={plan} onEdit={() => onEditModal('policy')} />
          <ReleasePlanSettingsSummary plan={plan} onEdit={() => onEditModal('policy')} />
        </div>
      )}

      {detailTab === 'diagnostics' && (
        <div id="release-flow-detail-diagnostics" className="release-flow__detail-grid release-flow__detail-grid--diagnostics">
          <ReleaseDiagnosticsSummary diagnostics={diagnostics} readiness={readiness} onPolicy={() => onDetailTab('policy')} />
          <DiagnosticsPanel diagnostics={diagnostics} />
        </div>
      )}

      <Modal
        open={editModal === 'plan'}
        title="플랜 기본 정보"
        description="목록과 실행 화면에 보이는 이름, 설명, 상태만 빠르게 수정합니다."
        onOpenChange={(open) => onEditModal(open ? 'plan' : null)}
        actions={<Button variant="primary" loading={saving} onClick={() => { onSave(); onEditModal(null); }}><IconSave size={14} />{saveLabel}</Button>}
      >
        <ReleasePlanBasicsForm plan={plan} onPlanValue={onPlanValue} />
      </Modal>

      <Modal
        open={editModal === 'policy'}
        title="전체 정책 상세 설정"
        description="실행 모드, 승인, 롤백, 운영 예외 같은 고급 항목은 필요할 때만 열어 수정합니다."
        onOpenChange={(open) => onEditModal(open ? 'policy' : null)}
        actions={<Button variant="primary" loading={saving} onClick={() => { onSave(); onEditModal(null); }}><IconSave size={14} />{saveLabel}</Button>}
      >
        <PolicyEditor plan={plan} setPolicy={onPolicy} readiness={readiness} />
      </Modal>

      <Modal
        open={editModal === 'step'}
        title={`단계 설정: ${selectedLabel}`}
        description="브랜치, manifest 경로, 승인 게이트, 롤백 기준처럼 앱별로 달라지는 값을 수정합니다."
        onOpenChange={(open) => onEditModal(open ? 'step' : null)}
        actions={<Button variant="primary" loading={saving} onClick={() => { onSave(); onEditModal(null); }}><IconSave size={14} />{saveLabel}</Button>}
      >
        <StepEditor
          title="선택한 단계"
          plan={plan}
          selected={selected}
          selectedIndex={selectedIndex}
          apps={apps}
          appById={appById}
          setStep={onStep}
          setPlan={onPlan}
        />
      </Modal>
    </div>
  );
}

function ReleasePlanBasicsForm({ plan, onPlanValue }: { plan: ReleasePlan; onPlanValue: (patch: Partial<ReleasePlan>) => void }) {
  return (
    <div className="release-flow__modal-form">
      <Field label="이름"><input className="input" value={plan.name} onChange={event => onPlanValue({ name: event.target.value })} /></Field>
      <Field label="설명"><textarea className="input" rows={4} value={plan.description} onChange={event => onPlanValue({ description: event.target.value })} /></Field>
      <Field label="상태">
        <select className="input" disabled={plan.status === 'archived'} value={plan.status} onChange={event => onPlanValue({ status: event.target.value as ReleasePlan['status'] })}>
          <option value="draft">초안</option>
          <option value="active">활성</option>
          <option value="paused">일시정지</option>
          {plan.status === 'archived' && <option value="archived">보관됨</option>}
        </select>
      </Field>
    </div>
  );
}

function ReleaseDetailStatusPanel({
  plan,
  errors,
  warnings,
  activeRuns,
  nextAction,
  onRun,
  onDiagnostics,
}: {
  plan: ReleasePlan;
  errors: number;
  warnings: number;
  activeRuns: number;
  nextAction: string;
  onRun: () => void;
  onDiagnostics: () => void;
}) {
  return (
    <section className="release-flow__detail-panel">
      <div className="release-flow__detail-panel-head">
        <span>현재 상태</span>
        <Badge tone={errors > 0 ? 'danger' : warnings > 0 ? 'warning' : 'success'}>{errors > 0 ? '막힘' : warnings > 0 ? '주의' : '정상'}</Badge>
      </div>
      <div className="release-flow__metric-grid">
        <FieldValue label="단계" value={`${plan.steps.length}개`} />
        <FieldValue label="실행 중" value={`${activeRuns}개`} />
        <FieldValue label="오류" value={`${errors}개`} />
        <FieldValue label="경고" value={`${warnings}개`} />
      </div>
      <div className="release-flow__next-action release-flow__next-action--compact">
        <span>다음 작업</span>
        <strong>{nextAction}</strong>
      </div>
      <div className="release-flow__detail-button-row">
        <Button size="sm" variant={activeRuns > 0 ? 'primary' : 'secondary'} onClick={onRun}>실행 보기</Button>
        <Button size="sm" variant={errors + warnings > 0 ? 'primary' : 'ghost'} onClick={onDiagnostics}>진단 보기</Button>
      </div>
    </section>
  );
}

function ReleaseSelectedStepSummary({
  selected,
  selectedNode,
  selectedIndex,
  appById,
  onEdit,
  onSequence,
}: {
  selected?: ReleasePlanStep;
  selectedNode: ReleaseNodeData | null;
  selectedIndex: number;
  appById: Map<string, Application>;
  onEdit: () => void;
  onSequence: () => void;
}) {
  if (!selected) {
    return (
      <section className="release-flow__detail-panel">
        <div className="release-flow__detail-panel-head"><span>선택 단계</span></div>
        <p className="release-flow__hint">그래프나 배포 순서 탭에서 단계를 선택하면 상세 작업이 여기에 표시됩니다.</p>
        <Button size="sm" onClick={onSequence}>단계 선택</Button>
      </section>
    );
  }
  const app = appById.get(selected.application_id);
  const config = selected.config;
  return (
    <section className="release-flow__detail-panel">
      <div className="release-flow__detail-panel-head">
        <span>선택 단계</span>
        <Badge tone={toUiTone(selectedNode?.tone ?? 'neutral')}>{selectedIndex + 1}</Badge>
      </div>
      <strong className="release-flow__detail-panel-title">{selected.name || app?.name || selected.application_id}</strong>
      <div className="release-flow__metric-grid release-flow__metric-grid--single">
        <FieldValue label="레포" value={app?.repo_ref || getString(config.repo_ref) || '-'} />
        <FieldValue label="브랜치" value={getString(config.branch, app?.branch || 'main')} />
        <FieldValue label="환경" value={getString(config.environment, '-')} />
        <FieldValue label="전략" value={valueLabel(getString(config.strategy, 'rolling'))} />
      </div>
      <div className="release-flow__detail-button-row">
        <Button size="sm" variant="primary" onClick={onEdit}>단계 설정</Button>
        <Button size="sm" onClick={onSequence}>순서 보기</Button>
      </div>
    </section>
  );
}

function ReleaseStepList({
  plan,
  selectedIndex,
  appById,
  onSelect,
  onEdit,
  onMove,
  onRemove,
}: {
  plan: ReleasePlan;
  selectedIndex: number;
  appById: Map<string, Application>;
  onSelect: (index: number) => void;
  onEdit: (index: number) => void;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
}) {
  if (plan.steps.length === 0) {
    return (
      <EmptyState
        icon={<IconAlertTriangle size={24} />}
        title="아직 배포 단계가 없습니다"
        description="단계 추가를 눌러 이 플랜에 포함할 애플리케이션을 먼저 넣어주세요."
      />
    );
  }
  return (
    <div className="release-flow__step-card-list">
      {plan.steps.map((step, index) => {
        const app = appById.get(step.application_id);
        const config = step.config;
        return (
          <div key={`${step.application_id}-${index}`} className={`release-flow__step-card ${index === selectedIndex ? 'release-flow__step-card--selected' : ''}`}>
            <button type="button" className="release-flow__step-card-main" aria-pressed={index === selectedIndex} onClick={() => onSelect(index)}>
              <span>{index + 1}</span>
              <strong>{step.name || app?.name || step.application_id}</strong>
              <small>{app?.repo_ref || getString(config.repo_ref) || 'repo 미지정'} · {getString(config.branch, app?.branch || 'main')}</small>
            </button>
            <div className="release-flow__step-card-actions">
              <Button size="sm" variant="primary" onClick={() => onEdit(index)}>설정</Button>
              <Button size="sm" variant="ghost" title="앞으로 이동" disabled={index === 0} onClick={() => onMove(index, -1)} aria-label="앞으로 이동"><IconArrowUp size={13} /></Button>
              <Button size="sm" variant="ghost" title="뒤로 이동" disabled={index === plan.steps.length - 1} onClick={() => onMove(index, 1)} aria-label="뒤로 이동"><IconArrowDown size={13} /></Button>
              <Button size="sm" variant="ghost" title="단계 삭제" onClick={() => onRemove(index)} aria-label="단계 삭제"><IconTrash size={13} /></Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReleasePolicySummaryPanel({ plan, onEdit }: { plan: ReleasePlan; onEdit: () => void }) {
  const settings = { ...DEFAULT_POLICY, ...plan.settings };
  return (
    <Card
      title="운영 정책"
      description="상세 값은 모달에서 수정하고, 여기서는 실행 전에 확인해야 할 핵심 기준만 보여줍니다."
      actions={<Button size="sm" variant="primary" onClick={onEdit}>정책 상세 수정</Button>}
    >
      <div className="release-flow__review-grid">
        <FieldValue label="런타임" value={valueLabel(getString(settings.runtime_mode, 'demo'))} />
        <FieldValue label="실행" value={valueLabel(getString(settings.execution_mode))} />
        <FieldValue label="승인" value={valueLabel(getString(settings.approval_policy))} />
        <FieldValue label="실패" value={valueLabel(getString(settings.failure_policy))} />
        <FieldValue label="롤백" value={valueLabel(getString(settings.rollback_policy))} />
        <FieldValue label="동시 실행" value={`${getNumber(settings.concurrency, 1)}개`} />
      </div>
    </Card>
  );
}

function ReleaseDiagnosticsSummary({ diagnostics, readiness, onPolicy }: { diagnostics: Diagnostic[]; readiness?: ReleaseReadiness; onPolicy: () => void }) {
  const errors = diagnostics.filter(item => item.severity === 'error').length;
  const warnings = diagnostics.filter(item => item.severity === 'warning').length;
  const status = readiness?.ready ? '준비됨' : errors > 0 ? '수정 필요' : warnings > 0 ? '검토 필요' : '대기';
  return (
    <Card
      title="진단 요약"
      description="실행 전에 막히는 항목을 먼저 보고, 정책 수정이 필요한 경우 바로 이동합니다."
      actions={<Button size="sm" onClick={onPolicy}>정책 보기</Button>}
    >
      <div className="release-flow__review-grid">
        <FieldValue label="상태" value={status} emphasis />
        <FieldValue label="오류" value={`${errors}개`} />
        <FieldValue label="경고" value={`${warnings}개`} />
        <FieldValue label="준비성" value={readiness?.ready ? '통과' : '확인 필요'} />
      </div>
    </Card>
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
    if (isFeatureDemoPlan(plan)) window.localStorage.setItem(LAST_VIEWED_RELEASE_PLAN_KEY, DEMO_RELEASE_PLAN_PICKER_ID);
    else if (plan.plan_id) window.localStorage.setItem(LAST_VIEWED_RELEASE_PLAN_KEY, plan.plan_id);
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

function demoReleaseRunHandoff(run: ReleaseRun): ReleaseRunHandoff {
  return {
    run_id: run.run_id,
    plan_id: run.plan_id,
    plan_name: run.plan_name,
    status: run.derived_status ?? run.status,
    headline: 'Storefront 배포 진행 중, 다음 운영 Wave 승인 준비',
    severity: 'warning',
    current_wave: run.current_wave,
    total_waves: run.total_waves,
    live_side_effects: false,
    attention_reasons: ['운영 매니페스트 Wave의 수동 승인이 필요합니다.'],
    verification: {
      status: 'warning',
      message: 'Storefront 스모크 테스트가 진행 중입니다.',
      evidence: ['Orders API /readyz 정상', 'Storefront rollout 2/3 replicas'],
      job_count: 1,
      production_targets: ['Release Manifests'],
    },
    abort_criteria: {
      status: 'passed',
      message: '자동 중단 기준이 설정되어 있습니다.',
      criteria: ['카나리 오류율이 5분 동안 5%를 넘으면 중단'],
      override_reason: null,
      production_targets: ['Release Manifests'],
    },
    change_freeze: {
      status: 'passed',
      message: '현재 변경 동결 기간이 아닙니다.',
      active: false,
      production_targets: ['Release Manifests'],
    },
    policy_overrides: [],
    next_actions: [
      { action: 'review_verification', label: 'Storefront 검증 결과 확인', enabled: true },
      { action: 'approve', label: '운영 Wave 승인', enabled: false, reason: '현재 Wave 완료 후 활성화됩니다.' },
      { action: 'notify', label: '릴리즈 담당자 알림', enabled: true },
    ],
    checks: [
      { name: '레포 변경', status: 'passed', message: '세 레포 커밋이 고정되었습니다.' },
      { name: '배포 검증', status: 'warning', message: 'Storefront rollout 진행 중입니다.' },
      { name: '운영 승인', status: 'blocked', message: '현재 Wave 완료를 기다립니다.' },
    ],
    last_event: { event_type: 'wave.dispatched', message: 'Wave 2 Storefront Web 배포를 시작했습니다.' },
  };
}

function demoReleasePlanSteps(): ReleasePlanStep[] {
  return [
    {
      step_id: 'demo-step-orders',
      application_id: 'demo-orders-api',
      name: 'Orders API',
      position: 0,
      depends_on: [],
      config: {
        repo_ref: 'JEONWOOHYUN-hydromel/demo-orders-api',
        branch: 'main',
        manifest_path: 'deploy/charts/orders',
        source_type: 'helm',
        environment: 'staging',
        namespace: 'demo-shop',
        replicas: 3,
        strategy: 'canary',
        canary_percent: 20,
        approval_gate: 'auto',
        image: 'ghcr.io/myjob/orders-api:2.1.0',
        commit_sha: '7db13ea4f21c',
        service_name: 'orders-api',
        health_check_path: '/readyz',
        post_deploy_verification_url: 'https://staging.example.com/api/orders/health',
        rollback_trigger: '5xx 오류율이 5분 동안 5%를 넘으면 롤백',
      },
    },
    {
      step_id: 'demo-step-storefront',
      application_id: 'demo-storefront-web',
      name: 'Storefront Web',
      position: 1,
      depends_on: ['demo-orders-api'],
      config: {
        repo_ref: 'JEONWOOHYUN-hydromel/demo-storefront-web',
        branch: 'main',
        manifest_path: 'k8s/overlays/staging',
        source_type: 'kustomize',
        environment: 'staging',
        namespace: 'demo-shop',
        replicas: 3,
        strategy: 'rolling',
        approval_gate: 'auto',
        image: 'ghcr.io/myjob/storefront-web:1.4.2',
        commit_sha: '2a981cd716fb',
        service_name: 'storefront-web',
        health_check_path: '/healthz',
        post_deploy_verification_url: 'https://staging.example.com/healthz',
      },
    },
    {
      step_id: 'demo-step-manifests',
      application_id: 'demo-release-manifests',
      name: 'Release Manifests',
      position: 2,
      depends_on: ['demo-orders-api', 'demo-storefront-web'],
      config: {
        repo_ref: 'JEONWOOHYUN-hydromel/demo-release-manifests',
        branch: 'main',
        manifest_path: 'environments/production/release-plan.yaml',
        source_type: 'raw-yaml',
        environment: 'production',
        namespace: 'demo-shop',
        replicas: 1,
        strategy: 'rolling',
        approval_gate: 'manual',
        image: 'ghcr.io/myjob/release-observer:1.0.0',
        commit_sha: 'b41fa095ce20',
        service_name: 'release-observer',
        health_check_path: '/readyz',
        change_ticket: 'CHG-DEMO-1042',
      },
    },
  ];
}

function demoReleaseDiagnostics(): Diagnostic[] {
  return [
    {
      source: 'release-plan-demo',
      severity: 'warning',
      message: '운영 매니페스트 단계는 수동 승인 후 진행됩니다.',
      code: 'DEMO_MANUAL_APPROVAL',
      line: 18,
      column: 3,
      end_line: 18,
      end_column: 28,
      path: 'steps[2].config.approval_gate',
      action: '승인 게이트 검토',
    },
  ];
}

function demoReleasePreview(plan: ReleasePlan): ReleasePlanPreview {
  const steps = plan.steps.map((step, index) => ({
    step_id: step.step_id || `demo-step-${index + 1}`,
    application_id: step.application_id,
    name: step.name,
    position: index,
    wave: index + 1,
    blocked_by: [],
    gate: getString(step.config.approval_gate, 'inherit'),
    strategy: getString(step.config.strategy, getString(plan.settings.default_strategy, 'rolling')),
    environment: getString(step.config.environment, firstEnvironment(plan)),
    action: getString(step.config.approval_gate) === 'manual' ? 'approval_required' : 'dispatch',
  }));
  return {
    executable: true,
    summary: '세 레포를 3개 Wave로 순차 배포하고 운영 반영 전에 수동 승인을 기다립니다.',
    waves: steps.map(step => ({ wave: step.wave ?? 1, step_ids: [step.step_id], applications: [step.name] })),
    steps,
    blockers: [],
  };
}

function demoReleaseReadiness(plan: ReleasePlan): ReleaseReadiness {
  const preview = demoReleasePreview(plan);
  return {
    ready: true,
    mode: 'demo',
    summary: '실행 전 필수 정보는 준비됐으며 운영 Wave의 수동 승인 흐름도 미리 확인할 수 있습니다.',
    checks: [
      { check_id: 'demo-repositories', name: '레포와 기준 브랜치', status: 'passed', message: '세 레포 모두 main 브랜치와 매니페스트 경로가 지정되었습니다.', blockers: [] },
      { check_id: 'demo-dependencies', name: '배포 의존성', status: 'passed', message: 'Orders API 이후 Storefront와 운영 매니페스트 순서가 계산되었습니다.', blockers: [] },
      { check_id: 'demo-diagnostics', name: '진단', status: 'passed', message: '차단 오류 없이 실행 미리보기를 만들었습니다.', blockers: [] },
      { check_id: 'demo-approval', name: '운영 승인', status: 'warning', message: '마지막 Wave는 운영자 수동 승인을 기다립니다.', blockers: [] },
    ],
    impact: {
      summary: 'staging 2개 앱과 production 매니페스트 1개를 순서대로 검토합니다.',
      runtime_mode: 'demo',
      live_side_effects: false,
      total_steps: plan.steps.length,
      total_waves: preview.waves.length,
      first_wave: 1,
      applications: plan.steps.map(step => step.name),
      environments: ['staging', 'production'],
      production_targets: ['Release Manifests'],
      production_target_count: 1,
      first_wave_steps: preview.steps.slice(0, 1).map(step => ({
        step_id: step.step_id,
        application_id: step.application_id,
        name: step.name,
        environment: step.environment,
        action: step.action,
        strategy: step.strategy,
        wave: step.wave,
      })),
    },
    next_actions: [
      { action_id: 'demo-review-approval', check_id: 'demo-approval', label: '운영 승인 조건 확인', severity: 'warning', message: '실행 중 마지막 Wave에서 승인 요청이 표시됩니다.', blockers: [] },
    ],
    blockers: [],
    warnings: ['운영 반영 전에 수동 승인이 필요합니다.'],
  };
}

function demoReleaseRunSummary(plan: ReleasePlan): ReleaseRunSummary {
  const run = demoReleaseRun(plan);
  return {
    total_runs: 1,
    status_breakdown: { waiting_for_approval: 1 },
    plan_breakdown: { [plan.name]: 1 },
    active_runs: 1,
    succeeded_runs: 0,
    cancelled_runs: 0,
    attention_required_runs: 1,
    failed_runs: 0,
    paused_runs: 0,
    rollback_requested_runs: 0,
    waiting_for_approval_runs: 1,
    live_runs: 0,
    unhealthy_runs: 0,
    verification_failed_runs: 0,
    verification_pending_timeout_runs: 0,
    policy_override_runs: 0,
    policy_override_breakdown: {},
    active_change_freeze_runs: 0,
    change_freeze_override_runs: 0,
    stale_runs: 0,
    last_run_status: 'waiting_for_approval',
    recent_runs: [{ run_id: run.run_id, plan_id: run.plan_id, status: 'waiting_for_approval', attention_reasons: ['운영 Wave 수동 승인 대기'] }],
  };
}

function demoReleaseAuditEvents(plan: ReleasePlan): ReleaseAuditEvent[] {
  const run = demoReleaseRun(plan);
  return run.events.map(event => ({
    ...event,
    run_id: run.run_id,
    plan_id: run.plan_id,
    plan_name: run.plan_name,
    run_status: run.derived_status ?? run.status,
    application_ids: run.steps.map(step => step.application_id),
  }));
}

function releaseAuditCsv(events: ReleaseAuditEvent[]): string {
  const rows = [
    ['created_at', 'event_type', 'message', 'actor', 'run_id', 'run_status', 'applications'],
    ...events.map(event => [
      event.created_at ?? '',
      event.event_type,
      event.message,
      event.actor ?? '',
      event.run_id,
      event.run_status,
      event.application_ids.join('|'),
    ]),
  ];
  return rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
}

function demoReleaseGeneratedManifest(plan: ReleasePlan, selectedIndex: number): ReleaseGeneratedManifest {
  const step = selectedStep(plan, selectedIndex) ?? plan.steps[0];
  if (!step) return { manifest: '', files: [], resources: [], resource_count: 0, diagnostics: [], warnings: [], summary: '선택된 단계가 없습니다.' };
  const name = safeId(getString(step.config.service_name, step.application_id)) || 'release-app';
  const namespace = getString(step.config.namespace, 'demo-shop');
  const image = getString(step.config.image, `ghcr.io/myjob/${name}:demo`);
  const replicas = getNumber(step.config.replicas, 2);
  const manifestPath = getString(step.config.manifest_path, `${name}/deployment.yaml`);
  const manifest = [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    `  name: ${name}`,
    `  namespace: ${namespace}`,
    '  labels:',
    `    app.kubernetes.io/name: ${name}`,
    'spec:',
    `  replicas: ${replicas}`,
    '  selector:',
    '    matchLabels:',
    `      app.kubernetes.io/name: ${name}`,
    '  template:',
    '    metadata:',
    '      labels:',
    `        app.kubernetes.io/name: ${name}`,
    '    spec:',
    '      containers:',
    `        - name: ${name}`,
    `          image: ${image}`,
    '          ports:',
    '            - containerPort: 8080',
    '          readinessProbe:',
    '            httpGet:',
    `              path: ${getString(step.config.health_check_path, '/readyz')}`,
    '              port: 8080',
    '---',
    'apiVersion: v1',
    'kind: Service',
    'metadata:',
    `  name: ${name}`,
    `  namespace: ${namespace}`,
    'spec:',
    '  selector:',
    `    app.kubernetes.io/name: ${name}`,
    '  ports:',
    '    - port: 80',
    '      targetPort: 8080',
    '',
  ].join('\n');
  const manualApproval = getString(step.config.approval_gate) === 'manual';
  const diagnostics: Diagnostic[] = manualApproval ? [{
    source: 'generated-manifest-demo',
    severity: 'warning',
    message: '이 단계의 Safe PR은 운영자 승인 후 병합합니다.',
    code: 'DEMO_PR_APPROVAL',
    line: 1,
    column: 1,
    end_line: 1,
    end_column: 20,
    path: `steps[${selectedIndex}].config.approval_gate`,
    action: '승인자 확인',
  }] : [];
  return {
    manifest,
    files: [{ path: manifestPath, content: manifest, action: 'update', description: `${step.name} 생성 매니페스트` }],
    resources: [
      { api_version: 'apps/v1', kind: 'Deployment', namespace, name },
      { api_version: 'v1', kind: 'Service', namespace, name },
    ],
    resource_count: 2,
    diagnostics,
    warnings: manualApproval ? ['운영 매니페스트는 수동 승인 이후 병합됩니다.'] : [],
    summary: `${step.name} 단계의 Deployment와 Service를 생성했습니다.`,
  };
}

function demoReleaseSafePr(
  plan: ReleasePlan,
  selectedIndex: number,
  generated: ReleaseGeneratedManifest,
  title: string,
  body: string,
): ReleaseManifestSafePr {
  const step = selectedStep(plan, selectedIndex) ?? plan.steps[0];
  const requestSummary = [title.trim(), body.trim()].filter(Boolean).join(' / ');
  return {
    ...generated,
    summary: requestSummary ? `${generated.summary} 요청: ${requestSummary}` : generated.summary,
    accepted: true,
    event_id: `evt-demo-safe-pr-${selectedIndex + 1}`,
    correlation_id: `corr-demo-safe-pr-${selectedIndex + 1}`,
    workflow_run_id: `wf-demo-safe-pr-${selectedIndex + 1}`,
    application_id: step?.application_id ?? 'demo-application',
    repo_ref: getString(step?.config.repo_ref, demoReleaseApplications()[selectedIndex]?.repo_ref ?? 'demo/release-manifests'),
    base_branch: getString(step?.config.branch, 'main'),
    manifest_path: generated.files[0]?.path ?? getString(step?.config.manifest_path, 'release.yaml'),
    commit_sha: getString(step?.config.commit_sha, `demo${selectedIndex + 1}c0ffee`),
    patch_sha256: `${selectedIndex + 1}`.repeat(64),
  };
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
  clusterHref,
  applicationHref,
  onTab,
  onClose,
  onOpenRuns,
  onOpenYaml,
}: {
  node: ReleaseNodeData | null;
  tab: string;
  clusterHref: string;
  applicationHref: string;
  onTab: (value: string) => void;
  onClose: () => void;
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
    <aside className="release-flow__side-panel" aria-label="선택 노드 상세">
      <div className="release-flow__side-panel-head">
        <div>
          <span>{node.wave != null ? `Wave ${node.wave}` : '대기'}</span>
          <h3>{node.step.name || node.step.application_id}</h3>
        </div>
        <div className="release-flow__side-panel-head-actions">
          <Badge tone={toUiTone(node.tone)}>{releaseNodeTypeLabel(node.nodeType)}</Badge>
          <button className="release-flow__inspector-close" type="button" aria-label="상세 닫기" title="상세 닫기" onClick={onClose}>×</button>
        </div>
      </div>
      <div className="release-flow__side-panel-status">
        <span className={`release-node__status release-node__status--${statusClass(node.executionStatus)}`}>배포 {statusLabel(node.executionStatus)}</span>
        <span className={`release-node__status release-node__status--${healthClass(node.healthStatus)}`}>상태 {healthLabel(node.healthStatus)}</span>
      </div>
      <div className="release-flow__inspector-tabs">
        {[
          ['overview', '요약'],
          ['kubernetes', '리소스'],
          ['logs', '이벤트'],
          ['yaml', '매니페스트'],
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
          {(clusterHref || applicationHref) && (
            <div className="release-flow__inspector-links">
              {applicationHref && <Link to={applicationHref}>애플리케이션 열기</Link>}
              {clusterHref && <Link to={clusterHref}>클러스터 열기</Link>}
            </div>
          )}
        </div>
      )}

      {tab === 'kubernetes' && (
        <div className="release-flow__resource-tree">
          <div className="release-flow__resource-tree-head">
            <span>종류 / 이름</span><span>동기화</span><span>상태</span>
          </div>
          {isApplication ? (
            <>
              <ResourceTreeRow kind="Deployment" name={node.step.application_id || node.id} sync={node.executionStatus === 'succeeded' ? 'Synced' : 'Pending'} health={node.healthStatus} />
              <ResourceTreeRow kind="Service" name={`${node.step.application_id || node.id}-svc`} sync="Synced" health="healthy" child />
              <ResourceTreeRow kind="ReplicaSet" name={`${node.step.application_id || node.id}-${(node.commitSha || 'current').slice(0, 7)}`} sync={node.executionStatus === 'succeeded' ? 'Synced' : 'Pending'} health={node.healthStatus} child />
              <ResourceTreeRow kind="Pod" name={`${node.step.application_id || node.id}-pod`} sync="Live" health={node.healthStatus} child />
            </>
          ) : (
            <ResourceTreeRow kind={releaseNodeTypeLabel(node.nodeType)} name={node.id} sync={statusLabel(node.executionStatus)} health={node.healthStatus} />
          )}
          <div className="release-flow__resource-tree-footer">
            <span>{node.namespace || 'default'} · {node.cluster || 'target cluster'}</span>
            {clusterHref && <Link to={clusterHref}>클러스터에서 보기</Link>}
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="release-flow__log-list">
          {node.failureReason && <LogRow time="00:02" source="warning" tone="warning" message={node.failureReason} />}
          <LogRow time="00:01" source="deploy" message={`${node.step.name || node.step.application_id} 단계가 ${valueLabel(node.gate)} 게이트에 진입했습니다. 현재 상태는 ${statusLabel(node.executionStatus)}입니다.`} />
          <LogRow time="00:00" source="health" message={`헬스 상태는 ${healthLabel(node.healthStatus)}입니다.`} />
        </div>
      )}

      {tab === 'yaml' && (
        <FieldSection title="Live Manifest">
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

function ResourceTreeRow({ kind, name, sync, health, child = false }: { kind: string; name: string; sync: string; health: string; child?: boolean }) {
  return (
    <div className={`release-flow__resource-tree-row ${child ? 'is-child' : ''}`}>
      <span><small>{kind}</small><strong>{name}</strong></span>
      <span>{sync}</span>
      <span className={`release-node__status release-node__status--${healthClass(health)}`}>{healthLabel(health)}</span>
    </div>
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
  const [connectRepoOpen, setConnectRepoOpen] = useState(false);
  const reviewReadiness = useReleaseReadiness();
  const stageIndex = NEW_PLAN_STAGES.findIndex(item => item.value === stage);
  const availableApps = useMemo(() => [...apps, ...extraApps], [apps, extraApps]);
  const availableAppById = useMemo(() => new Map([...appById, ...availableApps.map(app => [app.application_id, app] as const)]), [appById, availableApps]);
  const selected = selectedStep(draft, selectedIndex);
  const selectedApplicationIds = new Set(draft.steps.map(step => step.application_id));
  const canGoNext = stage === 'basics' ? Boolean(draft.name.trim()) : stage === 'apps' ? draft.steps.length > 0 : true;
  const previousStage = NEW_PLAN_STAGES[Math.max(0, stageIndex - 1)]?.value ?? 'basics';
  const nextStage = NEW_PLAN_STAGES[Math.min(NEW_PLAN_STAGES.length - 1, stageIndex + 1)]?.value ?? 'review';

  useEffect(() => {
    if (stage !== 'review' || draft.steps.length === 0) return;
    const timer = window.setTimeout(() => reviewReadiness.mutate(normalizePlan(draft)), 180);
    return () => window.clearTimeout(timer);
  }, [draft, reviewReadiness.mutate, stage]);

  const toggleApp = (app: Application) => {
    const selectedNow = selectedApplicationIds.has(app.application_id);
    onPlan(current => current ? setPlanApplicationSelected(current, app, !selectedNow) : current);
    if (!selectedNow) onSelectedIndex(draft.steps.length);
    else onSelectedIndex(index => Math.max(0, Math.min(index, draft.steps.length - 2)));
  };
  const addCreatedApplications = (created: Application[]) => {
    const existingIds = new Set([...availableApps, ...draft.steps.map(step => availableAppById.get(step.application_id)).filter((item): item is Application => Boolean(item))].map(app => app.application_id));
    const additions = created.filter(app => !existingIds.has(app.application_id));
    if (additions.length === 0) return;
    setExtraApps(current => [...current, ...additions]);
    onPlan(current => current ? additions.reduce((next, app) => setPlanApplicationSelected(next, app, true), current) : current);
    onSelectedIndex(draft.steps.length);
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
              <span>선택한 배포 정의만 릴리즈 단계가 됩니다. 레포, 브랜치, manifest와 대상 클러스터는 서버 검증을 거친 뒤에만 추가할 수 있습니다.</span>
            </div>
            <div className="release-flow__scope-note release-flow__scope-note--action">
              <span>새 레포가 필요하면 배포 정의 검증 절차를 여기서 바로 시작할 수 있습니다.</span>
              <Button type="button" size="sm" onClick={() => setConnectRepoOpen(true)}><IconPlus size={13} />배포 정의 추가</Button>
            </div>
            {availableApps.length === 0 ? (
              <EmptyState title="선택할 배포 정의가 없습니다" description="레포와 manifest, 대상 클러스터를 검증해 배포 정의를 만든 뒤 플랜에 포함하세요." action={<Button size="sm" variant="primary" onClick={() => setConnectRepoOpen(true)}>배포 정의 추가</Button>} />
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
          <ReadinessPanel
            readiness={reviewReadiness.data}
            loading={reviewReadiness.isPending}
            error={reviewReadiness.error}
            onRefresh={() => reviewReadiness.mutate(normalizePlan(draft))}
          />
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

      <ConnectRepoWizard
        open={connectRepoOpen}
        onClose={() => setConnectRepoOpen(false)}
        onCreated={addCreatedApplications}
        navigateAfterCreate={false}
      />
    </div>
  );
}

function PolicyReadinessGuide({ readiness, settings }: { readiness?: ReleaseReadiness; settings: Record<string, unknown> }) {
  const pathFor = useConsolePath();
  const runtimeMode = getString(settings.runtime_mode, 'demo');
  const operationalChecks = ['live.mode', 'change.ticket', 'release.window', 'change.freeze', 'runbook.sop', 'owner.contact', 'verification.plan', 'rollback.abort_criteria', 'plan.diagnostics', 'rollback.policy', 'alerts.enabled_channels'];
  const checks = readiness?.checks.filter(check => runtimeMode === 'live' ? operationalChecks.includes(check.check_id) : ['plan.diagnostics', 'rollback.policy'].includes(check.check_id)) ?? [];
  const blocked = checks.filter(check => check.status === 'blocked').length;
  const warning = checks.filter(check => check.status === 'warning').length;
  const status = blocked > 0 ? 'blocked' : warning > 0 ? 'warning' : 'passed';

  return (
    <section className={`release-flow__policy-readiness release-flow__policy-readiness--${status}`} aria-label="실행 전 확인 사항">
      <div className="release-flow__policy-readiness-head">
        <div>
          <span>실행 전 확인</span>
          <strong>{runtimeMode === 'live' ? '라이브 릴리즈 준비 상태' : '데모 플랜 검토 상태'}</strong>
          <p>{readiness?.summary ?? '플랜 변경 후 준비 상태를 계산하고 있습니다.'}</p>
        </div>
        <Badge tone={readiness ? readiness.ready ? (warning ? 'warning' : 'success') : 'danger' : 'neutral'}>
          {readiness ? readiness.ready ? warning ? `검토 ${warning}` : '준비됨' : `해결 ${blocked || readiness.blockers.length}` : '확인 중'}
        </Badge>
      </div>
      {checks.length > 0 && (
        <div className="release-flow__policy-checks">
          {checks.map(check => (
            <div key={check.check_id} className={`release-flow__policy-check release-flow__policy-check--${readinessStatusClass(check.status)}`}>
              <span>{readinessStatusLabel(check.status)}</span>
              <div>
                <strong>{check.name}</strong>
                <p>{check.blockers[0] ?? check.message}</p>
              </div>
              {check.check_id === 'alerts.enabled_channels' && (
                <Link to={pathFor('/settings/alerts')} className="release-flow__policy-check-link">알림 설정</Link>
              )}
            </div>
          ))}
        </div>
      )}
      {runtimeMode === 'live' && (
        <p className="release-flow__policy-footnote">아래 입력은 실행 조건을 설명하고 증빙을 연결합니다. 실제 GitOps 이벤트 발행은 서버의 라이브 워크스페이스 허용, 권한, 준비성 검사를 모두 통과해야 합니다.</p>
      )}
    </section>
  );
}

function ReleaseScheduleGuide({ settings }: { settings: Record<string, unknown> }) {
  const now = new Date();
  const releaseStart = parseReleaseDate(getString(settings.release_window_start));
  const releaseEnd = parseReleaseDate(getString(settings.release_window_end));
  const freezeStart = parseReleaseDate(getString(settings.change_freeze_start));
  const freezeEnd = parseReleaseDate(getString(settings.change_freeze_end));
  const releaseWindow = scheduleWindowStatus(releaseStart, releaseEnd, now, 'release');
  const freezeWindow = scheduleWindowStatus(freezeStart, freezeEnd, now, 'freeze');

  return (
    <div className="release-flow__schedule-guide" aria-live="polite">
      <div className={`release-flow__schedule-tile release-flow__schedule-tile--${releaseWindow.tone}`}>
        <span>릴리즈 가능 시간</span>
        <strong>{releaseWindow.label}</strong>
        <p>{formatReleaseWindow(releaseStart, releaseEnd)}</p>
      </div>
      <div className={`release-flow__schedule-tile release-flow__schedule-tile--${freezeWindow.tone}`}>
        <span>변경 동결</span>
        <strong>{freezeWindow.label}</strong>
        <p>{formatReleaseWindow(freezeStart, freezeEnd)}</p>
      </div>
    </div>
  );
}

function PolicySection({ title, description, children, open = false }: { title: string; description: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="release-flow__policy-section" open={open}>
      <summary>
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
        <span aria-hidden="true">+</span>
      </summary>
      <div className="release-flow__policy-section-body">{children}</div>
    </details>
  );
}

function PolicyEditor({ plan, setPolicy, readiness }: { plan: ReleasePlan; setPolicy: (patch: Record<string, unknown>) => void; readiness?: ReleaseReadiness }) {
  const settings = { ...DEFAULT_POLICY, ...plan.settings };
  const isLive = getString(settings.runtime_mode, 'demo') === 'live';
  return (
    <Card title="실행 정책">
      <PolicyReadinessGuide readiness={readiness} settings={settings} />
      <PolicySection title="기본 실행 방식" description="어떤 순서와 방식으로 변경을 진행할지 정합니다." open>
      <div className="release-flow__form-grid">
        <SelectField label="런타임 모드" value={getString(settings.runtime_mode, 'demo')} options={RUNTIME_MODES} onChange={value => setPolicy({ runtime_mode: value, provider_mode: value === 'live' ? 'live' : 'dry_run' })} />
        <SelectField label="실행 모드" value={getString(settings.execution_mode)} options={EXECUTION_MODES} onChange={value => setPolicy({ execution_mode: value })} />
        <SelectField label="승인 정책" value={getString(settings.approval_policy)} options={APPROVAL_POLICIES} onChange={value => setPolicy({ approval_policy: value })} />
        <SelectField label="실패 정책" value={getString(settings.failure_policy)} options={FAILURE_POLICIES} onChange={value => setPolicy({ failure_policy: value })} />
        <SelectField label="롤백 정책" value={getString(settings.rollback_policy)} options={ROLLBACK_POLICIES} onChange={value => setPolicy({ rollback_policy: value })} />
        <SelectField label="기본 전략" value={getString(settings.default_strategy)} options={STRATEGIES} onChange={value => setPolicy({ default_strategy: value })} />
        <Field label="동시 실행 수"><input className="input" type="number" min={1} max={20} value={getNumber(settings.concurrency, 1)} onChange={e => setPolicy({ concurrency: Number(e.target.value) })} /></Field>
        <Field label="헬스 타임아웃 초"><input className="input" type="number" min={30} max={3600} value={getNumber(settings.health_timeout_seconds, 600)} onChange={e => setPolicy({ health_timeout_seconds: Number(e.target.value) })} /></Field>
        <Field label="재시도 횟수"><input className="input" type="number" min={0} max={10} value={getNumber(settings.retry_attempts, 1)} onChange={e => setPolicy({ retry_attempts: Number(e.target.value) })} /></Field>
        <Field label="승격 경로">
          <input className="input" value={getStringArray(settings.environment_order).join(', ')} onChange={e => setPolicy({ environment_order: splitList(e.target.value) })} />
        </Field>
      </div>
      </PolicySection>

      <PolicySection title="변경 검토와 복구" description="Safe PR, 진단, 롤백처럼 변경 자체의 안전성을 확인합니다." open>
      <div className="release-flow__form-grid">
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
        {getString(settings.rollback_policy) === 'disabled' && (
          <Field label="롤백 예외 사유">
            <input className="input" value={getString(settings.rollback_override_reason)} onChange={e => setPolicy({ rollback_override_reason: e.target.value })} />
          </Field>
        )}
      </div>
      </PolicySection>

      {isLive && (
        <PolicySection title="운영 증빙과 시간 제어" description="실서비스 변경에 필요한 책임자, 시간, 검증 기준을 연결합니다." open>
        <ReleaseScheduleGuide settings={settings} />
        <div className="release-flow__form-grid">
        <Field label="변경 티켓"><input className="input" value={getString(settings.change_ticket)} onChange={e => setPolicy({ change_ticket: e.target.value })} /></Field>
        {!getString(settings.change_ticket).trim() && (
          <Field label="운영 변경 예외 사유">
            <input className="input" value={getString(settings.production_change_override_reason)} onChange={e => setPolicy({ production_change_override_reason: e.target.value })} />
          </Field>
        )}
            <Field label="릴리즈 가능 시간 시작">
              <input className="input" type="datetime-local" value={toDateTimeLocalValue(getString(settings.release_window_start))} onChange={e => setPolicy({ release_window_start: fromDateTimeLocalValue(e.target.value) })} />
            </Field>
            <Field label="릴리즈 가능 시간 종료">
              <input className="input" type="datetime-local" value={toDateTimeLocalValue(getString(settings.release_window_end))} onChange={e => setPolicy({ release_window_end: fromDateTimeLocalValue(e.target.value) })} />
            </Field>
            <Field label="릴리즈 시간 예외 사유">
              <input className="input" value={getString(settings.release_window_override_reason)} onChange={e => setPolicy({ release_window_override_reason: e.target.value })} />
            </Field>
            <Field label="변경 동결 시작">
              <input className="input" type="datetime-local" value={toDateTimeLocalValue(getString(settings.change_freeze_start))} onChange={e => setPolicy({ change_freeze_start: fromDateTimeLocalValue(e.target.value) })} />
            </Field>
            <Field label="변경 동결 종료">
              <input className="input" type="datetime-local" value={toDateTimeLocalValue(getString(settings.change_freeze_end))} onChange={e => setPolicy({ change_freeze_end: fromDateTimeLocalValue(e.target.value) })} />
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
        </div>
        </PolicySection>
      )}

      <PolicySection title="승인 기록" description="승인 정책이 요구될 때 승인자와 근거를 남깁니다.">
      <div className="release-flow__form-grid">
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
      </PolicySection>
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
  const environment = getString(config.environment, firstEnvironment(plan));
  const application = appById.get(selected.application_id);
  return (
    <Card title={title}>
      <StepTargetSummary
        application={application}
        config={config}
        strategy={strategy}
        approvalGate={effectiveApprovalGate(
          getString(config.approval_gate, 'inherit'),
          getString(plan.settings.approval_policy, 'auto_safe'),
          environment,
        )}
        approvalRecorded={Boolean(config.approval_granted || plan.settings.approval_granted)}
        environment={environment}
      />
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
          이 단계 승인 완료 (근거 기록)
        </label>
        {Boolean(config.approval_granted) && (
          <div className="release-flow__approval-evidence">
            <Field label="단계 승인자">
              <input className="input" value={getString(config.approval_granted_by)} onChange={e => setStepConfig(selectedIndex, { approval_granted_by: e.target.value }, setPlan)} />
            </Field>
            <Field label="단계 승인 사유">
              <input className="input" value={getString(config.approval_reason)} onChange={e => setStepConfig(selectedIndex, { approval_reason: e.target.value }, setPlan)} />
            </Field>
            <Field label="단계 승인 시각 (UTC)">
              <input className="input" type="datetime-local" value={toDateTimeLocalValue(getString(config.approval_granted_at))} onChange={e => setStepConfig(selectedIndex, { approval_granted_at: fromDateTimeLocalValue(e.target.value) }, setPlan)} />
            </Field>
          </div>
        )}
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

function StepTargetSummary({
  application,
  config,
  strategy,
  approvalGate,
  approvalRecorded,
  environment,
}: {
  application?: Application;
  config: Record<string, unknown>;
  strategy: string;
  approvalGate: string;
  approvalRecorded: boolean;
  environment: string;
}) {
  const branch = getString(config.branch, application?.branch ?? '미확인');
  const manifestPath = getString(config.manifest_path, application?.manifest_path ?? '미확인');
  const commitSha = getString(config.commit_sha, '미지정');
  const image = getString(config.image, '미지정');
  const cluster = getString(config.cluster_id, application?.cluster_id ?? '미확인');
  const namespace = getString(config.namespace, '미지정');
  const replicas = getNumber(config.replicas, 2);
  return (
    <section className="release-flow__step-target-summary" aria-label="배포 단계 source와 target 요약">
      <div className="release-flow__step-target-map">
        <div className="release-flow__step-target-surface">
          <span>Git source</span>
          <strong className="truncate" title={application?.repo_ref}>{application?.repo_ref || '연결된 레포 없음'}</strong>
          <small>{branch} / {manifestPath}</small>
        </div>
        <span className="release-flow__step-target-arrow" aria-hidden="true">-&gt;</span>
        <div className="release-flow__step-target-surface">
          <span>Deployment target</span>
          <strong className="truncate" title={cluster}>{cluster}</strong>
          <small>{environment} / {namespace}</small>
        </div>
      </div>
      <div className="release-flow__step-target-meta">
        <span>커밋 {commitSha}</span>
        <span>이미지 {image}</span>
        <span>{valueLabel(strategy)}</span>
        <span>게이트 {valueLabel(approvalGate)}</span>
        {approvalGateRequiresEvidence(approvalGate) && <span>{approvalRecorded ? '승인 기록 입력됨' : '승인 기록 필요'}</span>}
        <span>레플리카 {replicas}</span>
      </div>
    </section>
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
  const liveActionHint = liveSideEffects ? '라이브 실행 전 대상과 준비 상태를 다시 확인하는 패널이 표시됩니다.' : undefined;
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
          onClick={() => onDispatch(firstWave)}
        >
          Wave {firstWave} 실행
        </Button>
        <Button
          size="sm"
          loading={dispatching}
          disabled={!preview.executable || preview.waves.length === 0}
          title={previewActionHint}
          onClick={onStart}
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

function PlanArchiveConfirmation({
  plan,
  open,
  pending,
  onConfirm,
  onOpenChange,
}: {
  plan: ReleasePlan | null;
  open: boolean;
  pending: boolean;
  onConfirm: (reason: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!open) return;
    setReason('');
    setConfirmed(false);
  }, [open, plan?.plan_id]);
  if (!plan || !open) return null;
  const canConfirm = reason.trim().length > 0 && confirmed && !pending;
  return (
    <Modal
      open
      title="릴리즈 플랜 보관"
      description="플랜 상태를 보관됨으로 바꾸고, 이후 실행 대상에서 제외합니다. 기존 실행과 감사 기록은 유지됩니다."
      onOpenChange={onOpenChange}
      actions={(
        <>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="primary" loading={pending} disabled={!canConfirm} onClick={() => onConfirm(reason.trim())}>플랜 보관</Button>
        </>
      )}
    >
      <div className="release-flow__dispatch-confirm">
        <div className="release-flow__impact-grid">
          <div><span>플랜</span><strong title={plan.name}>{plan.name}</strong></div>
          <div><span>현재 상태</span><strong>{statusLabel(plan.status)}</strong></div>
          <div><span>포함 단계</span><strong>{plan.steps.length}개</strong></div>
          <div><span>기록</span><strong>유지</strong></div>
        </div>
        <Field label="보관 사유">
          <textarea className="input" rows={3} value={reason} onChange={event => setReason(event.target.value)} />
        </Field>
        <Checkbox
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          label="이 플랜이 이후 릴리즈 실행 대상에서 제외되는 것을 확인했습니다"
        />
      </div>
    </Modal>
  );
}

function PlanRestoreConfirmation({
  plan,
  open,
  pending,
  onConfirm,
  onOpenChange,
}: {
  plan: ReleasePlan | null;
  open: boolean;
  pending: boolean;
  onConfirm: (reason: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    if (!open) return;
    setReason('');
    setConfirmed(false);
  }, [open, plan?.plan_id]);
  if (!plan || !open) return null;
  const archive = recordValue(plan.settings.archive);
  const archivedReason = getString(archive.reason, '기록 없음');
  const archivedBy = getString(archive.archived_by, '기록 없음');
  const canConfirm = reason.trim().length > 0 && confirmed && !pending;
  return (
    <Modal
      open
      title="릴리즈 플랜 복구"
      description="보관 전 상태로 되돌리고, 다시 릴리즈 실행 후보로 포함합니다. 실행 전 준비 상태와 정책 검증은 다시 통과해야 합니다."
      onOpenChange={onOpenChange}
      actions={(
        <>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="primary" loading={pending} disabled={!canConfirm} onClick={() => onConfirm(reason.trim())}>플랜 복구</Button>
        </>
      )}
    >
      <div className="release-flow__dispatch-confirm">
        <div className="release-flow__impact-grid">
          <div><span>플랜</span><strong title={plan.name}>{plan.name}</strong></div>
          <div><span>현재 상태</span><strong>{statusLabel(plan.status)}</strong></div>
          <div><span>복구 후</span><strong>보관 전 상태</strong></div>
          <div><span>실행</span><strong>준비 상태 재검증</strong></div>
        </div>
        <div className="release-flow__form-grid">
          <FieldValue label="보관 사유" value={archivedReason} />
          <FieldValue label="보관 수행자" value={archivedBy} />
        </div>
        <Field label="복구 사유">
          <textarea className="input" rows={3} value={reason} onChange={event => setReason(event.target.value)} />
        </Field>
        <Checkbox
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          label="복구 후에도 배포 전에 준비 상태와 승인 게이트를 다시 확인하는 것을 알고 있습니다"
        />
      </div>
    </Modal>
  );
}

function PlanDeletionConfirmation({
  plan,
  mode,
  pending,
  onConfirm,
  onOpenChange,
}: {
  plan: ReleasePlan | null;
  mode: PlanDeletionMode | null;
  pending: boolean;
  onConfirm: (mode: PlanDeletionMode) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => setConfirmed(false), [mode, plan?.plan_id]);
  if (!plan || !mode) return null;
  const force = mode === 'force';
  const actionLabel = force ? '강제 삭제' : '플랜 삭제';
  return (
    <Modal
      open
      title={`릴리즈 플랜 ${actionLabel}`}
      description={force
        ? '플랜과 연결된 릴리즈 실행 기록을 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.'
        : '플랜을 삭제합니다. 연결된 실행 기록이 있으면 서버 정책에 따라 삭제가 거부될 수 있습니다.'}
      onOpenChange={onOpenChange}
      actions={(
        <>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="danger" loading={pending} disabled={!confirmed || pending} onClick={() => onConfirm(mode)}>{actionLabel}</Button>
        </>
      )}
    >
      <div className="release-flow__dispatch-confirm">
        <div className="release-flow__impact-grid">
          <div><span>플랜</span><strong title={plan.name}>{plan.name}</strong></div>
          <div><span>상태</span><strong>{statusLabel(plan.status)}</strong></div>
          <div><span>포함 단계</span><strong>{plan.steps.length}개</strong></div>
          <div><span>삭제 범위</span><strong>{force ? '플랜 + 실행 기록' : '플랜만'}</strong></div>
        </div>
        <Checkbox
          checked={confirmed}
          onChange={event => setConfirmed(event.target.checked)}
          label={force ? '실행 기록까지 영구 삭제하는 것을 확인했습니다' : '삭제할 플랜과 영향 범위를 확인했습니다'}
          description={force ? '강제 삭제 후에는 감사와 실행 이력을 복구할 수 없습니다.' : undefined}
        />
      </div>
    </Modal>
  );
}

function ReleaseDispatchConfirmation({
  open,
  intent,
  plan,
  preview,
  readiness,
  pending,
  onConfirm,
  onOpenChange,
}: {
  open: boolean;
  intent: ReleaseDispatchIntent | null;
  plan: ReleasePlan | null;
  preview?: ReleasePlanPreview;
  readiness?: ReleaseReadiness;
  pending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => setConfirmed(false), [intent?.action, intent?.wave, open]);
  if (!open || !intent || !plan) return null;

  const steps = (preview?.steps ?? []).filter((step) => intent.action === 'run' || step.wave === intent.wave);
  const environments = [...new Set(steps.map((step) => step.environment).filter(Boolean))];
  const productionSteps = steps.filter((step) => ['prod', 'production'].includes(step.environment.toLowerCase()));
  const actionLabel = intent.action === 'wave' ? `Wave ${intent.wave} 실행` : '추적 실행 시작';
  const blockers = readiness?.blockers ?? [];
  const warnings = readiness?.warnings ?? [];
  const readinessSummary = readiness?.ready
    ? warnings.length ? `${warnings.length}개 운영 경고` : '준비 상태 통과'
    : blockers[0] ?? '준비 상태를 다시 확인하세요';

  return (
    <Modal
      open={open}
      title={`라이브 릴리즈 확인: ${actionLabel}`}
      description="GitOps 이벤트를 발행하기 전에 이번 실행의 대상과 운영 조건을 다시 확인합니다."
      onOpenChange={onOpenChange}
    >
      <div className="release-flow__dispatch-confirm">
        <div className="release-flow__impact">
          <div className="release-flow__impact-grid">
            <div><span>플랜</span><strong title={plan.name}>{plan.name}</strong></div>
            <div><span>실행 범위</span><strong>{intent.action === 'wave' ? `Wave ${intent.wave}` : '전체 플랜'}</strong></div>
            <div><span>대상 단계</span><strong>{steps.length}개</strong></div>
            <div><span>운영 환경</span><strong>{productionSteps.length}개</strong></div>
          </div>
          <p>{environments.join(', ') || '환경 정보 없음'} / {readinessSummary}</p>
        </div>

        <section className="release-flow__dispatch-targets" aria-label="실행 대상">
          <div className="release-flow__dispatch-targets-head">
            <strong>이번 실행 대상</strong>
            <Badge tone={productionSteps.length > 0 ? 'warning' : 'info'}>{productionSteps.length > 0 ? '운영 대상 포함' : '비운영 대상'}</Badge>
          </div>
          {steps.length > 0 ? (
            <div className="release-flow__dispatch-target-list">
              {steps.map((step) => (
                <div key={step.step_id} className="release-flow__dispatch-target">
                  <strong>{step.name || step.application_id}</strong>
                  <span>{step.environment} / {valueLabel(step.strategy)} / {valueLabel(step.gate)}</span>
                </div>
              ))}
            </div>
          ) : <p className="release-flow__hint">미리보기에서 실행 대상을 확인하지 못했습니다. 실행을 취소하고 준비 상태를 다시 점검하세요.</p>}
        </section>

        {(blockers.length || warnings.length) ? (
          <section className="release-flow__dispatch-notices" aria-label="운영 확인 사항">
            {blockers.slice(0, 3).map((item) => <p key={item} className="text-danger">{item}</p>)}
            {warnings.slice(0, 3).map((item) => <p key={item} className="text-warning">{item}</p>)}
          </section>
        ) : null}

        <Checkbox
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          label="실행 대상과 준비 상태를 확인했습니다"
          description={readiness?.ready === false
            ? '최신 준비 상태에 blocker가 있어 실행할 수 없습니다. 아래 확인 사항을 먼저 해결하세요.'
            : '확인 후에만 실제 GitOps 이벤트가 발행됩니다. 서버의 릴리즈 정책과 권한 검증은 별도로 다시 적용됩니다.'}
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>취소</Button>
          <Button variant="primary" loading={pending} disabled={!confirmed || steps.length === 0 || readiness?.ready === false} onClick={onConfirm}>{actionLabel}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ReadinessPanel({
  readiness,
  loading,
  error,
  onRefresh,
  onResolve,
}: {
  readiness?: ReleaseReadiness;
  loading: boolean;
  error?: Error | null;
  onRefresh?: () => void;
  onResolve?: (checkId: string) => void;
}) {
  if (loading && !readiness) {
    return <Card title="준비 상태"><p className="release-flow__hint">릴리즈 준비 상태를 확인하는 중입니다...</p></Card>;
  }
  if (error && !readiness) {
    return (
      <Card title="준비 상태" actions={onRefresh ? <Button size="sm" variant="ghost" onClick={onRefresh}>다시 점검</Button> : undefined}>
        <p className="release-flow__hint text-danger">준비 상태를 계산하지 못했습니다. {error.message || '잠시 후 다시 점검해주세요.'}</p>
      </Card>
    );
  }
  if (!readiness) {
    return <Card title="준비 상태" actions={onRefresh ? <Button size="sm" variant="ghost" onClick={onRefresh}>점검 시작</Button> : undefined}><p className="release-flow__hint">아직 준비 상태 확인 결과가 없습니다.</p></Card>;
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
          {onRefresh && <Button size="sm" variant="ghost" onClick={onRefresh}>다시 점검</Button>}
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
              <div className="release-flow__next-action-actions">
                <Badge tone={readinessStatusTone(action.severity)}>{readinessStatusLabel(action.severity)}</Badge>
                {onResolve && <Button size="sm" variant="ghost" onClick={() => onResolve(action.check_id)}>수정 열기</Button>}
              </div>
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
  readiness,
  settingsHref,
}: {
  channels: AlertChannel[];
  loading: boolean;
  error: Error | null;
  readiness?: ReleaseReadiness;
  settingsHref: string;
}) {
  if (loading && channels.length === 0) {
    return <Card title="릴리즈 알림"><p className="release-flow__hint">알림 채널을 불러오는 중입니다...</p></Card>;
  }
  const enabled = channels.filter(channel => channel.enabled);
  const critical = enabled.filter(channel => channel.min_severity === 'critical');
  const warningOrLower = enabled.filter(channel => channel.min_severity !== 'critical');
  const validation = readiness?.checks.find(check => check.check_id === 'alerts.enabled_channels');
  const summaryTone = error
    ? 'warning'
    : validation
      ? readinessStatusTone(validation.status)
      : enabled.length > 0 ? 'success' : 'warning';
  const summaryLabel = error
    ? '사용 불가'
    : validation
      ? `검증 ${readinessStatusLabel(validation.status)}`
      : enabled.length > 0 ? `${enabled.length}개 활성` : '설정 안 됨';
  return (
    <Card
      title="릴리즈 알림"
      actions={<Badge tone={summaryTone}>{summaryLabel}</Badge>}
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
          {validation && (
            <div className={`release-flow__readiness-row release-flow__readiness-row--${readinessStatusClass(validation.status)}`}>
              <div>
                <strong>라이브 알림 검증</strong>
                <p>{validation.message}</p>
              </div>
              <Badge tone={readinessStatusTone(validation.status)}>{readinessStatusLabel(validation.status)}</Badge>
              {validation.blockers.length > 0 && (
                <ul>{validation.blockers.slice(0, 2).map(blocker => <li key={blocker}>{blocker}</li>)}</ul>
              )}
            </div>
          )}
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
  const isFeatureDemo = isFeatureDemoPlan(plan);
  const displayRuns = useMemo(
    () => (isFeatureDemo && runs.length === 0 && runFilter === 'all' ? [demoReleaseRun(plan)] : runs),
    [isFeatureDemo, plan, runFilter, runs],
  );
  const recentRunIds = useMemo(() => new Set((summary?.recent_runs ?? []).map(run => run.run_id)), [summary?.recent_runs]);
  useEffect(() => {
    if (loading && displayRuns.length === 0) return;
    if (displayRuns.length === 0) {
      if (selectedRunId && runFilter === 'all' && !recentRunIds.has(selectedRunId)) onSelectedRunIdChange('');
      return;
    }
    if (!selectedRunId) {
      onSelectedRunIdChange(displayRuns[0].run_id);
      return;
    }
    if (runFilter === 'all' && !displayRuns.some(run => run.run_id === selectedRunId) && !recentRunIds.has(selectedRunId)) {
      onSelectedRunIdChange(displayRuns[0].run_id);
    }
  }, [displayRuns, loading, onSelectedRunIdChange, recentRunIds, runFilter, selectedRunId]);
  const selectRecentRun = (runId: string) => {
    onRunFilterChange('all');
    onSelectedRunIdChange(runId);
  };
  const selectedRun = selectedRunId ? displayRuns.find(run => run.run_id === selectedRunId) : undefined;
  const run = selectedRun ?? displayRuns[0];
  const isDemoRun = run?.run_id === demoReleaseRunId(plan);
  const handoffQ = useReleaseRunHandoff(isDemoRun ? undefined : run?.run_id);
  const handoff = isDemoRun ? demoReleaseRunHandoff(run) : handoffQ.data;
  const reportM = useReleaseRunReport();
  const reportExportM = useReleaseRunReportExport();
  const [actionIntent, setActionIntent] = useState<RunActionIntent | null>(null);
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
  const notifyAction = handoff?.next_actions.find(action => action.action === 'notify');
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
      {displayRuns.length > 1 && (
        <Field label="실행 선택">
          <select className="input" value={run.run_id} onChange={e => onSelectedRunIdChange(e.target.value)}>
            {displayRuns.map(item => (
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
      <RunHandoffPanel handoff={handoff} loading={!isDemoRun && handoffQ.isPending} />
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
              if (isDemoRun) copyReleaseRunReport(run, handoff);
              else {
                reportM.mutate(run.run_id, {
                  onSuccess: data => copyReleaseRunReport(run, handoff, data.report.markdown),
                  onError: () => copyReleaseRunReport(run, handoff),
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
              if (!sideEffects) {
                onAdvance(run.run_id);
                return;
              }
              setActionIntent({
                title: '다음 Wave 진행',
                description: '다음 GitOps wave를 실행합니다. 현재 실행 상태와 대상 단계를 확인한 뒤 진행하세요.',
                confirmLabel: '다음 Wave 진행',
                runId: run.run_id,
                status,
                wave: run.current_wave,
                requiresAcknowledgement: true,
                onConfirm: () => onAdvance(run.run_id),
              });
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
              setActionIntent({
                title: '릴리즈 Wave 재시도',
                description: sideEffects
                  ? '실패했거나 비정상인 GitOps 단계를 다시 실행합니다. 영향과 복구 기준을 확인하세요.'
                  : 'dry-run 실행에서 실패했거나 비정상인 단계를 다시 계산합니다.',
                confirmLabel: '재시도 요청',
                runId: run.run_id,
                status,
                wave: run.current_wave,
                defaultReason: operatorActionReason('retry', run, status, attentionReasons),
                requiresAcknowledgement: sideEffects,
                onConfirm: reason => onRetry(run.run_id, reason),
              });
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
                onClick={() => setActionIntent({
                  title: '릴리즈 실행 재개',
                  description: '일시정지된 릴리즈 실행을 다시 진행합니다.',
                  confirmLabel: '실행 재개',
                  runId: run.run_id,
                  status,
                  wave: run.current_wave,
                  defaultReason: operatorActionReason('resume', run, status, attentionReasons),
                  onConfirm: reason => onResume(run.run_id, reason),
                })}
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
                onClick={() => setActionIntent({
                  title: '릴리즈 실행 일시정지',
                  description: '현재 Wave 이후의 릴리즈 진행을 멈춥니다. 재개 전까지 새 GitOps 작업이 진행되지 않습니다.',
                  confirmLabel: '일시정지',
                  runId: run.run_id,
                  status,
                  wave: run.current_wave,
                  defaultReason: operatorActionReason('pause', run, status, attentionReasons),
                  onConfirm: reason => onPause(run.run_id, reason),
                })}
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
            onClick={() => setActionIntent({
              title: '롤백 요청',
              description: '현재 릴리즈의 롤백을 요청합니다. 사용자 영향과 롤백 기준을 확인한 경우에만 진행하세요.',
              confirmLabel: '롤백 요청',
              runId: run.run_id,
              status,
              wave: run.current_wave,
              defaultReason: operatorActionReason('rollback', run, status, attentionReasons),
              requiresAcknowledgement: true,
              destructive: true,
              onConfirm: reason => onRollback(run.run_id, reason),
            })}
          >
            롤백
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || isDemoRun || isTerminal}
            title={sampleRunReason || cancelBlockedReason}
            onClick={() => setActionIntent({
              title: '릴리즈 실행 취소',
              description: '이 실행의 이후 릴리즈 진행을 중단합니다. 이미 적용된 변경은 자동으로 되돌아가지 않습니다.',
              confirmLabel: '실행 취소',
              runId: run.run_id,
              status,
              wave: run.current_wave,
              defaultReason: operatorActionReason('cancel', run, status, attentionReasons),
              requiresAcknowledgement: true,
              destructive: true,
              onConfirm: reason => onCancel(run.run_id, reason),
            })}
          >
            취소
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || isDemoRun || !alertable || Boolean(notifyBlockedReason)}
            title={sampleRunReason || notifyDisabledReason}
            onClick={() => setActionIntent({
              title: '릴리즈 담당자 알림',
              description: '현재 실행의 상태와 사유를 활성 알림 채널로 전달합니다.',
              confirmLabel: '알림 발송',
              runId: run.run_id,
              status,
              wave: run.current_wave,
              defaultReason: operatorActionReason('notify', run, status, attentionReasons),
              onConfirm: reason => onNotify(run.run_id, reason),
            })}
          >
            알림
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || isDemoRun}
            title={sampleRunReason || deleteBlockedReason}
            onClick={() => setActionIntent({
              title: '릴리즈 실행 삭제',
              description: canForceDelete
                ? '활성 상태의 실행입니다. 강제 삭제하면 이후 상태 추적과 운영 이력이 사라집니다.'
                : '실행 이력과 관련 화면의 상태를 삭제합니다.',
              confirmLabel: canForceDelete ? '강제 삭제' : '실행 삭제',
              runId: run.run_id,
              status,
              wave: run.current_wave,
              requiresAcknowledgement: true,
              requiresForce: canForceDelete,
              destructive: true,
              onConfirm: (_reason, force) => onDelete(run.run_id, force),
            })}
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
      <RunActionConfirmation
        intent={actionIntent}
        pending={busy}
        onOpenChange={open => {
          if (!open) setActionIntent(null);
        }}
      />
    </Card>
  );
}

function RunActionConfirmation({
  intent,
  pending,
  onOpenChange,
}: {
  intent: RunActionIntent | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [force, setForce] = useState(false);
  useEffect(() => {
    setReason(intent?.defaultReason ?? '');
    setAcknowledged(false);
    setForce(false);
  }, [intent]);
  if (!intent) return null;
  const normalizedReason = reason.trim() || intent.defaultReason || '';
  const disabled = pending
    || (Boolean(intent.defaultReason) && !normalizedReason)
    || (Boolean(intent.requiresAcknowledgement) && !acknowledged)
    || (Boolean(intent.requiresForce) && !force);
  return (
    <Modal
      open
      title={intent.title}
      description={intent.description}
      onOpenChange={onOpenChange}
      actions={(
        <>
          <Button variant="ghost" disabled={pending} onClick={() => onOpenChange(false)}>취소</Button>
          <Button
            variant={intent.destructive ? 'danger' : 'primary'}
            loading={pending}
            disabled={disabled}
            onClick={() => {
              intent.onConfirm(normalizedReason, force);
              onOpenChange(false);
            }}
          >
            {intent.confirmLabel}
          </Button>
        </>
      )}
    >
      <div className="release-flow__dispatch-confirm">
        <div className="release-flow__impact-grid">
          <div><span>실행</span><strong>{shortId(intent.runId)}</strong></div>
          <div><span>현재 상태</span><strong>{statusLabel(intent.status)}</strong></div>
          <div><span>현재 Wave</span><strong>{intent.wave}</strong></div>
        </div>
        {intent.defaultReason && (
          <Field label="작업 사유">
            <textarea className="input" rows={3} value={reason} onChange={event => setReason(event.target.value)} />
          </Field>
        )}
        {intent.requiresAcknowledgement && (
          <Checkbox
            checked={acknowledged}
            onChange={event => setAcknowledged(event.target.checked)}
            label="실행 대상과 영향을 확인했습니다"
          />
        )}
        {intent.requiresForce && (
          <Checkbox
            checked={force}
            onChange={event => setForce(event.target.checked)}
            label="활성 실행을 강제로 삭제하는 것을 확인했습니다"
            description="강제 삭제 후에는 실행 상태와 이력을 복구할 수 없습니다."
          />
        )}
      </div>
    </Modal>
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

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.split(/[\\/]/).pop() || 'release-manifest.yaml';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
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

function isFeatureDemoPlan(plan: ReleasePlan | null | undefined): boolean {
  return plan?.settings.feature_demo === true;
}

function releasePlanPickerId(plan: ReleasePlan): string {
  if (isFeatureDemoPlan(plan)) return DEMO_RELEASE_PLAN_PICKER_ID;
  return plan.plan_id ?? `draft-${safeId(plan.name) || 'plan'}`;
}

function featureDemoReleasePlan(): ReleasePlan {
  return normalizePlan({
    name: '멀티 레포 출시 기능 데모',
    description: '세 레포의 의존성, 승인, 실행 복구, 생성 YAML과 Safe PR 검토 화면을 한 플랜에서 확인합니다.',
    status: 'active',
    settings: {
      ...DEFAULT_POLICY,
      feature_demo: true,
      runtime_mode: 'demo',
      execution_mode: 'sequential_apply',
      approval_policy: 'production_only',
      failure_policy: 'pause_for_operator',
      rollback_policy: 'safe_pr',
      environment_order: ['staging', 'production'],
      release_owner: 'Platform Release Team',
      oncall_contact: '#release-oncall',
      runbook_url: 'https://docs.example.com/runbooks/multi-repo-release',
      abort_criteria: '카나리 오류율이 5분 동안 5%를 넘으면 중단',
      require_diagnostics_pass: true,
    },
    steps: demoReleasePlanSteps(),
  });
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
      last_run_status: 'running',
    },
    {
      application_id: 'demo-orders-api',
      name: 'Orders API',
      repo_ref: 'JEONWOOHYUN-hydromel/demo-orders-api',
      branch: 'main',
      cluster_id: 'demo-target-cluster',
      manifest_path: 'k8s/orders/deployment.yaml',
      last_run_status: 'succeeded',
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
  setPlan(current => current ? applyStepConfigPatch(current, index, patch) : current);
}

const APPROVAL_EVIDENCE_FIELDS = new Set([
  'approval_granted',
  'approval_granted_by',
  'approval_reason',
  'approval_granted_at',
]);

function applyPolicyPatch(plan: ReleasePlan, patch: Record<string, unknown>): ReleasePlan {
  const settings = { ...DEFAULT_POLICY, ...plan.settings, ...patch };
  if (!patchChangesReleaseScope(plan.settings, patch)) return { ...plan, settings };
  return {
    ...plan,
    settings: clearApprovalEvidence(settings),
    steps: plan.steps.map(step => ({ ...step, config: clearApprovalEvidence(step.config) })),
  };
}

function applyStepPatch(plan: ReleasePlan, index: number, patch: Partial<ReleasePlanStep>): ReleasePlan {
  const currentStep = plan.steps[index];
  if (!currentStep) return plan;
  const applicationChanged = typeof patch.application_id === 'string' && patch.application_id !== currentStep.application_id;
  const nextStep = applicationChanged
    ? { ...currentStep, ...patch, config: clearApprovalEvidence(currentStep.config) }
    : { ...currentStep, ...patch };
  return {
    ...plan,
    settings: applicationChanged ? clearApprovalEvidence(plan.settings) : plan.settings,
    steps: normalizeSteps(plan.steps.map((step, stepIndex) => stepIndex === index ? nextStep : step)),
  };
}

function applyStepConfigPatch(plan: ReleasePlan, index: number, patch: Record<string, unknown>): ReleasePlan {
  const currentStep = plan.steps[index];
  if (!currentStep) return plan;
  const config = { ...currentStep.config, ...patch };
  const scopeChanged = patchChangesReleaseScope(currentStep.config, patch);
  return {
    ...plan,
    settings: scopeChanged ? clearApprovalEvidence(plan.settings) : plan.settings,
    steps: plan.steps.map((step, stepIndex) => stepIndex === index
      ? { ...step, config: scopeChanged ? clearApprovalEvidence(config) : config }
      : step),
  };
}

function patchChangesReleaseScope(current: Record<string, unknown>, patch: Record<string, unknown>): boolean {
  return Object.entries(patch).some(([key, value]) => (
    !APPROVAL_EVIDENCE_FIELDS.has(key) && !releaseSettingValueEqual(current[key], value)
  ));
}

function clearApprovalEvidence<T extends Record<string, unknown>>(values: T): T {
  return {
    ...values,
    approval_granted: false,
    approval_granted_by: '',
    approval_reason: '',
    approval_granted_at: '',
  } as T;
}

function releaseSettingValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

function releasePlanExecutionFingerprint(plan: ReleasePlan): string {
  return JSON.stringify({
    name: plan.name,
    description: plan.description,
    status: plan.status,
    settings: plan.settings,
    steps: plan.steps.map(step => ({
      application_id: step.application_id,
      name: step.name,
      position: step.position,
      depends_on: step.depends_on,
      config: step.config,
    })),
  });
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
    auto_safe: '안전한 변경 자동',
    blocked: '막힘',
    canary: '카나리',
    demo: '데모',
    dry_run: 'dry-run',
    external_change_ticket: '변경 티켓 필요',
    inherit: '플랜 정책 따르기',
    live: '라이브',
    low: '낮음',
    manual: '수동',
    manual_each_step: '단계별 수동 승인',
    manual_approved: '수동 승인 완료',
    manual_production: '운영 수동 승인',
    medium: '중간',
    pending: '대기',
    policy: '정책',
    post_deploy: '배포 후',
    production_only: '운영 환경 수동 승인',
    queued: '대기',
    rolling: '롤링',
    safe_pr: 'Safe PR 검토',
    sequential: '순차',
    waiting: '대기 중',
  }[normalized] ?? value;
}

function releaseEdgeGateLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized === 'manual' || normalized.includes('manual')) return '수동 승인';
  if (normalized === 'dependency' || normalized === 'all_upstream_complete') return '의존성 통과';
  if (normalized === 'inherit') return '플랜 정책';
  return valueLabel(value) || '자동 진행';
}

function effectiveApprovalGate(configuredGate: string, policy: string, environment: string): string {
  if (configuredGate && configuredGate !== 'inherit') return configuredGate;
  if (policy === 'production_only') {
    return ['prod', 'production'].includes(environment.toLowerCase()) ? 'manual_production' : 'auto';
  }
  return policy || 'auto_safe';
}

function approvalGateRequiresEvidence(gate: string): boolean {
  return ['manual', 'manual_each_step', 'manual_production'].includes(gate);
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
      width: RELEASE_APP_NODE_WIDTH,
      height: RELEASE_APP_NODE_HEIGHT,
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
      data: {
        tone: 'info' as const,
        active: true,
        label: releaseEdgeGateLabel(getString(step.config.approval_gate, 'dependency')),
        detail: '상위 단계 완료',
      },
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
      data: { tone: 'ok' as const, active: false, label: '진단 통과' },
    }));
  const sequenceEdges: ReleaseEdge[] = dependencyEdges.length ? [] : plan.steps.slice(1).map((step, index) => ({
    id: `seq-${index}`,
    source: `step-${index}`,
    target: `step-${index + 1}`,
    type: 'animated',
    data: {
      tone: 'neutral' as const,
      label: releaseEdgeGateLabel(getString(step.config.approval_gate, 'auto')),
    },
  }));
  const terminalEdges: ReleaseEdge[] = plan.steps
    .map((step, index) => ({ step, index }))
    .filter(({ step, index }) => !dependentSources.has(step.application_id) || index === plan.steps.length - 1)
    .map(({ index }) => ({
      id: `step-${index}-approval`,
      source: `step-${index}`,
      target: 'sys-approval',
      type: 'animated',
      data: {
        tone: hasBlockedApplication ? 'warn' as const : 'info' as const,
        active: hasIncompleteApplication,
        label: '승인 요청',
        detail: 'manual gate',
        gate: true,
      },
    }));
  const systemEdges: ReleaseEdge[] = [
    {
      id: 'approval-verification',
      source: 'sys-approval',
      target: 'sys-verification',
      type: 'animated',
      data: { tone: 'neutral' as const, active: false, label: '승인 후 검증' },
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
  const nodeWidth = nodeType === 'application'
    ? RELEASE_APP_NODE_WIDTH
    : nodeType === 'approval'
      ? RELEASE_GATE_NODE_WIDTH
      : RELEASE_CHECKPOINT_NODE_WIDTH;
  const nodeHeight = nodeType === 'application'
    ? RELEASE_APP_NODE_HEIGHT
    : nodeType === 'approval'
      ? RELEASE_GATE_NODE_HEIGHT
      : RELEASE_CHECKPOINT_NODE_HEIGHT;
  return {
    id,
    type: 'release_step',
    position: { x: 0, y: 0 },
    width: nodeWidth,
    height: nodeHeight,
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
  const date = parseReleaseDate(value);
  if (!date) return value.replace(/Z$/, '').slice(0, 16);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function parseReleaseDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatReleaseWindow(start: Date | null, end: Date | null): string {
  if (!start && !end) return '설정되지 않음';
  if (!start || !end) return '시작과 종료를 모두 입력하세요';
  const formatter = new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${formatter.format(start)} - ${formatter.format(end)}`;
}

function scheduleWindowStatus(
  start: Date | null,
  end: Date | null,
  now: Date,
  kind: 'release' | 'freeze',
): { tone: 'neutral' | 'success' | 'warning' | 'danger'; label: string } {
  if (!start && !end) return { tone: 'neutral', label: kind === 'release' ? '시간 미설정' : '동결 미설정' };
  if (!start || !end || end <= start) return { tone: 'danger', label: '시간 확인 필요' };
  if (kind === 'release') {
    if (now < start) return { tone: 'warning', label: '아직 시작 전' };
    if (now > end) return { tone: 'danger', label: '가능 시간 종료' };
    return { tone: 'success', label: '지금 배포 가능' };
  }
  if (now < start || now > end) return { tone: 'success', label: '동결 아님' };
  return { tone: 'danger', label: '현재 동결 중' };
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
