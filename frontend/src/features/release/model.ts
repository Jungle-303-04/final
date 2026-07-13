import type { Application, ReleasePlan, ReleasePlanStep, ReleaseRun } from '@/shared/lib/types';

export type WorkspaceView = 'overview' | 'edit' | 'runs' | 'yaml';
export type WizardStage = 'basics' | 'repositories' | 'policy' | 'steps' | 'review';

export const WORKSPACE_VIEWS: Array<{ value: WorkspaceView; label: string }> = [
  { value: 'overview', label: '현황' },
  { value: 'edit', label: '플랜 편집' },
  { value: 'runs', label: '실행' },
  { value: 'yaml', label: 'YAML/PR' },
];

export const WIZARD_STAGES: Array<{ value: WizardStage; label: string }> = [
  { value: 'basics', label: '기본 정보' },
  { value: 'repositories', label: '리포지토리' },
  { value: 'policy', label: '배포 정책' },
  { value: 'steps', label: '단계 설정' },
  { value: 'review', label: '검토' },
];

export const STRATEGIES = [
  ['rolling', '롤링'],
  ['canary', '카나리'],
  ['blue_green', '블루/그린'],
] as const;

export const APPROVAL_POLICIES = [
  ['auto_safe', '안전한 변경 자동 승인'],
  ['manual_each_step', '모든 단계 수동 승인'],
  ['production_only', '운영 배포만 수동 승인'],
  ['external_change_ticket', '변경 티켓 승인'],
] as const;

export const FAILURE_POLICIES = [
  ['pause_for_operator', '담당자 확인까지 일시정지'],
  ['stop_on_failure', '실패 즉시 중단'],
  ['continue_independent', '독립 단계 계속 실행'],
] as const;

export const RUNTIME_MODES = [
  ['demo', '검증 모드'],
  ['live', '실제 배포'],
] as const;

export const STEP_GATES = [
  ['inherit', '플랜 정책 따르기'],
  ['auto', '자동 진행'],
  ['manual', '수동 승인'],
  ['safe_pr', 'Safe PR 확인'],
] as const;

export const ENVIRONMENTS = [
  ['sandbox', 'Sandbox'],
  ['staging', 'Staging'],
  ['production', 'Production'],
] as const;

export const DEFAULT_SETTINGS: Record<string, unknown> = {
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

export function createEmptyPlan(): ReleasePlan {
  return {
    name: '',
    description: '',
    status: 'draft',
    settings: { ...DEFAULT_SETTINGS },
    steps: [],
  };
}

export function clonePlan(plan: ReleasePlan): ReleasePlan {
  return {
    ...plan,
    settings: { ...DEFAULT_SETTINGS, ...plan.settings },
    steps: plan.steps.map((step) => ({
      ...step,
      depends_on: [...step.depends_on],
      config: { ...step.config },
    })),
  };
}

export function releasePlanPayload(plan: ReleasePlan): ReleasePlan {
  return {
    ...(plan.plan_id ? { plan_id: plan.plan_id } : {}),
    name: plan.name,
    description: plan.description,
    status: plan.status,
    settings: { ...plan.settings },
    steps: plan.steps.map((step) => ({
      ...(step.step_id ? { step_id: step.step_id } : {}),
      application_id: step.application_id,
      name: step.name,
      position: step.position,
      depends_on: [...step.depends_on],
      config: { ...step.config },
    })),
  };
}

export function stepKey(step: ReleasePlanStep, index: number) {
  return step.application_id.trim() || step.step_id?.trim() || `step-${slug(step.name || String(index + 1))}-${index + 1}`;
}

export function createStep(application: Application, position: number, previous?: ReleasePlanStep): ReleasePlanStep {
  const id = `step-${slug(application.application_id)}`;
  return {
    step_id: id,
    application_id: application.application_id,
    name: application.name,
    position,
    depends_on: previous ? [previous.application_id] : [],
    config: {
      environment: position === 0 ? 'staging' : 'production',
      namespace: 'default',
      approval_gate: 'inherit',
      cluster_id: application.cluster_id,
      branch: application.branch || 'main',
      manifest_path: application.manifest_path || 'deploy.yaml',
    },
  };
}

export function syncSelectedApplications(plan: ReleasePlan, applications: Application[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  const existing = new Map(plan.steps.map((step) => [step.application_id, step]));
  const next: ReleasePlanStep[] = [];
  for (const app of applications) {
    if (!selected.has(app.application_id)) continue;
    const current = existing.get(app.application_id);
    next.push(current ? { ...current } : createStep(app, next.length, next.at(-1)));
  }
  return { ...plan, steps: normalizePositions(next) };
}

export function normalizePositions(steps: ReleasePlanStep[]) {
  return steps.map((step, position) => ({ ...step, position }));
}

export function moveStep(steps: ReleasePlanStep[], from: number, direction: -1 | 1) {
  const to = from + direction;
  if (to < 0 || to >= steps.length) return steps;
  const next = steps.map((step) => ({ ...step }));
  [next[from], next[to]] = [next[to], next[from]];
  return normalizePositions(next);
}

export function planErrors(plan: ReleasePlan) {
  const errors: string[] = [];
  if (!plan.name.trim()) errors.push('플랜 이름을 입력하세요.');
  if (plan.name.trim().length > 120) errors.push('플랜 이름은 120자 이하여야 합니다.');
  if (plan.steps.length === 0) errors.push('배포할 리포지토리를 하나 이상 선택하세요.');
  const ids = new Set(plan.steps.map(stepKey));
  for (const [index, step] of plan.steps.entries()) {
    if (!step.application_id.trim()) errors.push(`${index + 1}번째 단계의 리포지토리가 비어 있습니다.`);
    for (const dependency of step.depends_on) {
      if (!ids.has(dependency)) errors.push(`${step.name || step.application_id} 단계가 존재하지 않는 의존성을 참조합니다.`);
    }
  }
  return [...new Set(errors)];
}

export function wizardStageErrors(stage: WizardStage, plan: ReleasePlan) {
  if (stage === 'basics') {
    if (!plan.name.trim()) return ['플랜 이름을 입력하세요.'];
    if (plan.name.trim().length > 120) return ['플랜 이름은 120자 이하여야 합니다.'];
  }
  if (stage === 'repositories' && plan.steps.length === 0) return ['배포할 리포지토리를 하나 이상 선택하세요.'];
  return [];
}

export function settingString(plan: ReleasePlan, key: string, fallback = '') {
  const value = plan.settings[key];
  return typeof value === 'string' && value ? value : fallback;
}

export function configString(step: ReleasePlanStep, key: string, fallback = '') {
  const value = step.config[key];
  return typeof value === 'string' && value ? value : fallback;
}

export function optionLabel(options: ReadonlyArray<readonly [string, string]>, value: string) {
  return options.find(([key]) => key === value)?.[1] ?? (value || '-');
}

export function releaseStatusLabel(status?: string) {
  const key = String(status || 'draft').toLowerCase();
  return {
    draft: '초안', active: '사용 중', paused: '일시정지', archived: '보관됨',
    running: '실행 중', waiting_for_approval: '승인 대기', succeeded: '성공',
    failed: '실패', cancelled: '취소됨', rollback_requested: '롤백 중', pending: '대기',
  }[key] ?? status ?? '대기';
}

export function releaseStatusTone(status?: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  const key = String(status || '').toLowerCase();
  if (['succeeded', 'healthy', 'active'].includes(key)) return 'success';
  if (['failed', 'critical', 'cancelled'].includes(key)) return 'danger';
  if (['running'].includes(key)) return 'info';
  if (['paused', 'waiting_for_approval', 'rollback_requested', 'warning'].includes(key)) return 'warning';
  return 'neutral';
}

export function latestRun(runs: ReleaseRun[]) {
  return [...runs].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))[0];
}

export function runStepStatus(run: ReleaseRun | undefined, applicationId: string) {
  return run?.steps.find((step) => step.application_id === applicationId)?.status ?? 'pending';
}

export function releaseWaves(steps: ReleasePlanStep[]) {
  const byId = new Map(steps.map((step) => [step.application_id, step]));
  const result = new Map<string, number>();
  const visiting = new Set<string>();

  const visit = (applicationId: string): number => {
    const cached = result.get(applicationId);
    if (cached) return cached;
    if (visiting.has(applicationId)) return 1;

    visiting.add(applicationId);
    const upstream = (byId.get(applicationId)?.depends_on ?? []).filter((dependency) => byId.has(dependency));
    const wave = upstream.length === 0 ? 1 : Math.max(...upstream.map(visit)) + 1;
    visiting.delete(applicationId);
    result.set(applicationId, wave);
    return wave;
  };

  steps.forEach((step) => visit(step.application_id));
  return result;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'app';
}
