import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import type { Session } from '@/shared/lib/types';
import { useToast } from '@/ui';

export const sessionKey = ['session'] as const;
export const emailCheckKey = (email: string) => ['auth', 'check-email', email.trim().toLowerCase()] as const;
const SESSION_CHECK_TIMEOUT_MS = 20_000;
const SESSION_STALE_MS = 120_000;
const SESSION_HINT_KEY = 'k8s-console-session-seen-at';
const SESSION_HINT_TTL_MS = 2 * 60 * 60 * 1000;

export type EmailCheckResponse = {
  available: boolean;
  reason_code?: string;
  detail?: string;
  retry_after?: number | null;
};

export type EmailVerificationResponse = {
  accepted: boolean;
  verification_required: boolean;
  email?: string | null;
};

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

export function useEmailAvailability(email: string, enabled: boolean) {
  const normalized = email.trim().toLowerCase();
  return useQuery({
    queryKey: emailCheckKey(normalized),
    queryFn: ({ signal }) => post<EmailCheckResponse>('/auth/check-email', { email: normalized }, { signal }),
    enabled: enabled && normalized.length > 0,
    staleTime: 60_000,
    retry: false,
  });
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
export const useSignup = () => useMutation({ mutationFn: (b: { email: string; password: string; password_confirm: string }) => post<EmailVerificationResponse>('/auth/signup', b) });
export const useApproveUser = () => {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: (userId: string) => post(`/auth/users/${userId}/approve`),
    onSuccess: () => {
      push({ tone: 'success', title: '가입 승인 완료', description: '멤버가 콘솔에 입장할 수 있습니다' });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: err => {
      push({ tone: 'danger', title: '가입 승인 실패', description: (err as Error).message || '잠시 후 다시 시도해주세요' });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
};
export function useIsAdmin(): boolean {
  const { data } = useSession();
  return data?.roles?.includes('service_admin') ?? false;
}
export const useResendVerification = () =>
  useMutation({
    mutationFn: (b: { email: string; password: string }) =>
      post<EmailVerificationResponse>('/auth/resend-verification', b),
  });
