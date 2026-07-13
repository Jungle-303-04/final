import { useEffect, useState } from 'react';
import { Bell, CheckCircle2, CirclePause, CirclePlay, FastForward, RefreshCw, RotateCcw, ShieldCheck, Undo2, XCircle } from 'lucide-react';
import type { ReleasePlan, ReleaseReadiness, ReleaseRun } from '@/shared/lib/types';
import { Badge, Button, EmptyState, Field, IconButton, Modal, Skeleton, Textarea } from '@/ui';
import { type RunAction, useReleaseReadiness, useReleaseRunAction, useStartReleasePlan } from './api';
import { latestRun, releaseStatusLabel, releaseStatusTone } from './model';

type ActionIntent = { action: RunAction; title: string; description: string; destructive?: boolean };

export function RunPanel({
  plan,
  runs,
  pending,
  onRefresh,
}: {
  plan: ReleasePlan;
  runs: ReleaseRun[];
  pending: boolean;
  onRefresh: () => Promise<unknown>;
}) {
  const readiness = useReleaseReadiness();
  const startRun = useStartReleasePlan();
  const runAction = useReleaseRunAction();
  const [selectedRunId, setSelectedRunId] = useState('');
  const [intent, setIntent] = useState<ActionIntent>();
  const [reason, setReason] = useState('');
  const selectedRun = runs.find((run) => run.run_id === selectedRunId) ?? latestRun(runs);

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) setSelectedRunId(latestRun(runs)?.run_id ?? '');
    if (selectedRunId && !runs.some((run) => run.run_id === selectedRunId)) setSelectedRunId(latestRun(runs)?.run_id ?? '');
  }, [runs, selectedRunId]);

  const requestAction = (next: ActionIntent) => {
    setReason('');
    setIntent(next);
  };

  const confirmAction = () => {
    if (!intent || !selectedRun) return;
    runAction.mutate(
      { action: intent.action, runId: selectedRun.run_id, reason: reason.trim() || undefined },
      { onSuccess: () => setIntent(undefined) },
    );
  };

  return (
    <div className="workflow-runs">
      <aside className="workflow-run-list">
        <div className="workflow-panel-heading">
          <div><h2>실행 기록</h2><span>{runs.length}개</span></div>
          <IconButton size="sm" label="실행 새로고침" icon={<RefreshCw size={15} />} onClick={() => void onRefresh()} />
        </div>
        {pending ? <Skeleton lines={6} /> : runs.length === 0 ? (
          <div className="workflow-inline-empty">아직 실행 기록이 없습니다.</div>
        ) : (
          <div className="workflow-run-list__items">
            {runs.map((run) => (
              <button key={run.run_id} type="button" className={selectedRun?.run_id === run.run_id ? 'is-selected' : ''} onClick={() => setSelectedRunId(run.run_id)}>
                <span className="workflow-run-list__top"><strong>Wave {run.current_wave}/{run.total_waves}</strong><Badge tone={releaseStatusTone(run.status)}>{releaseStatusLabel(run.status)}</Badge></span>
                <span className="workflow-run-list__id">{shortRunId(run.run_id)}</span>
                <span className="workflow-run-list__time">{formatDate(run.updated_at || run.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="workflow-run-detail" aria-label="실행 상세">
        {!selectedRun ? (
          <ExecutionPreparation
            plan={plan}
            readiness={readiness.data}
            pending={readiness.isPending || startRun.isPending}
            error={(readiness.error || startRun.error) as Error | null}
            onCheck={() => readiness.mutate(plan)}
            onStart={() => startRun.mutate(plan, { onSuccess: ({ run }) => setSelectedRunId(run.run_id) })}
          />
        ) : (
          <RunDetail run={selectedRun} onAction={requestAction} />
        )}
      </section>

      <Modal
        open={Boolean(intent)}
        onOpenChange={(open) => !open && setIntent(undefined)}
        title={intent?.title ?? '실행 작업'}
        description={intent?.description}
        actions={(
          <>
            <Button onClick={() => setIntent(undefined)}>취소</Button>
            <Button variant={intent?.destructive ? 'danger' : 'primary'} loading={runAction.isPending} onClick={confirmAction}>확인</Button>
          </>
        )}
      >
        <Field label="사유" help="감사 기록에 남습니다."><Textarea value={reason} maxLength={500} placeholder="작업 사유" onChange={(event) => setReason(event.target.value)} /></Field>
      </Modal>
    </div>
  );
}

function ExecutionPreparation({
  plan,
  readiness,
  pending,
  error,
  onCheck,
  onStart,
}: {
  plan: ReleasePlan;
  readiness?: ReleaseReadiness;
  pending: boolean;
  error: Error | null;
  onCheck: () => void;
  onStart: () => void;
}) {
  return (
    <section className="workflow-run-prep">
      <div className="workflow-run-prep__head">
        <span className="workflow-run-prep__icon"><ShieldCheck size={22} /></span>
        <div><h2>실행 준비</h2><p>{plan.name} · {plan.steps.length}개 단계</p></div>
      </div>
      {!readiness ? (
        <EmptyState
          icon={<ShieldCheck size={20} />}
          title="실행 전 확인이 필요합니다"
          action={<Button variant="primary" leadingIcon={<ShieldCheck size={16} />} loading={pending} onClick={onCheck}>준비 상태 확인</Button>}
        />
      ) : (
        <>
          <div className={readiness.ready ? 'workflow-readiness-banner is-ready' : 'workflow-readiness-banner is-blocked'}>
            {readiness.ready ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
            <div><strong>{readiness.ready ? '실행 준비 완료' : '실행 전 확인 필요'}</strong><span>{readinessMessage(readiness.summary)}</span></div>
          </div>
          <div className="workflow-readiness-checks">
            {readiness.checks.map((check) => (
              <div key={check.check_id}>
                <Badge tone={readinessTone(check.status)}>{readinessCheckLabel(check.status)}</Badge>
                <span><strong>{readinessCheckName(check.name)}</strong><small>{readinessMessage(check.message)}</small></span>
              </div>
            ))}
          </div>
          {(readiness.blockers.length > 0 || readiness.warnings.length > 0) && (
            <div className="workflow-validation">
              {[...readiness.blockers, ...readiness.warnings].map((message) => <span key={message}>{readinessMessage(message)}</span>)}
            </div>
          )}
          <div className="workflow-run-prep__actions">
            <Button leadingIcon={<RefreshCw size={16} />} loading={pending} onClick={onCheck}>다시 확인</Button>
            <Button variant="primary" leadingIcon={<CirclePlay size={16} />} disabled={!readiness.ready} loading={pending} onClick={onStart}>실행 시작</Button>
          </div>
        </>
      )}
      {error && <div className="workflow-validation" role="alert"><span>{error.message}</span></div>}
    </section>
  );
}

function RunDetail({ run, onAction }: { run: ReleaseRun; onAction: (intent: ActionIntent) => void }) {
  const progress = run.total_waves > 0 ? Math.min(100, Math.max(0, (run.current_wave / run.total_waves) * 100)) : 0;
  const actions = availableRunActions(run.status);
  return (
    <div className="workflow-run-detail__content">
      <header className="workflow-run-detail__header">
        <div>
          <div className="workflow-run-detail__status"><Badge tone={releaseStatusTone(run.status)}>{releaseStatusLabel(run.status)}</Badge><code>{shortRunId(run.run_id)}</code></div>
          <h2>{run.plan_name}</h2>
          <p>{formatDate(run.created_at)} · {run.started_by || '시스템'}</p>
        </div>
        <div className="workflow-run-actions">
          {actions.map((action) => <Button key={action.action} variant={action.destructive ? 'danger' : 'secondary'} leadingIcon={actionIcon(action.action)} onClick={() => onAction(action)}>{action.title}</Button>)}
        </div>
      </header>

      <section className="workflow-wave-progress">
        <div><span>Wave 진행</span><strong>{run.current_wave} / {run.total_waves}</strong></div>
        <div className="workflow-wave-progress__track"><span style={{ width: `${progress}%` }} /></div>
      </section>

      <div className="workflow-run-detail__grid">
        <section>
          <div className="workflow-panel-heading"><div><h3>단계 상태</h3><span>{run.steps.length}개</span></div></div>
          <div className="workflow-run-steps">
            {run.steps.map((step, index) => (
              <div key={step.run_step_id}>
                <span className="workflow-run-steps__index">{index + 1}</span>
                <span><strong>{step.name || step.application_id}</strong><small>Wave {step.wave} · {step.application_id}</small></span>
                <Badge tone={releaseStatusTone(step.status)}>{releaseStatusLabel(step.status)}</Badge>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="workflow-panel-heading"><div><h3>활동</h3><span>{run.events.length}개</span></div></div>
          {run.events.length === 0 ? <div className="workflow-inline-empty">아직 기록된 활동이 없습니다.</div> : (
            <ol className="workflow-run-events">
              {[...run.events].reverse().map((event) => (
                <li key={event.audit_id}><i /><span><strong>{event.message || event.event_type}</strong><small>{event.actor || '시스템'} · {formatDate(event.created_at)}</small></span></li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function availableRunActions(status: string): ActionIntent[] {
  if (status === 'running') return [
    { action: 'advance', title: '다음 Wave', description: '현재 Wave의 조건을 확인하고 다음 Wave를 시작합니다.' },
    { action: 'pause', title: '일시정지', description: '현재 실행을 담당자가 재개할 때까지 멈춥니다.' },
    { action: 'notify', title: '담당자 알림', description: '현재 실행 상태를 담당 채널로 알립니다.' },
  ];
  if (status === 'paused') return [
    { action: 'resume', title: '실행 재개', description: '일시정지된 실행을 이어서 진행합니다.' },
    { action: 'cancel', title: '실행 취소', description: '이 실행을 종료합니다.', destructive: true },
  ];
  if (status === 'failed') return [
    { action: 'retry', title: '재시도', description: '실패한 Wave를 다시 실행합니다.' },
    { action: 'rollback', title: '롤백', description: '마지막 정상 상태로 되돌리는 작업을 요청합니다.', destructive: true },
    { action: 'notify', title: '담당자 알림', description: '실패 상태를 담당 채널로 알립니다.' },
  ];
  if (status === 'waiting_for_approval') return [
    { action: 'notify', title: '승인 요청 알림', description: '승인 대기 상태를 담당자에게 다시 알립니다.' },
    { action: 'cancel', title: '실행 취소', description: '승인 대기 중인 실행을 종료합니다.', destructive: true },
  ];
  if (status === 'succeeded') return [
    { action: 'rollback', title: '롤백', description: '완료된 배포를 이전 정상 상태로 되돌립니다.', destructive: true },
  ];
  return [];
}

function actionIcon(action: RunAction) {
  return {
    advance: <FastForward size={16} />, pause: <CirclePause size={16} />, resume: <CirclePlay size={16} />,
    retry: <RotateCcw size={16} />, rollback: <Undo2 size={16} />, cancel: <XCircle size={16} />, notify: <Bell size={16} />,
  }[action];
}

function readinessTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'passed') return 'success';
  if (status === 'blocked') return 'danger';
  if (status === 'warning') return 'warning';
  if (status === 'info') return 'info';
  return 'neutral';
}

function readinessCheckLabel(status: string) {
  return { passed: '통과', blocked: '차단', warning: '주의', info: '정보' }[status] ?? status;
}

function readinessCheckName(name: string) {
  const labels: Record<string, string> = {
    'Plan graph': '플랜 흐름',
    'Dispatch inputs': '배포 입력값',
    'Application context': '애플리케이션 연결',
    'Active run lock': '중복 실행 방지',
    'Live dispatch gate': '실제 배포 조건',
    'Approval evidence': '승인 근거',
    'Change ticket': '변경 티켓',
    'Release window': '배포 시간대',
    'Change freeze': '변경 동결',
    Runbook: '런북',
    'Owner contact': '담당자 연락처',
    'Post-deploy verification': '배포 후 검증',
    'Rollback criteria': '롤백 기준',
    'Diagnostics gate': '진단 결과',
    'Rollback policy': '롤백 정책',
    'Alert channels': '알림 채널',
    'Retry policy': '재시도 정책',
    'Audit and redaction': '감사 기록과 민감 정보 보호',
  };
  return labels[name] ?? name;
}

function readinessMessage(message: string) {
  const summary = message.match(/^(\d+) blocker\(s\) must be resolved before release dispatch\.$/);
  if (summary) return `실행 전에 차단 항목 ${summary[1]}개를 해결해야 합니다.`;
  const waves = message.match(/^(\d+) step\(s\) can run in (\d+) dependency wave\(s\)\.$/);
  if (waves) return `${waves[1]}개 단계를 ${waves[2]}개 Wave로 실행할 수 있습니다.`;
  const missing = message.match(/^(.+) is missing (commit_sha|image|cluster context)\.$/);
  if (missing) {
    const fields: Record<string, string> = { commit_sha: '커밋 SHA', image: '배포 이미지', 'cluster context': '클러스터 연결 정보' };
    const field = fields[missing[2]];
    return `${missing[1]}에 ${field}가 없습니다.`;
  }
  const translations: Record<string, string> = {
    'Commit SHA and image are required before dispatch.': '실행하려면 각 단계에 커밋 SHA와 배포 이미지가 필요합니다.',
    'Registered application, repository, manifest, and cluster context are required.': '등록된 애플리케이션, 리포지토리, 매니페스트, 클러스터 연결 정보가 필요합니다.',
    'No active run is blocking this release plan.': '이 플랜과 충돌하는 실행이 없습니다.',
    'Demo mode is allowed for the first executable wave.': '검증 모드에서 첫 Wave를 실행할 수 있습니다.',
    'Approval evidence is complete and recent within 24 hour(s).': '최근 24시간 이내의 승인 근거가 준비됐습니다.',
    'Change ticket requirements are satisfied for the first executable wave.': '첫 Wave의 변경 티켓 조건을 충족했습니다.',
    'Release window requirements are satisfied for the first executable wave.': '첫 Wave의 배포 시간대 조건을 충족했습니다.',
    'No active production change freeze blocks this release.': '현재 이 배포를 막는 운영 변경 동결이 없습니다.',
    'Runbook/SOP evidence is present for the first executable wave.': '첫 Wave의 런북 또는 SOP 근거가 준비됐습니다.',
    'Release owner/on-call contact is present for the first executable wave.': '첫 Wave의 담당자 또는 온콜 연락처가 준비됐습니다.',
    'Post-deploy verification evidence is present for the first executable wave.': '첫 Wave의 배포 후 검증 근거가 준비됐습니다.',
    'Rollback/abort criteria are present for the first executable wave.': '첫 Wave의 롤백 또는 중단 기준이 준비됐습니다.',
    'Release diagnostics do not block live dispatch.': '진단 결과가 실제 배포를 차단하지 않습니다.',
    'Rollback policy is available for this release.': '이 배포에 롤백 정책이 설정됐습니다.',
    'No enabled alert channel is configured for release failure or approval events.': '배포 실패 또는 승인 이벤트를 받을 활성 알림 채널이 없습니다.',
    'Failed waves can be retried 1 time(s).': '실패한 Wave를 1회 재시도할 수 있습니다.',
    'Run events are audit-exportable and sensitive event details are redacted.': '실행 이벤트를 감사 기록으로 내보낼 수 있고 민감 정보는 가려집니다.',
  };
  return translations[message] ?? message;
}

function shortRunId(value: string) {
  return value.replace(/^release-run-/, '').slice(0, 12);
}

function formatDate(value?: string) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
