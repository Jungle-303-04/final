// 라우트 트리 — docs/fd/05 와 1:1
import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from '@/app/shell/AppShell';
import { RequireAdmin, RequireGuest, RequireSession } from '@/app/guards';
import { consoleRoutes } from '@/features/console/routes';
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
      element: <AppShell />,
      children: [
        { path: '/', element: <Navigate to="/overview" replace /> },
        { path: '/overview', element: L(() => import('@/features/fleet/FleetHeatmapView')) },
        { path: '/overview/c/:clusterId', element: L(() => import('@/features/fleet/FleetHeatmapView')) },
        { path: '/clusters', element: L(() => import('@/features/cluster/ClusterListView')) },
        { path: '/clusters/:clusterId', element: L(() => import('@/features/cluster/ClusterDetailView')) },
        { path: '/clusters/:clusterId/pods/:namespace/:pod', element: L(() => import('@/features/cluster/ClusterDetailView')) },
        { path: '/repos', element: L(() => import('@/features/repo/RepoListView')) },
        { path: '/repos/:applicationId', element: L(() => import('@/features/repo/RepoDetailView')) },
        { path: '/workflows', element: L(() => import('@/features/workflow/WorkflowListView')) },
        { path: '/workflows/:runId', element: L(() => import('@/features/workflow/WorkflowGraphView')) },
        { path: '/metrics', element: L(() => import('@/features/metrics/MetricsView')) },
        { path: '/ai', element: L(() => import('@/features/chat/ChatView')) },
        { path: '/ai/:conversationId', element: L(() => import('@/features/chat/ChatView')) },
        { path: '/notifications', element: L(() => import('@/features/notifications/NotificationsView')) },
        { path: '/incidents/:incidentId', element: L(() => import('@/features/notifications/IncidentDetailView')) },
        { path: '/catalog', element: L(() => import('@/features/resources/CatalogView')) },
        {
          path: '/settings',
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
  // 복각 UI — 단일 콘솔 앱 (구 /plural은 /console로 흡수)
  consoleRoutes,
  { path: '/plural', element: <Navigate to="/console" replace /> },
  { path: '/plural/*', element: <Navigate to="/console" replace /> },
  { path: '*', element: <Navigate to="/overview" replace /> },
]);
