// 라우트 트리 — 콘솔 앱이 곧 루트(/) 앱. 모든 화면은 실데이터 API 만 사용
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAdmin, RequireGuest, RequireSession } from '@/app/guards';
import { ConsoleLayout } from '@/features/console/ui';
import { Skeleton } from '@/ui';

const L = (f: () => Promise<{ default: React.ComponentType }>) => {
  const C = lazy(f);
  return <Suspense fallback={<Skeleton lines={6} />}><C /></Suspense>;
};

const consoleChildren = (basePath = '') => [
  { index: true, element: <Navigate to={`${basePath}/clusters`} replace /> },
  { path: 'clusters', element: L(() => import('@/features/cluster/ClusterListView')) },
  { path: 'clusters/:clusterId', element: L(() => import('@/features/cluster/ClusterDetailView')) },
  { path: 'clusters/:clusterId/pods/:namespace/:pod', element: L(() => import('@/features/cluster/ClusterDetailView')) },
  { path: 'repos', element: L(() => import('@/features/repo/RepoListView')) },
  { path: 'repos/:applicationId', element: L(() => import('@/features/repo/RepoDetailView')) },
  { path: 'incidents', element: L(() => import('@/features/notifications/NotificationsView')) },
  { path: 'incidents/:incidentId', element: L(() => import('@/features/notifications/IncidentDetailView')) },
  { path: 'ai', element: L(() => import('@/features/chat/ChatView')) },
  { path: 'ai/:conversationId', element: L(() => import('@/features/chat/ChatView')) },
  { path: 'catalog', element: L(() => import('@/features/resources/CatalogView')) },
  {
    path: 'settings',
    element: <RequireAdmin />,
    children: [
      { index: true, element: <Navigate to={`${basePath}/settings/members`} replace /> },
      { path: 'members', element: L(() => import('@/features/org/MembersView')) },
      { path: 'orgs', element: L(() => import('@/features/org/OrganizationsView')) },
      { path: 'groups', element: L(() => import('@/features/org/GroupsView')) },
      { path: 'access', element: L(() => import('@/features/org/AccessView')) },
      { path: 'alerts', element: L(() => import('@/features/notifications/AlertChannelsView')) },
      { path: 'ops', element: L(() => import('@/features/notifications/OpsView')) },
    ],
  },
  // 알 수 없는 경로 — 콘솔 셸 안에서 정직한 404 (몰래 홈 리다이렉트 금지)
  { path: '*', element: L(() => import('@/features/console/pages/NotFoundPage')) },
];

const devRoutes = import.meta.env.DEV
  ? [{ path: '/dev/ui', element: L(() => import('@/dev/UiShowcase')) }]
  : [];

export const router = createBrowserRouter([
  ...devRoutes,
  {
    element: <RequireGuest />,
    children: [
      { path: '/login', element: L(() => import('@/features/auth/LoginView')) },
      { path: '/signup', element: L(() => import('@/features/auth/SignupView')) },
      { path: '/pending', element: L(() => import('@/features/auth/PendingView')) },
      { path: '/verify-email', element: L(() => import('@/features/auth/VerifyEmailView')) },
    ],
  },
  { path: '/console', element: <Navigate to="/" replace /> },
  { path: '/console/*', element: <Navigate to="/" replace /> },
  {
    element: <RequireSession />,
    children: [
      { path: '/', element: <ConsoleLayout />, children: consoleChildren() },
    ],
  },
  // 구 경로 호환 — 실제 서비스는 /
  { path: '/plural', element: <Navigate to="/" replace /> },
  { path: '/plural/*', element: <Navigate to="/" replace /> },
  { path: '/overview', element: <Navigate to="/" replace /> },
  { path: '/overview/*', element: <Navigate to="/" replace /> },
  { path: '/notifications', element: <Navigate to="/incidents" replace /> },
]);
