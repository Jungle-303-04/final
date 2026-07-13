import { useMemo, useState } from 'react';
import { useCreateGroup, useGroupMembers, useGroups, useOrgs, useToggleMembership, useUsers } from '@/features/org/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import type { Group, User } from '@/shared/lib/types';
import { Badge, Button, Card, Drawer, EmptyState, Field, Input, Modal, Select, Skeleton, Table, type TableColumn } from '@/ui';

export default function GroupsView() {
  const groupsQ = useGroups();
  const orgsQ = useOrgs();
  const create = useCreateGroup();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [selected, setSelected] = useState<Group | null>(null);
  const orgName = useMemo(() => new Map((orgsQ.data ?? []).map((org) => [org.org_id, org.name])), [orgsQ.data]);
  const normalizedName = name.trim().toLowerCase();
  const duplicate = Boolean(normalizedName && (groupsQ.data ?? []).some((group) => group.org_id === orgId && group.name.trim().toLowerCase() === normalizedName));
  const canCreate = Boolean(orgId && normalizedName && !duplicate);
  const columns: TableColumn<Group>[] = [
    {
      id: 'name',
      header: '이름',
      sortValue: (group) => group.name,
      cell: (group) => <span className="font-semibold text-text-primary">{group.name}</span>,
    },
    {
      id: 'org',
      header: '조직',
      sortValue: (group) => orgName.get(group.org_id) ?? group.org_id,
      cell: (group) => orgName.get(group.org_id) ?? group.org_id,
    },
    {
      id: 'members',
      header: '멤버',
      sortValue: (group) => group.member_count,
      cell: (group) => <Badge tone="neutral">{group.member_count.toLocaleString()}명</Badge>,
    },
  ];

  const openCreate = () => {
    setOrgId(orgsQ.data?.[0]?.org_id ?? '');
    setName('');
    setOpen(true);
  };
  const closeCreate = () => {
    setOpen(false);
    setName('');
  };
  const submitCreate = () => {
    if (!canCreate) return;
    create.mutate({ org_id: orgId, name: name.trim() }, { onSuccess: closeCreate });
  };

  return (
    <SettingsNav title="그룹">
      <Card
        title="그룹"
        description="멤버 묶음과 리소스 권한의 기준을 관리합니다"
        actions={<Button variant="primary" leadingIcon={<PlusGlyph />} onClick={openCreate}>그룹 생성</Button>}
      >
        <Table
          rows={groupsQ.data ?? []}
          columns={columns}
          rowKey={(group) => group.group_id}
          loading={groupsQ.isPending}
          error={groupsQ.isError ? groupsQ.error : null}
          onRetry={() => void groupsQ.refetch()}
          onRowClick={setSelected}
          empty={(
            <EmptyState
              title="그룹 없음"
              description="그룹을 만들면 멤버십과 권한 부여를 한 번에 관리할 수 있습니다"
              action={<Button size="sm" variant="primary" leadingIcon={<PlusGlyph />} onClick={openCreate}>그룹 생성</Button>}
            />
          )}
        />
      </Card>

      <Modal open={open} title="그룹 생성" description="그룹 이름은 같은 조직 안에서 고유해야 합니다" onOpenChange={setOpen}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitCreate();
          }}
        >
          <Field label="조직" error={orgsQ.isError ? '조직 목록을 불러오지 못했습니다' : undefined}>
            <Select value={orgId} required disabled={orgsQ.isPending || orgsQ.isError} onChange={(event) => setOrgId(event.target.value)}>
              <option value="">선택</option>
              {(orgsQ.data ?? []).map((org) => <option key={org.org_id} value={org.org_id}>{org.name}</option>)}
            </Select>
          </Field>
          <Field label="이름" error={duplicate ? '이미 사용 중인 그룹 이름입니다' : undefined}>
            <Input value={name} required onChange={(event) => setName(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeCreate} disabled={create.isPending}>취소</Button>
            <Button type="submit" variant="primary" loading={create.isPending} disabled={!canCreate}>생성</Button>
          </div>
        </form>
      </Modal>

      <Drawer open={Boolean(selected)} title={`그룹: ${selected?.name ?? ''}`} description="그룹 멤버를 변경하면 관련 리소스 권한도 즉시 영향을 받습니다" onOpenChange={(next) => !next && setSelected(null)}>
        {selected && <GroupMembers group={selected} />}
      </Drawer>
    </SettingsNav>
  );
}

function GroupMembers({ group }: { group: Group }) {
  const membersQ = useGroupMembers(group.group_id);
  const usersQ = useUsers();
  const toggle = useToggleMembership(group.group_id);
  const [inlineError, setInlineError] = useState('');
  const memberIds = useMemo(() => new Set((membersQ.data ?? []).map((member) => member.user_id)), [membersQ.data]);
  const loading = membersQ.isPending || usersQ.isPending;
  const error = membersQ.isError ? membersQ.error : usersQ.isError ? usersQ.error : null;

  if (loading) return <Skeleton lines={8} />;
  if (error) {
    return (
      <EmptyState
        title="멤버 조회 실패"
        description={errorMessage(error)}
        action={<Button size="sm" onClick={() => {
          void membersQ.refetch();
          void usersQ.refetch();
        }}>다시 시도</Button>}
      />
    );
  }

  const users = usersQ.data ?? [];
  if (users.length === 0) {
    return <EmptyState title="멤버 없음" description="승인된 사용자가 생기면 이 그룹에 추가할 수 있습니다" />;
  }

  return (
    <div className="grid gap-3">
      {inlineError && <p className="rounded-panel border border-danger/40 bg-bg p-3 text-body text-danger">{inlineError}</p>}
      <div className="grid gap-2">
        {users.map((user) => {
          const checked = memberIds.has(user.user_id);
          return (
            <label key={user.user_id} className="flex min-w-0 items-center gap-3 rounded-panel border border-border bg-bg p-3 text-body text-text-secondary">
              <input
                type="checkbox"
                checked={checked}
                disabled={toggle.isPending}
                className="h-4 w-4 accent-accent"
                onChange={(event) => {
                  setInlineError('');
                  toggle.mutate(
                    { userId: user.user_id, add: event.target.checked },
                    { onError: (err) => setInlineError(groupMemberError(err, user)) },
                  );
                }}
              />
              <Avatar name={user.email} />
              <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{user.email}</span>
              {user.role === 'service_admin' && <Badge tone="info">서비스 관리자</Badge>}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function groupMemberError(error: unknown, user: User) {
  if (errorCode(error) === 'last_admin') return '최소 1명의 관리자 필요';
  return `${user.email} 멤버십 변경 실패 - ${errorMessage(error)}`;
}

function errorCode(error: unknown) {
  const raw = (error as { rawDetail?: unknown })?.rawDetail;
  if (raw && typeof raw === 'object' && 'code' in raw) return String((raw as { code?: unknown }).code);
  return '';
}

function errorMessage(error: unknown) {
  const candidate = error as { detail?: string; message?: string; rawDetail?: unknown };
  if (candidate?.detail) return candidate.detail;
  if (candidate?.message) return candidate.message;
  if (candidate?.rawDetail) {
    try {
      return JSON.stringify(candidate.rawDetail);
    } catch {
      return String(candidate.rawDetail);
    }
  }
  return String(error ?? '요청 처리에 실패했습니다');
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-control border border-border bg-raised text-label font-semibold text-text-secondary" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function initials(value: string) {
  const [first = '', second = ''] = value.replace(/@.*/, '').split(/[._-]/);
  return `${first[0] ?? ''}${second[0] ?? first[1] ?? ''}`.toUpperCase() || 'U';
}

function PlusGlyph() {
  return <span aria-hidden="true">+</span>;
}
