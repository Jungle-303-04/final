import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useIsAdmin, useSession } from '@/features/auth/api';
import { EmptyState, Skeleton } from '@/shared/ui';
import { IconLock } from '@/shared/ui/icons';

export function RequireSession() {
  const { data, isPending } = useSession();
  const loc = useLocation();
  if (isPending) return <div style={{ padding: 48 }}><Skeleton lines={5} /></div>;
  if (!data?.authenticated) return <Navigate to={`/login?returnTo=${encodeURIComponent(loc.pathname)}`} replace />;
  return <Outlet />;
}
export function RequireGuest() {
  const { data, isPending } = useSession();
  if (isPending) return null;
  if (data?.authenticated) return <Navigate to="/overview" replace />;
  return <Outlet />;
}
export function RequireAdmin() {
  const admin = useIsAdmin();
  if (!admin) return <EmptyState icon={<IconLock size={26} />} title="권한이 필요합니다" description="service_admin 역할이 필요한 화면입니다" />;
  return <Outlet />;
}
