// 라우트 트리 — 콘솔 앱이 곧 루트(/) 앱. 모든 화면은 실데이터 API 만 사용
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RequireAdmin, RequireGuest, RequireSession } from '@/app/guards';
import { ConsoleLayout } from '@/features/console/ui';
import { HomePage } from '@/features/console/pages/HomePage';
import { Skeleton } from '@/shared/ui';

const L = (f: () => Promise<{ default: React.ComponentType }>) => {
  const C = lazy(f);
  return <Suspense fallback={<Skeleton lines={6} />}><C /></Suspense>;
};

export const router = createBrowserRouter([
  {
    element: <RequireGuest />,
    children: [
      { path: '/login', element: L(() => import('@/features/auth/LoginView')) },
      { path: '/signup', element: L(() => import('@/features/auth/SignupView')) },
      { path: '/pending', element: L(() => import('@/features/auth/PendingView')) },
      { path: '/verify-email', element: L(() => import('@/features/auth/VerifyEmailView')) },
    ],
  },
  {
    element: <RequireSession />,
    children: [{
      path: '/',
      element: <ConsoleLayout />,
      children: [
        { index: true, element: <HomePage /> },
        { path: 'clusters', element: L(() => import('@/features/cluster/ClusterListView')) },
        { path: 'clusters/:clusterId', element: L(() => import('@/features/cluster/ClusterDetailView')) },
        { path: 'clusters/:clusterId/pods/:namespace/:pod', element: L(() => import('@/features/cluster/ClusterDetailView')) },
        { path: 'repos', element: L(() => import('@/features/repo/RepoListView')) },
        { path: 'repos/:applicationId', element: L(() => import('@/features/repo/RepoDetailView')) },
        { path: 'workflows', element: L(() => import('@/features/workflow/WorkflowListView')) },
        { path: 'workflows/:runId', element: L(() => import('@/features/workflow/WorkflowGraphView')) },
        { path: 'incidents', element: L(() => import('@/features/notifications/NotificationsView')) },
        { path: 'incidents/:incidentId', element: L(() => import('@/features/notifications/IncidentDetailView')) },
        { path: 'metrics', element: L(() => import('@/features/metrics/MetricsView')) },
        { path: 'ai', element: L(() => import('@/features/chat/ChatView')) },
        { path: 'ai/:conversationId', element: L(() => import('@/features/chat/ChatView')) },
        { path: 'catalog', element: L(() => import('@/features/resources/CatalogView')) },
        {
          path: 'settings',
          element: <RequireAdmin />,
          children: [
            { index: true, element: <Navigate to="/settings/members" replace /> },
            { path: 'members', element: L(() => import('@/features/org/MembersView')) },
            { path: 'orgs', element: L(() => import('@/features/org/OrganizationsView')) },
            { path: 'groups', element: L(() => import('@/features/org/GroupsView')) },
            { path: 'access', element: L(() => import('@/features/org/AccessView')) },
            { path: 'ops', element: L(() => import('@/features/notifications/OpsView')) },
          ],
        },
      ],
    }],
  },
  // 구 경로 호환 — 콘솔이 루트 앱으로 승격되며 전부 / 로 흡수
  { path: '/console', element: <Navigate to="/" replace /> },
  { path: '/console/*', element: <Navigate to="/" replace /> },
  { path: '/plural', element: <Navigate to="/" replace /> },
  { path: '/plural/*', element: <Navigate to="/" replace /> },
  { path: '/overview', element: <Navigate to="/" replace /> },
  { path: '/overview/*', element: <Navigate to="/" replace /> },
  { path: '/notifications', element: <Navigate to="/incidents" replace /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);
