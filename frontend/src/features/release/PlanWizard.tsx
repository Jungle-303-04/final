import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, GitBranch, Plus, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useConsolePath } from '@/features/console/ui';
import type { Application, ReleasePlan } from '@/shared/lib/types';
import { Badge, Button, Checkbox, EmptyState, Field, Input, Select, Skeleton, Textarea } from '@/ui';
import { useReleasePreview, useSaveReleasePlan } from './api';
import { WorkflowGraph } from './WorkflowGraph';
import {
  APPROVAL_POLICIES,
  ENVIRONMENTS,
  FAILURE_POLICIES,
  RUNTIME_MODES,
  STRATEGIES,
  WIZARD_STAGES,
  configString,
  createEmptyPlan,
  optionLabel,
  planErrors,
  settingString,
  stepKey,
  syncSelectedApplications,
  wizardStageErrors,
  type WizardStage,
} from './model';

export function PlanWizard({
  applications,
  applicationsPending,
  onCancel,
  onCreated,
}: {
  applications: Application[];
  applicationsPending: boolean;
  onCancel: () => void;
  onCreated: (plan: ReleasePlan) => void;
}) {
  const navigate = useNavigate();
  const pathFor = useConsolePath();
  const savePlan = useSaveReleasePlan();
  const preview = useReleasePreview();
  const [plan, setPlan] = useState(createEmptyPlan);
  const [stageIndex, setStageIndex] = useState(0);
  const [furthestStage, setFurthestStage] = useState(0);
  const [stageErrors, setStageErrors] = useState<string[]>([]);
  const stage = WIZARD_STAGES[stageIndex].value;

  const goToStage = (index: number) => {
    if (index > furthestStage) return;
    setStageIndex(index);
    setStageErrors([]);
    if (WIZARD_STAGES[index]?.value === 'review') preview.mutate(plan);
  };

  const next = () => {
    const errors = wizardStageErrors(stage, plan);
    if (errors.length > 0) {
      setStageErrors(errors);
      return;
    }
    const nextIndex = Math.min(stageIndex + 1, WIZARD_STAGES.length - 1);
    setStageIndex(nextIndex);
    setFurthestStage((current) => Math.max(current, nextIndex));
    setStageErrors([]);
    if (WIZARD_STAGES[nextIndex].value === 'review') preview.mutate(plan);
  };

  const create = () => {
    const errors = planErrors(plan);
    if (errors.length > 0) {
      setStageErrors(errors);
      return;
    }
    savePlan.mutate(plan, { onSuccess: ({ plan: saved }) => onCreated(saved) });
  };

  return (
    <div className="workflow-wizard">
      <div className="workflow-wizard__topbar">
        <Button variant="ghost" leadingIcon={<ArrowLeft size={16} />} onClick={onCancel}>워크플로우로 돌아가기</Button>
        <Badge tone="neutral">초안</Badge>
      </div>

      <ol className="workflow-wizard__steps" aria-label="새 플랜 단계">
        {WIZARD_STAGES.map((item, index) => (
          <li key={item.value} className={index === stageIndex ? 'is-current' : index < stageIndex ? 'is-complete' : ''}>
            <button type="button" disabled={index > furthestStage} aria-current={index === stageIndex ? 'step' : undefined} onClick={() => goToStage(index)}>
              <span>{index < stageIndex ? <Check size={14} /> : index + 1}</span>
              <strong>{item.label}</strong>
            </button>
          </li>
        ))}
      </ol>

      <div className="workflow-wizard__body">
        <WizardStageContent
          stage={stage}
          plan={plan}
          applications={applications}
          applicationsPending={applicationsPending}
          onChange={setPlan}
          onOpenCatalog={() => navigate(pathFor('/repos'))}
          preview={preview.data?.preview}
          previewPending={preview.isPending}
          previewError={preview.error as Error | null}
        />
      </div>

      <footer className="workflow-wizard__footer">
        <div className="workflow-wizard__errors" role="alert">
          {stageErrors.map((error) => <span key={error}>{error}</span>)}
        </div>
        <div>
          <Button disabled={stageIndex === 0} leadingIcon={<ArrowLeft size={16} />} onClick={() => goToStage(stageIndex - 1)}>이전</Button>
          {stageIndex < WIZARD_STAGES.length - 1 ? (
            <Button variant="primary" trailingIcon={<ArrowRight size={16} />} onClick={next}>다음</Button>
          ) : (
            <Button variant="primary" leadingIcon={<Save size={16} />} loading={savePlan.isPending} onClick={create}>플랜 만들기</Button>
          )}
        </div>
      </footer>
    </div>
  );
}

function WizardStageContent({
  stage,
  plan,
  applications,
  applicationsPending,
  onChange,
  onOpenCatalog,
  preview,
  previewPending,
  previewError,
}: {
  stage: WizardStage;
  plan: ReleasePlan;
  applications: Application[];
  applicationsPending: boolean;
  onChange: (plan: ReleasePlan) => void;
  onOpenCatalog: () => void;
  preview?: { executable: boolean; summary: string; waves: Array<{ wave: number; step_ids: string[] }>; blockers: string[] };
  previewPending: boolean;
  previewError: Error | null;
}) {
  const updateSetting = (key: string, value: unknown) => onChange({ ...plan, settings: { ...plan.settings, [key]: value } });
  const selectedIds = plan.steps.map((step) => step.application_id);

  if (stage === 'basics') {
    return (
      <section className="workflow-wizard-section workflow-wizard-section--narrow">
        <div className="workflow-wizard-section__heading"><span>1</span><div><h2>기본 정보</h2><p>워크플로우를 식별할 이름과 설명</p></div></div>
        <div className="workflow-wizard-form">
          <Field label="플랜 이름" error={!plan.name.trim() ? '필수 입력' : undefined}><Input autoFocus value={plan.name} maxLength={120} placeholder="예: 결제 서비스 운영 배포" onChange={(event) => onChange({ ...plan, name: event.target.value })} /></Field>
          <Field label="설명"><Textarea value={plan.description} maxLength={1000} placeholder="변경 목적과 적용 범위" onChange={(event) => onChange({ ...plan, description: event.target.value })} /></Field>
        </div>
      </section>
    );
  }

  if (stage === 'repositories') {
    return (
      <section className="workflow-wizard-section">
        <div className="workflow-wizard-section__heading"><span>2</span><div><h2>리포지토리</h2><p>이 플랜에서 배포할 애플리케이션</p></div></div>
        {applicationsPending ? <Skeleton lines={6} /> : applications.length === 0 ? (
          <EmptyState icon={<GitBranch size={20} />} title="연결된 리포지토리가 없습니다" action={<Button variant="primary" leadingIcon={<Plus size={16} />} onClick={onOpenCatalog}>리포지토리 연결</Button>} />
        ) : (
          <div className="workflow-repository-grid">
            {applications.map((application) => {
              const checked = selectedIds.includes(application.application_id);
              return (
                <label key={application.application_id} className={checked ? 'workflow-repository-option is-selected' : 'workflow-repository-option'}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      const ids = event.target.checked ? [...selectedIds, application.application_id] : selectedIds.filter((id) => id !== application.application_id);
                      onChange(syncSelectedApplications(plan, applications, ids));
                    }}
                  />
                  <span className="workflow-repository-option__icon"><GitBranch size={18} /></span>
                  <span className="workflow-repository-option__copy">
                    <strong>{application.name}</strong>
                    <small>{application.repo_ref}</small>
                    <em>{application.branch || 'main'} · {application.manifest_path || '매니페스트 미지정'}</em>
                  </span>
                  <span className="workflow-repository-option__check"><Check size={15} /></span>
                </label>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  if (stage === 'policy') {
    return (
      <section className="workflow-wizard-section workflow-wizard-section--narrow">
        <div className="workflow-wizard-section__heading"><span>3</span><div><h2>배포 정책</h2><p>전체 단계의 기본 실행 기준</p></div></div>
        <div className="workflow-form-grid">
          <Field label="실행 모드"><Select value={settingString(plan, 'runtime_mode', 'demo')} onChange={(event) => updateSetting('runtime_mode', event.target.value)}>{RUNTIME_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="기본 배포 전략"><Select value={settingString(plan, 'default_strategy', 'rolling')} onChange={(event) => updateSetting('default_strategy', event.target.value)}>{STRATEGIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="승인 정책"><Select value={settingString(plan, 'approval_policy', 'manual_each_step')} onChange={(event) => updateSetting('approval_policy', event.target.value)}>{APPROVAL_POLICIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="실패 처리"><Select value={settingString(plan, 'failure_policy', 'pause_for_operator')} onChange={(event) => updateSetting('failure_policy', event.target.value)}>{FAILURE_POLICIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
          <Field label="동시 실행 수"><Input type="number" min={1} max={20} value={Number(plan.settings.concurrency ?? 1)} onChange={(event) => updateSetting('concurrency', Number(event.target.value))} /></Field>
          <Field label="실패 재시도"><Input type="number" min={0} max={10} value={Number(plan.settings.retry_attempts ?? 1)} onChange={(event) => updateSetting('retry_attempts', Number(event.target.value))} /></Field>
        </div>
        <Checkbox label="진단을 통과한 변경만 실행" checked={Boolean(plan.settings.require_diagnostics_pass)} onChange={(event) => updateSetting('require_diagnostics_pass', event.target.checked)} />
      </section>
    );
  }

  if (stage === 'steps') {
    return (
      <section className="workflow-wizard-section">
        <div className="workflow-wizard-section__heading"><span>4</span><div><h2>단계 설정</h2><p>환경·전략·실행 순서</p></div></div>
        <div className="workflow-wizard-step-list">
          {plan.steps.map((step, index) => (
            <article key={stepKey(step, index)}>
              <div className="workflow-wizard-step-list__title"><span>{index + 1}</span><div><strong>{step.name || step.application_id}</strong><small>{step.application_id}</small></div></div>
              <div className="workflow-wizard-step-list__fields">
                <Field label="환경"><Select value={configString(step, 'environment', index === 0 ? 'staging' : 'production')} onChange={(event) => updateWizardStep(plan, onChange, index, 'environment', event.target.value)}>{ENVIRONMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                <Field label="네임스페이스"><Input value={configString(step, 'namespace', 'default')} onChange={(event) => updateWizardStep(plan, onChange, index, 'namespace', event.target.value)} /></Field>
                <Field label="배포 전략"><Select value={configString(step, 'strategy', settingString(plan, 'default_strategy', 'rolling'))} onChange={(event) => updateWizardStep(plan, onChange, index, 'strategy', event.target.value)}>{STRATEGIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                <Field label="선행 단계"><Select value={step.depends_on[0] ?? ''} onChange={(event) => updateWizardDependency(plan, onChange, index, event.target.value)} disabled={index === 0}><option value="">{index === 0 ? '없음' : '병렬 실행'}</option>{plan.steps.slice(0, index).map((candidate, candidateIndex) => <option key={stepKey(candidate, candidateIndex)} value={stepKey(candidate, candidateIndex)}>{candidate.name || candidate.application_id}</option>)}</Select></Field>
              </div>
            </article>
          ))}
        </div>
      </section>
    );
  }

  const finalErrors = planErrors(plan);
  return (
    <section className="workflow-wizard-section workflow-wizard-review">
      <div className="workflow-wizard-section__heading"><span>5</span><div><h2>검토</h2><p>저장할 플랜과 배포 흐름</p></div></div>
      <dl className="workflow-review-summary">
        <div><dt>플랜</dt><dd>{plan.name}</dd></div>
        <div><dt>리포지토리</dt><dd>{plan.steps.length}개</dd></div>
        <div><dt>실행 모드</dt><dd>{optionLabel(RUNTIME_MODES, settingString(plan, 'runtime_mode', 'demo'))}</dd></div>
        <div><dt>승인</dt><dd>{optionLabel(APPROVAL_POLICIES, settingString(plan, 'approval_policy', 'manual_each_step'))}</dd></div>
      </dl>
      <WorkflowGraph plan={plan} applications={applications} className="workflow-wizard-review__graph" controls={false} />
      <div className="workflow-preview-result">
        {previewPending ? <span>실행 가능 여부 확인 중</span> : previewError ? <span className="is-danger">{previewError.message}</span> : preview ? (
          <><Badge tone={preview.executable ? 'success' : 'warning'}>{preview.executable ? '실행 가능' : '실행 전 확인 필요'}</Badge><span>{preview.waves.length}개 Wave</span>{preview.blockers.map((blocker) => <span className="is-danger" key={blocker}>{blocker}</span>)}</>
        ) : null}
        {finalErrors.map((error) => <span className="is-danger" key={error}>{error}</span>)}
      </div>
    </section>
  );
}

function updateWizardStep(plan: ReleasePlan, onChange: (plan: ReleasePlan) => void, index: number, key: string, value: unknown) {
  onChange({ ...plan, steps: plan.steps.map((step, stepIndex) => stepIndex === index ? { ...step, config: { ...step.config, [key]: value } } : step) });
}

function updateWizardDependency(plan: ReleasePlan, onChange: (plan: ReleasePlan) => void, index: number, dependency: string) {
  onChange({ ...plan, steps: plan.steps.map((step, stepIndex) => stepIndex === index ? { ...step, depends_on: dependency ? [dependency] : [] } : step) });
}
