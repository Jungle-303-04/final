import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { FadeSlideIn } from '@/shared/motion';
import { PageHeader } from '@/plural-ui';

const ITEMS = [
  ['/settings/members', '멤버'], ['/settings/orgs', '조직'], ['/settings/groups', '그룹'],
  ['/settings/access', '리소스 권한'], ['/settings/ops', '운영(DLQ)'],
] as const;

export function SettingsNav({ title, children }: { title: string; children: ReactNode }) {
  return (
    <FadeSlideIn>
      <PageHeader title={`설정 — ${title}`} sub="조직·그룹·멤버·리소스 권한과 운영(DLQ) 관리" />
      <div className="tabs">
        {ITEMS.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}
            style={{ padding: '9px 14px', fontSize: 'var(--fs-sm)', color: 'inherit' }}>{label}</NavLink>
        ))}
      </div>
      {children}
    </FadeSlideIn>
  );
}
