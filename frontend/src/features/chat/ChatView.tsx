import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MAX_AI_MESSAGE_LENGTH, useConversation, useConversations, useCreateConversation, useDeleteConversation, useSendMessage, useSelectAction } from '@/features/chat/api';
import { ApprovalCard } from '@/features/repo/ApprovalCard';
import { useIsAdmin } from '@/features/auth/api';
import { Badge, Button, Card, EmptyState, Skeleton } from '@/shared/ui';
import { queryClient } from '@/shared/lib/query';
import { uiStore } from '@/shared/lib/ui-store';
import { timeAgo } from '@/shared/lib/format';
import { AnimatedList, FadeSlideIn } from '@/shared/motion';
import type { ChatMessage } from '@/shared/lib/types';
import { IconAlertTriangle, IconFile, IconSend, IconTrash } from '@/shared/ui/icons';
import { useConsolePath } from '@/features/console/ui';
import { chatContextFromSearchParams } from '@/features/chat/context';

export default function ChatView() {
  const { conversationId } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const pathFor = useConsolePath();
  const listQ = useConversations();
  const convQ = useConversation(conversationId);
  const create = useCreateConversation();
  const send = useSendMessage(conversationId ?? '');
  const remove = useDeleteConversation();
  const prefill = sp.get('prefill') ?? '';
  const chatContext = useMemo(() => chatContextFromSearchParams(sp), [sp]);
  const [draft, setDraft] = useState(prefill);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conv = convQ.data;

  useEffect(() => {
    if (prefill) setDraft(prefill);
  }, [prefill]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages.length]);

  const clearPrefill = () => {
    if (!sp.has('prefill')) return;
    const next = new URLSearchParams(sp);
    next.delete('prefill');
    setSp(next, { replace: true });
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || text.length > MAX_AI_MESSAGE_LENGTH) return;
    setDraft(''); // 낙관적으로 비우고, 실패하면 입력을 복원한다(작성 내용 유실 금지)
    const restore = (err: unknown) => {
      setDraft(text);
      uiStore.getState().toast('danger', `전송 실패 — ${(err as Error).message || '네트워크를 확인해주세요'}`);
    };
    const payload = { message: text, context: chatContext };
    if (conversationId) send.mutate(payload, { onSuccess: clearPrefill, onError: restore });
    else create.mutate(payload, { onSuccess: d => nav(pathFor(`/ai/${d.conversation_id}`)), onError: restore });
  };

  const deleteConversation = (id: string) => {
    remove.mutate(id, {
      onSuccess: () => {
        uiStore.getState().toast('ok', '대화를 삭제했습니다');
        if (id === conversationId) nav(pathFor('/ai'), { replace: true });
      },
      onError: err => uiStore.getState().toast('danger', `삭제 실패 — ${(err as Error).message}`),
    });
  };
  const draftLengthInvalid = draft.length > MAX_AI_MESSAGE_LENGTH;
  const submitDisabled = !draft.trim() || draftLengthInvalid || create.isPending || send.isPending || (!!conversationId && convQ.isError);

  return (
    <FadeSlideIn>
      <div className="chat-layout">
        <Card style={{ overflow: 'auto' }} title="대화" actions={<Button size="sm" onClick={() => nav(pathFor('/ai'))}>새 대화</Button>}>
          {listQ.isPending && <Skeleton lines={4} />}
          {listQ.isError && (
            <EmptyState icon={<IconAlertTriangle size={26} />} title={(listQ.error as Error).message}
              action={<Button size="sm" onClick={() => listQ.refetch()}>다시 시도</Button>} />
          )}
          {listQ.isSuccess && (listQ.data ?? []).length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', margin: 0 }}>대화 없음</p>
          )}
          {listQ.isSuccess && <AnimatedList items={listQ.data ?? []} getKey={c => c.conversation_id}>
            {c => (
              <div
                className="chat-thread-row"
                data-active={c.conversation_id === conversationId ? 'true' : 'false'}
              >
                <button type="button" className="chat-thread-open" onClick={() => nav(pathFor(`/ai/${c.conversation_id}`))}>
                  <span className="chat-thread-row__main">
                    <span className={`chat-thread-dot ${c.status === 'waiting' ? 'is-waiting' : ''}`} />
                    <span className="chat-thread-title">{c.title}</span>
                  </span>
                  <span className="chat-thread-row__meta">{timeAgo(c.updated_at)}</span>
                </button>
                <button
                  type="button"
                  className="chat-thread-delete"
                  disabled={remove.isPending}
                  aria-label="대화 삭제"
                  title="대화 삭제"
                  onClick={() => deleteConversation(c.conversation_id)}
                >
                  <IconTrash size={13} />
                </button>
              </div>
            )}
          </AnimatedList>}
        </Card>
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 0, padding: 0, overflow: 'hidden' }}>
          <div className="chat-panel-head">
            <div>
              <strong>{conv?.title ?? 'AI 운영 어시스턴트'}</strong>
              <span><Badge tone={conv?.status === 'waiting' ? 'info' : 'neutral'}>{conv?.status ?? 'ready'}</Badge></span>
            </div>
            {conversationId && (
              <Button size="sm" variant="ghost" onClick={() => deleteConversation(conversationId)} loading={remove.isPending} aria-label="대화 삭제" title="대화 삭제">
                <IconTrash size={14} />
              </Button>
            )}
          </div>
          <div className="chat-messages">
            {!conversationId && <EmptyState icon={<IconFile size={26} />} title="새 대화" />}
            {conversationId && convQ.isPending && <Skeleton lines={4} />}
            {conversationId && convQ.isError && (
              <EmptyState icon={<IconAlertTriangle size={26} />} title={(convQ.error as Error).message}
                action={<Button size="sm" onClick={() => convQ.refetch()}>다시 시도</Button>} />
            )}
            {conv?.messages.map(m => <MessageRenderer key={m.message_id} m={m} />)}
            {conv?.status === 'waiting' && (
              <div className="chat-thinking" data-testid="typing">분석 중<span className="skeleton" /></div>
            )}
            <div ref={bottomRef} />
          </div>
          <div className="chat-composer">
            {draftLengthInvalid && <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-xs)' }} role="alert">16,000자 제한을 초과했습니다</p>}
            <div className="chat-composer-row">
              <textarea className="input" rows={2} value={draft} placeholder="메시지 입력"
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); }} data-testid="chat-input" />
              <Button variant="primary" onClick={submit} loading={create.isPending || send.isPending} disabled={submitDisabled} data-testid="chat-send" aria-label="전송" title="전송">
                <IconSend size={16} />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </FadeSlideIn>
  );
}

function MessageRenderer({ m }: { m: ChatMessage }) {
  // 새 메시지가 append 될 때 fade+rise 로 등장(키 고정 — 폴링 리렌더 시 재애니메이션 없음)
  if (m.role === 'user') {
    return (
      <FadeSlideIn style={{ alignSelf: 'flex-end', maxWidth: '76%', minWidth: 0 }}>
        <div className="chat-bubble chat-bubble--user">{m.content}</div>
      </FadeSlideIn>
    );
  }
  return (
    <FadeSlideIn style={{ alignSelf: 'flex-start', maxWidth: '82%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="chat-bubble chat-bubble--assistant">
        {m.content.split('**').map((part, i) => i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>)}
      </div>
      {m.tool_calls?.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-2)', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px' }}>
          <Badge tone={t.status}>도구</Badge><code>{t.name}</code><span>{t.args}</span>
        </div>
      ))}
      {m.actions && <ActionSelectCard actions={m.actions} />}
      {m.approval_ref && <ApprovalCard approvalId={m.approval_ref.approval_id} summary={m.approval_ref.summary} resolved={m.approval_ref.resolved} compact />}
    </FadeSlideIn>
  );
}

function ActionSelectCard({ actions }: { actions: NonNullable<ChatMessage['actions']> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const select = useSelectAction();
  const canDeploy = useIsAdmin();
  const locked = !!actions.selected;
  return (
    <div className="chat-action" data-testid="action-card">
      <b style={{ fontSize: 'var(--fs-sm)' }}>복구 액션 제안</b>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
        {actions.options.map(o => (
          <label key={o.action_id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 'var(--fs-sm)', opacity: locked && actions.selected !== o.action_id ? 0.5 : 1 }}>
            <input type="radio" name={actions.plan_id} disabled={locked} checked={locked ? actions.selected === o.action_id : picked === o.action_id} onChange={() => setPicked(o.action_id)} />
            <span>
              {o.label} <Badge tone={o.risk}>위험도</Badge>
              <span style={{ display: 'block', color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{o.impact}</span>
            </span>
          </label>
        ))}
      </div>
      {locked
        ? <Badge tone="ok">실행됨 — 진행은 워크플로우에서 확인</Badge>
        : <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" variant="primary" disabled={!picked || !canDeploy} title={canDeploy ? '' : 'release_operator 권한 필요'}
              loading={select.isPending}
              onClick={() => picked && select.mutate({ planId: actions.plan_id, actionId: picked }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai'] }) })}>
              선택 실행
            </Button>
          </div>}
    </div>
  );
}
