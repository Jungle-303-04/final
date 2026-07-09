import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction, type SVGProps } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import { Handle, Position, type Edge, type Node, type NodeProps } from '@xyflow/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
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
  useReleaseAudit,
  useReleaseAuditExport,
  useReleaseRunHandoff,
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
import { Badge, Breadcrumb, Button, Card, EmptyState, Field, Tabs } from '@/ui';
import { FlowCanvas, useAutoLayout, type FlowEdgeData } from '@/shared/flow';
import type {
  Application,
  Diagnostic,
  ReleaseAuditEvent,
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

const BASELINE_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  replicas: 2
  selector:
    matchLabels:
      app: checkout-api
  template:
    metadata:
      labels:
        app: checkout-api
    spec:
      containers:
        - name: checkout-api
          image: ghcr.io/example/checkout-api:v1.4.2
          readinessProbe:
            httpGet:
              path: /readyz
              port: 8080
          resources:
            limits:
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  selector:
    app: checkout-api
  ports:
    - port: 80
      targetPort: 8080
`;

const SAMPLE_YAML = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  replicas: 0
  selector:
    matchLabels:
      app: checkout-v2
  template:
    metadata:
      labels:
        app: checkout-v2
    spec:
      containers:
        - name: checkout-api
          image: ghcr.io/example/checkout-api:latest
          securityContext:
            privileged: true
---
apiVersion: v1
kind: Service
metadata:
  name: checkout-api
  namespace: sandbox
spec:
  selector:
    app: checkout-v2
  ports:
    - port: 80
      targetPort: 9000
`;

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
  ['demo', 'Demo mode'],
  ['live', 'Live mode'],
];
const EXECUTION_MODES = [
  ['preview_only', 'Preview only'],
  ['manual_dispatch', 'Manual dispatch'],
  ['sequential_apply', 'Sequential apply'],
  ['promotion', 'Promotion path'],
];
const APPROVAL_POLICIES = [
  ['auto_safe', 'Auto for safe diffs'],
  ['manual_each_step', 'Manual every step'],
  ['production_only', 'Manual for production'],
  ['external_change_ticket', 'External ticket required'],
];
const FAILURE_POLICIES = [
  ['stop_on_failure', 'Stop on failure'],
  ['pause_for_operator', 'Pause for operator'],
  ['continue_independent', 'Continue independent waves'],
];
const ROLLBACK_POLICIES = [
  ['manual', 'Manual rollback'],
  ['safe_pr', 'Safe PR rollback'],
  ['restart_last_successful', 'Restart last healthy'],
  ['disabled', 'Disabled'],
];
const STRATEGIES = [
  ['rolling', 'Rolling'],
  ['canary', 'Canary'],
  ['blue_green', 'Blue/green'],
];
const STEP_GATES = [
  ['inherit', 'Inherit plan policy'],
  ['auto', 'Automatic'],
  ['manual', 'Manual approval'],
  ['safe_pr', 'Safe PR'],
];
const AUDIT_EVENT_FILTERS = [
  ['', 'All audit events'],
  ['workflow.run.failed', 'Workflow failed'],
  ['approval.requested', 'Approval requested'],
  ['approval.rejected', 'Approval rejected'],
  ['rollback.requested', 'Rollback requested'],
  ['release.*', 'Release operator actions'],
  ['release.notify.*', 'Release notifications'],
  ['release.retry.*', 'Retry attempts'],
  ['release.cancelled', 'Cancelled'],
  ['wave.dispatched', 'Wave dispatched'],
  ['evidence.queued', 'Evidence queued'],
];

type ReleaseNodeData = {
  step: ReleasePlanStep;
  app?: Application;
  index: number;
  selected: boolean;
  tone: ReleaseFlowTone;
  diagnostics: number;
  wave?: number | null;
  gate: string;
  strategy: string;
  environment: string;
};

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
  return (
    <div className={`release-node ${data.selected ? 'release-node--selected' : ''} ${borderClass}`}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div className="release-node__title">
        <span>{data.index + 1}. {data.step.name || data.app?.name || data.step.application_id}</span>
        {data.diagnostics > 0 && <Badge tone={toUiTone(data.tone)}>{data.diagnostics}</Badge>}
      </div>
      <div className="release-node__meta">
        <span>{data.app?.repo_ref ?? 'unknown repo'}</span>
        <span>{data.environment} / {data.strategy} / {data.gate}</span>
        <span>{data.wave ? `wave ${data.wave}` : 'wave pending'}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  );
}

const nodeTypes = { release_step: ReleaseStepNode };
type ReleaseEdge = Edge<FlowEdgeData>;

export default function ReleaseFlowView() {
  const pathFor = useConsolePath();
  const appsQ = useApplications();
  const plansQ = useReleasePlans();
  const alertChannelsQ = useAlertChannels();
  const [plan, setPlan] = useState<ReleasePlan | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [yaml, setYaml] = useState(SAMPLE_YAML);
  const [tab, setTab] = useState('plan');
  const [runFilter, setRunFilter] = useState<ReleaseRunFilter>('all');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [auditEventType, setAuditEventType] = useState('');
  const { data: planDiagnosticsData, mutate: diagnosePlan } = useDiagnostics();
  const { data: yamlDiagnosticsData, mutate: diagnoseYaml } = useDiagnostics();
  const { data: releasePreviewData, isPending: releasePreviewPending, mutate: previewRelease } = useReleasePreview();
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
  const archivePlan = useArchiveReleasePlan(plan?.plan_id ?? '');
  const deletePlan = useDeleteReleasePlan(plan?.plan_id ?? '');
  const deleteRun = useDeleteReleaseRun();
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);

  const apps = useMemo(() => appsQ.data ?? [], [appsQ.data]);
  const appById = useMemo(() => new Map(apps.map(app => [app.application_id, app])), [apps]);
  const selected = selectedStep(plan, selectedIndex);
  const selectedNamespace = getString(selected?.config.namespace, 'sandbox');
  const diagnosticPlan = useMemo(() => withDiagnosticDefaults(plan, apps), [apps, plan]);
  const settingsBaselines = useMemo(() => settingsBaselinesFor(apps), [apps]);

  useEffect(() => {
    if (plan || plansQ.isPending || appsQ.isPending) return;
    const existing = plansQ.data?.[0];
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
    const timer = window.setTimeout(() => {
      diagnoseYaml({ mode: 'yaml', content: yaml, context: { namespace: selectedNamespace, previous_content: BASELINE_YAML } });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [diagnoseYaml, selectedNamespace, yaml]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model) return;
    monaco.editor.setModelMarkers(model, 'myjob-yaml', markersFor(monaco, yamlDiagnosticsData?.diagnostics ?? []));
  }, [yamlDiagnosticsData]);

  const preview = releasePreviewData?.preview;
  const raw = useMemo(
    () => buildFlow(plan, apps, selectedIndex, planDiagnosticsData?.diagnostics ?? [], preview),
    [apps, plan, planDiagnosticsData, preview, selectedIndex],
  );
  const { nodes, edges } = useAutoLayout(raw.nodes, raw.edges, 'LR');

  const setPlanValue = (patch: Partial<ReleasePlan>) => setPlan(current => current ? { ...current, ...patch } : current);
  const setPolicy = (patch: Record<string, unknown>) =>
    setPlan(current => current ? { ...current, settings: { ...DEFAULT_POLICY, ...current.settings, ...patch } } : current);
  const setStep = (index: number, patch: Partial<ReleasePlanStep>) =>
    setPlan(current => current ? {
      ...current,
      steps: normalizeSteps(current.steps.map((step, i) => i === index ? { ...step, ...patch } : step)),
    } : current);
  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
  };

  return (
    <motion.div variants={fadeInUp} initial="initial" animate="animate">
      <Breadcrumb items={[{ label: 'Release flows' }]} />
      <div className="release-flow__header">
        <div>
          <h1>Release flow</h1>
          <p className="release-flow__hint">Plan multi-repo rollout order, gates, failure policy, and manifest risk before dispatch.</p>
        </div>
        <div className="release-flow__toolbar">
          <select
            className="input"
            value={plan?.plan_id ?? '__draft__'}
            onChange={e => {
              const next = plansQ.data?.find(item => item.plan_id === e.target.value);
              setPlan(next ? normalizePlan(next) : draftPlan(apps));
              setSelectedIndex(0);
            }}
          >
            <option value="__draft__">Draft plan</option>
            {(plansQ.data ?? []).map(item => <option key={item.plan_id} value={item.plan_id}>{item.name}</option>)}
          </select>
          <Button onClick={() => { setPlan(draftPlan(apps)); setSelectedIndex(0); }}><IconPlus size={14} />New</Button>
          <Button variant="primary" loading={save.isPending} disabled={!plan} onClick={() => plan && save.mutate(normalizePlan(plan), { onSuccess: d => setPlan(normalizePlan(d.plan)) })}><IconSave size={14} />Save</Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!plan?.plan_id || archivePlan.isPending}
            onClick={() => plan?.plan_id && archivePlan.mutate('Archived manually')}
          >
            Archive
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!plan?.plan_id || deletePlan.isPending}
            onClick={() => {
              if (!plan?.plan_id) return;
              if (!window.confirm(`Delete plan "${plan.name}"?`)) return;
              deletePlan.mutate(false, {
                onSuccess: () => {
                  setPlan(draftPlan(apps));
                  setSelectedIndex(0);
                },
              });
            }}
          >
            Delete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!plan?.plan_id || deletePlan.isPending}
            onClick={() => {
              if (!plan?.plan_id) return;
              if (!window.confirm(`Force delete plan "${plan.name}"? This also removes all release runs under it.`)) return;
              deletePlan.mutate(true, {
                onSuccess: () => {
                  setPlan(draftPlan(apps));
                  setSelectedIndex(0);
                },
              });
            }}
          >
            Force delete
          </Button>
        </div>
      </div>

      {appsQ.isPending ? (
        <Card title="Release plans" loading>
          <p className="release-flow__hint">Loading applications and plans...</p>
        </Card>
      ) : appsQ.error ? (
        <EmptyState title="릴리즈 플랜 정보를 불러오지 못했습니다" description={(appsQ.error as Error).message ?? '잠시 후 다시 시도해주세요'} />
      ) : plan ? (
        <>
          <Tabs value={tab} onValueChange={setTab} items={[
            { value: 'plan', label: 'Plan', count: planDiagnosticsData?.diagnostics.length },
            { value: 'policy', label: 'Policy', count: preview?.blockers.length },
            { value: 'yaml', label: 'YAML', count: yamlDiagnosticsData?.diagnostics.length },
          ]} />

          {tab === 'plan' && (
            <div className="release-flow">
              <Card title="Plan setup">
                <Field label="Name"><input className="input" value={plan.name} onChange={e => setPlanValue({ name: e.target.value })} /></Field>
                <Field label="Description"><textarea className="input" rows={3} value={plan.description} onChange={e => setPlanValue({ description: e.target.value })} /></Field>
                <Field label="Status">
                  <select className="input" value={plan.status} onChange={e => setPlanValue({ status: e.target.value as ReleasePlan['status'] })}>
                    <option value="draft">draft</option>
                    <option value="active">active</option>
                    <option value="paused">paused</option>
                    <option value="archived">archived</option>
                  </select>
                </Field>
                <div className="release-flow__toolbar">
                  <Button size="sm" onClick={() => addStep(plan, apps, setPlan)} disabled={apps.length === 0}><IconPlus size={13} />Step</Button>
                </div>
                <div className="release-flow__step-list">
                  {plan.steps.map((step, i) => (
                    <div key={`${step.application_id}-${i}`} className="release-flow__step-row">
                      <button className="btn btn--ghost btn--sm" onClick={() => setSelectedIndex(i)}>{i + 1}. {step.name || appById.get(step.application_id)?.name || step.application_id}</button>
                      <div className="release-flow__step-actions">
                        <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => moveStep(plan, i, -1, setPlan, setSelectedIndex)} aria-label="Move up"><IconArrowUp size={13} /></Button>
                        <Button size="sm" variant="ghost" disabled={i === plan.steps.length - 1} onClick={() => moveStep(plan, i, 1, setPlan, setSelectedIndex)} aria-label="Move down"><IconArrowDown size={13} /></Button>
                        <Button size="sm" variant="ghost" onClick={() => removeStep(plan, i, setPlan, setSelectedIndex)} aria-label="Remove"><IconTrash size={13} /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Dependency graph" className="p-0">
                <div className="release-flow__canvas">
                  <FlowCanvas nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodeClick={id => setSelectedIndex(Number(id.replace('step-', '')) || 0)} />
                </div>
              </Card>

              <div className="release-flow__stack">
                <StepEditor
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
          )}

          {tab === 'policy' && (
            <div className="release-flow__policy">
              <PolicyEditor plan={plan} setPolicy={setPolicy} />
              <PreviewPanel
                preview={preview}
                loading={releasePreviewPending}
                dispatching={dispatchRelease.isPending || startRelease.isPending}
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
                runs={runsQ.data ?? []}
                summary={summaryQ.data}
                runFilter={runFilter}
                onRunFilterChange={setRunFilter}
                selectedRunId={selectedRunId}
                onSelectedRunIdChange={setSelectedRunId}
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
              <Card title="YAML editor" className="p-0">
                <div className="release-flow__editor">
                  <Editor
                    height="460px"
                    language="yaml"
                    theme="vs-dark"
                    value={yaml}
                    onMount={onMount}
                    onChange={value => setYaml(value ?? '')}
                    options={{ minimap: { enabled: false }, fontSize: 13, lineNumbersMinChars: 3, scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2 }}
                  />
                </div>
              </Card>
              <DiagnosticsPanel diagnostics={yamlDiagnosticsData?.diagnostics ?? []} />
            </div>
          )}
        </>
      ) : <EmptyState title="Preparing release plan" />}
    </motion.div>
  );
}

function PolicyEditor({ plan, setPolicy }: { plan: ReleasePlan; setPolicy: (patch: Record<string, unknown>) => void }) {
  const settings = { ...DEFAULT_POLICY, ...plan.settings };
  return (
    <Card title="Execution policy">
      <div className="release-flow__form-grid">
        <SelectField label="Runtime mode" value={getString(settings.runtime_mode, 'demo')} options={RUNTIME_MODES} onChange={value => setPolicy({ runtime_mode: value, provider_mode: value === 'live' ? 'live' : 'dry_run' })} />
        <SelectField label="Execution mode" value={getString(settings.execution_mode)} options={EXECUTION_MODES} onChange={value => setPolicy({ execution_mode: value })} />
        <SelectField label="Approval policy" value={getString(settings.approval_policy)} options={APPROVAL_POLICIES} onChange={value => setPolicy({ approval_policy: value })} />
        <SelectField label="Failure policy" value={getString(settings.failure_policy)} options={FAILURE_POLICIES} onChange={value => setPolicy({ failure_policy: value })} />
        <SelectField label="Rollback policy" value={getString(settings.rollback_policy)} options={ROLLBACK_POLICIES} onChange={value => setPolicy({ rollback_policy: value })} />
        {getString(settings.rollback_policy) === 'disabled' && (
          <Field label="Rollback override reason">
            <input className="input" value={getString(settings.rollback_override_reason)} onChange={e => setPolicy({ rollback_override_reason: e.target.value })} />
          </Field>
        )}
        <SelectField label="Default strategy" value={getString(settings.default_strategy)} options={STRATEGIES} onChange={value => setPolicy({ default_strategy: value })} />
        <Field label="Concurrency"><input className="input" type="number" min={1} max={20} value={getNumber(settings.concurrency, 1)} onChange={e => setPolicy({ concurrency: Number(e.target.value) })} /></Field>
        <Field label="Health timeout seconds"><input className="input" type="number" min={30} max={3600} value={getNumber(settings.health_timeout_seconds, 600)} onChange={e => setPolicy({ health_timeout_seconds: Number(e.target.value) })} /></Field>
        <Field label="Retry attempts"><input className="input" type="number" min={0} max={10} value={getNumber(settings.retry_attempts, 1)} onChange={e => setPolicy({ retry_attempts: Number(e.target.value) })} /></Field>
        <Field label="Promotion path">
          <input className="input" value={getStringArray(settings.environment_order).join(', ')} onChange={e => setPolicy({ environment_order: splitList(e.target.value) })} />
        </Field>
        <Field label="Change ticket"><input className="input" value={getString(settings.change_ticket)} onChange={e => setPolicy({ change_ticket: e.target.value })} /></Field>
        {getString(settings.runtime_mode, 'demo') === 'live' && !getString(settings.change_ticket).trim() && (
          <Field label="Production change override reason">
            <input className="input" value={getString(settings.production_change_override_reason)} onChange={e => setPolicy({ production_change_override_reason: e.target.value })} />
          </Field>
        )}
        {getString(settings.runtime_mode, 'demo') === 'live' && (
          <>
            <Field label="Release window start">
              <input className="input" placeholder="2026-07-10T09:00:00Z" value={getString(settings.release_window_start)} onChange={e => setPolicy({ release_window_start: e.target.value })} />
            </Field>
            <Field label="Release window end">
              <input className="input" placeholder="2026-07-10T11:00:00Z" value={getString(settings.release_window_end)} onChange={e => setPolicy({ release_window_end: e.target.value })} />
            </Field>
            <Field label="Release window override reason">
              <input className="input" value={getString(settings.release_window_override_reason)} onChange={e => setPolicy({ release_window_override_reason: e.target.value })} />
            </Field>
            <Field label="Runbook URL">
              <input className="input" placeholder="https://wiki.example.com/release-runbook" value={getString(settings.runbook_url)} onChange={e => setPolicy({ runbook_url: e.target.value })} />
            </Field>
            {!getString(settings.runbook_url).trim() && (
              <Field label="Runbook override reason">
                <input className="input" value={getString(settings.runbook_override_reason)} onChange={e => setPolicy({ runbook_override_reason: e.target.value })} />
              </Field>
            )}
            <Field label="Release owner">
              <input className="input" placeholder="release lead or team" value={getString(settings.release_owner)} onChange={e => setPolicy({ release_owner: e.target.value })} />
            </Field>
            <Field label="On-call contact">
              <input className="input" placeholder="oncall@example.com or #release-oncall" value={getString(settings.oncall_contact)} onChange={e => setPolicy({ oncall_contact: e.target.value })} />
            </Field>
            <Field label="Verification override reason">
              <input className="input" value={getString(settings.verification_override_reason)} onChange={e => setPolicy({ verification_override_reason: e.target.value })} />
            </Field>
            <Field label="Abort criteria">
              <input className="input" placeholder="rollback if error rate > 5% for 5m" value={getString(settings.abort_criteria)} onChange={e => setPolicy({ abort_criteria: e.target.value })} />
            </Field>
            {!getString(settings.abort_criteria).trim() && (
              <Field label="Abort criteria override reason">
                <input className="input" value={getString(settings.abort_criteria_override_reason)} onChange={e => setPolicy({ abort_criteria_override_reason: e.target.value })} />
              </Field>
            )}
          </>
        )}
        <Field label="Safe PR URL"><input className="input" value={getString(settings.safe_pr_url)} onChange={e => setPolicy({ safe_pr_url: e.target.value, safe_pr_ready: Boolean(e.target.value.trim()) })} /></Field>
        <label className="release-flow__check">
          <input type="checkbox" checked={Boolean(settings.require_diagnostics_pass)} onChange={e => setPolicy({ require_diagnostics_pass: e.target.checked })} />
          Require diagnostics pass before dispatch
        </label>
        {!settings.require_diagnostics_pass && (
          <Field label="Diagnostics override reason">
            <input className="input" value={getString(settings.diagnostics_override_reason)} onChange={e => setPolicy({ diagnostics_override_reason: e.target.value })} />
          </Field>
        )}
        <label className="release-flow__check">
          <input type="checkbox" checked={Boolean(settings.approval_granted)} onChange={e => setPolicy({ approval_granted: e.target.checked })} />
          Approval granted for this plan
        </label>
        {Boolean(settings.approval_granted) && (
          <>
            <Field label="Approval granted by">
              <input className="input" value={getString(settings.approval_granted_by)} onChange={e => setPolicy({ approval_granted_by: e.target.value })} />
            </Field>
            <Field label="Approval reason">
              <input className="input" value={getString(settings.approval_reason)} onChange={e => setPolicy({ approval_reason: e.target.value })} />
            </Field>
            <Field label="Approval granted at (UTC)">
              <input className="input" type="datetime-local" value={toDateTimeLocalValue(getString(settings.approval_granted_at))} onChange={e => setPolicy({ approval_granted_at: fromDateTimeLocalValue(e.target.value) })} />
            </Field>
          </>
        )}
        <label className="release-flow__check">
          <input type="checkbox" checked={Boolean(settings.safe_pr_ready)} onChange={e => setPolicy({ safe_pr_ready: e.target.checked })} />
          Safe PR ready for this plan
        </label>
      </div>
    </Card>
  );
}

function StepEditor({
  plan,
  selected,
  selectedIndex,
  apps,
  appById,
  setStep,
  setPlan,
}: {
  plan: ReleasePlan;
  selected?: ReleasePlanStep;
  selectedIndex: number;
  apps: Application[];
  appById: Map<string, Application>;
  setStep: (index: number, patch: Partial<ReleasePlanStep>) => void;
  setPlan: Dispatch<SetStateAction<ReleasePlan | null>>;
}) {
  if (!selected) {
    return <Card title="Step editor"><EmptyState icon={<IconAlertTriangle size={24} />} title="No step selected" /></Card>;
  }
  const config = selected.config;
  const strategy = getString(config.strategy, getString(plan.settings.default_strategy, 'rolling'));
  return (
    <Card title="Step editor">
      <Field label="Application">
        <select className="input" value={selected.application_id} onChange={e => setStep(selectedIndex, { application_id: e.target.value, name: appById.get(e.target.value)?.name ?? e.target.value })}>
          {apps.map(app => <option key={app.application_id} value={app.application_id}>{app.name} / {app.repo_ref}</option>)}
        </select>
      </Field>
      <Field label="Step name"><input className="input" value={selected.name} onChange={e => setStep(selectedIndex, { name: e.target.value })} /></Field>
      <div className="release-flow__form-grid release-flow__form-grid--compact">
        <Field label="Branch"><input className="input" value={getString(config.branch, appById.get(selected.application_id)?.branch ?? 'main')} onChange={e => setStepConfig(selectedIndex, { branch: e.target.value }, setPlan)} /></Field>
        <Field label="Manifest path"><input className="input" value={getString(config.manifest_path, appById.get(selected.application_id)?.manifest_path ?? 'deploy.yaml')} onChange={e => setStepConfig(selectedIndex, { manifest_path: e.target.value }, setPlan)} /></Field>
        <Field label="Commit SHA"><input className="input" value={getString(config.commit_sha)} onChange={e => setStepConfig(selectedIndex, { commit_sha: e.target.value }, setPlan)} /></Field>
        <Field label="Image"><input className="input" value={getString(config.image)} onChange={e => setStepConfig(selectedIndex, { image: e.target.value }, setPlan)} /></Field>
        <Field label="Environment"><input className="input" value={getString(config.environment, firstEnvironment(plan))} onChange={e => setStepConfig(selectedIndex, { environment: e.target.value }, setPlan)} /></Field>
        <Field label="Namespace"><input className="input" value={getString(config.namespace, 'sandbox')} onChange={e => setStepConfig(selectedIndex, { namespace: e.target.value }, setPlan)} /></Field>
        <Field label="Replicas"><input className="input" type="number" min={0} value={getNumber(config.replicas, 2)} onChange={e => setStepConfig(selectedIndex, { replicas: Number(e.target.value) }, setPlan)} /></Field>
        <SelectField label="Strategy" value={strategy} options={STRATEGIES} onChange={value => setStepConfig(selectedIndex, { strategy: value }, setPlan)} />
        <SelectField label="Approval gate" value={getString(config.approval_gate, 'inherit')} options={STEP_GATES} onChange={value => setStepConfig(selectedIndex, { approval_gate: value }, setPlan)} />
        <Field label="Change ticket"><input className="input" value={getString(config.change_ticket)} onChange={e => setStepConfig(selectedIndex, { change_ticket: e.target.value }, setPlan)} /></Field>
        <Field label="Safe PR URL"><input className="input" value={getString(config.safe_pr_url)} onChange={e => setStepConfig(selectedIndex, { safe_pr_url: e.target.value, safe_pr_ready: Boolean(e.target.value.trim()) }, setPlan)} /></Field>
        <label className="release-flow__check">
          <input type="checkbox" checked={Boolean(config.approval_granted)} onChange={e => setStepConfig(selectedIndex, { approval_granted: e.target.checked }, setPlan)} />
          Approval granted for this step
        </label>
        <label className="release-flow__check">
          <input type="checkbox" checked={Boolean(config.safe_pr_ready)} onChange={e => setStepConfig(selectedIndex, { safe_pr_ready: e.target.checked }, setPlan)} />
          Safe PR ready for this step
        </label>
        <Field label="Canary percent"><input className="input" type="number" min={1} max={99} value={getNumber(config.canary_percent, strategy === 'canary' ? 20 : 0)} onChange={e => setStepConfig(selectedIndex, { canary_percent: Number(e.target.value) }, setPlan)} /></Field>
        <Field label="Service name"><input className="input" value={getString(config.service_name)} onChange={e => setStepConfig(selectedIndex, { service_name: e.target.value }, setPlan)} /></Field>
        <Field label="Health check path"><input className="input" value={getString(config.health_check_path, '/readyz')} onChange={e => setStepConfig(selectedIndex, { health_check_path: e.target.value }, setPlan)} /></Field>
        <Field label="Verification URL"><input className="input" placeholder="https://status.example.com/checkout" value={getString(config.post_deploy_verification_url)} onChange={e => setStepConfig(selectedIndex, { post_deploy_verification_url: e.target.value }, setPlan)} /></Field>
        <Field label="Rollback trigger"><input className="input" placeholder="rollback if p95 latency doubles for 10m" value={getString(config.rollback_trigger)} onChange={e => setStepConfig(selectedIndex, { rollback_trigger: e.target.value }, setPlan)} /></Field>
        <Field label="Timeout seconds"><input className="input" type="number" min={30} max={3600} value={getNumber(config.timeout_seconds, 600)} onChange={e => setStepConfig(selectedIndex, { timeout_seconds: Number(e.target.value) }, setPlan)} /></Field>
        <Field label="Retry attempts"><input className="input" type="number" min={0} max={10} value={getNumber(config.retry_attempts, getNumber(plan.settings.retry_attempts, 1))} onChange={e => setStepConfig(selectedIndex, { retry_attempts: Number(e.target.value) }, setPlan)} /></Field>
      </div>
      <Field label="Dependencies">
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

function PreviewPanel({
  preview,
  loading,
  dispatching,
  onDispatch,
  onStart,
}: {
  preview?: ReleasePlanPreview;
  loading: boolean;
  dispatching: boolean;
  onDispatch: (wave: number) => void;
  onStart: () => void;
}) {
  if (loading && !preview) return <Card title="Execution preview"><p className="release-flow__hint">Calculating preview...</p></Card>;
  if (!preview) return <Card title="Execution preview"><p className="release-flow__hint">No preview yet.</p></Card>;
  const firstWave = preview.waves[0]?.wave ?? 1;
  return (
    <Card
      title="Execution preview"
      actions={<Badge tone={preview.executable ? 'success' : 'warning'}>{preview.executable ? 'ready' : 'blocked'}</Badge>}
    >
      <p className="release-flow__hint">{preview.summary}</p>
      <div className="release-flow__toolbar release-flow__toolbar--preview">
        <Button
          size="sm"
          variant="primary"
          loading={dispatching}
          disabled={!preview.executable || preview.waves.length === 0}
          onClick={() => onDispatch(firstWave)}
        >
          Dispatch wave {firstWave}
        </Button>
        <Button
          size="sm"
          loading={dispatching}
          disabled={!preview.executable || preview.waves.length === 0}
          onClick={onStart}
        >
          Start tracked run
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
            <b>{step.name}</b>
            <span>{step.environment}</span>
            <span>{step.strategy}</span>
            <span>{step.gate}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ReadinessPanel({ readiness, loading }: { readiness?: ReleaseReadiness; loading: boolean }) {
  if (loading && !readiness) {
    return <Card title="Readiness"><p className="release-flow__hint">Checking release readiness...</p></Card>;
  }
  if (!readiness) {
    return <Card title="Readiness"><p className="release-flow__hint">No readiness check yet.</p></Card>;
  }
  const badgeTone = readiness.ready ? (readiness.warnings.length ? 'warning' : 'success') : 'danger';
  const impact = readiness.impact;
  const nextActions = readiness.next_actions ?? [];
  return (
    <Card
      title="Readiness"
      actions={
        <>
          <Badge tone={readiness.mode === 'live' ? 'danger' : 'info'}>{readiness.mode}</Badge>
          <Badge tone={badgeTone}>{readiness.ready ? 'ready' : 'blocked'}</Badge>
        </>
      }
    >
      <p className="release-flow__hint">{readiness.summary}</p>
      {impact && (
        <div className="release-flow__impact">
          <div className="release-flow__impact-grid">
            <div>
              <span>Applications</span>
              <strong>{impact.applications.length || impact.total_steps}</strong>
            </div>
            <div>
              <span>Environments</span>
              <strong>{impact.environments.join(', ') || '-'}</strong>
            </div>
            <div>
              <span>Waves</span>
              <strong>{impact.total_waves}</strong>
            </div>
            <div>
              <span>Production</span>
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
    return <Card title="Release alerts"><p className="release-flow__hint">Loading alert channels...</p></Card>;
  }
  const enabled = channels.filter(channel => channel.enabled);
  const critical = enabled.filter(channel => channel.min_severity === 'critical');
  const warningOrLower = enabled.filter(channel => channel.min_severity !== 'critical');
  const summaryTone = error ? 'warning' : enabled.length > 0 ? 'success' : 'warning';
  return (
    <Card
      title="Release alerts"
      actions={<Badge tone={summaryTone}>{error ? 'unavailable' : enabled.length > 0 ? `${enabled.length} enabled` : 'not configured'}</Badge>}
    >
      {error ? (
        <p className="release-flow__hint">Alert channel settings require admin access or are temporarily unavailable.</p>
      ) : (
        <>
          <div className="release-flow__summary">
            <div>
              <span>Total channels</span>
              <strong>{channels.length}</strong>
            </div>
            <div>
              <span>Enabled</span>
              <strong>{enabled.length}</strong>
            </div>
            <div>
              <span>Critical only</span>
              <strong>{critical.length}</strong>
            </div>
            <div>
              <span>Info/warning</span>
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
                  <Badge tone={channel.min_severity === 'critical' ? 'danger' : channel.min_severity === 'warning' ? 'warning' : 'info'}>{channel.enabled ? 'enabled' : 'disabled'}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="release-flow__hint">No enabled alert channel is ready for release failure or approval events.</p>
          )}
        </>
      )}
      <div className="release-flow__toolbar release-flow__toolbar--preview">
        <Link to={settingsHref}><Button size="sm" variant={enabled.length > 0 ? 'ghost' : 'primary'}>Alert settings</Button></Link>
      </div>
    </Card>
  );
}

function RunPanel({
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
  useEffect(() => {
    if (runs.length === 0) {
      if (selectedRunId) onSelectedRunIdChange('');
      return;
    }
    if (!selectedRunId || !runs.some(run => run.run_id === selectedRunId)) {
      onSelectedRunIdChange(runs[0].run_id);
    }
  }, [onSelectedRunIdChange, runs, selectedRunId]);
  const selectedRun = selectedRunId ? runs.find(run => run.run_id === selectedRunId) : undefined;
  const run = selectedRun ?? runs[0];
  const handoffQ = useReleaseRunHandoff(run?.run_id);
  if (loading && !run) return <Card title="Release runs"><p className="release-flow__hint">Loading release runs...</p></Card>;
  if (!run) {
    return (
      <Card title="Release runs">
        <RunSummary summary={summary} runFilter={runFilter} onRunFilterChange={onRunFilterChange} />
        <RunFilterField runFilter={runFilter} onRunFilterChange={onRunFilterChange} />
        <p className="release-flow__hint">
          {runFilter === 'all' ? 'No tracked release runs yet.' : 'No release runs match this filter.'}
        </p>
      </Card>
    );
  }
  const status = run.derived_status ?? run.status;
  const isTerminal = ['succeeded', 'failed', 'cancelled', 'rollback_requested'].includes(status);
  const githubUrl = getString(run.github.release_url);
  const runtimeMode = getString(run.settings.runtime_mode, getString(run.settings.provider_mode, 'demo'));
  const sideEffects = runtimeMode === 'live';
  const canForceDelete = ['running', 'paused', 'rollback_requested', 'waiting_for_approval'].includes(status);
  const canRetry = status === 'failed' || run.steps.some(step => step.health.status === 'unhealthy' || step.status === 'failed');
  const attention = recordValue(run.attention);
  const attentionReasons = getStringArray(attention.reasons);
  const attentionRequired = Boolean(attention.required) || attentionReasons.length > 0;
  const stale = Boolean(attention.stale);
  const alertable = attentionRequired || stale;
  const notifyAction = handoffQ.data?.next_actions.find(action => action.action === 'notify');
  const notifyBlockedReason = notifyAction?.enabled === false ? getString(notifyAction.reason) : '';
  return (
    <Card
      title="Release run"
      actions={
        <>
          {stale && <Badge tone="danger">Stale</Badge>}
          {attentionRequired && <Badge tone="warning">Needs attention</Badge>}
          <Badge tone={sideEffects ? 'danger' : 'info'}>{sideEffects ? 'Live mode' : 'Demo mode'}</Badge>
          <Badge tone={toneForStatus(status)}>{status}</Badge>
        </>
      }
    >
      <RunSummary summary={summary} runFilter={runFilter} onRunFilterChange={onRunFilterChange} />
      <RunFilterField runFilter={runFilter} onRunFilterChange={onRunFilterChange} />
      {runs.length > 1 && (
        <Field label="Inspect run">
          <select className="input" value={run.run_id} onChange={e => onSelectedRunIdChange(e.target.value)}>
            {runs.map(item => (
              <option key={item.run_id} value={item.run_id}>
                {shortId(item.run_id)} / {item.derived_status ?? item.status} / wave {item.current_wave}{recordValue(item.attention).required ? ' / attention' : ''}
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
            Wave {run.current_wave} of {run.total_waves} | health {getString(run.health.status, 'pending')} | {sideEffects ? 'real GitOps dispatch' : 'dry-run events only'}
          </p>
        </div>
        <div className="release-flow__toolbar release-flow__toolbar--preview">
          {githubUrl && <a href={githubUrl} target="_blank" rel="noreferrer"><Button size="sm">GitHub release</Button></a>}
          <Button size="sm" loading={busy} disabled={busy || status === 'paused' || isTerminal} onClick={() => onAdvance(run.run_id)}>Advance</Button>
          <Button
            size="sm"
            loading={busy}
            disabled={busy || !canRetry}
            onClick={() => withOperatorReason('Retry release wave', 'operator retried failed release wave', reason => onRetry(run.run_id, reason))}
          >
            Retry
          </Button>
          {status === 'paused'
            ? (
              <Button
                size="sm"
                loading={busy}
                onClick={() => withOperatorReason('Resume release run', 'operator resumed release run', reason => onResume(run.run_id, reason))}
              >
                Resume
              </Button>
            )
            : (
              <Button
                size="sm"
                loading={busy}
                disabled={busy || isTerminal}
                onClick={() => withOperatorReason('Pause release run', 'operator paused release run', reason => onPause(run.run_id, reason))}
              >
                Pause
              </Button>
            )}
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || isTerminal || getString(run.rollback.policy, getString(run.settings.rollback_policy)) === 'disabled'}
            onClick={() => withOperatorReason('Request rollback', 'operator requested rollback from release flow', reason => onRollback(run.run_id, reason))}
          >
            Rollback
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || isTerminal}
            onClick={() => withOperatorReason('Cancel release run', 'operator canceled release run', reason => onCancel(run.run_id, reason))}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy || !alertable || Boolean(notifyBlockedReason)}
            title={notifyBlockedReason || undefined}
            onClick={() => withOperatorReason('Notify release owner', 'operator requested release run notification', reason => onNotify(run.run_id, reason))}
          >
            Notify
          </Button>
          <Button
            size="sm"
            variant="ghost"
            loading={busy}
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Delete run ${shortId(run.run_id)}?`)) return;
              onDelete(run.run_id, canForceDelete ? window.confirm('Run is active. Force delete?') : false);
            }}
          >
            Delete
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
            <Badge tone={toneForStatus(step.status)}>{step.status}</Badge>
            <div className="release-flow__run-meta">
              {step.workflow_run_id && <span>workflow {shortId(step.workflow_run_id)}</span>}
              {getString(step.health.status) && <span>health {getString(step.health.status)}</span>}
              {step.details.side_effects === false && <span>dry-run</span>}
              {releaseStepMeta(step).map(item => <span key={item}>{item}</span>)}
              {commitUrl(step) && <a href={commitUrl(step)} target="_blank" rel="noreferrer">commit</a>}
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
    return <p className="release-flow__hint">Loading operator handoff...</p>;
  }
  if (!handoff) return null;
  return (
    <div className="release-flow__handoff">
      <div className="release-flow__handoff-head">
        <div>
          <strong>{handoff.headline}</strong>
          <p className="release-flow__hint">
            Wave {handoff.current_wave} of {handoff.total_waves} | {handoff.live_side_effects ? 'live side effects' : 'demo/dry-run'}
          </p>
        </div>
        <Badge tone={handoffTone(handoff.severity)}>{handoff.severity}</Badge>
      </div>
      <div className="release-flow__handoff-grid">
        <div>
          <span className="release-flow__handoff-label">Next actions</span>
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
          <span className="release-flow__handoff-label">Checks</span>
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
            <span className="release-flow__handoff-label">Verification</span>
            <div className="release-flow__handoff-list">
              <span>{handoff.verification.status}: {handoff.verification.message}</span>
              {handoff.verification.evidence.slice(0, 2).map(item => <span key={item}>{item}</span>)}
              {Number(handoff.verification.job_count ?? 0) > 0 && <span>{handoff.verification.job_count} verification job(s) pending</span>}
              {handoff.verification.jobs?.slice(0, 2).map(job => (
                <span key={job.job_id}>{verificationJobSummary(job)}</span>
              ))}
              {handoff.verification.override_reason && <span>{handoff.verification.override_reason}</span>}
            </div>
          </div>
        )}
        {handoff.abort_criteria && (
          <div>
            <span className="release-flow__handoff-label">Rollback criteria</span>
            <div className="release-flow__handoff-list">
              <span>{handoff.abort_criteria.status}: {handoff.abort_criteria.message}</span>
              {handoff.abort_criteria.criteria.slice(0, 2).map(item => <span key={item}>{item}</span>)}
              {handoff.abort_criteria.override_reason && <span>{handoff.abort_criteria.override_reason}</span>}
            </div>
          </div>
        )}
      </div>
      {handoff.last_event && (
        <p className="release-flow__hint">
          Last event: {getString(handoff.last_event.event_type)} {getString(handoff.last_event.message) && `- ${getString(handoff.last_event.message)}`}
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

function RunFilterField({
  runFilter,
  onRunFilterChange,
}: {
  runFilter: ReleaseRunFilter;
  onRunFilterChange: (filter: ReleaseRunFilter) => void;
}) {
  return (
    <Field label="Run filter">
      <select className="input" value={runFilter} onChange={e => onRunFilterChange(e.target.value as ReleaseRunFilter)}>
        <option value="all">All runs</option>
        <option value="attention">Needs attention</option>
        <option value="stale">Stale</option>
        <option value="live">Live</option>
        <option value="failed">Failed</option>
        <option value="rollback_requested">Rollback requested</option>
        <option value="unhealthy">Unhealthy</option>
        <option value="verification_failed">Verification failed</option>
        <option value="verification_pending_timeout">Verification timeout</option>
        <option value="waiting_for_approval">Waiting approval</option>
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
  const opsSignals: RunSummarySignal[] = [
    { label: 'Needs attention', count: summary.attention_required_runs ?? 0, filter: 'attention' },
    { label: 'Active', count: summary.active_runs ?? 0 },
    { label: 'Live', count: summary.live_runs ?? 0, filter: 'live' },
    { label: 'Rollback', count: summary.rollback_requested_runs ?? 0, filter: 'rollback_requested' },
    { label: 'Unhealthy', count: summary.unhealthy_runs ?? 0, filter: 'unhealthy' },
    { label: 'Verification failed', count: summary.verification_failed_runs ?? 0, filter: 'verification_failed' },
    { label: 'Verification timeout', count: summary.verification_pending_timeout_runs ?? 0, filter: 'verification_pending_timeout' },
    { label: 'Stale', count: summary.stale_runs ?? 0, filter: 'stale' },
  ];
  return (
    <div className="release-flow__summary">
      <button
        type="button"
        className="release-flow__summary-card"
        aria-pressed={runFilter === 'all'}
        onClick={() => onRunFilterChange('all')}
      >
        <span>Total runs</span>
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
      {summary.last_run_status && (
        <div className="release-flow__summary-card">
          <span>Latest</span>
          <strong>{summary.last_run_status}</strong>
        </div>
      )}
      {statuses.length > 0 ? statuses.map(([status, count]) => (
        <div key={status} className="release-flow__summary-card">
          <span>{status}</span>
          <strong>{count}</strong>
        </div>
      )) : (
        <div className="release-flow__summary-card">
          <span>Status</span>
          <strong>none</strong>
        </div>
      )}
    </div>
  );
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) {
    return <Card title="Diagnostics"><p className="release-flow__hint">No warnings or errors right now.</p></Card>;
  }
  return (
    <Card title={`Diagnostics ${diagnostics.length}`}>
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
  const scopeLabel = scopedRunId ? `Run ${shortId(scopedRunId)}` : 'Current plan';
  const actions = (
    <>
      <Badge tone="info">{scopeLabel}</Badge>
      {eventType && <Badge tone="warning">{eventType}</Badge>}
      <Button size="sm" loading={exporting} disabled={exporting} onClick={onExport}>Export CSV</Button>
    </>
  );
  if (loading && events.length === 0) {
    return (
      <Card
        title="Audit"
        actions={actions}
      >
        <AuditEventFilter value={eventType} onChange={onEventTypeChange} />
        <p className="release-flow__hint">Loading audit events...</p>
      </Card>
    );
  }
  if (events.length === 0) {
    return (
      <Card
        title="Audit"
        actions={actions}
      >
        <AuditEventFilter value={eventType} onChange={onEventTypeChange} />
        <p className="release-flow__hint">No audit events yet for {auditScopeText(scopeLabel, eventType)}.</p>
      </Card>
    );
  }
  return (
    <Card
      title="Audit"
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
                {shortId(event.run_id)} / {event.run_status || 'unknown'}
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
    <Field label="Audit event">
      <select className="input" value={value} onChange={event => onChange(event.target.value)}>
        {AUDIT_EVENT_FILTERS.map(([key, label]) => (
          <option key={key || 'all'} value={key}>{label}</option>
        ))}
      </select>
    </Field>
  );
}

function auditScopeText(scopeLabel: string, eventType: string): string {
  return eventType ? `${scopeLabel.toLowerCase()} and ${eventType}` : scopeLabel.toLowerCase();
}

function draftPlan(apps: Application[]): ReleasePlan {
  const steps = apps.slice(0, 3).map((app, index) => ({
    application_id: app.application_id,
    name: app.name,
    position: index,
    depends_on: index === 0 ? [] : [apps[index - 1].application_id],
    config: defaultStepConfig(app, index),
  }));
  return {
    name: 'Service release flow',
    description: 'Order multi-repo changes, gates, and rollout policy before dispatch.',
    status: 'draft',
    settings: { ...DEFAULT_POLICY },
    steps,
  };
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
  if (action === 'approval_required') return 'approval';
  if (action === 'safe_pr') return 'Safe PR';
  if (action === 'confirm') return 'confirm';
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
  if (normalized === 'passed') return 'passed';
  if (normalized === 'blocked') return 'blocked';
  if (normalized === 'warning') return 'warning';
  return status || 'info';
}

function shortId(value: string): string {
  return value.replace(/^workflow-/, '').slice(0, 8);
}

function withOperatorReason(title: string, fallback: string, submit: (reason: string) => void) {
  const reason = window.prompt(`${title} reason`, fallback);
  if (reason === null) return;
  const normalized = reason.trim();
  submit(normalized || fallback);
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
  if (getString(safePr.pr_url)) items.push('Safe PR created');
  else if (getString(safePr.title)) items.push('Safe PR');
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
  if (prUrl) return 'Safe PR created';
  const safePrTitle = getString(safePr.title);
  if (safePrTitle) return 'Safe PR requested';
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
  selectedIndex: number,
  diagnostics: Diagnostic[],
  preview?: ReleasePlanPreview,
): { nodes: Node[]; edges: ReleaseEdge[] } {
  if (!plan) return { nodes: [], edges: [] };
  const appById = new Map(apps.map(app => [app.application_id, app]));
  const stepByApp = new Map(plan.steps.map((step, i) => [step.application_id, `step-${i}`]));
  const previewByApp = new Map((preview?.steps ?? []).map(step => [step.application_id, step]));
  const nodes: Node[] = plan.steps.map((step, index) => {
    const stepDiagnostics = diagnosticsForStep(diagnostics, index);
    const tone: ReleaseFlowTone = stepDiagnostics.some(d => d.severity === 'error') ? 'danger' : stepDiagnostics.length ? 'warn' : 'neutral';
    const previewStep = previewByApp.get(step.application_id);
    return {
      id: `step-${index}`,
      type: 'release_step',
      position: { x: 0, y: 0 },
      data: {
        step,
        app: appById.get(step.application_id),
        index,
        selected: index === selectedIndex,
        tone,
        diagnostics: stepDiagnostics.length,
        wave: previewStep?.wave,
        gate: previewStep?.gate ?? getString(step.config.approval_gate, 'inherit'),
        strategy: previewStep?.strategy ?? getString(step.config.strategy, getString(plan.settings.default_strategy, 'rolling')),
        environment: previewStep?.environment ?? getString(step.config.environment, firstEnvironment(plan)),
      },
    };
  });
  const dependencyEdges: ReleaseEdge[] = plan.steps.flatMap((step, index) =>
    step.depends_on.map(dep => ({
      id: `dep-${dep}-${index}`,
      source: stepByApp.get(dep) ?? `step-${Math.max(0, index - 1)}`,
      target: `step-${index}`,
      type: 'animated',
      data: { tone: 'info' as const, active: true },
    }))
  );
  const sequenceEdges: ReleaseEdge[] = dependencyEdges.length ? [] : plan.steps.slice(1).map((_, index) => ({
    id: `seq-${index}`,
    source: `step-${index}`,
    target: `step-${index + 1}`,
    type: 'animated',
    data: { tone: 'neutral' as const },
  }));
  return { nodes, edges: [...dependencyEdges, ...sequenceEdges] };
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
