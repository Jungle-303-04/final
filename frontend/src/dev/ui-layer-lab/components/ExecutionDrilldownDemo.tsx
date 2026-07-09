import { useMemo, useState, type ReactNode } from 'react';
import { Button, cx } from '@/ui';
import { FlowIcon, TerminalBoxIcon } from '../icons';
import { drillWorkflows, modules } from '../data';
import type { DrillJob, DrillStep, DrillWorkflow } from '../types';
import { ModuleFrame, ReferenceCode, StatusBadge, TerminalBlock } from './ReferenceScaffold';

const moduleMeta = modules.find((item) => item.id === 'drilldown')!;

export function ExecutionDrilldownDemo() {
  const [workflowId, setWorkflowId] = useState(drillWorkflows[0].id);
  const workflow = drillWorkflows.find((item) => item.id === workflowId) ?? drillWorkflows[0];
  const [jobId, setJobId] = useState(workflow.jobs[0].id);
  const job = workflow.jobs.find((item) => item.id === jobId) ?? workflow.jobs[0];
  const [stepId, setStepId] = useState(job.steps[0].id);
  const step = job.steps.find((item) => item.id === stepId) ?? job.steps[0];

  const selectedPath = useMemo(() => `${workflow.title} / ${job.title} / ${step.title}`, [job.title, step.title, workflow.title]);

  const selectWorkflow = (next: DrillWorkflow) => {
    setWorkflowId(next.id);
    setJobId(next.jobs[0].id);
    setStepId(next.jobs[0].steps[0].id);
  };
  const selectJob = (next: DrillJob) => {
    setJobId(next.id);
    setStepId(next.steps[0].id);
  };
  const selectStep = (next: DrillStep) => setStepId(next.id);

  return (
    <ModuleFrame title={moduleMeta.title} summary={moduleMeta.summary} sources={moduleMeta.sources}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div className="overflow-hidden rounded-panel border border-border bg-bg">
          <div className="flex flex-col gap-3 border-b border-border bg-surface p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <FlowIcon className="h-5 w-5 text-accent" />
                <h3 className="truncate text-body font-semibold text-primary">실행 드릴뷰</h3>
              </div>
              <p className="mt-1 truncate text-caption text-muted">{selectedPath}</p>
            </div>
            <Button size="sm" leadingIcon={<TerminalBoxIcon className="h-4 w-4" />}>선택 로그 복사</Button>
          </div>

          <div className="grid min-h-[31rem] lg:grid-cols-[15rem_17rem_minmax(0,1fr)]">
            <Column title="Workflow">
              {drillWorkflows.map((item) => (
                <DrillButton
                  key={item.id}
                  active={item.id === workflow.id}
                  title={item.title}
                  detail={item.trigger}
                  status={item.status}
                  onClick={() => selectWorkflow(item)}
                />
              ))}
            </Column>

            <Column title="Job">
              {workflow.jobs.map((item) => (
                <DrillButton
                  key={item.id}
                  active={item.id === job.id}
                  title={item.title}
                  detail={item.duration}
                  status={item.status}
                  onClick={() => selectJob(item)}
                />
              ))}
            </Column>

            <div className="grid min-w-0 content-start gap-3 border-t border-border p-4 lg:border-l lg:border-t-0">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-label font-semibold text-secondary">Step</p>
                  <h4 className="mt-1 truncate text-title font-semibold text-primary">{step.title}</h4>
                </div>
                <StatusBadge status={step.status} />
              </div>

              <div className="flex flex-wrap gap-2">
                {job.steps.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cx(
                      'rounded-control border px-3 py-2 text-label font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      item.id === step.id ? 'border-accent bg-accent text-on-accent' : 'border-border bg-surface text-secondary hover:border-border-strong hover:text-primary',
                    )}
                    onClick={() => selectStep(item)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 rounded-panel border border-border bg-surface p-3">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="duration" value={step.duration} />
                  <Metric label="log lines" value={String(step.logs.length)} />
                </div>
                <TerminalBlock title="raw logs" lines={step.logs} />
              </div>
            </div>
          </div>
        </div>

        <ReferenceCode
          path={moduleMeta.componentPath}
          notes={[
            'GitHub Actions 자체를 따라 한다기보다 긴 작업을 이해시키는 정보 구조만 가져옵니다.',
            '우리 도메인에서는 workflow 대신 사용자 액션, job 대신 시스템 하위 작업, step 대신 실제 명령 단위로 이름을 바꾸면 됩니다.',
            '실패한 step은 자동으로 펼치고 원문 로그, 복사, 재시도 액션을 같은 패널 안에 둡니다.',
          ]}
        />
      </div>
    </ModuleFrame>
  );
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid content-start gap-2 border-t border-border p-3 lg:border-l lg:border-t-0 first:lg:border-l-0">
      <p className="px-1 text-caption font-semibold uppercase text-muted">{title}</p>
      {children}
    </div>
  );
}

function DrillButton({
  active,
  title,
  detail,
  status,
  onClick,
}: {
  active: boolean;
  title: string;
  detail: string;
  status: DrillWorkflow['status'];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cx(
        'grid gap-2 rounded-panel border bg-surface p-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active ? 'border-accent/50' : 'border-border hover:border-border-strong',
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-label font-semibold text-primary">{title}</span>
        <StatusBadge status={status} />
      </div>
      <span className="line-clamp-2 text-caption text-muted">{detail}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-border bg-bg p-3">
      <p className="text-caption font-semibold uppercase text-muted">{label}</p>
      <p className="mt-1 truncate text-body font-semibold text-primary">{value}</p>
    </div>
  );
}
