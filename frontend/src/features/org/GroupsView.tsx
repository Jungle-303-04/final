import { useState } from 'react';
import { useCreateGroup, useGroupMembers, useGroups, useOrgs, useToggleMembership, useUsers } from '@/features/org/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { Avatar, Button, Card, Drawer, Field, Modal, QueryBoundary, ResourceTable } from '@/shared/ui';
import type { Group } from '@/shared/lib/types';

export default function GroupsView() {
  const q = useGroups();
  const orgsQ = useOrgs();
  const create = useCreateGroup();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [orgId, setOrgId] = useState('');
  const [selected, setSelected] = useState<Group | null>(null);

  return (
    <SettingsNav title="그룹">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="primary" onClick={() => { setOpen(true); setOrgId(orgsQ.data?.[0]?.org_id ?? ''); }}>+ 그룹 생성</Button>
      </div>
      <Card>
        <QueryBoundary query={q}>{groups => (
          <ResourceTable<Group> rows={groups} rowKey={g => g.group_id} onRowClick={setSelected}
            columns={[
              { key: 'name', label: '이름', render: g => <b>{g.name}</b> },
              { key: 'org', label: '조직', render: g => orgsQ.data?.find(o => o.org_id === g.org_id)?.name ?? g.org_id },
              { key: 'members', label: '멤버', render: g => g.member_count },
            ]} />
        )}</QueryBoundary>
      </Card>
      <Modal open={open} title="그룹 생성" onClose={() => setOpen(false)}>
        <form onSubmit={e => { e.preventDefault(); create.mutate({ org_id: orgId, name }, { onSuccess: () => { setOpen(false); setName(''); } }); }}>
          <Field label="조직">
            <select className="input" value={orgId} onChange={e => setOrgId(e.target.value)} required>
              {(orgsQ.data ?? []).map(o => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
            </select>
          </Field>
          <Field label="이름"><input className="input" value={name} onChange={e => setName(e.target.value)} required /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" onClick={() => setOpen(false)}>취소</Button>
            <Button type="submit" variant="primary" loading={create.isPending}>생성</Button>
          </div>
        </form>
      </Modal>
      <Drawer open={!!selected} title={`그룹: ${selected?.name}`} onClose={() => setSelected(null)}>
        {selected && <GroupMembers group={selected} />}
      </Drawer>
    </SettingsNav>
  );
}

function GroupMembers({ group }: { group: Group }) {
  const members = useGroupMembers(group.group_id);
  const usersQ = useUsers();
  const toggle = useToggleMembership(group.group_id);
  const memberIds = new Set((members.data ?? []).map(m => m.user_id));
  return (
    <QueryBoundary query={usersQ}>{users => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(u => (
          <label key={u.user_id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--fs-sm)' }}>
            <input type="checkbox" checked={memberIds.has(u.user_id)}
              onChange={e => toggle.mutate({ userId: u.user_id, add: e.target.checked })} />
            <Avatar name={u.email} /> {u.email}
          </label>
        ))}
      </div>
    )}</QueryBoundary>
  );
}
