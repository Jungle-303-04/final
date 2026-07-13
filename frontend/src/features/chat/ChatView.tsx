import { useEffect, useMemo, useRef, useState, type ComponentProps, type RefObject } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  MAX_AI_MESSAGE_LENGTH,
  chatKeys,
  useConversation,
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useSendMessage,
  useSelectAction,
} from '@/features/chat/api';
import { ApprovalCard } from '@/features/repo/ApprovalCard';
import { useSession } from '@/features/auth/api';
import { timeAgo } from '@/shared/lib/format';
import type { ChatMessage, ConversationSummary, Tone } from '@/shared/lib/types';
import { useConsolePath } from '@/features/console/ui';
import { chatContextFromSearchParams, type AiChatContext } from '@/features/chat/context';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  KeyValueList,
  PageHeader,
  Skeleton,
  Textarea,
  Tooltip,
  cx,
  useToast,
} from '@/ui';
import { fadeInUp, listItem, listStagger } from '@/ui/motion';

type BadgeTone = ComponentProps<typeof Badge>['tone'];

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
  const { push } = useToast();
  const prefill = sp.get('prefill') ?? '';
  const chatContext = useMemo(() => chatContextFromSearchParams(sp), [sp]);
  const [draft, setDraft] = useState(prefill);
  const bottomRef = useRef<HTMLDivElement>(null);
  const conv = convQ.data;
  const aiIssue = aiConfigurationIssue({
    listError: listQ.error,
    detailError: convQ.error,
    createError: create.error,
    sendError: send.error,
    conversationStatus: conv?.status,
  });

  useEffect(() => {
    if (prefill) setDraft(prefill);
  }, [prefill]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conv?.messages.length]);

  const clearPrefill = () => {
    if (!sp.has('prefill')) return;
    const next = new URLSearchParams(sp);
    next.delete('prefill');
    setSp(next, { replace: true, preventScrollReset: true });
  };

  const submit = () => {
    const text = draft.trim();
    if (!text || text.length > MAX_AI_MESSAGE_LENGTH || aiIssue) return;
    setDraft('');
    const restore = (err: unknown) => {
      setDraft(text);
      push({ tone: 'danger', title: '전송 실패', description: errorMessage(err) || '네트워크를 확인해주세요' });
    };
    const payload = { message: text, context: chatContext };
    if (conversationId) send.mutate(payload, { onSuccess: clearPrefill, onError: restore });
    else {
      create.mutate(payload, {
        onSuccess: (data) => {
          push({ tone: 'success', title: '대화 생성 완료', description: 'AI 응답을 준비하고 있습니다' });
          nav(pathFor(`/ai/${data.conversation_id}`));
        },
        onError: restore,
      });
    }
  };

  const deleteConversation = (id: string) => {
    remove.mutate(id, {
      onSuccess: () => {
        push({ tone: 'success', title: '대화 삭제 완료', description: '선택한 대화를 정리했습니다' });
        if (id === conversationId) nav(pathFor('/ai'), { replace: true });
      },
      onError: (err) => push({ tone: 'danger', title: '삭제 실패', description: errorMessage(err) || '잠시 후 다시 시도해주세요' }),
    });
  };

  const draftLengthInvalid = draft.length > MAX_AI_MESSAGE_LENGTH;
  const submitDisabled = !draft.trim() || draftLengthInvalid || create.isPending || send.isPending || Boolean(conversationId && convQ.isError) || Boolean(aiIssue);

  return (
    <motion.div variants={fadeInUp} initial="initial" animate="animate" className="grid gap-6">
      <PageHeader
        title="AI 채팅"
        description="클러스터, 인시던트, 배포 맥락을 이어 받아 운영 판단을 정리합니다"
        actions={<Button variant="primary" onClick={() => nav(pathFor('/ai'))}>새 대화</Button>}
      />

      <section className="grid gap-4 lg:h-[calc(100dvh-12rem)] lg:grid-cols-[20rem_minmax(0,1fr)]" aria-label="AI 대화">
        <ConversationList
          conversations={listQ.data ?? []}
          activeId={conversationId}
          loading={listQ.isPending}
          error={listQ.isError ? listQ.error : null}
          deleting={remove.isPending}
          onRetry={() => void listQ.refetch()}
          onOpen={(id) => nav(pathFor(`/ai/${id}`))}
          onDelete={deleteConversation}
          onNew={() => nav(pathFor('/ai'))}
        />

        <Card className="flex min-h-[36rem] min-w-0 flex-col overflow-hidden p-0 lg:min-h-0">
          <ChatPanelHeader
            title={conv?.title ?? 'AI 운영 어시스턴트'}
            status={conv?.status ?? (conversationId ? 'pending' : 'ready')}
            deleting={remove.isPending}
            canDelete={Boolean(conversationId)}
            onDelete={() => conversationId && deleteConversation(conversationId)}
          />

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {aiIssue ? (
              <AiConfigurationNotice issue={aiIssue} pathFor={pathFor} onRetry={() => {
                void listQ.refetch();
                if (conversationId) void convQ.refetch();
              }} />
            ) : (
              <MessageArea
                conversationId={conversationId}
                conversation={conv}
                loading={Boolean(conversationId && convQ.isPending)}
                error={conversationId && convQ.isError ? convQ.error : null}
                onRetry={() => void convQ.refetch()}
                bottomRef={bottomRef}
              />
            )}
          </div>

          {!aiIssue && (
            <Composer
              draft={draft}
              context={chatContext}
              invalid={draftLengthInvalid}
              pending={create.isPending || send.isPending}
              disabled={submitDisabled}
              onDraftChange={setDraft}
              onSubmit={submit}
            />
          )}
        </Card>
      </section>
    </motion.div>
  );
}

function ConversationList({
  conversations,
  activeId,
  loading,
  error,
  deleting,
  onRetry,
  onOpen,
  onDelete,
  onNew,
}: {
  conversations: ConversationSummary[];
  activeId?: string;
  loading: boolean;
  error: unknown;
  deleting: boolean;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <Card
      title="대화"
      description="최근 대화와 진행 중인 분석"
      actions={<Button size="sm" onClick={onNew}>새 대화</Button>}
      className="min-h-0 overflow-hidden"
    >
      {loading ? (
        <Skeleton lines={6} />
      ) : error ? (
        <EmptyState
          title="대화 조회 실패"
          description={errorMessage(error)}
          action={<Button size="sm" onClick={onRetry}>다시 시도</Button>}
        />
      ) : conversations.length === 0 ? (
        <EmptyState
          title="대화 없음"
          description="운영 질문을 입력하면 새 대화가 생성됩니다"
          action={<Button size="sm" variant="primary" onClick={onNew}>새 대화</Button>}
        />
      ) : (
        <motion.div variants={listStagger} initial="initial" animate="animate" className="grid max-h-[calc(100dvh-18rem)] gap-2 overflow-auto pr-1">
          {conversations.map((conversation) => (
            <ConversationRow
              key={conversation.conversation_id}
              conversation={conversation}
              active={conversation.conversation_id === activeId}
              deleting={deleting}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </motion.div>
      )}
    </Card>
  );
}

function ConversationRow({
  conversation,
  active,
  deleting,
  onOpen,
  onDelete,
}: {
  conversation: ConversationSummary;
  active: boolean;
  deleting: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const meta = conversationStatusMeta(conversation.status);
  return (
    <motion.div
      variants={listItem}
      className={cx(
        'flex min-w-0 items-center gap-2 rounded-panel border p-2 transition-colors',
        active ? 'border-brand bg-raised' : 'border-border bg-bg hover:bg-raised',
      )}
    >
      <button
        type="button"
        className="grid min-w-0 flex-1 gap-1 rounded-control p-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => onOpen(conversation.conversation_id)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cx('h-2 w-2 shrink-0 rounded-full', meta.dotClass)} />
          <span className="min-w-0 truncate text-body font-semibold text-text-primary">{conversation.title}</span>
        </span>
        <span className="text-caption text-text-muted">{conversation.updated_at ? timeAgo(conversation.updated_at) : '시간 없음'}</span>
      </button>
      <IconButton
        size="sm"
        label="대화 삭제"
        icon={<TrashGlyph />}
        disabled={deleting}
        onClick={() => onDelete(conversation.conversation_id)}
      />
    </motion.div>
  );
}

function ChatPanelHeader({
  title,
  status,
  deleting,
  canDelete,
  onDelete,
}: {
  title: string;
  status: string;
  deleting: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const meta = conversationStatusMeta(status);
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 border-b border-border p-4">
      <div className="min-w-0">
        <h2 className="truncate text-title font-semibold text-text-primary">{title}</h2>
        <div className="mt-2">
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </div>
      </div>
      {canDelete && (
        <Button size="sm" variant="ghost" loading={deleting} onClick={onDelete}>
          삭제
        </Button>
      )}
    </div>
  );
}

function MessageArea({
  conversationId,
  conversation,
  loading,
  error,
  onRetry,
  bottomRef,
}: {
  conversationId?: string;
  conversation?: { messages: ChatMessage[]; status: string };
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  bottomRef: RefObject<HTMLDivElement>;
}) {
  if (!conversationId) {
    return (
      <EmptyState
        icon={<FileGlyph />}
        title="새 대화"
        description="클러스터나 인시던트 화면에서 넘어온 맥락이 있으면 함께 전송됩니다"
      />
    );
  }
  if (loading) return <Skeleton lines={8} />;
  if (error) {
    return (
      <EmptyState
        icon={<AlertGlyph />}
        title="대화 조회 실패"
        description={errorMessage(error)}
        action={<Button size="sm" onClick={onRetry}>다시 시도</Button>}
      />
    );
  }
  return (
    <div className="flex min-h-full flex-col gap-3">
      {conversation?.messages.length === 0 && (
        <EmptyState title="메시지 없음" description="첫 메시지를 보내면 분석이 시작됩니다" />
      )}
      {conversation?.messages.map((message) => <MessageRenderer key={message.message_id} message={message} />)}
      {conversation?.status === 'waiting' && (
        <div className="flex w-fit items-center gap-2 rounded-panel border border-border bg-bg px-3 py-2 text-body text-text-secondary" data-testid="typing">
          <span className="h-2 w-2 rounded-full bg-info motion-safe:animate-pulse" />
          분석 중
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function MessageRenderer({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <motion.div variants={fadeInUp} initial="initial" animate="animate" className="flex justify-end">
        <div className="max-w-[min(42rem,86%)] whitespace-pre-wrap break-words rounded-panel border border-brand bg-brand px-4 py-3 text-body text-on-accent shadow-soft">
          {message.content}
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div variants={fadeInUp} initial="initial" animate="animate" className="flex max-w-[min(48rem,92%)] flex-col gap-2">
      <div className="whitespace-pre-wrap break-words rounded-panel border border-border bg-bg px-4 py-3 text-body leading-relaxed text-text-secondary shadow-soft">
        {renderAssistantContent(message.content)}
      </div>
      {message.tool_calls?.map((trace, index) => <ToolTraceRow key={`${trace.name}-${index}`} trace={trace} />)}
      {message.actions && <ActionSelectCard actions={message.actions} />}
      {message.approval_ref && (
        <ApprovalCard approvalId={message.approval_ref.approval_id} summary={message.approval_ref.summary} resolved={message.approval_ref.resolved} compact />
      )}
    </motion.div>
  );
}

function renderAssistantContent(content: string) {
  return content.split('**').map((part, index) => (
    index % 2 ? <strong key={`${part}-${index}`} className="font-semibold text-text-primary">{part}</strong> : <span key={`${part}-${index}`}>{part}</span>
  ));
}

function ToolTraceRow({ trace }: { trace: NonNullable<ChatMessage['tool_calls']>[number] }) {
  return (
    <details className="max-w-full rounded-panel border border-border bg-surface p-3 text-body">
      <summary className="flex min-w-0 cursor-pointer items-center gap-2 text-text-secondary">
        <Badge tone={toneToBadge(trace.status)}>도구</Badge>
        <code className="min-w-0 truncate font-mono text-caption text-text-primary">{trace.name}</code>
      </summary>
      {trace.args && (
        <code className="mt-3 block max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-control border border-border bg-bg p-3 font-mono text-caption text-text-secondary">
          {compactToolArgs(trace.args)}
        </code>
      )}
    </details>
  );
}

function compactToolArgs(args: string): string {
  const text = args.trim();
  if (text.length <= 900) return text;
  return `${text.slice(0, 900)}...`;
}

function ActionSelectCard({ actions }: { actions: NonNullable<ChatMessage['actions']> }) {
  const [picked, setPicked] = useState<string | null>(null);
  const select = useSelectAction();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const canDeploy = Boolean(session?.roles?.some((role) => role === 'service_admin' || role === 'release_operator'));
  const locked = Boolean(actions.selected);
  return (
    <div className="grid gap-3 rounded-panel border border-border bg-surface p-4" data-testid="action-card">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="text-body font-semibold text-text-primary">복구 조치 제안</p>
        {locked && <Badge tone="success">실행됨</Badge>}
      </div>
      <div className="grid gap-2">
        {actions.options.map((option) => {
          const selected = locked ? actions.selected === option.action_id : picked === option.action_id;
          return (
            <label
              key={option.action_id}
              className={cx(
                'flex min-w-0 gap-3 rounded-panel border border-border bg-bg p-3 text-body transition-colors',
                !locked && 'cursor-pointer hover:bg-raised',
                locked && !selected && 'opacity-60',
              )}
            >
              <input
                type="radio"
                name={actions.plan_id}
                disabled={locked}
                checked={selected}
                onChange={() => setPicked(option.action_id)}
                className="mt-1 h-4 w-4 accent-accent"
              />
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate font-semibold text-text-primary">{option.label}</span>
                  <Badge tone={toneToBadge(option.risk)}>위험도</Badge>
                </span>
                <span className="text-label text-text-secondary">{option.impact || '영향 정보 없음'}</span>
              </span>
            </label>
          );
        })}
      </div>
      {!locked && (
        <div className="flex justify-end">
          <Tooltip label={canDeploy ? '선택한 복구 조치를 실행 큐에 등록합니다' : 'release_operator 권한 필요'}>
            <span>
              <Button
                size="sm"
                variant="primary"
                disabled={!picked || !canDeploy}
                loading={select.isPending}
                onClick={() => picked && select.mutate(
                  { planId: actions.plan_id, actionId: picked },
                  { onSuccess: () => void queryClient.invalidateQueries({ queryKey: chatKeys.list() }) },
                )}
              >
                선택 실행
              </Button>
            </span>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

function Composer({
  draft,
  context,
  invalid,
  pending,
  disabled,
  onDraftChange,
  onSubmit,
}: {
  draft: string;
  context?: AiChatContext;
  invalid: boolean;
  pending: boolean;
  disabled: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="grid gap-3 border-t border-border bg-surface p-4">
      {context && <ContextSummary context={context} />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Field
            label="메시지"
            help={`${draft.length.toLocaleString()} / ${MAX_AI_MESSAGE_LENGTH.toLocaleString()}자`}
            error={invalid ? '16,000자 제한을 초과했습니다' : undefined}
          >
            <Textarea
              rows={2}
              value={draft}
              placeholder="운영 질문 입력"
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') onSubmit();
              }}
              data-testid="chat-input"
              className="min-h-20"
            />
          </Field>
        </div>
        <Button
          variant="primary"
          loading={pending}
          disabled={disabled}
          onClick={onSubmit}
          data-testid="chat-send"
          className="sm:mb-6"
        >
          전송
        </Button>
      </div>
    </div>
  );
}

function ContextSummary({ context }: { context: AiChatContext }) {
  const items = [
    { label: '클러스터', value: context.cluster_id },
    { label: '인시던트', value: context.incident_id ?? context.correlation_id },
    { label: '대상', value: [context.kind, context.namespace, context.name].filter(Boolean).join(' / ') },
    { label: '증상', value: context.symptom },
    { label: '원인', value: context.root_cause },
    { label: '유형', value: context.resource_type },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
  if (!items.length) return null;
  return (
    <div className="rounded-panel border border-border bg-bg p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="info">컨텍스트</Badge>
        <p className="text-label text-text-secondary">전송 시 이 리소스 식별자가 함께 전달됩니다</p>
      </div>
      <KeyValueList items={items} />
    </div>
  );
}

function AiConfigurationNotice({ issue, pathFor, onRetry }: { issue: AiIssue; pathFor: (to: string) => string; onRetry: () => void }) {
  return (
    <EmptyState
      icon={<SettingsGlyph />}
      title={issue.title}
      description={(
        <span>
          {issue.description}
          {issue.detail && <span className="mt-2 block break-words text-caption text-text-muted">{issue.detail}</span>}
        </span>
      )}
      action={(
        <span className="inline-flex flex-wrap justify-center gap-2">
          <Button size="sm" onClick={onRetry}>다시 시도</Button>
          <Link to={pathFor('/settings/ops')}><Button size="sm" variant="primary">운영 설정</Button></Link>
        </span>
      )}
    />
  );
}

type AiIssue = { title: string; description: string; detail?: string };

function aiConfigurationIssue({
  listError,
  detailError,
  createError,
  sendError,
  conversationStatus,
}: {
  listError: unknown;
  detailError: unknown;
  createError: unknown;
  sendError: unknown;
  conversationStatus?: string;
}): AiIssue | null {
  const errors = [listError, detailError, createError, sendError].filter(Boolean);
  const configError = errors.find(isLlmConfigurationError);
  if (configError) {
    return {
      title: 'AI 설정 확인 필요',
      description: 'LLM provider 또는 API key 설정을 확인한 뒤 대화를 다시 시도하세요.',
      detail: diagnosticMessage(configError),
    };
  }
  if (conversationStatus === 'failed') {
    return {
      title: 'AI 응답 실패',
      description: 'AI worker가 응답을 생성하지 못했습니다. LLM provider, API key, 크레딧 상태를 확인하세요.',
    };
  }
  return null;
}

function isLlmConfigurationError(error: unknown) {
  const text = `${errorMessage(error)} ${rawDetailMessage(error)}`.toLowerCase();
  return [
    'llm_provider',
    'llm provider',
    'llm_api_key',
    'openai_api_key',
    'anthropic_api_key',
    'gemini_api_key',
    'api_key',
    'api key',
    'insufficient_quota',
    'quota',
    'provider unconfigured',
    'unauthorized',
    'authentication',
  ].some((needle) => text.includes(needle));
}

function diagnosticMessage(error: unknown) {
  const raw = rawDetailMessage(error);
  if (raw) return raw;
  return errorMessage(error);
}

function errorMessage(error: unknown) {
  const candidate = error as { detail?: string; message?: string; rawDetail?: unknown };
  if (candidate?.detail) return candidate.detail;
  if (candidate?.message) return candidate.message;
  if (candidate?.rawDetail) {
    try {
      return JSON.stringify(candidate.rawDetail);
    } catch {
      return String(candidate.rawDetail);
    }
  }
  return String(error ?? '');
}

function rawDetailMessage(error: unknown) {
  const raw = (error as { rawDetail?: unknown })?.rawDetail;
  if (!raw) return '';
  try {
    return typeof raw === 'string' ? raw : JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function conversationStatusMeta(status: string): { label: string; tone: BadgeTone; dotClass: string } {
  const key = status.toLowerCase();
  if (key === 'waiting' || key === 'pending') return { label: '분석 중', tone: 'info', dotClass: 'bg-info motion-safe:animate-pulse' };
  if (key === 'failed') return { label: '실패', tone: 'danger', dotClass: 'bg-danger' };
  if (key === 'completed' || key === 'idle' || key === 'ready' || key === 'active') return { label: key === 'ready' ? '준비' : '완료', tone: 'success', dotClass: 'bg-success' };
  return { label: status || '미확인', tone: 'neutral', dotClass: 'bg-text-muted' };
}

function toneToBadge(tone: Tone): BadgeTone {
  if (tone === 'ok') return 'success';
  if (tone === 'warn') return 'warning';
  if (tone === 'danger') return 'danger';
  if (tone === 'info') return 'info';
  return 'neutral';
}

function TrashGlyph() {
  return <span aria-hidden="true">×</span>;
}

function FileGlyph() {
  return <span aria-hidden="true">AI</span>;
}

function AlertGlyph() {
  return <span aria-hidden="true">!</span>;
}

function SettingsGlyph() {
  return <span aria-hidden="true">LLM</span>;
}
