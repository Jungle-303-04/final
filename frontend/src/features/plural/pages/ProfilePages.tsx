// Profile 그룹: me, security, tokens, encryption-keys, keys, eab
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  ConfirmModal,
  FormField,
  Input,
  Modal,
  PageHeader,
  SaveButton,
  SideNav,
  Switch,
  Table,
} from '@/plural-ui';
import { CopyIcon, KeyIcon, PlusIcon, ShieldIcon, TrashIcon } from '@/plural-ui/icons';
import { ACCESS_TOKENS, CURRENT_USER, PUBLIC_KEYS, type AccessToken, type PublicKey } from '../mock';

export function ProfileLayout() {
  return (
    <div className="pl-withsidenav">
      <SideNav
        items={[
          { to: '/console/profile/me', label: '프로필' },
          { to: '/console/profile/security', label: '보안' },
          { to: '/console/profile/tokens', label: '액세스 토큰' },
          { to: '/console/profile/encryption-keys', label: '암호화 키' },
          { to: '/console/profile/keys', label: '공개 키' },
          { to: '/console/profile/eab', label: 'EAB 자격 증명' },
        ]}
      />
      <div className="pl-sidenav-body">
        <Outlet />
      </div>
    </div>
  );
}

export function ProfileMe() {
  const [name, setName] = useState(CURRENT_USER.name);

  return (
    <>
      <PageHeader title="프로필" sub="개인 정보를 관리합니다." />
      <Card>
        <div className="pl-row" style={{ marginBottom: 24 }}>
          <div className="pl-avatar" style={{ width: 48, height: 48, fontSize: 20 }}>
            {CURRENT_USER.avatar}
          </div>
          <div className="pl-owner">
            <div className="name" style={{ fontSize: 16 }}>
              {CURRENT_USER.name}
            </div>
            <div className="email">{CURRENT_USER.email}</div>
          </div>
        </div>
        <FormField label="이름">
          <Input value={name} onChange={setName} />
        </FormField>
        <FormField label="이메일">
          <Input value={CURRENT_USER.email} disabled />
        </FormField>
        <div className="pl-row" style={{ justifyContent: 'flex-end' }}>
          <SaveButton />
        </div>
      </Card>
    </>
  );
}

export function ProfileSecurity() {
  const [mfa, setMfa] = useState(false);

  return (
    <>
      <PageHeader title="보안" sub="로그인 방식과 2단계 인증을 관리합니다." />
      <div className="pl-stack">
        <Card>
          <div className="pl-row pl-row--between">
            <div>
              <div style={{ fontWeight: 600 }}>로그인 방식</div>
              <p className="pl-muted" style={{ marginTop: 4 }}>
                {CURRENT_USER.provider} 계정으로 로그인 중
              </p>
            </div>
            <Chip severity="info">{CURRENT_USER.provider}</Chip>
          </div>
        </Card>
        <Card>
          <div className="pl-row pl-row--between">
            <div>
              <div className="pl-row" style={{ fontWeight: 600 }}>
                <ShieldIcon size={14} /> 2단계 인증 (TOTP)
              </div>
              <p className="pl-muted" style={{ marginTop: 4 }}>
                인증 앱을 통한 일회용 코드 사용
              </p>
            </div>
            <Switch checked={mfa} onChange={setMfa} />
          </div>
        </Card>
        <Card>
          <div className="pl-row pl-row--between">
            <div>
              <div style={{ fontWeight: 600 }}>비밀번호 변경</div>
              <p className="pl-muted" style={{ marginTop: 4 }}>
                OAuth 로그인 계정은 비밀번호가 없습니다.
              </p>
            </div>
            <Button disabled>변경</Button>
          </div>
        </Card>
      </div>
    </>
  );
}

export function AccessTokens() {
  const [createdOpen, setCreatedOpen] = useState(false);
  const [revoking, setRevoking] = useState<AccessToken | null>(null);

  return (
    <>
      <PageHeader
        title="액세스 토큰"
        sub="API와 CLI 인증에 사용하는 토큰입니다."
        actions={
          <Button variant="primary" onClick={() => setCreatedOpen(true)}>
            <PlusIcon size={14} /> 토큰 생성
          </Button>
        }
      />
      <Table headers={['토큰', '생성일', '마지막 사용', '']}>
        {ACCESS_TOKENS.map((t) => (
          <tr key={t.id}>
            <td>
              <span className="pl-code">{t.token}</span>
            </td>
            <td>{t.createdAt}</td>
            <td>{t.lastUsed}</td>
            <td>
              <div className="pl-rowactions">
                <Button size="small">
                  <CopyIcon size={13} /> 복사
                </Button>
                <Button size="small" destructive onClick={() => setRevoking(t)}>
                  <TrashIcon size={13} /> 폐기
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Modal
        open={createdOpen}
        onClose={() => setCreatedOpen(false)}
        title="토큰 생성됨"
        actions={
          <Button variant="primary" onClick={() => setCreatedOpen(false)}>
            확인
          </Button>
        }
      >
        <p style={{ marginTop: 0 }}>이 토큰은 지금만 확인할 수 있어요. 안전한 곳에 보관하세요.</p>
        <div className="pl-codeblock">logo-8f2a-11xd-93bb-77e1</div>
      </Modal>
      <ConfirmModal
        open={revoking !== null}
        title="토큰 폐기"
        message={
          <span>
            <span className="pl-code">{revoking?.token}</span> 토큰을 폐기할까요? 이 토큰을 사용하는 CLI/CI가
            즉시 인증에 실패합니다.
          </span>
        }
        confirmLabel="폐기"
        destructive
        onConfirm={() => {}}
        onClose={() => setRevoking(null)}
      />
    </>
  );
}

export function KeyBackups() {
  return (
    <>
      <PageHeader title="암호화 키" sub="클러스터 시크릿 암호화 키 백업입니다." />
      <Table headers={['이름', '저장소', '생성일', '']}>
        <tr>
          <td>
            <div className="pl-cell">
              <KeyIcon size={14} /> logo-mgmt-key
            </div>
          </td>
          <td>
            <span className="pl-code">Jungle-303-04/infra</span>
          </td>
          <td>2026-06-26</td>
          <td>
            <div className="pl-rowactions">
              <Button size="small">
                <CopyIcon size={13} /> 복원 명령
              </Button>
            </div>
          </td>
        </tr>
      </Table>
    </>
  );
}

export function PublicKeys() {
  const [addOpen, setAddOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [deletingKey, setDeletingKey] = useState<PublicKey | null>(null);

  return (
    <>
      <PageHeader
        title="공개 키"
        sub="암호화 통신에 사용하는 GPG/age 공개 키입니다."
        actions={
          <Button variant="primary" onClick={() => setAddOpen(true)}>
            <PlusIcon size={14} /> 키 추가
          </Button>
        }
      />
      <Table headers={['이름', '지문', '등록일', '']}>
        {PUBLIC_KEYS.map((k) => (
          <tr key={k.id}>
            <td>
              <div className="pl-cell">
                <KeyIcon size={14} /> {k.name}
              </div>
            </td>
            <td>
              <span className="pl-code">{k.digest}</span>
            </td>
            <td>{k.createdAt}</td>
            <td>
              <div className="pl-rowactions">
                <Button size="small" destructive onClick={() => setDeletingKey(k)}>
                  <TrashIcon size={13} /> 삭제
                </Button>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="공개 키 추가"
        actions={
          <>
            <Button onClick={() => setAddOpen(false)}>취소</Button>
            <Button variant="primary" disabled={!keyName} onClick={() => setAddOpen(false)}>
              추가
            </Button>
          </>
        }
      >
        <FormField label="키 이름">
          <Input value={keyName} onChange={setKeyName} placeholder="my-laptop" />
        </FormField>
        <FormField label="공개 키 내용">
          <Input placeholder="age1..." />
        </FormField>
      </Modal>
      <ConfirmModal
        open={deletingKey !== null}
        title="공개 키 삭제"
        message={`${deletingKey?.name ?? ''} 키를 삭제할까요? 이 키로 암호화된 통신이 더 이상 동작하지 않아요.`}
        confirmLabel="삭제"
        destructive
        onConfirm={() => {}}
        onClose={() => setDeletingKey(null)}
      />
    </>
  );
}

export function EabCredentials() {
  return (
    <>
      <PageHeader title="EAB 자격 증명" sub="ACME 외부 계정 바인딩 자격 증명입니다." />
      <Table headers={['Key ID', '클러스터', '공급자', '생성일', '']}>
        <tr>
          <td>
            <span className="pl-code">eab-9f3k…a21</span>
          </td>
          <td>클러스터01</td>
          <td>
            <Chip>zerossl</Chip>
          </td>
          <td>2026-06-27</td>
          <td>
            <div className="pl-rowactions">
              <Button size="small" destructive>
                <TrashIcon size={13} /> 삭제
              </Button>
            </div>
          </td>
        </tr>
      </Table>
    </>
  );
}
