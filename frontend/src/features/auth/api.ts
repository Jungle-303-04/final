import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/shared/lib/api';
import type { Session } from '@/shared/lib/types';
import { uiStore } from '@/shared/lib/ui-store';

export const sessionKey = ['session'] as const;
export function useSession() {
  return useQuery({ queryKey: sessionKey, queryFn: () => get<Session>('/auth/session'), staleTime: 60_000 });
}
export function refreshSession() {
  return post<Session>('/auth/session/refresh');
}
export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { email: string; password: string }) => post<Session>('/auth/login', b),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionKey }),
  });
}
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => post('/auth/logout'), onSuccess: () => qc.clear() });
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
