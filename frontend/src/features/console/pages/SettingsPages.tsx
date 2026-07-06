// Settings + Profile 그룹
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  FormField,
  InfoTip,
  Input,
  LinkTabList,
  Modal,
  PageHeader,
  SaveButton,
  SideNav,
  Switch,
  Table,
} from '@/plural-ui';
import { PlusIcon } from '@/plural-ui/icons';
import {
  CONSOLE_AUDITS,
  CONSOLE_GROUPS,
  CONSOLE_USERS,
  NOTIF_SINKS,
  PERSONAS,
  SERVICE_ACCOUNTS,
  WEBHOOKS,
} from '../api';
import { SimpleCreateModal } from '../flows';
import { BindingsEditor, GenericDetailModal, PermissionsModal } from '../popups';
import { useViewer } from '../viewer';

/* ── Settings 레이아웃 ────────────────── */
/* 기능 축(역할) 권한: 사용자 관리·전역 설정 메뉴는 해당 관리 기능이 있는 역할에게만 보인다 */
export function SettingsLayout() {
  const { role } = useViewer();
  const items = [
    ...(role.features.globalSettings ? [{ to: '/console/settings/global', label: '전역 설정' }] : []),
    ...(role.features.userManagement
      ? [{ to: '/console/settings/user-management', label: '사용자 관리' }]
      : []),
    { to: '/console/settings/ai', label: 'AI 설정' },
    { to: '/console/settings/projects', label: '프로젝트' },
    { to: '/console/settings/domains', label: '도메인' },
    { to: '/console/settings/webhooks', label: '웹훅' },
    { to: '/console/settings/notifications', label: '알림' },
    { to: '/console/settings/audits', label: '감사 로그' },
  ];
  return (
    <div className="pl-withsidenav">
      <SideNav items={items} />
      <div className="pl-sidenav-body">
        <Outlet />
      </div>
    </div>
  );
}

/* 기능 권한이 없는 역할이 URL로 직접 진입한 경우 (I5 — 숨김과 일관되게 차단) */
function FeatureDenied({ title, message }: { title: string; message: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <p className="pl-muted" style={{ margin: 0 }}>
          {message}
        </p>
      </Card>
    </>
  );
}

/* ── 전역 설정 ────────────────────────── */
export function GlobalSettings() {
  const { role } = useViewer();
  if (!role.features.globalSettings)
    return (
      <FeatureDenied
        title="전역 설정"
        message="전역 설정은 관리자 역할에게만 열려 있어요 — 역할은 설정 → 사용자 관리 → 역할에서 관리됩니다."
      />
    );
  return (
    <>
      <PageHeader title="전역 설정" sub="콘솔 전체에 적용되는 설정입니다." />
      <LinkTabList
        tabs={[
          { to: '/console/settings/global/general', label: '일반' },
          { to: '/console/settings/global/permissions', label: '권한' },
          { to: '/console/settings/global/repositories', label: '저장소' },
          { to: '/console/settings/global/observability', label: '관찰성' },
          { to: '/console/settings/global/oidc', label: 'OIDC' },
          { to: '/console/settings/global/smtp', label: 'SMTP' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function GlobalGeneral() {
  const [darkLogo, setDarkLogo] = useState(true);
  return (
    <Card>
      <FormField label="콘솔 이름">
        <Input value="jungle-console" />
      </FormField>
      <FormField label="다크 모드 로고 사용">
        <Switch checked={darkLogo} onChange={setDarkLogo} />
      </FormField>
      <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
        <SaveButton />
      </div>
    </Card>
  );
}

export function GlobalPermissions() {
  return (
    <Card>
      <div className="pl-row" style={{ marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>전역 기본 권한</span>
        <InfoTip>
          적용 순서: ① 리소스 직접 바인딩 → ② 소속 프로젝트 바인딩 → ③ 이 전역 기본. 아무 규칙도 없을
          때의 마지막 폴백입니다. 기능 권한(무엇을 할 수 있는가)은 사용자 관리 → 역할에서 관리해요.
        </InfoTip>
      </div>
      <BindingsEditor resource="전역 기본 권한" />
      <div className="pl-row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
        <SaveButton />
      </div>
    </Card>
  );
}

export function GlobalRepositories() {
  return (
    <Card>
      <FormField label="배포 저장소" hint="콘솔이 동기화하는 기본 저장소">
        <Input value="https://github.com/Jungle-303-04/final.git" />
      </FormField>
      <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
        <SaveButton />
      </div>
    </Card>
  );
}

export function GlobalObservability() {
  return (
    <Table headers={['제공자', '유형', '상태']}>
      <tr>
        <td style={{ fontWeight: 600 }}>Prometheus</td>
        <td>
          <Chip>메트릭</Chip>
        </td>
        <td>
          <Chip severity="success">연결됨</Chip>
        </td>
      </tr>
      <tr>
        <td style={{ fontWeight: 600 }}>Loki</td>
        <td>
          <Chip>로그</Chip>
        </td>
        <td>
          <Chip severity="success">연결됨</Chip>
        </td>
      </tr>
    </Table>
  );
}

export function GlobalOidc() {
  return (
    <Table headers={['제공자', 'Issuer', '상태']}>
      <tr>
        <td style={{ fontWeight: 600 }}>logo-oidc</td>
        <td>
          <span className="pl-code">https://oidc.logo.dev</span>
        </td>
        <td>
          <Chip severity="success">연결됨</Chip>
        </td>
      </tr>
    </Table>
  );
}

export function GlobalSmtp() {
  return (
    <Card>
      <FormField label="SMTP 서버">
        <Input placeholder="smtp.gmail.com" />
      </FormField>
      <FormField label="포트">
        <Input placeholder="587" />
      </FormField>
      <FormField label="발신자">
        <Input placeholder="console@jungle.dev" />
      </FormField>
      <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
        <SaveButton />
      </div>
    </Card>
  );
}

/* ── 사용자 관리 ──────────────────────── */
export function UserManagement() {
  const { role } = useViewer();
  if (!role.features.userManagement)
    return (
      <FeatureDenied
        title="사용자 관리"
        message="사용자 관리는 관리자 역할에게만 열려 있어요 — 필요하면 관리자에게 역할 부여를 요청하세요."
      />
    );
  return (
    <>
      <PageHeader title="사용자 관리" sub="사용자, 그룹, 서비스 계정, 페르소나를 관리합니다." />
      <LinkTabList
        tabs={[
          { to: '/console/settings/user-management/users', label: '사용자' },
          { to: '/console/settings/user-management/groups', label: '그룹' },
          { to: '/console/settings/user-management/service-accounts', label: '서비스 계정' },
          { to: '/console/settings/user-management/roles', label: '역할' },
          { to: '/console/settings/user-management/personas', label: '페르소나' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function ConsoleUsers() {
  const [editing, setEditing] = useState<(typeof CONSOLE_USERS)[number] | null>(null);
  const [admin, setAdmin] = useState(false);
  return (
    <>
      <Table headers={['사용자', '역할', '마지막 로그인', '']}>
        {CONSOLE_USERS.map((u) => (
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
              <Chip severity={u.role === '관리자' ? 'info' : 'neutral'}>{u.role}</Chip>
            </td>
            <td>{u.lastLogin}</td>
            <td>
              <div className="pl-rowactions">
                <Button
                  size="small"
                  onClick={() => {
                    setEditing(u);
                    setAdmin(u.role === '관리자');
                  }}
                >
                  편집
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
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
        <div className="pl-row pl-row--between">
          <span style={{ fontWeight: 600 }}>관리자 권한</span>
          <Switch checked={admin} onChange={setAdmin} />
        </div>
      </Modal>
    </>
  );
}

export function ConsoleGroups() {
  const [selectedGroup, setSelectedGroup] = useState<(typeof CONSOLE_GROUPS)[number] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <div className="pl-toolbar">
        <span />
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <PlusIcon size={14} /> 그룹 생성
        </Button>
      </div>
      <SimpleCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="그룹 생성"
        fields={[
          { label: '그룹 이름', placeholder: 'platform-team' },
          { label: '설명', placeholder: '그룹 설명' },
        ]}
      />
      <Table headers={['그룹', '설명', '멤버']}>
        {CONSOLE_GROUPS.map((g) => (
          <tr key={g.id} className="clickable" onClick={() => setSelectedGroup(g)}>
            <td style={{ fontWeight: 600 }}>{g.name}</td>
            <td>{g.description}</td>
            <td>{g.members}명</td>
          </tr>
        ))}
      </Table>
      {selectedGroup && (
        <GenericDetailModal
          title={`그룹 — ${selectedGroup.name}`}
          onClose={() => setSelectedGroup(null)}
          rows={[
            { label: '설명', value: selectedGroup.description },
            { label: '멤버', value: `${selectedGroup.members}명` },
            { label: '멤버 목록', value: selectedGroup.name === 'sre' ? '우녕, minmings, console-bot' : '개발자 8명' },
            { label: '바인딩', value: '알림 라우터 slack-alerts' },
          ]}
        />
      )}
    </>
  );
}

export function ConsoleServiceAccounts() {
  return (
    <Table headers={['서비스 계정', '토큰', '생성', '']}>
      {SERVICE_ACCOUNTS.map((s) => (
        <tr key={s.id}>
          <td>
            <div className="pl-cell">
              <div className="pl-avatar">{s.name[0]}</div>
              <div className="pl-owner">
                <div className="name">{s.name}</div>
                <div className="email">{s.email}</div>
              </div>
            </div>
          </td>
          <td>{s.tokens}개</td>
          <td>{s.createdAt}</td>
          <td>
            <div className="pl-rowactions">
              <Button size="small">토큰 발급</Button>
            </div>
          </td>
        </tr>
      ))}
    </Table>
  );
}

export function Personas() {
  const [selected, setSelected] = useState<(typeof PERSONAS)[number] | null>(null);
  return (
    <>
      <Table headers={['페르소나', '설명', '적용 대상']}>
        {PERSONAS.map((p) => (
          <tr key={p.id} className="clickable" onClick={() => setSelected(p)}>
            <td style={{ fontWeight: 600 }}>{p.name}</td>
            <td>{p.description}</td>
            <td>{p.members}명</td>
          </tr>
        ))}
      </Table>
      {selected && (
        <GenericDetailModal
          title={`페르소나 — ${selected.name}`}
          onClose={() => setSelected(null)}
          rows={[
            { label: '설명', value: selected.description },
            { label: '적용 대상', value: `${selected.members}명` },
            {
              label: '표시 메뉴',
              value: selected.name === 'platform-admin' ? '전체' : 'CD, 플로우, 쿠버네티스',
            },
            { label: '숨김 메뉴', value: selected.name === 'platform-admin' ? '없음' : '설정, 비용 관리' },
          ]}
        />
      )}
    </>
  );
}

/* ── AI 설정 ──────────────────────────── */
export function AiSettings() {
  const [insights, setInsights] = useState(true);
  return (
    <>
      <PageHeader title="AI 설정" sub="AI 제공자와 인사이트 기능을 구성합니다." />
      <div className="pl-stack">
        <Card>
          <FormField label="AI 제공자">
            <Input value="Anthropic (Claude)" />
          </FormField>
          <FormField label="API 키">
            <Input type="password" value="••••••••••••" />
          </FormField>
        </Card>
        <Card>
          <div className="pl-row pl-row--between">
            <div>
              <div style={{ fontWeight: 600 }}>AI 인사이트</div>
              <p className="pl-muted" style={{ marginTop: 4 }}>
                장애·드리프트에 대한 자동 분석을 생성합니다.
              </p>
            </div>
            <Switch checked={insights} onChange={setInsights} />
          </div>
        </Card>
      </div>
    </>
  );
}

/* ── 나머지 설정 ──────────────────────── */
const PROJECTS = [
  { name: 'default', description: '기본 프로젝트 — 미지정 리소스가 소속', isDefault: true, clusters: 18, groups: 'developers(읽기), sre(쓰기)' },
  { name: 'platform', description: '플랫폼 팀 전용 — mgmt·인프라 스택', isDefault: false, clusters: 2, groups: 'sre(쓰기)' },
];

export function ProjectsSettings() {
  const [createOpen, setCreateOpen] = useState(false);
  const [permsFor, setPermsFor] = useState<string | null>(null);
  return (
    <>
      <PageHeader
        title={
          <>
            프로젝트
            <InfoTip>
              팀 단위 리소스 스코프입니다. 클러스터·서비스·스택을 프로젝트에 소속시키면, 프로젝트에
              바인딩된 권한이 소속 리소스 전체에 상속됩니다.
            </InfoTip>
          </>
        }
        sub="팀 단위 리소스 스코프"
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} /> 프로젝트 생성
          </Button>
        }
      />
      <SimpleCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="프로젝트 생성"
        fields={[
          { label: '프로젝트 이름', placeholder: 'team-a' },
          { label: '설명', placeholder: '프로젝트 설명' },
          { label: '기본 그룹', placeholder: 'developers', hint: '이 프로젝트 리소스에 접근할 그룹' },
        ]}
      />
      <Table headers={['프로젝트', '설명', '소속 클러스터', '권한 바인딩', '', '']}>
        {PROJECTS.map((p) => (
          <tr key={p.name}>
            <td style={{ fontWeight: 600 }}>{p.name}</td>
            <td>{p.description}</td>
            <td>{p.clusters}개</td>
            <td>
              <span className="pl-muted">{p.groups}</span>
            </td>
            <td>{p.isDefault && <Chip severity="success">기본</Chip>}</td>
            <td>
              <div className="pl-rowactions">
                <Button size="small" onClick={() => setPermsFor(p.name)}>
                  권한
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {permsFor && <PermissionsModal resource={`프로젝트 ${permsFor}`} onClose={() => setPermsFor(null)} />}
    </>
  );
}

export function WebhooksSettings() {
  const [selectedWh, setSelectedWh] = useState<(typeof WEBHOOKS)[number] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="웹훅"
        sub="외부 시스템으로 이벤트를 전송합니다."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <PlusIcon size={14} /> 웹훅 생성
          </Button>
        }
      />
      <SimpleCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="웹훅 생성"
        fields={[
          { label: '이름', placeholder: 'teams-notify' },
          { label: 'URL', placeholder: 'https://hooks.example.com/…' },
          { label: '이벤트', placeholder: 'deploy.completed, alert.fired', hint: '쉼표로 구분' },
          { label: '시크릿', placeholder: 'HMAC 서명 시크릿', password: true },
        ]}
      />
      <Table headers={['웹훅', 'URL', '이벤트', '생성']}>
        {WEBHOOKS.map((w) => (
          <tr key={w.id} className="clickable" onClick={() => setSelectedWh(w)}>
            <td style={{ fontWeight: 600 }}>{w.name}</td>
            <td>
              <span className="pl-code">{w.url}</span>
            </td>
            <td>
              <Chip>{w.events}</Chip>
            </td>
            <td>{w.createdAt}</td>
          </tr>
        ))}
      </Table>
      {selectedWh && (
        <GenericDetailModal
          title={`웹훅 — ${selectedWh.name}`}
          onClose={() => setSelectedWh(null)}
          rows={[
            { label: 'URL', value: <span className="pl-code">{selectedWh.url}</span> },
            { label: '이벤트', value: <Chip>{selectedWh.events}</Chip> },
            { label: '생성', value: selectedWh.createdAt },
            { label: '최근 발송', value: '2시간 전 — 200 OK' },
            { label: '실패율 (7일)', value: '0%' },
          ]}
        />
      )}
    </>
  );
}

export function NotificationsSettings() {
  const [selectedSink, setSelectedSink] = useState<(typeof NOTIF_SINKS)[number] | null>(null);
  return (
    <>
      <PageHeader title="알림" sub="알림 라우터와 싱크를 구성합니다." />
      <Table headers={['싱크', '유형', '대상', '생성']}>
        {NOTIF_SINKS.map((n) => (
          <tr key={n.id} className="clickable" onClick={() => setSelectedSink(n)}>
            <td style={{ fontWeight: 600 }}>{n.name}</td>
            <td>
              <Chip>{n.type}</Chip>
            </td>
            <td>
              <span className="pl-code">{n.target}</span>
            </td>
            <td>{n.createdAt}</td>
          </tr>
        ))}
      </Table>
      {selectedSink && (
        <GenericDetailModal
          title={`알림 싱크 — ${selectedSink.name}`}
          onClose={() => setSelectedSink(null)}
          rows={[
            { label: '유형', value: <Chip>{selectedSink.type}</Chip> },
            { label: '대상', value: <span className="pl-code">{selectedSink.target}</span> },
            { label: '생성', value: selectedSink.createdAt },
            { label: '라우팅 이벤트', value: 'alert.fired, deploy.failed, pr.created' },
            { label: '최근 발송', value: 'PodCrashLooping (12분 전)' },
          ]}
        />
      )}
    </>
  );
}

export function ConsoleAudits() {
  return (
    <>
      <PageHeader title="감사 로그" sub="플랫폼 내 모든 활동 기록입니다." />
      <LinkTabList
        tabs={[
          { to: '/console/settings/audits/logs', label: '활동' },
          { to: '/console/settings/audits/logins', label: '로그인' },
          { to: '/console/settings/audits/geo', label: '지역 분포' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function AuditsActivity() {
  const [selectedAudit, setSelectedAudit] = useState<(typeof CONSOLE_AUDITS)[number] | null>(null);
  return (
    <>
      <Table headers={['액션', '행위자', 'IP', '위치', '시간']}>
        {CONSOLE_AUDITS.map((a) => (
          <tr key={a.id} className="clickable" onClick={() => setSelectedAudit(a)}>
            <td>
              <span className="pl-code">{a.action}</span>
            </td>
            <td>{a.actor}</td>
            <td>{a.ip}</td>
            <td>{a.location}</td>
            <td>{a.time}</td>
          </tr>
        ))}
      </Table>
      {selectedAudit && (
        <GenericDetailModal
          title="감사 로그 상세"
          onClose={() => setSelectedAudit(null)}
          rows={[
            { label: '액션', value: <span className="pl-code">{selectedAudit.action}</span> },
            { label: '행위자', value: selectedAudit.actor },
            { label: 'IP', value: selectedAudit.ip },
            { label: '위치', value: selectedAudit.location },
            { label: '시간', value: selectedAudit.time },
            { label: '연관 리소스', value: selectedAudit.action.includes('PR') ? 'PR#128 / dashboard-worker' : selectedAudit.action.includes('stack') ? 'aws-network / run-292' : '—' },
          ]}
        />
      )}
    </>
  );
}

/* ── Profile ──────────────────────────── */
export function ConsoleProfile() {
  return (
    <>
      <PageHeader title="프로필" sub="콘솔 사용자 프로필입니다." />
      <Card>
        <div className="pl-row" style={{ marginBottom: 24 }}>
          <div className="pl-avatar" style={{ width: 48, height: 48, fontSize: 20 }}>
            W
          </div>
          <div className="pl-owner">
            <div className="name" style={{ fontSize: 16 }}>
              우녕
            </div>
            <div className="email">woonyong.dev@gmail.com</div>
          </div>
        </div>
        <FormField label="이름">
          <Input value="우녕" />
        </FormField>
        <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
          <SaveButton />
        </div>
      </Card>
    </>
  );
}
