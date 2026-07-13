// 조직/그룹/멤버/권한 — G1·G2·G3·G5 실존 route.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post, put } from '@/shared/lib/api';
import type { AccessGrant, Group, Org, User } from '@/shared/lib/types';
import { useToast } from '@/ui';

const ORG_QUERY_TIMEOUT_MS = 8_000;

export const useOrgs = () => useQuery({ queryKey: ['orgs'], queryFn: () => get<{ orgs: Org[] }>('/orgs', { timeoutMs: ORG_QUERY_TIMEOUT_MS }), retry: false, select: d => d.orgs });
export const useGroups = () => useQuery({ queryKey: ['groups'], queryFn: () => get<{ groups: Group[] }>('/groups', { timeoutMs: ORG_QUERY_TIMEOUT_MS }), retry: false, select: d => d.groups });
export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => get<{ users: User[] }>('/users', { timeoutMs: ORG_QUERY_TIMEOUT_MS }), retry: false, select: d => d.users });
export const useGrants = (resourceId?: string) =>
  useQuery({ queryKey: ['access', resourceId ?? 'all'], queryFn: () => get<{ grants: AccessGrant[] }>(`/access${resourceId ? `?resource_id=${resourceId}` : ''}`, { timeoutMs: ORG_QUERY_TIMEOUT_MS }), retry: false, select: d => d.grants });

// 커스텀 훅 — hooks 규칙 준수를 위해 use 접두사(내부에서 useQueryClient 호출).
function useInvalidator(keys: string[][]) {
  const qc = useQueryClient();
  return () => keys.forEach(k => qc.invalidateQueries({ queryKey: k }));
}

export function useCreateOrg() {
  const inv = useInvalidator([['orgs']]);
  const { push } = useToast();
  return useMutation({
    mutationFn: (b: { name: string; description?: string }) => post<Org>('/orgs', b),
    onSuccess: () => { inv(); push({ tone: 'success', title: '조직 생성 완료', description: '새 조직을 만들었습니다' }); },
    onError: (err) => push({ tone: 'danger', title: '조직 생성 실패', description: mutationError(err) }),
  });
}
export function useDeleteOrg() {
  const inv = useInvalidator([['orgs']]);
  const { push } = useToast();
  return useMutation({
    mutationFn: (id: string) => del(`/orgs/${id}`),
    onSuccess: () => { inv(); push({ tone: 'success', title: '조직 삭제 완료', description: '조직을 정리했습니다' }); },
    onError: (err) => push({ tone: 'danger', title: '조직 삭제 실패', description: orgDeleteError(err) }),
  });
}
export function useCreateGroup() {
  const inv = useInvalidator([['groups'], ['orgs']]);
  const { push } = useToast();
  return useMutation({
    mutationFn: (b: { org_id: string; name: string }) => post<Group>('/groups', b),
    onSuccess: () => { inv(); push({ tone: 'success', title: '그룹 생성 완료', description: '새 그룹을 만들었습니다' }); },
    onError: (err) => push({ tone: 'danger', title: '그룹 생성 실패', description: mutationError(err) }),
  });
}
export function useGroupMembers(groupId: string) {
  return useQuery({
    queryKey: ['groups', groupId, 'members'],
    queryFn: () => get<{ members: { user_id: string; email: string }[] }>(`/groups/${groupId}/members`, { timeoutMs: ORG_QUERY_TIMEOUT_MS }),
    enabled: !!groupId,
    retry: false,
    select: d => d.members,
  });
}
export function useToggleMembership(groupId: string) {
  const qc = useQueryClient();
  const { push } = useToast();
  return useMutation({
    mutationFn: ({ userId, add }: { userId: string; add: boolean }) =>
      add ? put(`/groups/${groupId}/members/${userId}`) : del(`/groups/${groupId}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      push({ tone: 'success', title: '멤버십 변경 완료', description: '그룹 멤버를 갱신했습니다' });
    },
    // 실패 시 체크박스가 실제 상태로 되돌아가도록 서버 상태 재조회
    onError: (err) => {
      push({ tone: 'danger', title: '멤버십 변경 실패', description: membershipError(err) });
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
export interface GrantPayload { subject_type: 'user' | 'group'; subject_id: string; subject_label?: string; resource_type: string; resource_id: string; role: string }
export function useGrantAccess() {
  const inv = useInvalidator([['access']]);
  const { push } = useToast();
  return useMutation({
    mutationFn: (b: GrantPayload) => post('/access', b),
    onSuccess: () => { inv(); push({ tone: 'success', title: '권한 부여 완료', description: '리소스 권한을 부여했습니다' }); },
    onError: (err) => push({ tone: 'danger', title: '권한 부여 실패', description: mutationError(err) }),
  });
}
export function useRevokeAccess() {
  const inv = useInvalidator([['access']]);
  const { push } = useToast();
  return useMutation({
    mutationFn: (id: string) => del(`/access/${id}`),
    onSuccess: () => { inv(); push({ tone: 'success', title: '권한 회수 완료', description: '리소스 권한을 회수했습니다' }); },
    onError: (err) => push({ tone: 'danger', title: '권한 회수 실패', description: mutationError(err) }),
  });
}

function mutationError(err: unknown) {
  const candidate = err as { detail?: string; message?: string; rawDetail?: unknown };
  if (candidate?.detail) return candidate.detail;
  if (candidate?.message) return candidate.message;
  if (candidate?.rawDetail) {
    try {
      return JSON.stringify(candidate.rawDetail);
    } catch {
      return String(candidate.rawDetail);
    }
  }
  return '잠시 후 다시 시도해주세요';
}

function orgDeleteError(err: unknown) {
  const message = mutationError(err);
  return message === 'groups_exist' ? '소속 그룹을 먼저 정리해야 합니다' : message;
}

function membershipError(err: unknown) {
  const raw = (err as { rawDetail?: unknown })?.rawDetail;
  if (raw && typeof raw === 'object' && (raw as { code?: unknown }).code === 'last_admin') return '최소 1명의 관리자 필요';
  return mutationError(err);
}
