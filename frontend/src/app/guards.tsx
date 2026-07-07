import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
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
      <main className="min-h-dvh bg-bg p-6 text-primary sm:p-12">
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
        <main className="min-h-dvh bg-bg p-6 text-primary sm:p-12">
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

function AlertGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M12 4 3.5 19h17z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 9v4.5M12 16.5h.01" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect x="5.5" y="10" width="13" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 10V7.8a3.5 3.5 0 0 1 7 0V10" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
    </svg>
  );
}
