import { useState } from 'react';
import { useGrantAccess, useGrants, useGroups, useRevokeAccess, useUsers } from '@/features/org/api';
import { useClusters } from '@/features/cluster/api';
import { useApplications } from '@/features/repo/api';
import { SettingsNav } from '@/features/org/SettingsNav';
import { Badge, Button, Card, Field, Modal, QueryBoundary, ResourceTable } from '@/shared/ui';
import { timeAgo } from '@/shared/lib/format';

const ROLES = [
  ['observer', '읽기 전용'], ['release_operator', '배포 실행'], ['cluster_steward', '위험 명령 승인'],
] as const;

export default function AccessView() {
  const q = useGrants();
  const grant = useGrantAccess();
  const revoke = useRevokeAccess();
  const usersQ = useUsers(); const groupsQ = useGroups();
  const clustersQ = useClusters(); const appsQ = useApplications();
  const [open, setOpen] = useState(false);
  const [subjectType, setSubjectType] = useState<'user' | 'group'>('group');
  const [subjectId, setSubjectId] = useState('');
  const [resourceType, setResourceType] = useState('cluster');
  const [resourceId, setResourceId] = useState('');
  const [role, setRole] = useState<string>('observer');

  const subjects = subjectType === 'user' ? (usersQ.data ?? []).map(u => [u.user_id, u.email]) : (groupsQ.data ?? []).map(g => [g.group_id, g.name]);
  const targets = resourceType === 'cluster' ? (clustersQ.data ?? []).map(c => [c.cluster_id, c.name]) : (appsQ.data ?? []).map(a => [a.application_id, a.name]);

  return (
    <SettingsNav title="리소스 권한">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button variant="primary" onClick={() => setOpen(true)}>+ 권한 부여</Button>
      </div>
      <Card>
        <QueryBoundary query={q}>{grants => (
          <ResourceTable rows={grants} rowKey={g => g.access_id}
            columns={[
              { key: 'subject', label: '대상', render: g => <span><Badge tone="neutral">{g.subject_type}</Badge> {g.subject_label}</span> },
              { key: 'resource', label: '리소스', render: g => <code>{g.resource_type}/{g.resource_id}</code> },
              { key: 'role', label: '역할', render: g => <Badge tone="info">{g.role}</Badge> },
              { key: 'at', label: '부여', render: g => timeAgo(g.granted_at) },
              { key: 'del', label: '', render: g => <Button size="sm" variant="danger" onClick={() => revoke.mutate(g.access_id)}>회수</Button> },
            ]} />
        )}</QueryBoundary>
      </Card>
      <Modal open={open} title="권한 부여" onClose={() => setOpen(false)}>
        <form onSubmit={e => {
          e.preventDefault();
          grant.mutate({ subject_type: subjectType, subject_id: subjectId, subject_label: subjects.find(s => s[0] === subjectId)?.[1], resource_type: resourceType, resource_id: resourceId, role }, { onSuccess: () => setOpen(false) });
        }}>
          <Field label="대상 유형">
            <select className="input" value={subjectType} onChange={e => { setSubjectType(e.target.value as 'user' | 'group'); setSubjectId(''); }}>
              <option value="group">그룹</option><option value="user">사용자</option>
            </select>
          </Field>
          <Field label="대상">
            <select className="input" value={subjectId} onChange={e => setSubjectId(e.target.value)} required>
              <option value="">선택…</option>
              {subjects.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field label="리소스 유형">
            <select className="input" value={resourceType} onChange={e => { setResourceType(e.target.value); setResourceId(''); }}>
              <option value="cluster">클러스터</option><option value="application">애플리케이션</option>
            </select>
          </Field>
          <Field label="리소스">
            <select className="input" value={resourceId} onChange={e => setResourceId(e.target.value)} required>
              <option value="">선택…</option>
              {targets.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field label="역할">
            <select className="input" value={role} onChange={e => setRole(e.target.value)}>
              {ROLES.map(([v, l]) => <option key={v} value={v} title={l}>{v} — {l}</option>)}
            </select>
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" onClick={() => setOpen(false)}>취소</Button>
            <Button type="submit" variant="primary" loading={grant.isPending}>부여</Button>
          </div>
        </form>
      </Modal>
    </SettingsNav>
  );
}
