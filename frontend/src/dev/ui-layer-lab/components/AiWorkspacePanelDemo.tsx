import { useMemo, useState, type FormEvent } from 'react';
import { Badge, Button, Textarea, cx } from '@/ui';
import { PanelIcon, SparkIcon, TerminalBoxIcon } from '../icons';
import { modules } from '../data';
import { ModuleFrame, ReferenceCode, TerminalBlock } from './ReferenceScaffold';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

const moduleMeta = modules.find((item) => item.id === 'assistant')!;

const initialMessages: Message[] = [
  { id: 'm1', role: 'user', text: '현재 배포가 왜 멈췄는지 설명해줘.' },
  { id: 'm2', role: 'assistant', text: '승인 대기 단계에서 멈췄습니다. diff는 안전하지만 운영 네임스페이스 변경이라 승인자가 필요합니다.' },
];

const planItems = [
  { title: '배포 run 상태 확인', detail: 'WAITING_FOR_APPROVAL 단계와 approval_id 연결 확인', done: true },
  { title: '관련 diff 요약', detail: 'replicas 2 → 3, image tag b914d8c 적용 예정', done: true },
  { title: '승인 또는 거절 액션 제안', detail: '정책 위반 없음. 승인 후 rollout_waiting 감시 필요', done: false },
];

const toolLogs = [
  '$ read_workflow_run run_42',
  'status: WAITING_FOR_APPROVAL',
  'approval_id: apr_71',
  '$ read_policy_diff apr_71',
  'risk: low',
  'changed: deployment/frontend replicas 2 -> 3',
];

export function AiWorkspacePanelDemo() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('승인하면 다음에 어떤 상태를 봐야 해?');
  const [view, setView] = useState<'plan' | 'tool' | 'artifact'>('plan');
  const lastAssistant = useMemo(() => [...messages].reverse().find((item) => item.role === 'assistant'), [messages]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setMessages((items) => [
      ...items,
      { id: `u-${items.length}`, role: 'user', text: trimmed },
      { id: `a-${items.length}`, role: 'assistant', text: '승인 후에는 rollout_waiting, pod readiness, error log 증가 여부를 함께 보면 됩니다. 필요한 체크를 작업 센터에 등록할 수 있습니다.' },
    ]);
    setInput('');
    setView('artifact');
  };

  return (
    <ModuleFrame title={moduleMeta.title} summary={moduleMeta.summary} sources={moduleMeta.sources}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div className="min-h-[34rem] overflow-hidden rounded-panel border border-border bg-bg">
          <div className="grid h-full min-h-[34rem] lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid min-w-0 content-start gap-4 p-4">
              <div className="rounded-panel border border-border bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-label font-semibold text-secondary">현재 앱 화면</p>
                    <h3 className="mt-1 truncate text-title font-semibold text-primary">workflow/run_42</h3>
                  </div>
                  <Badge tone="warning">승인 대기</Badge>
                </div>
                <div className="mt-4 grid gap-2">
                  {['RENDERING', 'DIFFING', 'POLICY_CHECKING', 'WAITING_FOR_APPROVAL'].map((step, index) => (
                    <div key={step} className="flex items-center gap-3">
                      <span className={cx('h-2.5 w-2.5 rounded-full', index < 3 ? 'bg-success' : 'bg-warning')} />
                      <span className="min-w-0 flex-1 truncate text-body text-secondary">{step}</span>
                      <span className="text-caption text-muted">{index < 3 ? '완료' : '현재'}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-panel border border-border bg-surface p-4">
                <div className="flex items-center gap-2">
                  <SparkIcon className="h-5 w-5 text-accent" />
                  <h3 className="text-body font-semibold text-primary">AI가 화면 위에 붙는 방식</h3>
                </div>
                <p className="mt-2 text-label text-secondary">
                  채팅은 현재 화면을 가리지 않는 오른쪽 패널로 확장하고, 결과는 plan, tool, artifact 같은 작은 UI 조각으로 분리합니다.
                </p>
              </div>
            </div>

            <aside className="flex min-h-0 flex-col border-t border-border bg-surface lg:border-l lg:border-t-0">
              <div className="flex items-center justify-between gap-3 border-b border-border p-3">
                <div className="flex items-center gap-2">
                  <PanelIcon className="h-5 w-5 text-accent" />
                  <span className="text-body font-semibold text-primary">AI Panel</span>
                </div>
                <Badge tone="info">context attached</Badge>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-3">
                <div className="grid gap-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cx(
                        'max-w-[92%] rounded-panel border p-3 text-body',
                        message.role === 'user'
                          ? 'ml-auto border-accent/40 bg-accent/10 text-primary'
                          : 'border-border bg-bg text-secondary',
                      )}
                    >
                      {message.text}
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-3 rounded-panel border border-border bg-bg p-3">
                  <div className="flex gap-1">
                    {(['plan', 'tool', 'artifact'] as const).map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={cx(
                          'h-8 rounded-control px-3 text-label font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                          view === item ? 'bg-accent text-on-accent' : 'text-secondary hover:bg-raised hover:text-primary',
                        )}
                        onClick={() => setView(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  {view === 'plan' && <PlanPreview />}
                  {view === 'tool' && <TerminalBlock title="tool invocation" lines={toolLogs} />}
                  {view === 'artifact' && <ArtifactPreview lastAssistant={lastAssistant?.text ?? ''} />}
                </div>
              </div>
              <form onSubmit={submit} className="grid gap-2 border-t border-border p-3">
                <Textarea value={input} onChange={(event) => setInput(event.target.value)} className="min-h-20" />
                <Button type="submit" variant="primary" leadingIcon={<SparkIcon className="h-4 w-4" />}>전송</Button>
              </form>
            </aside>
          </div>
        </div>

        <ReferenceCode
          path={moduleMeta.componentPath}
          notes={[
            '짧은 질문은 command palette에서 시작하고, 대화가 길어지면 오른쪽 패널로 승격합니다.',
            'AI 응답은 말풍선 하나에 몰아넣지 말고 plan, tool log, result artifact로 나누면 상태 이해가 쉬워집니다.',
            '현재 화면 선택값과 conversation id를 함께 보존해야 사용자가 페이지를 이동해도 맥락을 잃지 않습니다.',
          ]}
        />
      </div>
    </ModuleFrame>
  );
}

function PlanPreview() {
  return (
    <div className="grid gap-2">
      {planItems.map((item) => (
        <div key={item.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-control border border-border bg-surface p-3">
          <span className={cx('mt-1 h-2.5 w-2.5 rounded-full', item.done ? 'bg-success' : 'bg-info')} />
          <span className="min-w-0">
            <span className="block text-label font-semibold text-primary">{item.title}</span>
            <span className="block text-caption text-muted">{item.detail}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ArtifactPreview({ lastAssistant }: { lastAssistant: string }) {
  return (
    <div className="grid gap-3 rounded-panel border border-border bg-surface p-3">
      <div className="flex items-center gap-2">
        <TerminalBoxIcon className="h-4 w-4 text-accent" />
        <span className="text-label font-semibold text-primary">Next checks</span>
      </div>
      <ul className="grid gap-2 text-label text-secondary">
        <li>rollout_waiting 상태가 90초 이상 유지되는지 확인</li>
        <li>pod readiness 100% 도달 여부 확인</li>
        <li>warning 로그 증가 시 drilldown 자동 고정</li>
      </ul>
      {lastAssistant && <p className="rounded-control bg-bg p-2 text-caption text-muted">{lastAssistant}</p>}
    </div>
  );
}
