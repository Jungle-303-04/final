import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Code2, Copy, FileCode2, GitPullRequest, RefreshCw } from 'lucide-react';
import type { Application, ReleasePlan } from '@/shared/lib/types';
import { Badge, Button, EmptyState, Field, IconButton, Select, useToast } from '@/ui';
import { useReleaseGeneratedManifest, useSubmitReleaseGeneratedManifestSafePr } from './api';
import { configString } from './model';

export function ManifestPanel({ plan, applications }: { plan: ReleasePlan; applications: Application[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const renderManifest = useReleaseGeneratedManifest();
  const submitSafePr = useSubmitReleaseGeneratedManifestSafePr();
  const { push } = useToast();
  const selectedStep = plan.steps[selectedIndex] ?? plan.steps[0];
  const application = applications.find((app) => app.application_id === selectedStep?.application_id);
  const generated = renderManifest.variables?.stepIndex === selectedIndex ? renderManifest.data : undefined;
  const errorCount = generated?.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length ?? 0;

  const generate = () => renderManifest.mutate({ plan, stepIndex: selectedIndex });
  const copyYaml = async () => {
    if (!generated?.manifest) return;
    try {
      await navigator.clipboard.writeText(generated.manifest);
      push({ tone: 'success', title: 'YAML을 복사했습니다' });
    } catch {
      push({ tone: 'danger', title: 'YAML 복사 실패', description: '브라우저의 클립보드 권한을 확인하세요.' });
    }
  };

  return (
    <div className="workflow-manifest">
      <div className="workflow-manifest__toolbar">
        <div className="workflow-manifest__selection">
          <Field label="배포 단계">
            <Select value={selectedIndex} onChange={(event) => setSelectedIndex(Number(event.target.value))}>
              {plan.steps.map((step, index) => <option key={step.step_id || `${step.application_id}-${index}`} value={index}>{index + 1}. {step.name || step.application_id}</option>)}
            </Select>
          </Field>
          {selectedStep && (
            <dl>
              <div><dt>브랜치</dt><dd>{configString(selectedStep, 'branch', application?.branch || 'main')}</dd></div>
              <div><dt>경로</dt><dd>{configString(selectedStep, 'manifest_path', application?.manifest_path || '-')}</dd></div>
            </dl>
          )}
        </div>
        <div className="workflow-manifest__actions">
          {generated && <IconButton label="YAML 복사" icon={<Copy size={16} />} onClick={() => void copyYaml()} />}
          <Button leadingIcon={<RefreshCw size={16} />} loading={renderManifest.isPending} disabled={!selectedStep} onClick={generate}>{generated ? '다시 생성' : 'YAML 생성'}</Button>
          <Button
            variant="primary"
            leadingIcon={<GitPullRequest size={16} />}
            loading={submitSafePr.isPending}
            disabled={!generated || errorCount > 0}
            onClick={() => submitSafePr.mutate({ plan, stepIndex: selectedIndex })}
          >Safe PR 요청</Button>
        </div>
      </div>

      {renderManifest.error && <div className="workflow-validation" role="alert"><span>{(renderManifest.error as Error).message}</span></div>}

      {!selectedStep ? (
        <EmptyState icon={<Code2 size={20} />} title="YAML을 생성할 단계가 없습니다" />
      ) : !generated ? (
        <EmptyState icon={<FileCode2 size={20} />} title="생성된 YAML이 없습니다" description="선택한 배포 단계의 매니페스트를 생성하면 여기에 표시됩니다." />
      ) : (
        <div className="workflow-manifest__workspace">
          <section className="workflow-code-panel">
            <div className="workflow-code-panel__head">
              <div><FileCode2 size={16} /><h2>생성된 매니페스트</h2></div>
              <Badge tone={errorCount > 0 ? 'danger' : 'success'}>{errorCount > 0 ? `${errorCount}개 오류` : '진단 통과'}</Badge>
            </div>
            <pre tabIndex={0}><code>{generated.manifest}</code></pre>
          </section>

          <aside className="workflow-manifest__review">
            <section>
              <div className="workflow-panel-heading"><div><h3>변경 요약</h3><span>{generated.resource_count}개 리소스</span></div></div>
              <p>{manifestSummary(generated.summary)}</p>
            </section>
            <section>
              <div className="workflow-panel-heading"><div><h3>파일</h3><span>{generated.files.length}개</span></div></div>
              <div className="workflow-file-list">
                {generated.files.map((file) => <div key={file.path}><FileCode2 size={15} /><span><strong>{file.path}</strong><small>{manifestAction(file.action)} · {manifestDescription(file.description)}</small></span></div>)}
              </div>
            </section>
            <section>
              <div className="workflow-panel-heading"><div><h3>진단</h3><span>{generated.diagnostics.length}개</span></div></div>
              {generated.diagnostics.length === 0 ? (
                <div className="workflow-diagnostic is-success"><CheckCircle2 size={16} /><span>차단 오류가 없습니다.</span></div>
              ) : generated.diagnostics.map((diagnostic, index) => (
                <div key={`${diagnostic.code}-${diagnostic.line}-${index}`} className={`workflow-diagnostic is-${diagnostic.severity}`}>
                  {diagnostic.severity === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                  <span><strong>{manifestDiagnostic(diagnostic.message)}</strong><small>{diagnostic.code} · {diagnostic.line}:{diagnostic.column}</small></span>
                </div>
              ))}
            </section>
            {submitSafePr.data && (
              <section className="workflow-safe-pr-result">
                <CheckCircle2 size={18} />
                <span><strong>Safe PR 작업 접수</strong><small>{submitSafePr.data.workflow_run_id}</small></span>
              </section>
            )}
            {submitSafePr.error && <div className="workflow-validation" role="alert"><span>{(submitSafePr.error as Error).message}</span></div>}
          </aside>
        </div>
      )}
    </div>
  );
}

function manifestSummary(summary: string) {
  const generated = summary.match(/^Generated (\d+) Kubernetes resource\(s\) for (.+)\.$/);
  if (generated) return `${generated[2]}용 Kubernetes 리소스 ${generated[1]}개를 생성했습니다.`;
  return summary;
}

function manifestAction(action: string) {
  const labels: Record<string, string> = { upsert: '생성 또는 수정', create: '생성', update: '수정', delete: '삭제' };
  return labels[action] ?? action;
}

function manifestDescription(description: string) {
  const generated = description.match(/^Generated manifest for (.+)$/);
  return generated ? `${generated[1]}용 매니페스트` : description;
}

function manifestDiagnostic(message: string) {
  if (message === 'image is required before this generated manifest can be used.') {
    return '생성된 매니페스트를 사용하려면 배포 이미지가 필요합니다.';
  }
  const limited = message.match(/^(.+) can render, but field-level diff support is limited\.$/);
  if (limited) return `${limited[1]}은 생성할 수 있지만 필드 단위 차이 비교 지원이 제한됩니다.`;
  const normalized = message.match(/^(.+) was normalized to Kubernetes DNS label '(.+)'\.$/);
  if (normalized) return `${normalized[1]} 값을 Kubernetes DNS 이름 '${normalized[2]}'로 정규화했습니다.`;
  return message;
}
