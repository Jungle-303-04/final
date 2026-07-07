import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MAX_AI_MESSAGE_LENGTH, useConversation, useConversations, useCreateConversation, useSendMessage, useSelectAction } from '@/features/chat/api';
import { ApprovalCard } from '@/features/repo/ApprovalCard';
import { useIsAdmin } from '@/features/auth/api';
import { Badge, Button, Card, EmptyState } from '@/shared/ui';
import { queryClient } from '@/shared/lib/query';
import { uiStore } from '@/shared/lib/ui-store';
import { timeAgo } from '@/shared/lib/format';
import { FadeSlideIn } from '@/shared/motion';
import type { ChatMessage } from '@/shared/lib/types';

export default function ChatView() {
  const { conversationId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const listQ = useConversations();
  const convQ = useConversation(conversationId);
  const create = useCreateConversation();
  const send = useSendMessage(conversationId ?? '');
  const [draft, setDraft] = useState(sp.get('prefill') ?? '');
  const bottomRef = useRef<HTMLDivElement>(null);
  const conv = convQ.data;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv?.messages.length]);

  const submit = () => {
    const text = draft.trim();
    if (!text || text.length > MAX_AI_MESSAGE_LENGTH) return;
    setDraft(''); // 낙관적으로 비우고, 실패하면 입력을 복원한다(작성 내용 유실 금지)
    const restore = (err: unknown) => {
      setDraft(text);
      uiStore.getState().toast('danger', `전송 실패 — ${(err as Error).message || '네트워크를 확인해주세요'}`);
    };
    if (conversationId) send.mutate(text, { onError: restore });
    else create.mutate(text, { onSuccess: d => nav(`/ai/${d.conversation_id}`), onError: restore });
  };

  return (
    <FadeSlideIn>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, height: 'calc(100vh - 140px)' }}>
        <Card style={{ overflow: 'auto' }} title="대화" actions={<Button size="sm" onClick={() => nav('/ai')}>+ 새 대화</Button>}>
          {listQ.isSuccess && (listQ.data ?? []).length === 0 && (
            <p style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)', margin: 0 }}>대화 이력이 없습니다 — 오른쪽에 입력하면 새 대화가 시작됩니다.</p>
          )}
          {(listQ.data ?? []).map(c => (
            <div key={c.conversation_id} onClick={() => nav(`/ai/${c.conversation_id}`)}
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 'var(--fs-sm)',
                background: c.conversation_id === conversationId ? 'var(--surface-3)' : 'transparent' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.status === 'waiting' ? 'var(--info)' : 'var(--surface-3)' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
              </div>
              <span style={{ color: 'var(--text-3)', fontSize: 'var(--fs-xs)' }}>{timeAgo(c.updated_at)}</span>
            </div>
          ))}
        </Card>
        <Card style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingRight: 6 }}>
            {!conversationId && <EmptyState icon="✦" title="AI 운영 어시스턴트" description="장애 분석, 복구 제안, 배포 질문 — 아래에 입력하세요" />}
            {conv?.messages.map(m => <MessageRenderer key={m.message_id} m={m} />)}
            {conv?.status === 'waiting' && (
              <div style={{ color: 'var(--text-2)', fontSize: 'var(--fs-sm)' }} data-testid="typing">✦ 분석 중<span className="skeleton" style={{ display: 'inline-block', width: 30, marginLeft: 8, height: 8 }} /></div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 8 }}>
            {draft.length > MAX_AI_MESSAGE_LENGTH && <p style={{ color: 'var(--danger)', fontSize: 'var(--fs-xs)' }} role="alert">16,000자 제한을 초과했습니다</p>}
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea className="input" rows={2} value={draft} placeholder="무엇이든 물어보세요 (⌘↵ 전송)"
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit(); }} data-testid="chat-input" />
              <Button variant="primary" onClick={submit} loading={create.isPending || send.isPending} data-testid="chat-send">전송</Button>
            </div>
          </div>
        </Card>
      </div>
    </FadeSlideIn>
  );
}

function MessageRenderer({ m }: { m: ChatMessage }) {
  if (m.role === 'user') {
    return <div style={{ alignSelf: 'flex-end', maxWidth: '76%', background: 'var(--brand)', borderRadius: '12px 12px 2px 12px', padding: '10px 14px', fontSize: 'var(--fs-sm)', whiteSpace: 'pre-wrap' }}>{m.content}</div>;
  }
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '82%', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ background: 'var(--surface-2)', borderRadius: '12px 12px 12px 2px', padding: '10px 14px', fontSize: 'var(--fs-sm)', whiteSpace: 'pre-wrap' }}>
        {m.content.split('**').map((part, i) => i % 2 ? <b key={i}>{part}</b> : <span key={i}>{part}</span>)}
      </div>
      {m.tool_calls?.map((t, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-2)', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px' }}>
          <Badge tone={t.status}>도구</Badge><code>{t.name}</code><span>{t.args}</span>
        </div>
      ))}
      {m.actions && <ActionSelectCard actions={m.actions} />}
      {m.approval_ref && <ApprovalCard approvalId={m.approval_ref.approval_id} summary={m.approval_ref.summary} resolved={m.approval_ref.resolved} compact />}
    </div>
  );
}

function ActionSelectCard({ actions }: { actions: NonNullable<ChatMessage['actions']> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const select = useSelectAction();
  const canDeploy = useIsAdmin();
  const locked = !!actions.selected;
  return (
    <div className="card" style={{ background: 'var(--surface-2)', padding: 14 }} data-testid="action-card">
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
