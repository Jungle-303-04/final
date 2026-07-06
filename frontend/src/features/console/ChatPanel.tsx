// LOGO AI 챗봇 우측 패널 — 텍스트 + 확인 버튼 + 선택지 + 정보 카드 인터랙션
import { useEffect, useRef, useState } from 'react';
import { Button, Chip } from '@/plural-ui';
import { CloseIcon, PlusIcon, SendIcon } from '@/plural-ui/icons';

type MsgAction = { label: string; value: string; primary?: boolean };
type InfoRow = { label: string; value: string };
type Msg = {
  role: 'user' | 'assistant';
  text: string;
  actions?: MsgAction[];
  info?: InfoRow[];
  actionsUsed?: boolean;
};

type Thread = { id: string; title: string; messages: Msg[] };

const INITIAL_THREADS: Thread[] = [
  {
    id: 'th-1',
    title: 'CrashLoopBackOff 디버깅',
    messages: [
      { role: 'user', text: 'dashboard-worker가 계속 재시작돼. 원인 분석해줘.' },
      {
        role: 'assistant',
        text: '클러스터02의 dashboard-worker-5c2d-q9r4 팟을 확인했어요.\n\n원인: OOMKilled — 메모리 사용량이 512Mi 리밋을 초과했습니다 (최근 1시간 동안 7회 재시작).\n\n메모리 리밋을 1Gi로 올리는 수정을 제안합니다. PR을 생성할까요?',
        info: [
          { label: '팟', value: 'dashboard-worker-5c2d-q9r4' },
          { label: '상태', value: 'CrashLoopBackOff (7회 재시작)' },
          { label: '원인', value: 'OOMKilled — 512Mi 초과' },
        ],
        actions: [
          { label: 'PR 생성 확인', value: 'confirm-pr', primary: true },
          { label: '아니요', value: 'cancel' },
        ],
      },
    ],
  },
  {
    id: 'th-2',
    title: '비용 최적화 상담',
    messages: [
      { role: 'user', text: '클러스터01 비용 줄일 방법 있어?' },
      {
        role: 'assistant',
        text: '클러스터01은 월 $160.08로 전체의 56%를 차지해요. 아래 항목 중 어떤 걸 먼저 볼까요?',
        actions: [
          { label: 'Spot 전환 (약 60% 절감)', value: 'opt-spot' },
          { label: '리소스 요청 최적화', value: 'opt-rightsize' },
          { label: '야간 오토스케일 다운', value: 'opt-night' },
        ],
      },
    ],
  },
];

function mockReply(value: string): Msg {
  switch (value) {
    case 'confirm-pr':
      return {
        role: 'assistant',
        text: 'PR을 생성했어요. 리뷰 후 머지하면 자동으로 재배포됩니다.',
        info: [
          { label: 'PR', value: 'Jungle-303-04/final#128' },
          { label: '제목', value: 'dashboard-worker 메모리 리밋 1Gi로 상향' },
          { label: '상태', value: '리뷰 대기' },
        ],
        actions: [{ label: '대기 PR 목록 보기', value: 'goto-prs' }],
      };
    case 'cancel':
      return { role: 'assistant', text: '알겠어요. 필요하면 언제든 다시 요청하세요.' };
    case 'goto-prs':
      return {
        role: 'assistant',
        text: '셀프 서비스 → 대기 PR 탭에서 확인할 수 있어요. 좌측 사이드바에서 이동하세요.',
      };
    case 'opt-spot':
      return {
        role: 'assistant',
        text: 'Spot 인스턴스 전환 플랜입니다. 적용할까요?',
        info: [
          { label: '대상', value: '클러스터01 기본 노드 그룹 (5노드)' },
          { label: '예상 절감', value: '월 $61.7 (-60%)' },
          { label: '리스크', value: '중단 허용 워크로드 전제' },
        ],
        actions: [
          { label: '적용 확인', value: 'apply-spot', primary: true },
          { label: '취소', value: 'cancel' },
        ],
      };
    case 'apply-spot':
      return {
        role: 'assistant',
        text: '스택 실행을 트리거했어요. 스택 → aws-network → 실행 탭에서 진행 상황을 확인하세요.',
        info: [
          { label: '실행', value: 'run-292' },
          { label: '상태', value: '실행 중' },
        ],
      };
    case 'opt-rightsize':
      return {
        role: 'assistant',
        text: 'dashboard-worker가 실제 사용량 대비 2.3배의 리소스를 요청 중이에요. requests를 250m/256Mi로 낮추는 걸 추천합니다.',
        actions: [
          { label: 'PR 생성 확인', value: 'confirm-pr', primary: true },
          { label: '취소', value: 'cancel' },
        ],
      };
    case 'opt-night':
      return {
        role: 'assistant',
        text: '야간(22시–07시) 오토스케일 다운 스케줄을 설정하면 월 약 $18 절감이 예상돼요.',
        actions: [
          { label: '스케줄 적용 확인', value: 'apply-spot', primary: true },
          { label: '취소', value: 'cancel' },
        ],
      };
    default:
      if (/업그레이드/.test(value))
        return {
          role: 'assistant',
          text: '클러스터02(v1.29.4)는 2개 마이너 버전이 뒤처져 있어요. 목표 버전을 선택하세요.',
          actions: [
            { label: 'v1.30 (안전)', value: 'ver-130', primary: true },
            { label: 'v1.31', value: 'ver-131' },
            { label: 'v1.32 (최신)', value: 'ver-132' },
          ],
        };
      if (/^ver-/.test(value))
        return {
          role: 'assistant',
          text: '업그레이드 플랜을 준비했어요. 실행할까요?',
          info: [
            { label: '대상', value: '클러스터02' },
            { label: '경로', value: 'v1.29.4 → 순차 업그레이드' },
            { label: '예상 소요', value: '약 25분, 무중단' },
          ],
          actions: [
            { label: '실행 확인', value: 'apply-spot', primary: true },
            { label: '취소', value: 'cancel' },
          ],
        };
      if (/pr|만들|생성/i.test(value))
        return {
          role: 'assistant',
          text: '변경 사항으로 PR을 만들 준비가 됐어요. 진행할까요?',
          actions: [
            { label: 'PR 생성 확인', value: 'confirm-pr', primary: true },
            { label: '취소', value: 'cancel' },
          ],
        };
      return {
        role: 'assistant',
        text: `"${value}"에 대해 클러스터 상태를 분석했어요. (mock 응답) 관련 리소스는 CD → 서비스 탭에서 확인할 수 있습니다.`,
      };
  }
}

export function ChatPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [threads, setThreads] = useState<Thread[]>(INITIAL_THREADS);
  const [activeId, setActiveId] = useState('th-1');
  const [draft, setDraft] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  const active = threads.find((t) => t.id === activeId) ?? threads[0];

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [active?.messages.length, open]);

  if (!open) return null;

  const append = (userText: string, replyValue: string, msgIndex?: number) => {
    setThreads((ts) =>
      ts.map((t) => {
        if (t.id !== activeId) return t;
        const messages = t.messages.map((m, i) =>
          i === msgIndex ? { ...m, actionsUsed: true } : m,
        );
        return {
          ...t,
          messages: [...messages, { role: 'user' as const, text: userText }, mockReply(replyValue)],
        };
      }),
    );
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    append(text, text);
  };

  const newThread = () => {
    const id = `th-${Date.now()}`;
    setThreads((ts) => [...ts, { id, title: '새 대화', messages: [] }]);
    setActiveId(id);
  };

  return (
    <aside className="co-chatpanel">
      <div className="co-chat-head">
        <span className="pl-row" style={{ fontWeight: 600 }}>
          <SendIcon size={14} /> LOGO AI
        </span>
        <div className="pl-row">
          <button type="button" className="pl-navbtn" onClick={newThread} title="새 대화">
            <PlusIcon size={13} />
          </button>
          <button type="button" className="pl-navbtn" onClick={onClose} title="닫기">
            <CloseIcon size={13} />
          </button>
        </div>
      </div>

      <div className="co-chat-threads">
        {threads.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`co-chat-thread${t.id === activeId ? ' active' : ''}`}
            onClick={() => setActiveId(t.id)}
          >
            {t.title}
          </button>
        ))}
      </div>

      <div className="co-chat-body" ref={bodyRef}>
        {active.messages.length === 0 && (
          <div className="co-chat-empty">
            <p>무엇이든 물어보세요.</p>
            <div className="pl-stack" style={{ gap: 8 }}>
              {['클러스터02 업그레이드 플랜 짜줘', 'dashboard-worker 왜 죽어?', '비용 요약해줘'].map((s) => (
                <Chip key={s}>
                  <button
                    type="button"
                    style={{ all: 'unset', cursor: 'pointer' }}
                    onClick={() => setDraft(s)}
                  >
                    {s}
                  </button>
                </Chip>
              ))}
            </div>
          </div>
        )}
        {active.messages.map((m, i) => (
          <div key={i} className={`co-msg ${m.role}`}>
            {m.role === 'assistant' && (
              <div className="pl-avatar co-msg-avatar" style={{ background: 'var(--color-fill-two)' }}>
                AI
              </div>
            )}
            <div className="bubble">
              <span style={{ whiteSpace: 'pre-wrap' }}>{m.text}</span>
              {m.info && (
                <div className="co-msg-info">
                  {m.info.map((r) => (
                    <div key={r.label} className="row">
                      <span className="k">{r.label}</span>
                      <span className="v">{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {m.actions && !m.actionsUsed && (
                <div className="co-msg-actions">
                  {m.actions.map((a) => (
                    <Button
                      key={a.value}
                      size="small"
                      variant={a.primary ? 'primary' : 'secondary'}
                      onClick={() => append(a.label, a.value, i)}
                    >
                      {a.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="co-chat-input">
        <input
          value={draft}
          placeholder="AI에게 물어보세요…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && send()}
        />
        <Button variant="primary" size="medium" disabled={!draft.trim()} onClick={send}>
          <SendIcon size={14} />
        </Button>
      </div>
    </aside>
  );
}
