import { useState } from 'react';
import { useCreateOrg, useDeleteOrg, useOrgs } from '@/features/org/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { Button, Card, EmptyState, Field, Modal, QueryBoundary, ResourceTable } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/format';
import { IconFile, IconPlus } from '@/shared/ui/icons';
import type { Org } from '@/shared/lib/types';

export default function OrganizationsView() {
  const q = useOrgs();
  const create = useCreateOrg();
  const remove = useDeleteOrg();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [confirming, setConfirming] = useState<Org | null>(null);
  const [confirmText, setConfirmText] = useState('');

  return (
    <SettingsNav title="조직">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="primary" onClick={() => setOpen(true)} data-testid="new-org"><IconPlus size={15} />조직 생성</Button>
      </div>
      <Card>
        <QueryBoundary query={q}>{orgs => (
          <ResourceTable<Org> rows={orgs} rowKey={o => o.org_id}
            empty={<EmptyState icon={<IconFile size={26} />} title="아직 조직이 없습니다" action={<Button variant="primary" onClick={() => setOpen(true)}><IconPlus size={15} />첫 조직 만들기</Button>} />}
            columns={[
              { key: 'name', label: '이름', render: o => <b>{o.name}</b> },
              { key: 'desc', label: '설명', render: o => o.description || '—' },
              { key: 'members', label: '멤버', render: o => o.member_count },
              { key: 'groups', label: '그룹', render: o => o.group_count },
              { key: 'at', label: '생성', render: o => timeAgo(o.created_at) },
              { key: 'del', label: '', render: o => <Button size="sm" variant="danger" onClick={() => { setConfirming(o); setConfirmText(''); }}>삭제</Button> },
            ]} />
        )}</QueryBoundary>
      </Card>
      <Modal open={open} title="조직 생성" onClose={() => setOpen(false)}>
        <form onSubmit={e => { e.preventDefault(); create.mutate({ name, description: desc }, { onSuccess: () => { setOpen(false); setName(''); setDesc(''); } }); }}>
          <Field label="이름 (3~40자)"><input className="input" value={name} onChange={e => setName(e.target.value)} minLength={3} maxLength={40} required data-testid="org-name" /></Field>
          <Field label="설명"><input className="input" value={desc} onChange={e => setDesc(e.target.value)} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" onClick={() => setOpen(false)}>취소</Button>
            <Button type="submit" variant="primary" loading={create.isPending} data-testid="org-submit">생성</Button>
          </div>
        </form>
      </Modal>
      <Modal open={!!confirming} title="조직 삭제" onClose={() => setConfirming(null)}>
        <p style={{ fontSize: 'var(--fs-sm)' }}>삭제하려면 조직 이름 <b>{confirming?.name}</b> 을 입력하세요.</p>
        <input className="input" value={confirmText} onChange={e => setConfirmText(e.target.value)} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <Button onClick={() => setConfirming(null)}>취소</Button>
          <Button variant="danger" disabled={confirmText !== confirming?.name}
            onClick={() => confirming && remove.mutate(confirming.org_id, { onSettled: () => setConfirming(null) })}>삭제</Button>
        </div>
      </Modal>
    </SettingsNav>
  );
}
