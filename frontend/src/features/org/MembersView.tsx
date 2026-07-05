import { useApproveUser } from '@/features/auth/api';
import { useUsers, useGroups } from '@/features/org/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { Avatar, Badge, Button, Card, QueryBoundary, ResourceTable, SearchInput, useSearchFilter } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/format';
import type { User } from '@/shared/lib/types';

export default function MembersView() {
  const q = useUsers();
  const groupsQ = useGroups();
  const approve = useApproveUser();
  const [rows, s, setS] = useSearchFilter(q.data ?? [], u => u.email);
  const groupName = (id: string) => groupsQ.data?.find(g => g.group_id === id)?.name ?? id;
  return (
    <SettingsNav title="멤버">
      <div style={{ marginBottom: 12 }}><SearchInput value={s} onChange={setS} /></div>
      <Card>
        <QueryBoundary query={q}>{() => (
          <ResourceTable<User> rows={rows} rowKey={u => u.user_id}
            columns={[
              { key: 'email', label: '멤버', render: u => <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Avatar name={u.email} />{u.email}</span> },
              { key: 'role', label: '역할', render: u => <Badge tone={u.role === 'service_admin' ? 'info' : 'neutral'}>{u.role}</Badge> },
              { key: 'status', label: '상태', render: u => <Badge status={u.status}>{u.status === 'active' ? '활성' : u.status === 'pending_approval' ? '승인 대기' : '검증 대기'}</Badge> },
              { key: 'groups', label: '그룹', render: u => u.groups.map(groupName).join(', ') || '—' },
              { key: 'at', label: '가입', render: u => timeAgo(u.created_at) },
              { key: 'act', label: '', render: u => u.status === 'pending_approval'
                ? <Button size="sm" variant="primary" loading={approve.isPending} onClick={() => approve.mutate(u.user_id)} data-testid={`approve-${u.email}`}>승인</Button>
                : null },
            ]} />
        )}</QueryBoundary>
      </Card>
    </SettingsNav>
  );
}
