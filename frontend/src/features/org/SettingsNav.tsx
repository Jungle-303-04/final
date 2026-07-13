import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useConsolePath } from '@/features/console/ui';

const ITEMS = [
  ['/settings/members', '멤버'],
  ['/settings/orgs', '조직'],
  ['/settings/groups', '그룹'],
  ['/settings/access', '리소스 권한'],
  ['/settings/alerts', '알림 채널'],
  ['/settings/ops', '운영(DLQ)'],
] as const;

export function SettingsNav({ title, children }: { title: string; children: ReactNode }) {
  const pathFor = useConsolePath();
  const location = useLocation();

  return (
    <div className="grid gap-6">
      <header className="min-w-0">
        <h1 className="truncate text-page font-semibold text-text-primary">설정 · {title}</h1>
      </header>
      <nav className="flex max-w-full gap-1 overflow-x-auto border-b border-border pb-2" aria-label="설정">
        {ITEMS.map(([to, label]) => {
          const destination = pathFor(to);
          const active = location.pathname === destination;
          return (
            <Button
              key={to}
              render={<NavLink to={destination} />}
              nativeButton={false}
              variant={active ? 'secondary' : 'ghost'}
              size="sm"
              className="shrink-0"
              aria-current={active ? 'page' : undefined}
            >
              {label}
            </Button>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
