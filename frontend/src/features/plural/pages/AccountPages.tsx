// Account 그룹: users(+invites), groups, service-accounts, roles, domains, billing(+payments)
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  ConfirmModal,
  DetailModal,
  EmptyState,
  FormField,
  IconFrame,
  InfoTip,
  Input,
  LinkTabList,
  Modal,
  PageHeader,
  SaveButton,
  SearchInput,
  SideNav,
  Switch,
  Table,
} from '@/plural-ui';
import { PeopleIcon, PlusIcon, TrashIcon } from '@/plural-ui/icons';
import { DOMAINS, GROUPS, INVITES, ROLES, USERS, type Domain, type Group, type Invite, type Role, type User } from '../mock';

/* ── Account 레이아웃 (세로 서브내비) ─── */
export function AccountLayout() {
  return (
    <div className="pl-withsidenav">
      <SideNav
        items={[
          { to: '/plural/account/edit', label: '계정 설정' },
          { to: '/plural/account/users', label: '사용자' },
          { to: '/plural/account/groups', label: '그룹' },
          { to: '/plural/account/service-accounts', label: '서비스 계정' },
          { to: '/plural/account/roles', label: '역할' },
          { to: '/plural/account/domains', label: '도메인' },
          { to: '/plural/account/billing', label: '배포' },
        ]}
      />
      <div className="pl-sidenav-body">
        <Outlet />
      </div>
    </div>
  );
}

/* ── 계정 설정 ────────────────────────── */
export function AccountAttributes() {
  const [name, setName] = useState('Jungle-303-04');

  return (
    <>
      <PageHeader title="계정 설정" sub="조직 계정 속성을 관리합니다." />
      <Card>
        <FormField label="계정 이름">
          <Input value={name} onChange={setName} />
        </FormField>
        <FormField label="도메인 자동 가입" hint="이 도메인의 이메일은 자동으로 계정에 합류합니다.">
          <Input placeholder="jungle.dev" />
        </FormField>
        <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
          <SaveButton />
        </div>
      </Card>
    </>
  );
}

/* ── 사용자 초대 모달 ─────────────────── */
function InviteModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [email, setEmail] = useState('');
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="사용자 초대"
      actions={
        <>
          <Button onClick={onClose}>취소</Button>
          <Button variant="primary" disabled={!email} onClick={onClose}>
            초대 보내기
          </Button>
        </>
      }
    >
      <FormField label="이메일 주소">
        <Input value={email} onChange={setEmail} placeholder="teammate@example.com" />
      </FormField>
    </Modal>
  );
}

/* ── 사용자 ───────────────────────────── */
export function UsersPage() {
  return (
    <>
      <PageHeader title="사용자" sub="계정의 사용자와 초대를 관리합니다." />
      <LinkTabList
        tabs={[
          { to: '/plural/account/users', label: '사용자', end: true },
          { to: '/plural/account/users/invites', label: '초대' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function UsersList() {
  const [q, setQ] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const rows = USERS.filter((u) => u.email.includes(q) || u.name.includes(q));

  return (
    <>
      <div className="pl-toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="사용자 검색" />
        <Button variant="primary" onClick={() => setInviteOpen(true)}>
          <PlusIcon size={14} /> 사용자 초대
        </Button>
      </div>
      <Table headers={['사용자', '그룹', '권한', '']}>
        {rows.map((u) => (
          <tr key={u.id}>
            <td>
              <div className="pl-cell">
                <div className="pl-avatar">{u.name[0]}</div>
                <div className="pl-owner">
                  <div className="name">{u.name}</div>
                  <div className="email">{u.email}</div>
                </div>
              </div>
            </td>
            <td>
              <div className="pl-row">
                {u.groups.map((g) => (
                  <Chip key={g}>{g}</Chip>
                ))}
              </div>
            </td>
            <td>{u.admin ? <Chip severity="info">관리자</Chip> : <Chip>멤버</Chip>}</td>
            <td>
              <div className="pl-rowactions">
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(u);
                    setIsAdmin(u.admin);
                  }}
                >
                  편집
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={`사용자 편집 — ${editing?.name ?? ''}`}
        actions={
          <>
            <Button onClick={() => setEditing(null)}>취소</Button>
            <Button variant="primary" onClick={() => setEditing(null)}>
              저장
            </Button>
          </>
        }
      >
        <FormField label="이름">
          <Input value={editing?.name ?? ''} />
        </FormField>
        <FormField label="이메일">
          <Input value={editing?.email ?? ''} disabled />
        </FormField>
        <FormField label="그룹">
          <div className="pl-row">
            {editing?.groups.map((g) => (
              <Chip key={g}>{g}</Chip>
            ))}
            <Button size="small">그룹 추가</Button>
          </div>
        </FormField>
        <div className="pl-row pl-row--between">
          <span style={{ fontWeight: 600 }}>관리자 권한</span>
          <Switch checked={isAdmin} onChange={setIsAdmin} />
        </div>
      </Modal>
    </>
  );
}

export function InvitesPage() {
  const [revoking, setRevoking] = useState<Invite | null>(null);
  if (INVITES.length === 0) return <EmptyState title="대기 중인 초대가 없습니다" />;
  return (
    <>
      <Table headers={['이메일', '생성일', '']}>
        {INVITES.map((i) => (
          <tr key={i.id}>
            <td>{i.email}</td>
            <td>{i.createdAt}</td>
            <td>
              <div className="pl-rowactions">
                <Button size="small" destructive onClick={() => setRevoking(i)}>
                  <TrashIcon size={13} /> 철회
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <ConfirmModal
        open={revoking !== null}
        title="초대 철회"
        message={`${revoking?.email ?? ''} 님에게 보낸 초대를 철회할까요? 초대 링크가 즉시 무효화됩니다.`}
        confirmLabel="철회"
        destructive
        onConfirm={() => {}}
        onClose={() => setRevoking(null)}
      />
    </>
  );
}

/* ── 그룹 ─────────────────────────────── */
export function GroupsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [viewing, setViewing] = useState<Group | null>(null);

  return (
    <>
      <PageHeader
        title="그룹"
        sub="사용자를 그룹으로 묶어 권한을 관리합니다."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} /> 그룹 생성
          </Button>
        }
      />
      <Table headers={['그룹', '설명', '멤버', '']}>
        {GROUPS.map((g) => (
          <tr key={g.id} className="clickable" onClick={() => setViewing(g)}>
            <td>
              <div className="pl-cell">
                <IconFrame size="md">
                  <PeopleIcon />
                </IconFrame>
                {g.name}
              </div>
            </td>
            <td>{g.description}</td>
            <td>{g.members}명</td>
            <td>
              <div className="pl-rowactions">
                <Button size="small" onClick={() => setViewing(g)}>
                  편집
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {viewing && (
        <DetailModal
          title={`그룹 — ${viewing.name}`}
          onClose={() => setViewing(null)}
          rows={[
            { label: '설명', value: viewing.description },
            { label: '멤버', value: `${viewing.members}명` },
            {
              label: '멤버 목록',
              value: viewing.name === 'admins' ? '우녕' : 'cluster01-cloud-sa, cluster02-cloud-sa',
            },
          ]}
        >
          <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
            <Button size="small">멤버 추가</Button>
          </div>
        </DetailModal>
      )}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="그룹 생성"
        actions={
          <>
            <Button onClick={() => setCreateOpen(false)}>취소</Button>
            <Button variant="primary" disabled={!name} onClick={() => setCreateOpen(false)}>
              생성
            </Button>
          </>
        }
      >
        <FormField label="그룹 이름">
          <Input value={name} onChange={setName} placeholder="developers" />
        </FormField>
        <FormField label="설명">
          <Input placeholder="그룹 설명" />
        </FormField>
      </Modal>
    </>
  );
}

/* ── 서비스 계정 ──────────────────────── */
export function ServiceAccountsPage() {
  const svc = USERS.filter((u) => u.groups.includes('service'));
  const [tokenFor, setTokenFor] = useState<User | null>(null);
  const [createSaOpen, setCreateSaOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="서비스 계정"
        sub="자동화를 위한 비인간 계정입니다."
        actions={
          <Button variant="primary" onClick={() => setCreateSaOpen(true)}>
            <PlusIcon size={14} /> 서비스 계정 생성
          </Button>
        }
      />
      <Modal
        open={createSaOpen}
        onClose={() => setCreateSaOpen(false)}
        title="서비스 계정 생성"
        actions={
          <>
            <Button onClick={() => setCreateSaOpen(false)}>취소</Button>
            <Button variant="primary" onClick={() => setCreateSaOpen(false)}>
              생성
            </Button>
          </>
        }
      >
        <FormField label="계정 이름">
          <Input placeholder="ci-bot" />
        </FormField>
        <FormField label="소속 그룹">
          <Input value="service" />
        </FormField>
        <FormField label="설명">
          <Input placeholder="CI 파이프라인용 계정" />
        </FormField>
      </Modal>
      <Table headers={['계정', '', '']}>
        {svc.map((u) => (
          <tr key={u.id}>
            <td>
              <div className="pl-cell">
                <div className="pl-avatar">{u.name[0]}</div>
                <div className="pl-owner">
                  <div className="name">{u.name}</div>
                  <div className="email">{u.email}</div>
                </div>
              </div>
            </td>
            <td>
              <Chip>서비스</Chip>
            </td>
            <td>
              <div className="pl-rowactions">
                <Button size="small" onClick={() => setTokenFor(u)}>
                  토큰 발급
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Modal
        open={tokenFor !== null}
        onClose={() => setTokenFor(null)}
        title={`토큰 발급 — ${tokenFor?.name ?? ''}`}
        actions={
          <Button variant="primary" onClick={() => setTokenFor(null)}>
            확인
          </Button>
        }
      >
        <p style={{ marginTop: 0 }}>이 토큰은 지금만 확인할 수 있어요. 안전한 곳에 보관하세요.</p>
        <div className="pl-codeblock">logo-svc-4c8d-22ab-91ee-x7f2</div>
      </Modal>
    </>
  );
}

/* ── 역할 ─────────────────────────────── */
export function RolesPage() {
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPerms, setNewPerms] = useState<string[]>(['설치']);
  const togglePerm = (p: string) =>
    setNewPerms((v) => (v.includes(p) ? v.filter((x) => x !== p) : [...v, p]));
  return (
    <>
      <PageHeader
        title={
          <>
            역할
            <InfoTip>
              콘솔 기능 권한(무엇을 할 수 있는가)을 정의합니다. 특정 리소스에 대한 접근 권한(볼/바꿀 수
              있는가)은 각 리소스의 권한 버튼에서 바인딩해요.
            </InfoTip>
          </>
        }
        sub="콘솔 기능 권한을 정의합니다"
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} /> 역할 생성
          </Button>
        }
      />
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="역할 생성"
        actions={
          <>
            <Button onClick={() => setCreateOpen(false)}>취소</Button>
            <Button variant="primary" onClick={() => setCreateOpen(false)}>
              생성
            </Button>
          </>
        }
      >
        <FormField label="역할 이름">
          <Input placeholder="deployer" />
        </FormField>
        <FormField label="설명">
          <Input placeholder="배포 권한만 가진 역할" />
        </FormField>
        <FormField label="권한" hint="클릭해서 켜고 끕니다.">
          <div className="pl-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {['설치', '배포', '사용자', '지원', '통합', '퍼블리시'].map((p) => (
              <button key={p} type="button" style={{ all: 'unset', cursor: 'pointer' }} onClick={() => togglePerm(p)}>
                <Chip severity={newPerms.includes(p) ? 'info' : 'neutral'}>{p}</Chip>
              </button>
            ))}
          </div>
        </FormField>
        <FormField label="바인딩 대상">
          <Input placeholder="developers (그룹) 또는 이메일" />
        </FormField>
      </Modal>
      <Table headers={['역할', '설명', '권한', '']}>
        {ROLES.map((r) => (
          <tr key={r.id}>
            <td style={{ fontWeight: 600 }}>{r.name}</td>
            <td>{r.description}</td>
            <td>
              <div className="pl-row" style={{ flexWrap: 'wrap', gap: 4 }}>
                {r.permissions.map((p) => (
                  <Chip key={p}>{p}</Chip>
                ))}
              </div>
            </td>
            <td>
              <div className="pl-rowactions">
                <Button size="small" onClick={() => setEditingRole(r)}>
                  편집
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Modal
        open={editingRole !== null}
        onClose={() => setEditingRole(null)}
        title={`역할 편집 — ${editingRole?.name ?? ''}`}
        actions={
          <>
            <Button onClick={() => setEditingRole(null)}>취소</Button>
            <Button variant="primary" onClick={() => setEditingRole(null)}>
              저장
            </Button>
          </>
        }
      >
        <FormField label="설명">
          <Input value={editingRole?.description ?? ''} />
        </FormField>
        <FormField label="권한" hint="클릭해서 권한을 켜고 끕니다 (mock).">
          <div className="pl-row" style={{ flexWrap: 'wrap', gap: 6 }}>
            {['설치', '배포', '사용자', '지원', '통합', '퍼블리시'].map((p) => (
              <Chip key={p} severity={editingRole?.permissions.includes(p) ? 'info' : 'neutral'}>
                {p}
              </Chip>
            ))}
          </div>
        </FormField>
      </Modal>
    </>
  );
}

/* ── 도메인 ───────────────────────────── */
export function DomainsPage() {
  const [deleting, setDeleting] = useState<Domain | null>(null);
  return (
    <>
      <PageHeader title="도메인" sub="계정이 소유한 DNS 도메인입니다." />
      <Table headers={['도메인', '생성자', '생성일', '']}>
        {DOMAINS.map((d) => (
          <tr key={d.id}>
            <td>
              <span className="pl-code">{d.domain}</span>
            </td>
            <td>{d.creator}</td>
            <td>{d.createdAt}</td>
            <td>
              <div className="pl-rowactions">
                <Button size="small" destructive onClick={() => setDeleting(d)}>
                  <TrashIcon size={13} /> 삭제
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <ConfirmModal
        open={deleting !== null}
        title="도메인 삭제"
        message={
          <span>
            <span className="pl-code">{deleting?.domain}</span> 도메인을 삭제할까요? 이 도메인을 사용하는
            서비스의 DNS가 즉시 해제됩니다.
          </span>
        }
        confirmLabel="삭제"
        destructive
        onConfirm={() => {}}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

/* ── 청구 ─────────────────────────────── */
export function BillingLayout() {
  return (
    <>
      <PageHeader title="청구" sub="플랜과 결제 수단을 관리합니다." />
      <LinkTabList
        tabs={[
          { to: '/plural/account/billing', label: '플랜 관리', end: true },
          { to: '/plural/account/billing/payments', label: '결제', end: true },
        ]}
      />
      <Outlet />
    </>
  );
}

export function BillingManagePlan() {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  return (
    <>
      <div className="pl-grid-cards">
        <Card>
          <div className="pl-row pl-row--between">
            <div style={{ fontWeight: 600 }}>무료 체험</div>
            <Chip severity="warning">27일 남음</Chip>
          </div>
          <p className="pl-sub" style={{ margin: '12px 0' }}>
            체험 기간 동안 Pro 기능을 모두 사용할 수 있어요.
          </p>
          <Button variant="primary" onClick={() => setUpgradeOpen(true)}>
            지금 업그레이드
          </Button>
        </Card>
        <Card>
          <div style={{ fontWeight: 600 }}>Pro 플랜</div>
          <p className="pl-sub" style={{ margin: '12px 0' }}>
            클러스터당 $399/월 · 무제한 사용자 · 프리미엄 지원
          </p>
          <Button onClick={() => setCompareOpen(true)}>플랜 비교</Button>
        </Card>
      </div>
      <Modal
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        title="Pro로 업그레이드"
        actions={
          <>
            <Button onClick={() => setUpgradeOpen(false)}>취소</Button>
            <Button variant="primary" onClick={() => setUpgradeOpen(false)}>
              결제 진행 (mock)
            </Button>
          </>
        }
      >
        <FormField label="플랜">
          <Input value="Pro — 클러스터당 $399/월" />
        </FormField>
        <FormField label="결제 수단">
          <Input value="Visa •••• 6411" />
        </FormField>
        <p className="pl-muted" style={{ margin: 0 }}>
          지금 업그레이드하면 체험 잔여 27일이 크레딧으로 이월됩니다.
        </p>
      </Modal>
      <Modal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        size="large"
        title="플랜 비교"
        actions={<Button onClick={() => setCompareOpen(false)}>닫기</Button>}
      >
        <Table headers={['기능', 'Free', 'Pro', 'Enterprise']}>
          {[
            { f: '클러스터', a: '1개', b: '무제한', c: '무제한' },
            { f: '사용자', a: '5명', b: '무제한', c: '무제한' },
            { f: 'AI 인사이트', a: '—', b: '포함', c: '포함' },
            { f: 'SLA 지원', a: '—', b: '업무시간', c: '24/7' },
            { f: 'SSO/OIDC', a: '—', b: '포함', c: '포함 + SCIM' },
          ].map((r) => (
            <tr key={r.f}>
              <td style={{ fontWeight: 600 }}>{r.f}</td>
              <td>{r.a}</td>
              <td>{r.b}</td>
              <td>{r.c}</td>
            </tr>
          ))}
        </Table>
      </Modal>
    </>
  );
}

export function BillingPayments() {
  return (
    <div className="pl-stack">
      <Table headers={['결제 수단', '만료', '기본', '']}>
        <tr>
          <td>
            <div className="pl-cell">💳 Visa •••• 6411</div>
          </td>
          <td>2028/04</td>
          <td>
            <Chip severity="success">기본</Chip>
          </td>
          <td>
            <div className="pl-rowactions">
              <Button size="small">편집</Button>
            </div>
          </td>
        </tr>
      </Table>
      <Table headers={['청구서', '기간', '금액', '상태']}>
        {[
          { id: 'INV-2026-07', period: '2026년 7월', amount: '$0.00 (무료 체험)', status: '발행 예정' },
          { id: 'INV-2026-06', period: '2026년 6월', amount: '$0.00 (무료 체험)', status: '결제 완료' },
        ].map((inv) => (
          <tr key={inv.id}>
            <td>
              <span className="pl-code">{inv.id}</span>
            </td>
            <td>{inv.period}</td>
            <td>{inv.amount}</td>
            <td>
              <Chip severity={inv.status === '결제 완료' ? 'success' : 'neutral'}>{inv.status}</Chip>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
