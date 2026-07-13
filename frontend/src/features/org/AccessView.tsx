import { useMemo, useState } from 'react';
import { useGrantAccess, useGrants, useGroups, useRevokeAccess, useUsers } from '@/features/org/api';
import { useClusters } from '@/features/cluster/api';
import { useApplications } from '@/features/repo/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { timeAgo } from '@/shared/lib/format';
import type { AccessGrant } from '@/shared/lib/types';
import { Badge, Button, Card, EmptyState, Field, Modal, Select, Skeleton, Table, type TableColumn } from '@/ui';

const ROLES = [
  ['observer', '읽기 전용'],
  ['release_operator', '배포 실행'],
  ['cluster_steward', '위험 명령 승인'],
] as const;

type Option = [string, string];

export default function AccessView() {
  const grantsQ = useGrants();
  const grant = useGrantAccess();
  const revoke = useRevokeAccess();
  const usersQ = useUsers();
  const groupsQ = useGroups();
  const clustersQ = useClusters();
  const appsQ = useApplications();
  const [open, setOpen] = useState(false);
  const [subjectType, setSubjectType] = useState<'user' | 'group'>('group');
  const [subjectId, setSubjectId] = useState('');
  const [resourceType, setResourceType] = useState('cluster');
  const [resourceId, setResourceId] = useState('');
  const [role, setRole] = useState<string>('observer');
  const [revoking, setRevoking] = useState<AccessGrant | null>(null);
  const subjects = useMemo<Option[]>(
    () => subjectType === 'user'
      ? (usersQ.data ?? []).map((user) => [user.user_id, user.email])
      : (groupsQ.data ?? []).map((group) => [group.group_id, group.name]),
    [groupsQ.data, subjectType, usersQ.data],
  );
  const targets = useMemo<Option[]>(
    () => resourceType === 'cluster'
      ? (clustersQ.data ?? []).map((cluster) => [cluster.cluster_id, cluster.name || cluster.cluster_id])
      : (appsQ.data ?? []).map((app) => [app.application_id, app.name || app.application_id]),
    [appsQ.data, clustersQ.data, resourceType],
  );
  const sourceLoading = usersQ.isPending || groupsQ.isPending || clustersQ.isPending || appsQ.isPending;
  const sourceError = usersQ.error || groupsQ.error || clustersQ.error || appsQ.error;
  const canGrant = Boolean(subjectId && resourceId && role && !sourceLoading && !sourceError);
  const columns: TableColumn<AccessGrant>[] = [
    {
      id: 'subject',
      header: '대상',
      sortValue: (item) => item.subject_label,
      width: 'lg',
      cell: (item) => (
        <span className="inline-flex min-w-0 items-center gap-2">
          <Badge tone="neutral">{item.subject_type === 'group' ? '그룹' : '사용자'}</Badge>
          <span className="min-w-0 truncate font-semibold text-text-primary">{item.subject_label}</span>
        </span>
      ),
    },
    {
      id: 'resource',
      header: '리소스',
      width: 'lg',
      sortValue: (item) => `${item.resource_type}/${item.resource_id}`,
      cell: (item) => <code className="font-mono text-caption text-text-secondary">{item.resource_type}/{item.resource_id}</code>,
    },
    {
      id: 'role',
      header: '역할',
      sortValue: (item) => item.role,
      cell: (item) => <Badge tone="info">{roleLabel(item.role)}</Badge>,
    },
    {
      id: 'granted',
      header: '부여',
      sortValue: (item) => item.granted_at,
      cell: (item) => timeAgo(item.granted_at) || '시간 없음',
    },
    {
      id: 'action',
      header: '',
      align: 'right',
      cell: (item) => (
        <Button
          size="sm"
          variant="danger"
          loading={revoke.isPending && revoke.variables === item.access_id}
          disabled={revoke.isPending}
          onClick={() => setRevoking(item)}
        >
          회수
        </Button>
      ),
    },
  ];

  const closeGrant = () => {
    setOpen(false);
    setSubjectId('');
    setResourceId('');
    setRole('observer');
  };
  const submitGrant = () => {
    if (!canGrant) return;
    grant.mutate(
      {
        subject_type: subjectType,
        subject_id: subjectId,
        subject_label: subjects.find(([id]) => id === subjectId)?.[1],
        resource_type: resourceType,
        resource_id: resourceId,
        role,
      },
      { onSuccess: closeGrant },
    );
  };

  return (
    <SettingsNav title="리소스 권한">
      <Card
        title="리소스 권한"
        description="사용자 또는 그룹에 클러스터와 배포 정의 접근 역할을 부여합니다"
        actions={<Button variant="primary" leadingIcon={<PlusGlyph />} onClick={() => setOpen(true)}>권한 부여</Button>}
      >
        <Table
          rows={grantsQ.data ?? []}
          columns={columns}
          rowKey={(item) => item.access_id}
          loading={grantsQ.isPending}
          error={grantsQ.isError ? grantsQ.error : null}
          onRetry={() => void grantsQ.refetch()}
          empty={<EmptyState title="권한 없음" description="아직 부여된 리소스 권한이 없습니다" action={<Button size="sm" variant="primary" onClick={() => setOpen(true)}>권한 부여</Button>} />}
        />
      </Card>

      <Modal open={open} title="권한 부여" description="선택한 리소스에 필요한 최소 역할만 부여하세요" onOpenChange={setOpen}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitGrant();
          }}
        >
          {sourceLoading && <Skeleton lines={3} />}
          {sourceError && (
            <EmptyState
              title="선택지 조회 실패"
              description={errorMessage(sourceError)}
              action={<Button size="sm" onClick={() => {
                void usersQ.refetch();
                void groupsQ.refetch();
                void clustersQ.refetch();
                void appsQ.refetch();
              }}>다시 시도</Button>}
            />
          )}
          {!sourceLoading && !sourceError && (
            <>
              <Field label="대상 유형">
                <Select value={subjectType} onChange={(event) => {
                  setSubjectType(event.target.value as 'user' | 'group');
                  setSubjectId('');
                }}>
                  <option value="group">그룹</option>
                  <option value="user">사용자</option>
                </Select>
              </Field>
              <Field label="대상" error={subjects.length === 0 ? '선택 가능한 대상이 없습니다' : undefined}>
                <Select value={subjectId} required disabled={subjects.length === 0} onChange={(event) => setSubjectId(event.target.value)}>
                  <option value="">선택</option>
                  {subjects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </Select>
              </Field>
              <Field label="리소스 유형">
                <Select value={resourceType} onChange={(event) => {
                  setResourceType(event.target.value);
                  setResourceId('');
                }}>
                  <option value="cluster">클러스터</option>
                  <option value="application">배포 정의</option>
                </Select>
              </Field>
              <Field label="리소스" error={targets.length === 0 ? '선택 가능한 리소스가 없습니다' : undefined}>
                <Select value={resourceId} required disabled={targets.length === 0} onChange={(event) => setResourceId(event.target.value)}>
                  <option value="">선택</option>
                  {targets.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                </Select>
              </Field>
              <Field label="역할">
                <Select value={role} onChange={(event) => setRole(event.target.value)}>
                  {ROLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeGrant} disabled={grant.isPending}>취소</Button>
            <Button type="submit" variant="primary" loading={grant.isPending} disabled={!canGrant}>부여</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(revoking)}
        title="권한 회수"
        description="대상은 즉시 해당 리소스 접근 권한을 잃습니다"
        onOpenChange={(next) => {
          if (!next) setRevoking(null);
        }}
      >
        <div className="grid gap-4">
          <div className="rounded-panel border border-border bg-bg p-4">
            <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-body">
              <dt className="text-text-muted">대상</dt>
              <dd className="min-w-0 break-words text-text-primary">{revoking?.subject_label}</dd>
              <dt className="text-text-muted">리소스</dt>
              <dd className="min-w-0 break-words font-mono text-caption text-text-secondary">{revoking?.resource_type}/{revoking?.resource_id}</dd>
              <dt className="text-text-muted">역할</dt>
              <dd><Badge tone="info">{roleLabel(revoking?.role ?? '')}</Badge></dd>
            </dl>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRevoking(null)} disabled={revoke.isPending}>취소</Button>
            <Button
              variant="danger"
              loading={revoke.isPending}
              onClick={() => revoking && revoke.mutate(revoking.access_id, { onSettled: () => setRevoking(null) })}
            >
              회수 실행
            </Button>
          </div>
        </div>
      </Modal>
    </SettingsNav>
  );
}

function roleLabel(role: string) {
  const match = ROLES.find(([value]) => value === role);
  return match ? match[1] : role || '역할 없음';
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

function PlusGlyph() {
  return <span aria-hidden="true">+</span>;
}
