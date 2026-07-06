// 조직/그룹/멤버/권한 — G1·G2·G3·G5 실존 route. mock mode는 로컬 데모 fallback.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post, put } from '@/shared/lib/api';
import type { AccessGrant, Group, Org, User } from '@/shared/lib/types';
import { uiStore } from '@/shared/lib/ui-store';

export const useOrgs = () => useQuery({ queryKey: ['orgs'], queryFn: () => get<{ orgs: Org[] }>('/orgs'), select: d => d.orgs });
export const useGroups = () => useQuery({ queryKey: ['groups'], queryFn: () => get<{ groups: Group[] }>('/groups'), select: d => d.groups });
export const useUsers = () => useQuery({ queryKey: ['users'], queryFn: () => get<{ users: User[] }>('/users'), select: d => d.users });
export const useGrants = (resourceId?: string) =>
  useQuery({ queryKey: ['access', resourceId ?? 'all'], queryFn: () => get<{ grants: AccessGrant[] }>(`/access${resourceId ? `?resource_id=${resourceId}` : ''}`), select: d => d.grants });

function invalidator(keys: string[][]) {
  const qc = useQueryClient();
  return () => keys.forEach(k => qc.invalidateQueries({ queryKey: k }));
}
export function useCreateOrg() {
  const inv = invalidator([['orgs']]);
  return useMutation({ mutationFn: (b: { name: string; description?: string }) => post<Org>('/orgs', b), onSuccess: () => { inv(); uiStore.getState().toast('ok', '조직을 만들었습니다'); } });
}
export function useDeleteOrg() {
  const inv = invalidator([['orgs']]);
  return useMutation({
    mutationFn: (id: string) => del(`/orgs/${id}`),
    onSuccess: inv,
    onError: () => uiStore.getState().toast('danger', '소속 그룹을 먼저 정리해야 합니다'),
  });
}
export function useCreateGroup() {
  const inv = invalidator([['groups'], ['orgs']]);
  return useMutation({ mutationFn: (b: { org_id: string; name: string }) => post<Group>('/groups', b), onSuccess: () => { inv(); uiStore.getState().toast('ok', '그룹을 만들었습니다'); } });
}
export function useGroupMembers(groupId: string) {
  return useQuery({ queryKey: ['groups', groupId, 'members'], queryFn: () => get<{ members: { user_id: string; email: string }[] }>(`/groups/${groupId}/members`), enabled: !!groupId, select: d => d.members });
}
export function useToggleMembership(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, add }: { userId: string; add: boolean }) =>
      add ? put(`/groups/${groupId}/members/${userId}`) : del(`/groups/${groupId}/members/${userId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); qc.invalidateQueries({ queryKey: ['users'] }); },
  });
}
export interface GrantPayload { subject_type: 'user' | 'group'; subject_id: string; subject_label?: string; resource_type: string; resource_id: string; role: string }
export function useGrantAccess() {
  const inv = invalidator([['access']]);
  return useMutation({ mutationFn: (b: GrantPayload) => post('/access', b), onSuccess: () => { inv(); uiStore.getState().toast('ok', '권한을 부여했습니다'); } });
}
export function useRevokeAccess() {
  const inv = invalidator([['access']]);
  return useMutation({ mutationFn: (id: string) => del(`/access/${id}`), onSuccess: inv });
}
