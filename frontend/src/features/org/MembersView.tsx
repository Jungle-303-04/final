import { useMemo, useState, type ReactNode } from 'react';
import { useApproveUser } from '@/features/auth/api';
import { useGroups, useUsers } from '@/features/org/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { timeAgo } from '@/shared/lib/format';
import type { User } from '@/shared/lib/types';
import { Badge, Button, Card, EmptyState, Field, Input, Table, type TableColumn } from '@/ui';

export default function MembersView() {
  const usersQ = useUsers();
  const groupsQ = useGroups();
  const approve = useApproveUser();
  const [search, setSearch] = useState('');
  const normalizedSearch = search.trim().toLowerCase();
  const groupNames = useMemo(
    () => new Map((groupsQ.data ?? []).map((group) => [group.group_id, group.name])),
    [groupsQ.data],
  );
  const rows = useMemo(
    () => (usersQ.data ?? []).filter((user) => user.email.toLowerCase().includes(normalizedSearch)),
    [normalizedSearch, usersQ.data],
  );
  const columns: TableColumn<User>[] = [
    {
      id: 'email',
      header: '멤버',
      width: 'lg',
      sortValue: (user) => user.email,
      cell: (user) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={user.email} />
          <span className="min-w-0 truncate font-semibold text-primary">{user.email}</span>
        </span>
      ),
    },
    {
      id: 'role',
      header: '역할',
      sortValue: (user) => user.role,
      cell: (user) => <Badge tone={user.role === 'service_admin' ? 'info' : 'neutral'}>{roleLabel(user.role)}</Badge>,
    },
    {
      id: 'status',
      header: '상태',
      sortValue: (user) => user.status,
      cell: (user) => <Badge tone={statusTone(user.status)}>{statusLabel(user.status)}</Badge>,
    },
    {
      id: 'groups',
      header: '그룹',
      width: 'lg',
      cell: (user) => formatGroups(user.groups, groupNames),
    },
    {
      id: 'created',
      header: '가입',
      sortValue: (user) => user.created_at,
      cell: (user) => timeAgo(user.created_at) || '시간 없음',
    },
    {
      id: 'action',
      header: '',
      align: 'right',
      cell: (user) => user.status === 'pending_approval' ? (
        <Button
          size="sm"
          variant="primary"
          loading={approve.isPending && approve.variables === user.user_id}
          disabled={approve.isPending}
          onClick={() => approve.mutate(user.user_id)}
          data-testid={`approve-${user.email}`}
        >
          승인
        </Button>
      ) : null,
    },
  ];
  const empty = normalizedSearch ? (
    <EmptyState
      title="검색 결과 없음"
      description="입력한 조건과 일치하는 멤버가 없습니다"
      action={<Button size="sm" onClick={() => setSearch('')}>필터 초기화</Button>}
    />
  ) : (
    <EmptyState title="멤버 없음" description="가입 요청이 들어오면 이 목록에 표시됩니다" />
  );

  return (
    <SettingsNav title="멤버">
      <Card
        title="멤버"
        description="가입 승인, 역할, 그룹 소속을 확인합니다"
        actions={(
          <div className="w-full min-w-64 sm:w-80">
            <Field label="멤버 검색">
              <Input value={search} placeholder="이메일 검색" onChange={(event) => setSearch(event.target.value)} />
            </Field>
          </div>
        )}
      >
        <Table
          rows={rows}
          columns={columns}
          rowKey={(user) => user.user_id}
          loading={usersQ.isPending}
          error={usersQ.isError ? usersQ.error : null}
          onRetry={() => void usersQ.refetch()}
          empty={empty}
        />
        {groupsQ.isError && (
          <p className="mt-3 text-caption text-warning">그룹 이름을 불러오지 못해 일부 항목은 ID로 표시됩니다.</p>
        )}
      </Card>
    </SettingsNav>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-border bg-raised text-label font-semibold text-secondary" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function initials(value: string) {
  const [first = '', second = ''] = value.replace(/@.*/, '').split(/[._-]/);
  return `${first[0] ?? ''}${second[0] ?? first[1] ?? ''}`.toUpperCase() || 'U';
}

function formatGroups(groups: string[], groupNames: Map<string, string>): ReactNode {
  const labels = groups.map((groupId) => groupNames.get(groupId) ?? groupId);
  if (!labels.length) return <span className="text-muted">없음</span>;
  return <span className="truncate">{labels.join(', ')}</span>;
}

function roleLabel(role: string) {
  if (role === 'service_admin') return '서비스 관리자';
  if (role === 'user') return '사용자';
  return role;
}

function statusLabel(status: User['status']) {
  if (status === 'active') return '활성';
  if (status === 'pending_approval') return '승인 대기';
  return '인증 대기';
}

function statusTone(status: User['status']) {
  if (status === 'active') return 'success';
  if (status === 'pending_approval') return 'warning';
  return 'info';
}
