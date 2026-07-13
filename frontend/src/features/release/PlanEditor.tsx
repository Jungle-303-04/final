import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import type { Application, ReleasePlan } from '@/shared/lib/types';
import { Badge, Button, Checkbox, Field, IconButton, Input, Modal, Select, Textarea } from '@/ui';
import { useDeleteReleasePlan, useSaveReleasePlan } from './api';
import { WorkflowGraph } from './WorkflowGraph';
import {
  APPROVAL_POLICIES,
  ENVIRONMENTS,
  FAILURE_POLICIES,
  RUNTIME_MODES,
  STEP_GATES,
  STRATEGIES,
  clonePlan,
  configString,
  createStep,
  moveStep,
  normalizePositions,
  planErrors,
  releasePlanPayload,
  settingString,
  stepKey,
} from './model';

export function PlanEditor({
  source,
  plan,
  applications,
  applicationsPending,
  selectedStepId,
  onSelectStep,
  onChange,
  onSaved,
  onDeleted,
}: {
  source: ReleasePlan;
  plan: ReleasePlan;
  applications: Application[];
  applicationsPending: boolean;
  selectedStepId: string;
  onSelectStep: (stepId: string) => void;
  onChange: (plan: ReleasePlan) => void;
  onSaved: (plan: ReleasePlan) => void;
  onDeleted: () => void;
}) {
  const savePlan = useSaveReleasePlan(source.plan_id);
  const deletePlan = useDeleteReleasePlan();
  const [addApplicationId, setAddApplicationId] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const selectedIndex = plan.steps.findIndex((step, index) => stepKey(step, index) === selectedStepId);
  const selectedStep = plan.steps[selectedIndex];
  const availableApplications = applications.filter((app) => !plan.steps.some((step) => step.application_id === app.application_id));
  const errors = planErrors(plan);
  const dirty = JSON.stringify(releasePlanPayload(plan)) !== JSON.stringify(releasePlanPayload(clonePlan(source)));
  const appById = useMemo(() => new Map(applications.map((app) => [app.application_id, app])), [applications]);

  const updateSetting = (key: string, value: unknown) => onChange({ ...plan, settings: { ...plan.settings, [key]: value } });
  const updateStep = (key: string, value: unknown) => {
    if (!selectedStep) return;
    const steps = plan.steps.map((step, index) => index === selectedIndex
      ? key === 'name' ? { ...step, name: String(value) } : { ...step, config: { ...step.config, [key]: value } }
      : step);
    onChange({ ...plan, steps });
  };

  const addStep = () => {
    const app = applications.find((item) => item.application_id === addApplicationId);
    if (!app) return;
    const nextStep = createStep(app, plan.steps.length, plan.steps.at(-1));
    onChange({ ...plan, steps: [...plan.steps, nextStep] });
    onSelectStep(stepKey(nextStep, plan.steps.length));
    setAddApplicationId('');
  };

  const removeStep = (index: number) => {
    const removedId = stepKey(plan.steps[index], index);
    const steps = normalizePositions(plan.steps
      .filter((_, stepIndex) => stepIndex !== index)
      .map((step) => ({ ...step, depends_on: step.depends_on.filter((dependency) => dependency !== removedId) })));
    onChange({ ...plan, steps });
    const nextIndex = Math.min(index, steps.length - 1);
    onSelectStep(nextIndex >= 0 ? stepKey(steps[nextIndex], nextIndex) : '');
  };

  const reorderStep = (index: number, direction: -1 | 1) => {
    const moved = moveStep(plan.steps, index, direction);
    const positions = new Map(moved.map((step, stepIndex) => [stepKey(step, stepIndex), stepIndex]));
    const safe = moved.map((step, stepIndex) => ({
      ...step,
      depends_on: step.depends_on.filter((dependency) => (positions.get(dependency) ?? stepIndex) < stepIndex),
    }));
    onChange({ ...plan, steps: safe });
  };

  const setDependency = (dependencyId: string, checked: boolean) => {
    if (!selectedStep) return;
    const current = new Set(selectedStep.depends_on);
    if (checked) current.add(dependencyId); else current.delete(dependencyId);
    const steps = plan.steps.map((step, index) => index === selectedIndex ? { ...step, depends_on: [...current] } : step);
    onChange({ ...plan, steps });
  };

  const submit = () => {
    if (errors.length > 0) return;
    savePlan.mutate({ ...plan, steps: normalizePositions(plan.steps) }, { onSuccess: ({ plan: saved }) => onSaved(saved) });
  };

  return (
    <div className="workflow-editor">
      <div className="workflow-editor__header">
        <div>
          <h2>플랜 편집</h2>
          <span>{dirty ? '저장하지 않은 변경 있음' : '모든 변경 저장됨'}</span>
        </div>
        <div className="workflow-editor__header-actions">
          {errors.length > 0 && <Badge tone="warning">{errors.length}개 확인 필요</Badge>}
          <Button variant="primary" leadingIcon={<Save size={16} />} disabled={!dirty || errors.length > 0} loading={savePlan.isPending} onClick={submit}>변경 저장</Button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="workflow-validation" role="alert">
          {errors.map((error) => <span key={error}>{error}</span>)}
        </div>
      )}

      <WorkflowGraph
        plan={plan}
        applications={applications}
        selectedStepId={selectedStepId}
        onSelectStep={onSelectStep}
        className="workflow-editor__graph"
      />

      <div className="workflow-editor__workspace">
        <aside className="workflow-editor__steps">
          <div className="workflow-panel-heading">
            <div><h3>배포 단계</h3><span>{plan.steps.length}개</span></div>
          </div>
          <div className="workflow-step-list">
            {plan.steps.map((step, index) => {
              const id = stepKey(step, index);
              return (
                <div key={id} className={`workflow-step-list__item${selectedStepId === id ? ' is-selected' : ''}`}>
                  <button
                    type="button"
                    className="workflow-step-list__select"
                    aria-label={`${index + 1}단계 ${step.name || step.application_id} 선택`}
                    onClick={() => onSelectStep(id)}
                  >
                    <span className="workflow-step-list__index">{index + 1}</span>
                    <span className="workflow-step-list__copy"><strong>{step.name || step.application_id}</strong><small>{configString(step, 'environment', 'staging')}</small></span>
                  </button>
                  <span className="workflow-step-list__actions">
                    <IconButton size="sm" label="위로 이동" icon={<ArrowUp size={14} />} disabled={index === 0} onClick={() => reorderStep(index, -1)} />
                    <IconButton size="sm" label="아래로 이동" icon={<ArrowDown size={14} />} disabled={index === plan.steps.length - 1} onClick={() => reorderStep(index, 1)} />
                    <IconButton size="sm" label="단계 삭제" icon={<Trash2 size={14} />} onClick={() => removeStep(index)} />
                  </span>
                </div>
              );
            })}
          </div>
          <div className="workflow-add-step">
            <Select value={addApplicationId} onChange={(event) => setAddApplicationId(event.target.value)} disabled={applicationsPending || availableApplications.length === 0} aria-label="추가할 리포지토리">
              <option value="">{applicationsPending ? '불러오는 중' : availableApplications.length ? '리포지토리 선택' : '추가 가능한 리포지토리 없음'}</option>
              {availableApplications.map((app) => <option key={app.application_id} value={app.application_id}>{app.name}</option>)}
            </Select>
            <IconButton label="단계 추가" icon={<Plus size={16} />} variant="primary" disabled={!addApplicationId} onClick={addStep} />
          </div>
        </aside>

        <div className="workflow-editor__forms">
          <section className="workflow-form-section">
            <div className="workflow-panel-heading"><div><h3>플랜 설정</h3><span>전체 단계에 적용</span></div></div>
            <div className="workflow-form-grid">
              <Field label="플랜 이름" error={!plan.name.trim() ? '필수 입력' : undefined}><Input value={plan.name} maxLength={120} onChange={(event) => onChange({ ...plan, name: event.target.value })} /></Field>
              <Field label="상태"><Select value={plan.status} onChange={(event) => onChange({ ...plan, status: event.target.value as ReleasePlan['status'] })}><option value="draft">초안</option><option value="active">사용 중</option><option value="paused">일시정지</option></Select></Field>
              <Field label="실행 모드"><Select value={settingString(plan, 'runtime_mode', 'demo')} onChange={(event) => updateSetting('runtime_mode', event.target.value)}>{RUNTIME_MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
              <Field label="기본 배포 전략"><Select value={settingString(plan, 'default_strategy', 'rolling')} onChange={(event) => updateSetting('default_strategy', event.target.value)}>{STRATEGIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
              <Field label="승인 정책"><Select value={settingString(plan, 'approval_policy', 'manual_each_step')} onChange={(event) => updateSetting('approval_policy', event.target.value)}>{APPROVAL_POLICIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
              <Field label="실패 처리"><Select value={settingString(plan, 'failure_policy', 'pause_for_operator')} onChange={(event) => updateSetting('failure_policy', event.target.value)}>{FAILURE_POLICIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
              <Field label="동시 실행 수"><Input type="number" min={1} max={20} value={Number(plan.settings.concurrency ?? 1)} onChange={(event) => updateSetting('concurrency', Number(event.target.value))} /></Field>
              <Field label="상태 확인 제한(초)"><Input type="number" min={30} max={7200} value={Number(plan.settings.health_timeout_seconds ?? 600)} onChange={(event) => updateSetting('health_timeout_seconds', Number(event.target.value))} /></Field>
              <div className="workflow-form-grid__wide">
                <Field label="플랜 설명"><Textarea value={plan.description} maxLength={1000} onChange={(event) => onChange({ ...plan, description: event.target.value })} /></Field>
              </div>
            </div>
          </section>

          <section className="workflow-form-section">
            <div className="workflow-panel-heading"><div><h3>단계 설정</h3><span>{selectedStep ? selectedStep.name || selectedStep.application_id : '단계를 선택하세요'}</span></div></div>
            {selectedStep ? (
              <>
                <div className="workflow-form-grid">
                  <Field label="표시 이름"><Input value={selectedStep.name || ''} onChange={(event) => updateStep('name', event.target.value)} /></Field>
                  <Field label="환경"><Select value={configString(selectedStep, 'environment', 'staging')} onChange={(event) => updateStep('environment', event.target.value)}>{ENVIRONMENTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                  <Field label="클러스터"><Input value={configString(selectedStep, 'cluster_id', appById.get(selectedStep.application_id)?.cluster_id || '')} onChange={(event) => updateStep('cluster_id', event.target.value)} /></Field>
                  <Field label="네임스페이스"><Input value={configString(selectedStep, 'namespace', 'default')} onChange={(event) => updateStep('namespace', event.target.value)} /></Field>
                  <Field label="배포 전략"><Select value={configString(selectedStep, 'strategy', settingString(plan, 'default_strategy', 'rolling'))} onChange={(event) => updateStep('strategy', event.target.value)}>{STRATEGIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                  <Field label="승인"><Select value={configString(selectedStep, 'approval_gate', 'inherit')} onChange={(event) => updateStep('approval_gate', event.target.value)}>{STEP_GATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
                  <Field label="브랜치"><Input value={configString(selectedStep, 'branch', appById.get(selectedStep.application_id)?.branch || 'main')} onChange={(event) => updateStep('branch', event.target.value)} /></Field>
                  <Field label="매니페스트 경로"><Input value={configString(selectedStep, 'manifest_path', appById.get(selectedStep.application_id)?.manifest_path || 'deploy.yaml')} onChange={(event) => updateStep('manifest_path', event.target.value)} /></Field>
                </div>
                <div className="workflow-dependencies">
                  <span>선행 단계</span>
                  {selectedIndex === 0 ? <p>첫 단계는 선행 단계 없이 시작합니다.</p> : plan.steps.slice(0, selectedIndex).map((candidate, index) => {
                    const id = stepKey(candidate, index);
                    return <Checkbox key={id} label={candidate.name || candidate.application_id} checked={selectedStep.depends_on.includes(id)} onChange={(event) => setDependency(id, event.target.checked)} />;
                  })}
                </div>
              </>
            ) : <div className="workflow-inline-empty">왼쪽 목록에서 편집할 단계를 선택하세요.</div>}
          </section>

          <section className="workflow-danger-zone">
            <div><h3>플랜 삭제</h3><p>실행 기록이 연결된 플랜은 삭제가 제한될 수 있습니다.</p></div>
            <Button variant="danger" leadingIcon={<Trash2 size={16} />} onClick={() => setDeleteOpen(true)}>플랜 삭제</Button>
          </section>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="플랜 삭제"
        description={`삭제하려면 "${plan.name}"을 입력하세요.`}
        actions={<><Button onClick={() => setDeleteOpen(false)}>취소</Button><Button variant="danger" loading={deletePlan.isPending} disabled={deleteConfirm !== plan.name} onClick={() => source.plan_id && deletePlan.mutate({ planId: source.plan_id }, { onSuccess: onDeleted })}>삭제</Button></>}
      >
        <Field label="플랜 이름"><Input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} /></Field>
      </Modal>
    </div>
  );
}
