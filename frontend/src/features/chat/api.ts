import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import type { Conversation } from '@/shared/lib/types';
import { adaptConversationSummary } from '@/shared/lib/adapt';

export const chatKeys = {
  list: () => ['ai', 'conversations'] as const,
  one: (id: string) => ['ai', 'conversations', id] as const,
};
// G10 — 목록 API 는 mock 계약(실백엔드 도입 전까지 mock 전용)
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
    onSuccess: () => qc.invalidateQueries({ queryKey: chatKeys.list() }),
  });
}
export const MAX_AI_MESSAGE_LENGTH = 16_000;
