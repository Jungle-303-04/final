// Console 복제 UI 라우트 트리 — /console 하위 (단일 앱 통합)
import { Navigate, type RouteObject } from 'react-router-dom';
import { ConsoleLayout } from './ui';
import { DomainsPage, RolesPage } from '../plural/pages/AccountPages';
import {
  Marketplace,
  Publisher,
  Repository,
  RepositoryArtifacts,
  RepositoryDeployments,
  RepositoryDescription,
  RepositoryEdit,
  RepositoryPackageList,
  RepositoryPackages,
  RepositoryTests,
  Stack as BundleDetail,
} from '../plural/pages/MarketplacePages';
import { AuditGeo, CloudShell, LoginAudits } from '../plural/pages/MiscPages';
import {
  AccessTokens as ProfileTokens,
  EabCredentials,
  KeyBackups,
  ProfileLayout,
  ProfileMe,
  ProfileSecurity,
  PublicKeys,
} from '../plural/pages/ProfilePages';
import {
  AiAgentRuns,
  AiInfraResearch,
  AiLayout,
  AiSentinels,
  AiThreads,
  Catalogs,
  ComplianceReports,
  ConsoleNotFound,
  CostManagement,
  EdgeClusters,
  EdgeImages,
  EdgeLayout,
  FlowsList,
  OutstandingPrs,
  PrAutomations,
  ScmManagement,
  SecurityLayout,
  SecurityOverview,
  SecurityPolicies,
  SelfServiceLayout,
  VulnerabilityReports,
  WorkbenchesList,
} from './pages/AiMiscPages';
import {
  CdClusterDetail,
  CdClusters,
  CdGlobalServices,
  CdLayout,
  CdObservers,
  CdPipelines,
  CdRepos,
  CdServiceDetail,
  CdServices,
  ClusterAddOns,
  ClusterAlerts,
  ClusterDetails,
  ClusterInsights,
  ClusterLogs,
  ClusterMetrics,
  ClusterNetwork,
  ClusterNodes,
  ClusterPods,
  ClusterServices,
  ClusterUpgrades,
  ServiceComponents,
  ServiceErrors,
  ServiceLogs,
  ServiceRevisions,
  ServiceSettings,
} from './pages/CdPages';
import { HomePage } from './pages/HomePage';
import {
  ClusterOverviewTab,
  ClusterServiceDrillPage,
  NamespaceDrillPage,
  NodeDrillPage,
  PodDrillPage,
} from './pages/DrillPages';
import {
  AiSettings,
  AuditsActivity,
  ConsoleAudits,
  ConsoleGroups,
  ConsoleServiceAccounts,
  ConsoleUsers,
  GlobalGeneral,
  GlobalObservability,
  GlobalOidc,
  GlobalPermissions,
  GlobalRepositories,
  GlobalSettings,
  GlobalSmtp,
  NotificationsSettings,
  Personas,
  ProjectsSettings,
  SettingsLayout,
  UserManagement,
  WebhooksSettings,
} from './pages/SettingsPages';
import {
  K8sResourceList,
  KubernetesLayout,
  StackDetail,
  StackEnv,
  StackFiles,
  StackOutput,
  StackRunDetail,
  StackRuns,
  StacksList,
  StackState,
  StackVars,
} from './pages/StacksK8sPages';

export const consoleRoutes: RouteObject = {
  path: '/console',
  element: <ConsoleLayout />,
  children: [
    { index: true, element: <Navigate to="home" replace /> },
    { path: 'home', element: <HomePage /> },

    /* ── CD ── */
    {
      path: 'cd',
      element: <CdLayout />,
      children: [
        { index: true, element: <Navigate to="clusters" replace /> },
        { path: 'clusters', element: <CdClusters /> },
        { path: 'services', element: <CdServices /> },
        { path: 'repos', element: <CdRepos /> },
        { path: 'git', element: <Navigate to="/console/cd/repos" replace /> },
        { path: 'pipelines', element: <CdPipelines /> },
        { path: 'globalservices', element: <CdGlobalServices /> },
        { path: 'observers', element: <CdObservers /> },
      ],
    },
    {
      path: 'cd/clusters/:clusterId',
      element: <CdClusterDetail />,
      children: [
        // 드릴다운 진입점: 플릿 맵 → 클러스터 개요(보드+맵 위젯) (I10: ?group=&lens=)
        { index: true, element: <Navigate to="overview" replace /> },
        { path: 'overview', element: <ClusterOverviewTab /> },
        { path: 'map', element: <Navigate to="../overview" replace /> },
        { path: 'services', element: <ClusterServices /> },
        { path: 'metrics', element: <ClusterMetrics /> },
        { path: 'details', element: <ClusterDetails /> },
        { path: 'nodes', element: <ClusterNodes /> },
        { path: 'pods', element: <ClusterPods /> },
        { path: 'network', element: <ClusterNetwork /> },
        { path: 'insights', element: <ClusterInsights /> },
        { path: 'alerts', element: <ClusterAlerts /> },
        { path: 'upgrades', element: <ClusterUpgrades /> },
        { path: 'logs', element: <ClusterLogs /> },
        { path: 'addons', element: <ClusterAddOns /> },
      ],
    },
    /* ── 드릴다운 L2·L3 (클러스터 내 서비스/노드/네임스페이스 → 팟) ── */
    { path: 'cd/clusters/:clusterId/services/:serviceName', element: <ClusterServiceDrillPage /> },
    { path: 'cd/clusters/:clusterId/nodes/:nodeName', element: <NodeDrillPage /> },
    { path: 'cd/clusters/:clusterId/namespaces/:nsName', element: <NamespaceDrillPage /> },
    { path: 'cd/clusters/:clusterId/pods/:podName', element: <PodDrillPage /> },

    {
      path: 'cd/services/:serviceId',
      element: <CdServiceDetail />,
      children: [
        { index: true, element: <ServiceComponents /> },
        { path: 'errors', element: <ServiceErrors /> },
        { path: 'logs', element: <ServiceLogs /> },
        { path: 'revisions', element: <ServiceRevisions /> },
        { path: 'settings', element: <ServiceSettings /> },
      ],
    },

    /* ── Stacks ── */
    { path: 'stacks', element: <StacksList /> },
    {
      path: 'stacks/:stackId',
      element: <StackDetail />,
      children: [
        { index: true, element: <Navigate to="runs" replace /> },
        { path: 'runs', element: <StackRuns /> },
        { path: 'state', element: <StackState /> },
        { path: 'output', element: <StackOutput /> },
        { path: 'vars', element: <StackVars /> },
        { path: 'env', element: <StackEnv /> },
        { path: 'files', element: <StackFiles /> },
      ],
    },
    { path: 'stacks/:stackId/runs/:runId', element: <StackRunDetail /> },

    /* ── Kubernetes ── */
    { path: 'kubernetes', element: <Navigate to="/console/kubernetes/mgmt/deployments" replace /> },
    {
      path: 'kubernetes/:clusterId',
      element: <KubernetesLayout />,
      children: [
        { index: true, element: <Navigate to="deployments" replace /> },
        { path: ':resource', element: <K8sResourceList /> },
      ],
    },

    /* ── AI ── */
    {
      path: 'ai',
      element: <AiLayout />,
      children: [
        { index: true, element: <Navigate to="agent-runs" replace /> },
        { path: 'agent-runs', element: <AiAgentRuns /> },
        { path: 'threads', element: <AiThreads /> },
        { path: 'sentinels', element: <AiSentinels /> },
        { path: 'infra-research', element: <AiInfraResearch /> },
      ],
    },

    /* ── 마켓플레이스 + 셸 (구 plural 앱에서 통합) ── */
    { path: 'marketplace', element: <Marketplace /> },
    { path: 'installed', element: <Marketplace installed /> },
    {
      path: 'marketplace/:name',
      element: <Repository />,
      children: [
        { index: true, element: <RepositoryDescription /> },
        {
          path: 'packages',
          element: <RepositoryPackages />,
          children: [
            { index: true, element: <Navigate to="helm" replace /> },
            { path: 'helm', element: <RepositoryPackageList type="helm" /> },
            { path: 'terraform', element: <RepositoryPackageList type="terraform" /> },
            { path: 'docker', element: <RepositoryPackageList type="docker" /> },
          ],
        },
        { path: 'tests', element: <RepositoryTests /> },
        { path: 'deployments', element: <RepositoryDeployments /> },
        { path: 'artifacts', element: <RepositoryArtifacts /> },
        { path: 'edit', element: <RepositoryEdit /> },
      ],
    },
    { path: 'bundles/:name', element: <BundleDetail /> },
    { path: 'publisher/:id', element: <Publisher /> },
    { path: 'shell', element: <CloudShell /> },

    /* ── Flows / Edge / Workbenches ── */
    { path: 'flows', element: <FlowsList /> },
    {
      path: 'edge',
      element: <EdgeLayout />,
      children: [
        { index: true, element: <Navigate to="clusters" replace /> },
        { path: 'clusters', element: <EdgeClusters /> },
        { path: 'images', element: <EdgeImages /> },
      ],
    },
    { path: 'workbenches', element: <WorkbenchesList /> },

    /* ── Self-service ── */
    {
      path: 'self-service',
      element: <SelfServiceLayout />,
      children: [
        { index: true, element: <Navigate to="catalogs" replace /> },
        { path: 'catalogs', element: <Catalogs /> },
        { path: 'pr/outstanding', element: <OutstandingPrs /> },
        { path: 'pr/automations', element: <PrAutomations /> },
        { path: 'pr/scm', element: <ScmManagement /> },
      ],
    },

    /* ── Security / Cost ── */
    {
      path: 'security',
      element: <SecurityLayout />,
      children: [
        { index: true, element: <Navigate to="overview" replace /> },
        { path: 'overview', element: <SecurityOverview /> },
        { path: 'policies', element: <SecurityPolicies /> },
        { path: 'vulnerability-reports', element: <VulnerabilityReports /> },
        { path: 'compliance-reports', element: <ComplianceReports /> },
      ],
    },
    { path: 'cost-management', element: <CostManagement /> },

    /* ── Settings / Profile ── */
    {
      path: 'settings',
      element: <SettingsLayout />,
      children: [
        { index: true, element: <Navigate to="global" replace /> },
        {
          path: 'global',
          element: <GlobalSettings />,
          children: [
            { index: true, element: <Navigate to="general" replace /> },
            { path: 'general', element: <GlobalGeneral /> },
            { path: 'permissions', element: <GlobalPermissions /> },
            { path: 'repositories', element: <GlobalRepositories /> },
            { path: 'observability', element: <GlobalObservability /> },
            { path: 'oidc', element: <GlobalOidc /> },
            { path: 'smtp', element: <GlobalSmtp /> },
          ],
        },
        {
          path: 'user-management',
          element: <UserManagement />,
          children: [
            { index: true, element: <Navigate to="users" replace /> },
            { path: 'users', element: <ConsoleUsers /> },
            { path: 'groups', element: <ConsoleGroups /> },
            { path: 'service-accounts', element: <ConsoleServiceAccounts /> },
            { path: 'roles', element: <RolesPage /> },
            { path: 'personas', element: <Personas /> },
          ],
        },
        { path: 'ai', element: <AiSettings /> },
        { path: 'projects', element: <ProjectsSettings /> },
        { path: 'domains', element: <DomainsPage /> },
        { path: 'webhooks', element: <WebhooksSettings /> },
        { path: 'notifications', element: <NotificationsSettings /> },
        {
          path: 'audits',
          element: <ConsoleAudits />,
          children: [
            { index: true, element: <Navigate to="logs" replace /> },
            { path: 'logs', element: <AuditsActivity /> },
            { path: 'logins', element: <LoginAudits /> },
            { path: 'geo', element: <AuditGeo /> },
          ],
        },
      ],
    },
    {
      path: 'profile',
      element: <ProfileLayout />,
      children: [
        { index: true, element: <Navigate to="me" replace /> },
        { path: 'me', element: <ProfileMe /> },
        { path: 'security', element: <ProfileSecurity /> },
        { path: 'tokens', element: <ProfileTokens /> },
        { path: 'encryption-keys', element: <KeyBackups /> },
        { path: 'keys', element: <PublicKeys /> },
        { path: 'eab', element: <EabCredentials /> },
      ],
    },

    /* ── 404 ── */
    { path: '*', element: <ConsoleNotFound /> },
  ],
};
