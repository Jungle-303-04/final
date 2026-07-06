// 기타 그룹: audits(logs/logins/geo), cloud shell
import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Card, Chip, DetailModal, EmptyState, LinkTabList, PageHeader, Table } from '@/plural-ui';
import { GlobeIcon } from '@/plural-ui/icons';
import { AUDITS, LOGINS, type AuditRow } from '../mock';

/* ── Audits ───────────────────────────── */
export function AuditsLayout() {
  return (
    <>
      <PageHeader title="감사 로그" sub="계정에서 일어난 활동 기록입니다." />
      <LinkTabList
        tabs={[
          { to: '/plural/audits/logs', label: '로그' },
          { to: '/plural/audits/logins', label: '로그인' },
          { to: '/plural/audits/geo', label: '지역 분포' },
        ]}
      />
      <Outlet />
    </>
  );
}

export function AuditLogs() {
  const [selected, setSelected] = useState<AuditRow | null>(null);
  return (
    <>
      <Table headers={['액션', '행위자', 'IP', '위치', '시간']}>
        {AUDITS.map((a) => (
          <tr key={a.id} className="clickable" onClick={() => setSelected(a)}>
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
      {selected && (
        <DetailModal
          title="감사 로그 상세"
          onClose={() => setSelected(null)}
          rows={[
            { label: '액션', value: <span className="pl-code">{selected.action}</span> },
            { label: '행위자', value: selected.actor },
            { label: 'IP', value: selected.ip },
            { label: '위치', value: selected.location },
            { label: '시간', value: selected.time },
          ]}
        />
      )}
    </>
  );
}

export function LoginAudits() {
  const [selected, setSelected] = useState<(typeof LOGINS)[number] | null>(null);
  return (
    <>
      <Table headers={['사용자', 'IP', '위치', '시간']}>
        {LOGINS.map((l) => (
          <tr key={l.id} className="clickable" onClick={() => setSelected(l)}>
            <td>{l.user}</td>
            <td>{l.ip}</td>
            <td>{l.location}</td>
            <td>{l.time}</td>
          </tr>
        ))}
      </Table>
      {selected && (
        <DetailModal
          title="로그인 상세"
          onClose={() => setSelected(null)}
          rows={[
            { label: '사용자', value: selected.user },
            { label: 'IP', value: selected.ip },
            { label: '위치', value: selected.location },
            { label: '시간', value: selected.time },
            { label: '방식', value: 'GitHub OAuth' },
            { label: '기기', value: 'macOS · Chrome' },
          ]}
        />
      )}
    </>
  );
}

export function AuditGeo() {
  return (
    <Card>
      <div className="pl-row" style={{ marginBottom: 16 }}>
        <GlobeIcon size={16} />
        <span style={{ fontWeight: 600 }}>로그인 지역 분포</span>
      </div>
      <div
        style={{
          height: 320,
          display: 'grid',
          placeItems: 'center',
          border: '1px dashed var(--color-border)',
          borderRadius: 'var(--rad-md)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p className="pl-sub" style={{ margin: 0 }}>
            세계 지도 시각화 (mock)
          </p>
          <div className="pl-row" style={{ marginTop: 12, justifyContent: 'center' }}>
            <Chip severity="info">서울, KR — 2</Chip>
            <Chip>버지니아, US — 1</Chip>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ── Cloud Shell ─────────────────────── */
export function CloudShell() {
  return (
    <>
      <PageHeader title="클라우드 셸" sub="브라우저에서 바로 LOGO CLI를 사용하세요." />
      <Card>
        <div className="pl-codeblock" style={{ minHeight: 320 }}>
          Welcome to LOGO Cloud Shell ⎈{'\n'}
          {'\n'}$ logo version{'\n'}logo cli 0.12.4{'\n'}
          {'\n'}$ logo clusters list{'\n'}NAME         PROVIDER  VERSION{'\n'}클러스터01    AWS       v1.29.4{'\n'}클러스터02    AWS       v1.29.4{'\n'}
          {'\n'}$ <span style={{ opacity: 0.6 }}>▊</span>
        </div>
      </Card>
    </>
  );
}

/* ── 404 ─────────────────────────────── */
export function NotFound() {
  return <EmptyState title="페이지를 찾을 수 없습니다" message="주소를 확인해 주세요." />;
}
