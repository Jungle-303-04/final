import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post } from '@/shared/lib/api';
import type {
  AiConversationAcceptedResponse,
  AiConversationDetailResponse,
  ChatActions,
  ChatApprovalRef,
  ChatMessage,
  ChatToolCall,
  Conversation,
  ConversationSummary,
  Tone,
} from '@/shared/lib/types';
import { adaptConversationSummary } from '@/shared/lib/adapt';
import type { AiChatContext } from '@/features/chat/context';
import { useToast } from '@/ui';

const CHAT_QUERY_TIMEOUT_MS = 8_000;

export interface AiMessagePayload {
  message: string;
  title?: string;
  context?: AiChatContext;
}

export const chatKeys = {
  list: () => ['ai', 'conversations'] as const,
  one: (id: string) => ['ai', 'conversations', id] as const,
};
// G10 — AI 대화 목록 route (Gateway /conversations).
export const useConversations = () =>
  useQuery({
    queryKey: chatKeys.list(),
    queryFn: () => get<{ conversations: Record<string, unknown>[] }>('/ai/conversations', { timeoutMs: CHAT_QUERY_TIMEOUT_MS }),
    retry: false,
    select: d => d.conversations.map(adaptConversationSummary),
    refetchInterval: 15_000,
  });
export const useConversation = (id: string | undefined) =>
  useQuery({
    queryKey: chatKeys.one(id ?? ''), enabled: !!id,
    queryFn: () => get<AiConversationDetailResponse>(`/ai/conversations/${id}`, { timeoutMs: CHAT_QUERY_TIMEOUT_MS }),
    retry: false,
    select: adaptConversationDetail,
    // waiting 중 2s, idle 15s (docs/fd/views/ai-chat AC — status 만으로 파생)
    refetchInterval: q => (q.state.data?.conversation?.status === 'waiting' ? 2_000 : 15_000),
  });
export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | AiMessagePayload) =>
      post<AiConversationAcceptedResponse>('/ai/conversations', aiMessagePayload(input, { includeTitle: true })),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.list() }),
  });
}
export function useSendMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | AiMessagePayload) =>
      post<AiConversationAcceptedResponse>(`/ai/conversations/${id}/messages`, aiMessagePayload(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chatKeys.one(id) });
      qc.invalidateQueries({ queryKey: chatKeys.list() });
    },
  });
}

export function aiMessagePayload(input: string | AiMessagePayload, options: { includeTitle?: boolean } = {}): AiMessagePayload {
  if (typeof input === 'string') return { message: input };
  return {
    message: input.message,
    ...(options.includeTitle && input.title ? { title: input.title } : {}),
    ...(input.context ? { context: input.context } : {}),
  };
}
export function useDeleteConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => del<void>(`/ai/conversations/${id}`),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: chatKeys.list() });
      qc.removeQueries({ queryKey: chatKeys.one(id) });
    },
  });
}
export function useSelectAction() {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ planId, actionId }: { planId: string; actionId: string }) =>
      post(`/rca/recovery-plans/${planId}/actions/${actionId}/select`),
    onSuccess: () => {
      push({ tone: 'success', title: '복구 액션 등록', description: '진행 상태는 워크플로우에서 확인할 수 있습니다' });
      qc.invalidateQueries({ queryKey: chatKeys.list() });
    },
    onError: err => {
      const e = err as { kind?: string; detail?: string };
      push({
        tone: 'danger',
        title: '액션 실행 실패',
        description: e.kind === 'forbidden'
          ? 'release_operator 권한이 필요합니다'
          : e.detail ?? '잠시 후 다시 시도해주세요',
      });
      // 다른 세션에서 이미 선택됐을 수 있음 — 대화 최신화
      qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'ai' });
    },
  });
}
export const MAX_AI_MESSAGE_LENGTH = 16_000;

type RawRecord = Record<string, unknown>;

const TONES = new Set<Tone>(['ok', 'warn', 'danger', 'info', 'neutral']);

export function adaptConversationDetail(raw: AiConversationDetailResponse): Conversation {
  const summary = adaptConversationSummary(raw.conversation) as ConversationSummary;
  return {
    ...summary,
    messages: asRecordArray(raw.messages).map(adaptChatMessage),
  };
}

function adaptChatMessage(raw: RawRecord): ChatMessage {
  const metadata = recordOrUndefined(raw.metadata);
  const toolCalls = adaptToolCalls(raw, metadata);
  const actions = adaptActions(raw.actions) ?? adaptActions(metadata?.actions);
  const approvalRef = adaptApprovalRef(raw.approval_ref) ?? adaptApprovalRef(metadata?.approval_ref);
  return {
    message_id: String(raw.message_id ?? ''),
    role: raw.role === 'assistant' ? 'assistant' : 'user',
    status: typeof raw.status === 'string' ? raw.status : undefined,
    content: String(raw.content ?? ''),
    created_at: String(raw.created_at ?? ''),
    metadata,
    tool_calls: toolCalls,
    actions,
    approval_ref: approvalRef,
  };
}

function adaptToolCalls(raw: RawRecord, metadata: RawRecord | undefined): ChatToolCall[] | undefined {
  const calls = [
    ...asRecordArray(raw.tool_calls),
    ...asRecordArray(metadata?.tool_calls),
    ...asRecordArray(metadata?.tool_trace),
  ].map(adaptToolCall).filter(call => call.name);
  return calls.length ? calls : undefined;
}

function adaptToolCall(raw: RawRecord): ChatToolCall {
  return {
    name: String(raw.name ?? raw.tool ?? ''),
    args: stringifyArgs(raw.args ?? raw.arguments ?? {}),
    status: toneFromStatus(raw.status, raw.ok, raw.error),
  };
}

function adaptActions(value: unknown): ChatActions | undefined {
  const raw = recordOrUndefined(value);
  if (!raw) return undefined;
  const optionRows = Array.isArray(raw.options) ? raw.options : raw.candidates;
  const options = asRecordArray(optionRows).map(option => ({
    action_id: String(option.action_id ?? ''),
    label: String(option.label ?? option.title ?? option.action ?? ''),
    risk: toneFromStatus(option.risk ?? option.risk_level, undefined, undefined),
    impact: String(option.impact ?? option.blast_radius ?? option.description ?? ''),
  })).filter(option => option.action_id && option.label);
  const planId = String(raw.plan_id ?? '');
  if (!planId || options.length === 0) return undefined;
  const selected = raw.selected ?? raw.selected_action_id;
  return {
    plan_id: planId,
    options,
    selected: selected == null || selected === '' ? undefined : String(selected),
  };
}

function adaptApprovalRef(value: unknown): ChatApprovalRef | undefined {
  const raw = recordOrUndefined(value);
  if (!raw) return undefined;
  const approvalId = String(raw.approval_id ?? raw.approval_ref ?? '');
  if (!approvalId) return undefined;
  const resolved = raw.resolved === 'granted' || raw.resolved === 'rejected' ? raw.resolved : undefined;
  return {
    approval_id: approvalId,
    summary: String(raw.summary ?? ''),
    resolved,
  };
}

function toneFromStatus(status: unknown, ok: unknown, error: unknown): Tone {
  if (typeof status === 'string') {
    const normalized = status.toLowerCase();
    if (TONES.has(normalized as Tone)) return normalized as Tone;
    if (['success', 'succeeded', 'complete', 'completed', 'low'].includes(normalized)) return 'ok';
    if (['failed', 'failure', 'error', 'errored', 'high', 'critical'].includes(normalized)) return 'danger';
    if (['warning', 'warn', 'medium'].includes(normalized)) return 'warn';
    if (['running', 'pending', 'active'].includes(normalized)) return 'info';
  }
  if (ok === true) return 'ok';
  if (ok === false || error) return 'danger';
  return 'neutral';
}

function stringifyArgs(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return String(value);
  }
}

function recordOrUndefined(value: unknown): RawRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as RawRecord
    : undefined;
}

function asRecordArray(value: unknown): RawRecord[] {
  return Array.isArray(value) ? value.filter((item): item is RawRecord => !!recordOrUndefined(item)) : [];
}
