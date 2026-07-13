import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { LockKeyholeIcon as LockGlyph, TriangleAlertIcon as AlertGlyph } from 'lucide-react';
import { clearSessionHint, hasRecentSessionHint, markSessionSeen, useIsAdmin, useSession } from '@/features/auth/api';
import { Button, EmptyState, Skeleton } from '@/ui';

export function RequireSession() {
  const { data, error, isError, isPending, refetch } = useSession();
  const loc = useLocation();
  const [slowPending, setSlowPending] = useState(false);
  useEffect(() => {
    if (data?.authenticated) markSessionSeen();
    if (isError) {
      const e = error as { kind?: string; status?: number };
      if (e.kind === 'unauthorized' || e.status === 401) clearSessionHint();
    }
  }, [data?.authenticated, error, isError]);
  useEffect(() => {
    if (!isPending) {
      setSlowPending(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setSlowPending(true), 5000);
    return () => window.clearTimeout(timer);
  }, [isPending]);
  if (isPending) {
    if (hasRecentSessionHint()) return <Outlet />;
    return (
      <main className="min-h-dvh bg-bg p-6 text-text-primary sm:p-12">
        {slowPending ? (
          <EmptyState icon={<AlertGlyph />} title="세션 확인 중"
            action={<Button size="sm" onClick={() => refetch()}>다시 시도</Button>} />
        ) : <Skeleton lines={5} />}
      </main>
    );
  }
  if (isError) {
    const e = error as { kind?: string; detail?: string; status?: number };
    if (hasRecentSessionHint() && e.kind !== 'unauthorized' && e.status !== 401) return <Outlet />;
    if (e.kind !== 'unauthorized' && e.status !== 401) {
      return (
        <main className="min-h-dvh bg-bg p-6 text-text-primary sm:p-12">
          <EmptyState icon={<AlertGlyph />} title={e.detail || '세션을 확인하지 못했습니다'}
            action={<Button size="sm" onClick={() => refetch()}>다시 시도</Button>} />
        </main>
      );
    }
  }
  if (isError || !data?.authenticated) {
    const returnTo = `${loc.pathname}${loc.search}${loc.hash}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <Outlet />;
}
export function RequireGuest() {
  const { data, isError } = useSession();
  const loc = useLocation();
  if (!isError && data?.authenticated) return <Navigate to={safeReturnTo(new URLSearchParams(loc.search).get('returnTo'))} replace />;
  return <Outlet />;
}
export function RequireAdmin() {
  const admin = useIsAdmin();
  if (!admin) return <EmptyState icon={<LockGlyph />} title="권한이 필요합니다" description="service_admin 역할이 필요한 화면입니다" />;
  return <Outlet />;
}

function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('://')) return '/';
  return value;
}
