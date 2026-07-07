import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import type { Conversation } from '@/shared/lib/types';
import { adaptConversationSummary } from '@/shared/lib/adapt';
import { uiStore } from '@/shared/lib/ui-store';

export const chatKeys = {
  list: () => ['ai', 'conversations'] as const,
  one: (id: string) => ['ai', 'conversations', id] as const,
};
// G10 — AI 대화 목록 route (Gateway /conversations).
export const useConversations = () =>
  useQuery({ queryKey: chatKeys.list(), queryFn: () => get<{ conversations: Record<string, unknown>[] }>('/ai/conversations'), select: d => d.conversations.map(adaptConversationSummary), refetchInterval: 15_000 });
export const useConversation = (id: string | undefined) =>
  useQuery({
    queryKey: chatKeys.one(id ?? ''), enabled: !!id,
    queryFn: () => get<Conversation>(`/ai/conversations/${id}`),
    // waiting 중 2s, idle 15s (docs/fd/views/ai-chat AC — status 만으로 파생)
    refetchInterval: q => (q.state.data?.status === 'waiting' ? 2_000 : 15_000),
  });
export function useCreateConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => post<{ conversation_id: string }>('/ai/conversations', { message }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.list() }),
  });
}
export function useSendMessage(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (message: string) => post(`/ai/conversations/${id}/messages`, { message }),
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.one(id) }),
  });
}
export function useSelectAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, actionId }: { planId: string; actionId: string }) =>
      post(`/rca/recovery-plans/${planId}/actions/${actionId}/select`),
    onSuccess: () => {
      uiStore.getState().toast('ok', '복구 액션을 실행 큐에 등록했습니다 — 진행은 워크플로우에서 확인');
      qc.invalidateQueries({ queryKey: chatKeys.list() });
    },
    onError: err => {
      const e = err as { kind?: string; detail?: string };
      uiStore.getState().toast('danger', e.kind === 'forbidden'
        ? '실행 거부 — release_operator 권한이 필요합니다'
        : `액션 실행 실패 — ${e.detail ?? '잠시 후 다시 시도해주세요'}`);
      // 다른 세션에서 이미 선택됐을 수 있음 — 대화 최신화
      qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'ai' });
    },
  });
}
export const MAX_AI_MESSAGE_LENGTH = 16_000;
