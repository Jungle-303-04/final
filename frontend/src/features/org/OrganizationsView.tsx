import { useMemo, useState } from 'react';
import { useCreateOrg, useDeleteOrg, useOrgs } from '@/features/org/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { timeAgo } from '@/shared/lib/format';
import type { Org } from '@/shared/lib/types';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Table, type TableColumn } from '@/ui';

export default function OrganizationsView() {
  const orgsQ = useOrgs();
  const create = useCreateOrg();
  const remove = useDeleteOrg();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [confirming, setConfirming] = useState<Org | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const normalizedName = name.trim().toLowerCase();
  const duplicate = Boolean(normalizedName && (orgsQ.data ?? []).some((org) => org.name.trim().toLowerCase() === normalizedName));
  const validName = name.trim().length >= 3 && name.trim().length <= 40 && !duplicate;
  const columns = useMemo<TableColumn<Org>[]>(() => [
    {
      id: 'name',
      header: '이름',
      sortValue: (org) => org.name,
      cell: (org) => <span className="font-semibold text-text-primary">{org.name}</span>,
    },
    {
      id: 'description',
      header: '설명',
      width: 'lg',
      cell: (org) => org.description || <span className="text-text-muted">없음</span>,
    },
    {
      id: 'members',
      header: '멤버',
      sortValue: (org) => org.member_count,
      cell: (org) => <Badge tone="neutral">{org.member_count.toLocaleString()}명</Badge>,
    },
    {
      id: 'groups',
      header: '그룹',
      sortValue: (org) => org.group_count,
      cell: (org) => <Badge tone="neutral">{org.group_count.toLocaleString()}개</Badge>,
    },
    {
      id: 'created',
      header: '생성',
      sortValue: (org) => org.created_at,
      cell: (org) => timeAgo(org.created_at) || '시간 없음',
    },
    {
      id: 'delete',
      header: '',
      align: 'right',
      cell: (org) => (
        <Button size="sm" variant="danger" onClick={() => {
          setConfirming(org);
          setConfirmText('');
        }}>
          삭제
        </Button>
      ),
    },
  ], []);

  const closeCreate = () => {
    setOpen(false);
    setName('');
    setDescription('');
  };
  const submitCreate = () => {
    if (!validName) return;
    create.mutate(
      { name: name.trim(), description: description.trim() },
      { onSuccess: closeCreate },
    );
  };

  return (
    <SettingsNav title="조직">
      <Card
        title="조직"
        description="멤버와 그룹을 묶는 운영 단위입니다"
        actions={<Button variant="primary" leadingIcon={<PlusGlyph />} onClick={() => setOpen(true)} data-testid="new-org">조직 생성</Button>}
      >
        <Table
          rows={orgsQ.data ?? []}
          columns={columns}
          rowKey={(org) => org.org_id}
          loading={orgsQ.isPending}
          error={orgsQ.isError ? orgsQ.error : null}
          onRetry={() => void orgsQ.refetch()}
          empty={(
            <EmptyState
              icon={<OrgGlyph />}
              title="조직 없음"
              description="첫 조직을 만들면 멤버와 그룹을 연결할 수 있습니다"
              action={<Button size="sm" variant="primary" leadingIcon={<PlusGlyph />} onClick={() => setOpen(true)}>조직 생성</Button>}
            />
          )}
        />
      </Card>

      <Modal open={open} title="조직 생성" description="조직 이름은 같은 워크스페이스 안에서 고유해야 합니다" onOpenChange={setOpen}>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitCreate();
          }}
        >
          <Field
            label="이름"
            help="3~40자"
            error={duplicate ? '이미 사용 중인 조직 이름입니다' : undefined}
          >
            <Input value={name} minLength={3} maxLength={40} required onChange={(event) => setName(event.target.value)} data-testid="org-name" />
          </Field>
          <Field label="설명" help="선택 사항">
            <Input value={description} maxLength={200} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeCreate} disabled={create.isPending}>취소</Button>
            <Button type="submit" variant="primary" loading={create.isPending} disabled={!validName} data-testid="org-submit">생성</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirming)}
        title="조직 삭제"
        description="삭제하려면 조직 이름을 그대로 입력하세요"
        onOpenChange={(next) => {
          if (!next) setConfirming(null);
        }}
      >
        <div className="grid gap-4">
          <p className="text-body text-text-secondary">
            <span className="font-semibold text-text-primary">{confirming?.name}</span> 조직을 삭제합니다. 소속 그룹이 있으면 서버가 삭제를 차단합니다.
          </p>
          <Field label="확인 입력">
            <Input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={remove.isPending}>취소</Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              disabled={confirmText !== confirming?.name}
              onClick={() => confirming && remove.mutate(confirming.org_id, { onSettled: () => setConfirming(null) })}
            >
              삭제
            </Button>
          </div>
        </div>
      </Modal>
    </SettingsNav>
  );
}

function PlusGlyph() {
  return <span aria-hidden="true">+</span>;
}

function OrgGlyph() {
  return <span aria-hidden="true">ORG</span>;
}
