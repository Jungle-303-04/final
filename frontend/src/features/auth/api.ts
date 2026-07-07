import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import type { Session } from '@/shared/lib/types';
import { uiStore } from '@/shared/lib/ui-store';

export const sessionKey = ['session'] as const;
const SESSION_CHECK_TIMEOUT_MS = 20_000;
const SESSION_STALE_MS = 120_000;
const SESSION_HINT_KEY = 'k8s-console-session-seen-at';
const SESSION_HINT_TTL_MS = 2 * 60 * 60 * 1000;

export function markSessionSeen() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SESSION_HINT_KEY, String(Date.now()));
}

export function clearSessionHint() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(SESSION_HINT_KEY);
}

export function hasRecentSessionHint() {
  if (typeof window === 'undefined') return false;
  const seenAt = Number(window.localStorage.getItem(SESSION_HINT_KEY) ?? 0);
  return Number.isFinite(seenAt) && Date.now() - seenAt < SESSION_HINT_TTL_MS;
}

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: () => get<Session>('/auth/session', { timeoutMs: SESSION_CHECK_TIMEOUT_MS }),
    staleTime: SESSION_STALE_MS,
    refetchOnWindowFocus: false,
    retry: false,
  });
}
export function refreshSession() {
  return post<Session>('/auth/session/refresh');
}
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { email: string; password: string }) => post<Session>('/auth/login', b),
    onSuccess: session => {
      if (session.authenticated) markSessionSeen();
      qc.setQueryData(sessionKey, session);
    },
  });
}
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post('/auth/logout'),
    onSuccess: () => {
      clearSessionHint();
      qc.clear();
    },
  });
}
export const useSignup = () => useMutation({ mutationFn: (b: { email: string; password: string; password_confirm: string }) => post('/auth/signup', b) });
export const useApproveUser = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => post(`/auth/users/${userId}/approve`),
    onSuccess: () => { uiStore.getState().toast('ok', '가입을 승인했습니다'); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: err => { uiStore.getState().toast('danger', `승인 실패 — ${(err as Error).message}`); qc.invalidateQueries({ queryKey: ['users'] }); },
  });
};
export function useIsAdmin(): boolean {
  const { data } = useSession();
  return data?.roles?.includes('service_admin') ?? false;
}
export const useResendVerification = () =>
  useMutation({
    mutationFn: (b: { email: string; password: string }) =>
      post('/auth/resend-verification', b),
  });
