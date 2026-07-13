import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'motion/react';
import { useConsolePath } from '@/features/console/ui';
import { PageHeader, cx } from '@/ui';
import { fadeInUp } from '@/ui/motion';

const ITEMS = [
  ['/settings/members', '멤버'], ['/settings/orgs', '조직'], ['/settings/groups', '그룹'],
  ['/settings/access', '리소스 권한'], ['/settings/alerts', '알림 채널'], ['/settings/ops', '운영(DLQ)'],
] as const;

export function SettingsNav({ title, children }: { title: string; children: ReactNode }) {
  const pathFor = useConsolePath();
  return (
    <motion.div variants={fadeInUp} initial="initial" animate="animate" className="grid gap-6">
      <PageHeader title={`설정 - ${title}`} description="조직, 멤버, 권한, 알림 채널, 운영 큐를 한 곳에서 관리합니다" />
      <nav className="flex max-w-full gap-1 overflow-x-auto border-b border-border" aria-label="설정">
        {ITEMS.map(([to, label]) => (
          <NavLink
            key={to}
            to={pathFor(to)}
            className={({ isActive }) => cx(
              'h-10 shrink-0 rounded-t-control border-b-2 px-4 text-body font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              isActive ? 'border-accent text-primary' : 'border-transparent text-secondary hover:text-primary',
            )}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      {children}
    </motion.div>
  );
}
