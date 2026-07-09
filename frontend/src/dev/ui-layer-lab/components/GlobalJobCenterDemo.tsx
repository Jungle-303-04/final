import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, cx, useToast } from '@/ui';
import { JobsIcon, PlayIcon } from '../icons';
import { jobTemplates, modules } from '../data';
import type { RunningJob } from '../types';
import { ModuleFrame, ProgressMeter, ReferenceCode, StatusBadge, TerminalBlock } from './ReferenceScaffold';

const moduleMeta = modules.find((item) => item.id === 'jobs')!;

export function GlobalJobCenterDemo() {
  const { push } = useToast();
  const [jobs, setJobs] = useState<RunningJob[]>(() => [
    {
      ...jobTemplates[0],
      id: 'seed-pull',
      status: 'running',
      progress: 48,
      startedAt: Date.now() - 9200,
      logs: ['remote refs 조회 완료', '변경 파일 계산 중'],
    },
  ]);
  const [selectedId, setSelectedId] = useState('seed-pull');
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];
  const runningCount = jobs.filter((job) => job.status === 'running').length;
  const globalProgress = useMemo(() => {
    if (jobs.length === 0) return 0;
    return jobs.reduce((sum, job) => sum + job.progress, 0) / jobs.length;
  }, [jobs]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setJobs((items) => items.map((job) => advanceJob(job, push)));
    }, 900);
    return () => window.clearInterval(timer);
  }, [push]);

  const startJob = (templateIndex: number) => {
    const template = jobTemplates[templateIndex];
    const id = `${template.kind}-${Date.now()}`;
    const next: RunningJob = {
      ...template,
      id,
      status: 'running',
      progress: 4,
      startedAt: Date.now(),
      logs: [`${template.title} 시작`, template.steps[0]],
    };
    setJobs((items) => [next, ...items].slice(0, 5));
    setSelectedId(id);
    push({ tone: 'info', title: `${template.title} 시작`, description: template.detail });
  };

  return (
    <ModuleFrame
      title={moduleMeta.title}
      summary={moduleMeta.summary}
      sources={moduleMeta.sources}
      actions={
        <>
          {jobTemplates.map((template, index) => (
            <Button key={template.kind} size="sm" leadingIcon={<PlayIcon className="h-4 w-4" />} onClick={() => startJob(index)}>
              {template.title}
            </Button>
          ))}
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <div className="overflow-hidden rounded-panel border border-border bg-bg">
          <div className="border-b border-border bg-surface">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <JobsIcon className="h-5 w-5 text-accent" />
                <div className="min-w-0">
                  <h3 className="truncate text-body font-semibold text-primary">전역 작업 상태</h3>
                  <p className="truncate text-caption text-muted">짧은 작업은 toast, 긴 작업은 Job Center로 승격</p>
                </div>
              </div>
              <Badge tone={runningCount > 0 ? 'info' : 'neutral'}>{runningCount} running</Badge>
            </div>
            <ProgressMeter value={globalProgress} className="rounded-none" />
          </div>

          <div className="grid min-h-[30rem] lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="grid content-start gap-3 p-4">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className={cx(
                    'grid gap-3 rounded-panel border bg-surface p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    selected?.id === job.id ? 'border-accent/50' : 'border-border hover:border-border-strong',
                  )}
                  onClick={() => setSelectedId(job.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-body font-semibold text-primary">{job.title}</p>
                      <p className="mt-1 truncate text-caption text-muted">{job.detail}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                  <ProgressMeter value={job.progress} />
                  <p className="truncate text-caption text-muted">{currentStep(job)}</p>
                </button>
              ))}
            </div>

            <aside className="border-t border-border bg-surface p-4 lg:border-l lg:border-t-0">
              {selected ? (
                <div className="grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-body font-semibold text-primary">{selected.title}</h3>
                      <p className="text-caption text-muted">{Math.max(1, Math.round((Date.now() - selected.startedAt) / 1000))}초 경과</p>
                    </div>
                    <StatusBadge status={selected.status} />
                  </div>
                  <div className="grid gap-2">
                    {selected.steps.map((step, index) => {
                      const state = stepState(selected, index);
                      return (
                        <div key={step} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-control border border-border bg-bg p-2">
                          <span className={cx('mt-1 h-2.5 w-2.5 rounded-full', state === 'done' ? 'bg-success' : state === 'active' ? 'bg-info motion-safe:animate-pulse' : 'bg-muted')} />
                          <span className="truncate text-label text-secondary">{step}</span>
                        </div>
                      );
                    })}
                  </div>
                  <TerminalBlock title="job log" lines={selected.logs} />
                </div>
              ) : (
                <p className="text-body text-muted">선택된 작업 없음</p>
              )}
            </aside>
          </div>
        </div>

        <ReferenceCode
          path={moduleMeta.componentPath}
          notes={[
            'progress를 알 수 있는 작업만 determinate bar를 쓰고, 알 수 없으면 단계명 중심의 running 상태를 씁니다.',
            '중요하지 않은 완료 이벤트는 자동 toast로 사라져도 되지만 실패와 승인 필요 상태는 작업 센터에 남겨야 합니다.',
            '작업 카드는 항상 상세 로그로 들어가는 링크나 선택 상태를 가져야 사용자가 멈춘 이유를 확인할 수 있습니다.',
          ]}
        />
      </div>
    </ModuleFrame>
  );
}

function advanceJob(job: RunningJob, push: ReturnType<typeof useToast>['push']): RunningJob {
  if (job.status !== 'running') return job;
  const nextProgress = Math.min(100, job.progress + 7 + Math.round(Math.random() * 8));
  const nextLogs = job.logs.includes(currentStep({ ...job, progress: nextProgress }))
    ? job.logs
    : [...job.logs, currentStep({ ...job, progress: nextProgress })];
  if (nextProgress >= 100) {
    push({ tone: 'success', title: `${job.title} 완료`, description: job.detail });
    return { ...job, progress: 100, status: 'success', logs: [...nextLogs, '완료'] };
  }
  return { ...job, progress: nextProgress, logs: nextLogs };
}

function currentStep(job: RunningJob) {
  const index = Math.min(job.steps.length - 1, Math.floor((job.progress / 100) * job.steps.length));
  return job.steps[index] ?? job.steps[0];
}

function stepState(job: RunningJob, index: number) {
  const activeIndex = Math.min(job.steps.length - 1, Math.floor((job.progress / 100) * job.steps.length));
  if (job.status === 'success' || index < activeIndex) return 'done';
  if (index === activeIndex) return 'active';
  return 'queued';
}
