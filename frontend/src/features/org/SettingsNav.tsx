import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { FadeSlideIn } from '@/shared/motion';
import { PageHeader } from '@/plural-ui';
import { useConsolePath } from '@/features/console/ui';

const ITEMS = [
  ['/settings/members', '멤버'], ['/settings/orgs', '조직'], ['/settings/groups', '그룹'],
  ['/settings/access', '리소스 권한'], ['/settings/ops', '운영(DLQ)'],
] as const;

export function SettingsNav({ title, children }: { title: string; children: ReactNode }) {
  const pathFor = useConsolePath();
  return (
    <FadeSlideIn>
      <PageHeader title={`설정 — ${title}`} />
      {/* 스타일은 .tabs a 공통 규칙 사용 — 인라인 color 가 active 색을 덮지 않게 제거 */}
      <div className="tabs">
        {ITEMS.map(([to, label]) => (
          <NavLink key={to} to={pathFor(to)} className={({ isActive }) => isActive ? 'active' : ''}>{label}</NavLink>
        ))}
      </div>
      {children}
    </FadeSlideIn>
  );
}
