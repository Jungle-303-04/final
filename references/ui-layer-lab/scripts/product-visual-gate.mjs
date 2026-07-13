import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { chromium } from "playwright";

const port = await findAvailablePort();
const runNonce = randomUUID();
const baseUrl = `http://127.0.0.1:${port}`;
const productUrl = `${baseUrl}/product`;
const homeClusterId = "visual-cluster";
const homeNodeName = "visual-node";
const homePodName = "checkout-api-0";
const resourcesLongUid = `visual-pod-${"u".repeat(220)}`;
const resourcesLongOwner = `checkout-owner-${"o".repeat(220)}`;
const resourcesLongRelatedName = `checkout-service-${"r".repeat(220)}`;
const resourcesLongEventReason = `BackOff${"R".repeat(220)}`;
const resourcesLongEventMessage = `ContainerRestart${"M".repeat(440)}`;
const productHomeUrl = `${productUrl}?cluster=${homeClusterId}`;
const productResourcesUrl = `${productUrl}/resources/pod?cluster=${homeClusterId}`;
const authSessionPath = "/api/auth/session";
const homeBaseApiPaths = [
  "/api/clusters?limit=100",
  `/api/clusters/${homeClusterId}/summary`,
  `/api/clusters/${homeClusterId}/nodes/summary`,
];
const homePodApiPath =
  `/api/clusters/${homeClusterId}/nodes/${homeNodeName}/pods/summary`;
const homeFeatureApiPaths = [...homeBaseApiPaths, homePodApiPath];
const resourcesSummaryApiPath =
  `/api/clusters/${homeClusterId}/inventory/summary`;
const resourcesListApiPath =
  `/api/clusters/${homeClusterId}/inventory/resources?resource_type=pod&include_deleted=false&limit=200`;
const resourcesDetailApiPath =
  `/api/clusters/${homeClusterId}/inventory/resource-detail?resource_type=pod&kind=Pod&name=${homePodName}&namespace=shop&related_limit=100&event_limit=50`;
const resourcesBaseApiPaths = [homeBaseApiPaths[0], resourcesSummaryApiPath, resourcesListApiPath];
const issuesCorrelationId = "visual-correlation";
const issuesIncidentId = "visual-incident";
const issuesSubject = "deployment/shop/checkout-api";
const issuesSymptom = "Checkout API response latency increased";
const issuesAuditSubject = "incident.detected";
const productIssuesUrl = `${productUrl}/issues?cluster=${homeClusterId}`;
const issuesListApiPath =
  `/api/dashboard/rca/timeline?cluster_id=${homeClusterId}&limit=50`;
const issuesDetailApiPath =
  `/api/dashboard/rca/incidents/${issuesIncidentId}?cluster_id=${homeClusterId}`;
const issuesEvidenceApiPath =
  `/api/evidence?correlation_id=${issuesCorrelationId}&limit=50`;
const issuesReportsApiPath =
  `/api/rca-reports?correlation_id=${issuesCorrelationId}&limit=50`;
const issuesAuditApiPath =
  `/api/audit/timeline?correlation_id=${issuesCorrelationId}&limit=50`;
const issuesRecentChangesApiPath =
  `/api/rca/incidents/${issuesIncidentId}/recent-changes?limit=5`;
const issuesRecoveryApiPath =
  `/api/rca/recovery-plans/by-correlation/${issuesCorrelationId}`;
const issuesBaseApiPaths = [homeBaseApiPaths[0], issuesListApiPath];
const issuesDetailApiPaths = [
  issuesDetailApiPath,
  issuesEvidenceApiPath,
  issuesReportsApiPath,
  issuesAuditApiPath,
  issuesRecentChangesApiPath,
  issuesRecoveryApiPath,
];
const stateHarnessUrl = `${baseUrl}/scripts/fixtures/product-state-visual-harness.html`;
const shellHarnessUrl = `${baseUrl}/scripts/fixtures/product-shell-visual-harness.html?cluster=cluster-1`;
const outputDir = new URL("../output/playwright/", import.meta.url).pathname;
const shellHeaderSelector = "[data-slot='sidebar-inset'] > header";
const clusterScopePickerSelector = `${shellHeaderSelector} [data-slot='cluster-scope-picker']`;
const clusterScopeTriggerSelector = `${clusterScopePickerSelector} [data-slot='select-trigger']`;
const clusterProviderIconSelector = `${clusterScopeTriggerSelector} [data-slot='cluster-provider-icon']`;
// Deterministic fixture captures guard local UI contracts only. AWS-backed acceptance
// evidence is captured by a separate workflow and must not reuse these screenshots.
const authLoginSelectors = [
  "[data-slot='card']",
  "[data-slot='card-header']",
  "[data-slot='card-content']",
  "[data-slot='field-group']",
  "[data-slot='field']",
  "[data-slot='input']",
  "[data-slot='button']",
  "form",
  "h1",
  "label",
];
const authStateSelectors = [
  "[data-slot='empty']",
  "h1",
  "p",
];
const authLoadingSelectors = [
  "main[aria-busy='true']",
  "[role='status']",
  "[data-slot='loading-preview']",
  "[data-slot='skeleton']",
  "aside",
  "header",
];
const stateSelectors = [
  "[data-slot='empty']",
  "[data-slot='surface']",
  "[data-slot='button']",
  "[data-slot='button-group']",
  "[data-slot='button-group-separator']",
  "[data-slot='button-group-text']",
  "[data-slot='item']",
  "[data-slot='item-title']",
  "[data-slot='item-description']",
  "[data-slot='progress']",
  "[data-slot='progress-track']",
  "[data-slot='progress-indicator']",
  "[data-slot='scroll-area']",
  "[data-slot='scroll-area-viewport']",
  "[data-slot='scroll-area-scrollbar']",
  "[data-slot='scroll-area-thumb']",
  "[data-slot='status-mark']",
  "[data-slot='tabs']",
  "[data-slot='tabs-list']",
  "[data-slot='tabs-trigger']",
  "[data-slot='tabs-content']",
  "[role='alert']",
  "h1",
  "h2",
  "p",
  "code",
];
const shellSelectors = [
  "[data-slot='sidebar-provider']",
  "[data-slot='sidebar-inset']",
  "[data-slot='sidebar-navigation']",
  "[data-slot='sidebar-menu']",
  "[data-slot='sidebar-trigger']",
  clusterScopePickerSelector,
  clusterScopeTriggerSelector,
  clusterProviderIconSelector,
  "[data-shell-harness-outlet]",
  "header",
  "main",
];
const homeSelectors = [
  "[data-slot='sidebar-provider']",
  "[data-slot='sidebar-inset']",
  "[data-slot='sidebar-trigger']",
  "[data-slot='surface']",
  clusterScopePickerSelector,
  clusterScopeTriggerSelector,
  clusterProviderIconSelector,
  "[data-slot='progress']",
  "[data-slot='progress-track']",
  "[data-slot='progress-indicator']",
  "[data-slot='item']",
  "[data-slot='item-title']",
  "[data-slot='item-description']",
  "[data-slot='status-mark']",
  "header",
  "main",
  "h1",
  "h2",
  "h3",
  "p",
];
const homeForbiddenSelectors = [
  "[data-slot='sidebar-provider']",
  "[data-slot='sidebar-inset']",
  "[data-slot='sidebar-trigger']",
  "[data-slot='empty']",
  "[role='alert']",
  "header",
  "main",
  "h2",
  "p",
];
const resourcesSelectors = [
  "[data-slot='sidebar-provider']",
  "[data-slot='sidebar-inset']",
  "[data-slot='sidebar-trigger']",
  "[data-slot='surface']",
  "[data-slot='badge']",
  clusterScopePickerSelector,
  clusterScopeTriggerSelector,
  clusterProviderIconSelector,
  "[data-slot='accordion']",
  "[data-slot='accordion-trigger']",
  "[data-slot='table-container']",
  "[data-slot='table']",
  "[data-slot='status-mark']",
  "header",
  "main",
  "h3",
  "p",
];
const resourcesDetailSelectors = [
  ...resourcesSelectors,
  "[data-slot='sheet-overlay']",
  "[data-slot='sheet-content']",
  "[data-slot='sheet-title']",
  "[data-slot='tabs']",
  "[data-slot='tabs-list']",
  "[data-slot='tabs-trigger']",
];
const issuesSelectors = [
  "[data-slot='sidebar-provider']",
  "[data-slot='sidebar-inset']",
  "[data-slot='sidebar-trigger']",
  "[data-slot='product-page-frame']",
  "[data-slot='card']",
  "[data-slot='card-title']",
  "[data-slot='button']",
  "[data-slot='badge']",
  clusterScopePickerSelector,
  clusterScopeTriggerSelector,
  clusterProviderIconSelector,
  "[data-testid='audit-event-subject']",
  "[data-testid='issue-recent-changes']",
  "header",
  "main",
  "p",
];
const localeStorageKey = "kubeheal.locale";
const maxInitialCumulativeLayoutShift = 0.1;
const layoutShiftMeasurements = [];
const browserLocales = {
  en: "en-US",
  ko: "ko-KR",
};
const localeSmokeCopy = {
  en: {
    home: {
      heading: "Cluster status",
      navigation: "Primary navigation",
      route: "Home",
    },
    resources: {
      heading: "Resources",
      navigation: "Primary navigation",
      route: "Resources",
    },
  },
  ko: {
    home: {
      heading: "클러스터 상태",
      navigation: "주요 메뉴",
      route: "홈",
    },
    resources: {
      heading: "리소스",
      navigation: "주요 메뉴",
      route: "리소스",
    },
  },
};
const localeControlCopy = {
  en: {
    control: "Language: English",
    options: { en: "English", ko: "Korean" },
  },
  ko: {
    control: "언어: 한국어",
    options: { en: "영어", ko: "한국어" },
  },
};
const visualScenarios = [
  {
    id: "auth-unauthenticated-desktop-light",
    locale: "ko",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "Opsia에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "auth-unauthenticated-mobile-dark",
    locale: "ko",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "Opsia에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 390, height: 844 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
  },
  {
    id: "auth-unauthenticated-reflow-320-light",
    locale: "ko",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "Opsia에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 320, height: 800 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "auth-unauthenticated-text-resize-200-light",
    locale: "ko",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "Opsia에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 640, height: 800 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "auth-unauthenticated-forced-colors",
    locale: "ko",
    url: productUrl,
    authSession: "unauthenticated",
    heading: "Opsia에 로그인",
    requiredSelectors: authLoginSelectors,
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
  },
  {
    id: "home-authenticated-node-desktop-light-text-diet",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "nodes",
    heading: "클러스터 상태",
    requiredSelectors: [
      ...homeSelectors,
      "[data-slot='sidebar']",
      "[data-slot='sidebar-navigation']",
      "[data-slot='sidebar-menu']",
    ],
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    layoutShiftBudget: maxInitialCumulativeLayoutShift,
    apiDelayMsByPath: {
      [homeBaseApiPaths[0]]: 300,
      [homeBaseApiPaths[1]]: 350,
      [homeBaseApiPaths[2]]: 450,
    },
  },
  {
    id: "home-sidebar-reflow-1920-light",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "nodes",
    sidebarReflowAssertions: true,
    heading: "클러스터 상태",
    requiredSelectors: [
      ...homeSelectors,
      "[data-slot='sidebar']",
      "[data-slot='sidebar-inset']",
      "[data-slot='product-page-frame']",
    ],
    viewport: { width: 1920, height: 1080 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "home-authenticated-pod-desktop-light",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "pods",
    heading: "클러스터 상태",
    requiredSelectors: [
      ...homeSelectors,
      "[data-slot='sidebar']",
      "[data-slot='sidebar-navigation']",
      "[data-slot='sidebar-menu']",
    ],
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "home-authenticated-node-mobile-dark",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "nodes",
    heading: "클러스터 상태",
    requiredSelectors: homeSelectors,
    viewport: { width: 390, height: 844 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
  },
  {
    id: "home-authenticated-node-reflow-320-light",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "nodes",
    heading: "클러스터 상태",
    requiredSelectors: homeSelectors,
    viewport: { width: 320, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "home-authenticated-node-text-resize-200-light",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "nodes",
    heading: "클러스터 상태",
    requiredSelectors: homeSelectors,
    viewport: { width: 640, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "home-authenticated-node-forced-colors",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "nodes",
    heading: "클러스터 상태",
    requiredSelectors: homeSelectors,
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
  },
  {
    id: "home-authenticated-pod-forced-colors",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "pods",
    heading: "클러스터 상태",
    requiredSelectors: homeSelectors,
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
  },
  {
    id: "home-locale-smoke-ko",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "nodes",
    localeSmoke: "home",
    heading: localeSmokeCopy.ko.home.heading,
    requiredSelectors: [
      ...homeSelectors,
      "[data-slot='sidebar']",
      "[data-slot='sidebar-navigation']",
      "[data-slot='sidebar-menu']",
    ],
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "home-locale-smoke-en",
    locale: "en",
    navigatorLocale: "ko",
    persistedLocale: "en",
    verifyPersistedLocalePrecedence: true,
    expectedApiRequestCount: 2,
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "nodes",
    localeSmoke: "home",
    heading: localeSmokeCopy.en.home.heading,
    requiredSelectors: [
      ...homeSelectors,
      "[data-slot='sidebar']",
      "[data-slot='sidebar-navigation']",
      "[data-slot='sidebar-menu']",
    ],
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "resources-authenticated-desktop-light",
    locale: "ko",
    url: productResourcesUrl,
    authSession: "authenticated",
    resourcesScenario: true,
    heading: "리소스",
    requiredSelectors: resourcesSelectors,
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    layoutShiftBudget: maxInitialCumulativeLayoutShift,
    apiDelayMsByPath: {
      [homeBaseApiPaths[0]]: 300,
      [resourcesSummaryApiPath]: 350,
      [resourcesListApiPath]: 350,
    },
  },
  {
    id: "resources-authenticated-mobile-dark",
    locale: "ko",
    url: productResourcesUrl,
    authSession: "authenticated",
    resourcesScenario: true,
    heading: "리소스",
    requiredSelectors: resourcesSelectors,
    viewport: { width: 390, height: 844 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
  },
  {
    id: "resources-authenticated-reflow-320-light",
    locale: "ko",
    url: productResourcesUrl,
    authSession: "authenticated",
    resourcesScenario: true,
    heading: "리소스",
    requiredSelectors: resourcesSelectors,
    viewport: { width: 320, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "resources-authenticated-text-resize-200-light",
    locale: "ko",
    url: productResourcesUrl,
    authSession: "authenticated",
    resourcesScenario: true,
    heading: "리소스",
    requiredSelectors: resourcesSelectors,
    viewport: { width: 640, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "resources-authenticated-forced-colors",
    locale: "ko",
    url: productResourcesUrl,
    authSession: "authenticated",
    resourcesScenario: true,
    heading: "리소스",
    requiredSelectors: resourcesSelectors,
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
  },
  {
    id: "resources-locale-smoke-ko",
    locale: "ko",
    verifyLocaleTogglePersistence: "en",
    expectedApiRequestCount: 2,
    url: productResourcesUrl,
    authSession: "authenticated",
    resourcesScenario: true,
    localeSmoke: "resources",
    heading: localeSmokeCopy.ko.resources.heading,
    requiredSelectors: resourcesSelectors,
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "resources-locale-smoke-en",
    locale: "en",
    url: productResourcesUrl,
    authSession: "authenticated",
    resourcesScenario: true,
    localeSmoke: "resources",
    heading: localeSmokeCopy.en.resources.heading,
    requiredSelectors: resourcesSelectors,
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "resources-detail-reflow-320-dark",
    locale: "ko",
    url: `${productResourcesUrl}&resource=shop%2F${homePodName}&kind=Pod`,
    authSession: "authenticated",
    resourcesScenario: true,
    resourcesDetail: true,
    heading: `${homePodName} 상세`,
    requiredSelectors: resourcesDetailSelectors,
    viewport: { width: 320, height: 900 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
  },
  {
    id: "resources-detail-full-reflow-320-light",
    locale: "ko",
    url: `${productResourcesUrl}&resource=shop%2F${homePodName}&kind=Pod&full=1`,
    authSession: "authenticated",
    resourcesScenario: true,
    resourcesDetail: true,
    resourcesFull: true,
    heading: `${homePodName} 상세`,
    requiredSelectors: resourcesDetailSelectors,
    viewport: { width: 320, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "resources-detail-long-overview-text-resize-200-light",
    locale: "ko",
    url: `${productResourcesUrl}&resource=shop%2F${homePodName}&kind=Pod`,
    authSession: "authenticated",
    resourcesScenario: true,
    resourcesDetail: true,
    resourcesLongIdentity: true,
    resourcesDetailTab: "overview",
    heading: `${homePodName} 상세`,
    requiredSelectors: resourcesDetailSelectors,
    viewport: { width: 640, height: 1100 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "resources-detail-long-relations-text-resize-200-light",
    locale: "ko",
    url: `${productResourcesUrl}&resource=shop%2F${homePodName}&kind=Pod`,
    authSession: "authenticated",
    resourcesScenario: true,
    resourcesDetail: true,
    resourcesLongIdentity: true,
    resourcesDetailTab: "relations",
    heading: `${homePodName} 상세`,
    requiredSelectors: resourcesDetailSelectors,
    viewport: { width: 640, height: 1100 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "resources-detail-long-events-text-resize-200-light",
    locale: "ko",
    url: `${productResourcesUrl}&resource=shop%2F${homePodName}&kind=Pod`,
    authSession: "authenticated",
    resourcesScenario: true,
    resourcesDetail: true,
    resourcesLongIdentity: true,
    resourcesDetailTab: "events",
    heading: `${homePodName} 상세`,
    requiredSelectors: resourcesDetailSelectors,
    viewport: { width: 640, height: 1100 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "issues-authenticated-detail-desktop-light",
    locale: "en",
    url: productIssuesUrl,
    authSession: "authenticated",
    issuesScenario: true,
    accessibleTarget: "Issues",
    expectedApiRequestCounts: { [issuesListApiPath]: 2 },
    requiredSelectors: issuesSelectors,
    viewport: { width: 1440, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    layoutShiftBudget: maxInitialCumulativeLayoutShift,
    apiDelayMsByPath: {
      [homeBaseApiPaths[0]]: 300,
      [issuesListApiPath]: 400,
    },
  },
  {
    id: "issues-authenticated-detail-reflow-320-light",
    locale: "en",
    url: productIssuesUrl,
    authSession: "authenticated",
    issuesScenario: true,
    accessibleTarget: "Issues",
    expectedApiRequestCounts: { [issuesListApiPath]: 2 },
    requiredSelectors: issuesSelectors,
    viewport: { width: 320, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "issues-authenticated-detail-text-resize-200-light",
    locale: "en",
    url: productIssuesUrl,
    authSession: "authenticated",
    issuesScenario: true,
    accessibleTarget: "Issues",
    expectedApiRequestCounts: { [issuesListApiPath]: 2 },
    requiredSelectors: issuesSelectors,
    viewport: { width: 640, height: 1200 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
  },
  {
    id: "issues-authenticated-detail-forced-colors",
    locale: "en",
    url: productIssuesUrl,
    authSession: "authenticated",
    issuesScenario: true,
    accessibleTarget: "Issues",
    expectedApiRequestCounts: { [issuesListApiPath]: 2 },
    requiredSelectors: issuesSelectors,
    viewport: { width: 1024, height: 1000 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
  },
  {
    id: "home-cluster-forbidden-light",
    locale: "ko",
    url: productHomeUrl,
    authSession: "authenticated",
    homeScenario: true,
    homeFrame: "nodes",
    homeFeatureState: "cluster-forbidden",
    heading: "이 범위에 접근할 수 없습니다",
    requiredSelectors: homeForbiddenSelectors,
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "auth-session-error-light",
    locale: "ko",
    url: productUrl,
    authSession: "error",
    heading: "검증된 응답을 읽지 못했습니다",
    requiredSelectors: [...authStateSelectors, "[role='alert']", "[data-slot='button']"],
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "auth-session-loading-light",
    locale: "ko",
    url: productUrl,
    authSession: "loading",
    status: "세션 확인 중",
    loadingAssertions: true,
    requiredSelectors: authLoadingSelectors,
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
  },
  {
    id: "state-reflow-320-light",
    locale: "ko",
    url: stateHarnessUrl,
    heading: "공통 상태·작업 접근성 검증",
    requiredSelectors: stateSelectors,
    viewport: { width: 320, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    stateAssertions: true,
  },
  {
    id: "state-text-resize-200-light",
    locale: "ko",
    url: stateHarnessUrl,
    heading: "공통 상태·작업 접근성 검증",
    requiredSelectors: stateSelectors,
    viewport: { width: 640, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
    stateAssertions: true,
  },
  {
    id: "state-forced-colors",
    locale: "ko",
    url: stateHarnessUrl,
    heading: "공통 상태·작업 접근성 검증",
    requiredSelectors: stateSelectors,
    viewport: { width: 1024, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
    stateAssertions: true,
  },
  {
    id: "shell-desktop-expanded-light",
    locale: "ko",
    url: shellHarnessUrl,
    heading: "홈",
    requiredSelectors: [...shellSelectors, "[data-slot='sidebar']"],
    viewport: { width: 1440, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    shellMode: "desktop-expanded",
  },
  {
    id: "shell-desktop-collapsed-forced-colors",
    locale: "ko",
    url: shellHarnessUrl,
    heading: "홈",
    requiredSelectors: [...shellSelectors, "[data-slot='sidebar']"],
    viewport: { width: 1440, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "active",
    shellMode: "desktop-collapsed",
  },
  {
    id: "shell-mobile-drawer-dark-390",
    locale: "ko",
    url: shellHarnessUrl,
    heading: "홈",
    requiredSelectors: [
      ...shellSelectors,
      "[data-slot='sidebar-mobile']",
      "[data-slot='dialog-content']",
      "[data-slot='dialog-overlay']",
    ],
    viewport: { width: 390, height: 844 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
    shellMode: "mobile-open",
  },
  {
    id: "shell-mobile-drawer-dark-320",
    locale: "ko",
    url: shellHarnessUrl,
    heading: "홈",
    requiredSelectors: [
      ...shellSelectors,
      "[data-slot='sidebar-mobile']",
      "[data-slot='dialog-content']",
      "[data-slot='dialog-overlay']",
    ],
    viewport: { width: 320, height: 800 },
    theme: "dark",
    colorScheme: "dark",
    forcedColors: "none",
    shellMode: "mobile-open",
  },
  {
    id: "shell-text-resize-200-light",
    locale: "ko",
    url: shellHarnessUrl,
    heading: "홈",
    requiredSelectors: [
      ...shellSelectors,
      "[data-slot='sidebar-mobile']",
      "[data-slot='dialog-content']",
      "[data-slot='dialog-overlay']",
    ],
    viewport: { width: 640, height: 900 },
    theme: "light",
    colorScheme: "light",
    forcedColors: "none",
    rootFontScale: 2,
    shellMode: "mobile-open",
  },
];

const homeFeatureApiFixtures = new Map([
  [homeFeatureApiPaths[0], {
    clusters: [{
      workspace_id: "visual-workspace",
      cluster_id: homeClusterId,
      name: "visual-cluster",
      environment: "production",
      provider: "eks",
      status: "active",
      settings: {},
      connection_status: "online",
      connection_stage: "ready",
      last_agent_id: "visual-agent",
      last_agent_seen_at: "2026-07-12T10:00:00Z",
      node_count: 2,
      pod_count: 18,
      incident_count: 1,
      created_at: "2026-07-01T00:00:00Z",
      updated_at: "2026-07-12T10:00:01Z",
    }],
  }],
  [homeFeatureApiPaths[1], {
    cluster_id: homeClusterId,
    name: "visual-cluster",
    health: "warning",
    workloads: {
      deployments: [{
        name: "checkout-api",
        kind: "Deployment",
        namespace: "shop",
        health: "warning",
        ready: "2/3",
        restarts: 3,
      }],
    },
    warning_events: [{
      namespace: "shop",
      name: "checkout-warning",
      reason: "BackOff",
      message: "Container is restarting",
      involved_kind: "Pod",
      involved_name: homePodName,
      count: 2,
      last_seen_at: "2026-07-12T09:59:00Z",
    }],
    open_incidents: [{
      incident_id: "visual-incident",
      correlation_id: "visual-correlation",
      symptom: "Restart loop",
      root_cause: null,
      namespace: "shop",
      resource_kind: "Pod",
      resource_name: homePodName,
      status: "open",
      created_at: "2026-07-12T09:58:00Z",
    }],
    usage: {
      sampled_at: "2026-07-12T10:00:00Z",
      pods_running: 17,
      pods_total: 18,
      nodes_ready: 2,
      nodes_total: 2,
      restart_total: 3,
      cpu_pct: 42.5,
      mem_pct: 61.25,
    },
  }],
  [homeFeatureApiPaths[2], {
    cluster_id: homeClusterId,
    nodes: [{
      name: homeNodeName,
      ready: true,
      health: "healthy",
      pods_running: 9,
      pods_capacity: 110,
      cpu_pct: 37.5,
      mem_pct: 54,
      restarts_recent: 0,
      conditions: [],
    }, {
      name: "visual-node-warning",
      ready: false,
      health: "warning",
      pods_running: 8,
      pods_capacity: 110,
      cpu_pct: null,
      mem_pct: null,
      restarts_recent: 3,
      conditions: ["MemoryPressure"],
    }],
  }],
  [homeFeatureApiPaths[3], {
    cluster_id: homeClusterId,
    node_name: homeNodeName,
    pods: [{
      name: homePodName,
      namespace: "shop",
      phase: "Running",
      health: "warning",
      ready: "1/2",
      restarts: 3,
      owner_kind: "Deployment",
      owner_name: "checkout-api",
      cpu_mcores: 245.5,
      mem_mib: 382,
      incident_correlation_id: "visual-correlation",
    }, {
      name: "payments-api-0",
      namespace: "shop",
      phase: "Running",
      health: "healthy",
      ready: "1/1",
      restarts: 0,
      owner_kind: "Deployment",
      owner_name: "payments-api",
      cpu_mcores: 128,
      mem_mib: 256,
      incident_correlation_id: null,
    }],
  }],
]);

const resourcesDetailApiFixture = {
  cluster_id: homeClusterId,
  identity: {
    resource_type: "pod",
    kind: "Pod",
    namespace: "shop",
    name: homePodName,
  },
  resource: visualInventoryResource(),
  related: {
    services: [visualInventoryResource({
      inventory_key: "visual-service-checkout",
      resource_type: "service",
      kind: "Service",
      name: "checkout",
      uid: "visual-service-checkout-uid",
      status: "Active",
      summary: {
        type: "ClusterIP",
        cluster_ip: "10.96.0.10",
        external_url: null,
        external_hosts: [],
        ports: [{ name: "http", protocol: "TCP", port: 80, target_port: 8080 }],
      },
    })],
  },
  events: [visualInventoryResource({
    inventory_key: "visual-event-backoff",
    resource_type: "event",
    kind: "Event",
    name: "visual-pod:Pod:checkout-api-0:BackOff",
    uid: null,
    status: "Warning",
    health: "warning",
    summary: {
      type: "Warning",
      reason: "BackOff",
      message: "Container is restarting",
      count: 2,
      first_timestamp: "2026-07-12T09:58:00Z",
      last_timestamp: "2026-07-12T09:59:00Z",
      reporting_component: "kubelet",
      involved_kind: "Pod",
      involved_name: homePodName,
      involved_uid: "visual-pod-checkout-uid",
    },
  })],
};

const resourcesLongDetailApiFixture = {
  ...resourcesDetailApiFixture,
  resource: {
    ...resourcesDetailApiFixture.resource,
    uid: resourcesLongUid,
    summary: {
      ...resourcesDetailApiFixture.resource.summary,
      node_name: `visual-node-${"n".repeat(220)}`,
      owner_name: resourcesLongOwner,
    },
  },
  related: {
    services: [{
      ...resourcesDetailApiFixture.related.services[0],
      name: resourcesLongRelatedName,
      uid: `visual-service-${"s".repeat(220)}`,
    }],
  },
  events: [{
    ...resourcesDetailApiFixture.events[0],
    name: resourcesLongEventReason,
    summary: {
      ...resourcesDetailApiFixture.events[0].summary,
      reason: resourcesLongEventReason,
      message: resourcesLongEventMessage,
    },
  }],
};

const resourcesFeatureApiFixtures = new Map([
  [homeBaseApiPaths[0], homeFeatureApiFixtures.get(homeBaseApiPaths[0])],
  [resourcesSummaryApiPath, {
    cluster_id: homeClusterId,
    latest_snapshot: {
      snapshot_id: "visual-snapshot",
      collected_at: "2026-07-12T10:00:00Z",
    },
    counts: [
      { resource_type: "pod", health: "healthy", count: 1 },
      { resource_type: "pod", health: "degraded", count: 1 },
      { resource_type: "service", health: "healthy", count: 1 },
    ],
  }],
  [resourcesListApiPath, {
    cluster_id: homeClusterId,
    resource_type: "pod",
    resources: [
      visualInventoryResource(),
      visualInventoryResource({
        inventory_key: "visual-pod-payments",
        name: "payments-api-0",
        uid: "visual-pod-payments-uid",
        health: "healthy",
        summary: {
          phase: "Running",
          node_name: homeNodeName,
          restart_total: 0,
          cpu_mcores: 128,
          mem_mib: 256,
        },
      }),
    ],
  }],
  [resourcesDetailApiPath, resourcesDetailApiFixture],
]);

const issuesFeatureApiFixtures = new Map([
  [homeBaseApiPaths[0], homeFeatureApiFixtures.get(homeBaseApiPaths[0])],
  [issuesListApiPath, {
    items: [visualIssueTimelineItem()],
  }],
  [issuesDetailApiPath, {
    item: visualIssueTimelineItem({
      root_cause: "Memory pressure caused repeated Pod restarts",
      confidence: 0.91,
      supporting_evidence: ["OOMKilled event observed"],
      missing_evidence: [],
    }),
  }],
  [issuesEvidenceApiPath, {
    items: [{
      id: 7,
      workspace_id: "visual-workspace",
      correlation_id: issuesCorrelationId,
      kind: "incident.evidence",
      cluster_id: homeClusterId,
      evidence_ref: "visual-evidence",
      summary: "Kubernetes evidence collected",
      sources: [{
        source: "kubernetes",
        summary: "Pod restart and OOMKilled event",
        schema_version: 1,
        collector: "cluster-agent",
        collector_version: "1.0.0",
        source_version: null,
        query_version: null,
        collected_at: "2026-07-13T10:20:00Z",
        evidence_key: "kubernetes",
        source_id: null,
        agent_id: "visual-agent",
        window_start: null,
      }],
      created_at: "2026-07-13T10:20:00Z",
    }],
    limit: 50,
    offset: 0,
    has_more: false,
    next_cursor: null,
  }],
  [issuesReportsApiPath, {
    items: [{
      id: 11,
      workspace_id: "visual-workspace",
      correlation_id: issuesCorrelationId,
      root_cause: "Memory limit exceeded",
      action: "Increase memory limit after approval",
      incident_id: issuesIncidentId,
      cluster_id: homeClusterId,
      symptom: issuesSymptom,
      severity: "warning",
      confidence: 0.91,
      reason: "OOMKilled and memory usage evidence agree",
      evidence_ref: "visual-evidence",
      supporting_evidence: ["OOMKilled"],
      missing_evidence: [],
      created_at: "2026-07-13T10:30:00Z",
      resource_kind: "Deployment",
      resource_name: "checkout-api",
      namespace: "shop",
      secondary_symptoms: [],
      selected_candidate_id: "candidate-memory",
      candidates: [],
      supporting_evidence_refs: [],
      missing_evidence_checks: [],
    }],
    limit: 50,
    offset: 0,
    has_more: false,
    next_cursor: null,
  }],
  [issuesAuditApiPath, {
    items: [{
      subject: issuesAuditSubject,
      source: "dashboard-projection",
      created_at: "2026-07-13T10:10:00Z",
      causation_id: null,
      payload_summary: {
        incident_id: issuesIncidentId,
        severity: "warning",
      },
    }],
    limit: 50,
    has_more: false,
    next_cursor: null,
  }],
  [issuesRecentChangesApiPath, {
    incident_id: issuesIncidentId,
    items: [{
      event_id: "visual-change-event",
      changed_at: "2026-07-13T09:55:00Z",
      namespace: "shop",
      resource_kind: "Deployment",
      resource_name: "checkout-api",
      image_before: "registry.example/checkout:v1",
      image_after: "registry.example/checkout:v2",
      pr_url: "https://github.com/acme/platform/pull/42",
      commit_sha: "0123456789abcdef",
      repository_id: "visual-repository",
      repo_ref: "github.com/acme/platform",
      workflow_run_id: "visual-workflow-run",
    }],
    limit: 5,
  }],
  [issuesRecoveryApiPath, {
    plan_id: "visual-plan",
    correlation_id: issuesCorrelationId,
    incident_id: issuesIncidentId,
    evidence_ref: "visual-evidence",
    status: "selection_requested",
    summary: "Choose a safe action for the memory pressure incident",
    target: {
      cluster_id: homeClusterId,
      namespace: "shop",
      name: "checkout-api",
    },
    recommended_action_id: "increase-memory",
    execution_route: "approval",
    selection_required: true,
    selected_action_id: null,
    selected_by: null,
    selected_action: null,
    candidates: [{
      action_id: "increase-memory",
      title: "Increase memory limit",
      description: "Raise the checkout-api Deployment memory limit to 1Gi",
      route: "deployment.patch",
      rank: 1,
      score: 0.91,
      risk_level: "medium",
      blast_radius: "one Deployment",
      approval_required: true,
      prerequisites: ["confirm capacity"],
      validation_checks: ["rollout healthy"],
      rollback_plan: "Restore the previous memory limit",
      evidence_refs: ["visual-evidence"],
    }],
  }],
]);

function visualIssueTimelineItem(overrides = {}) {
  return {
    workspace_id: "visual-workspace",
    correlation_id: issuesCorrelationId,
    cluster_id: homeClusterId,
    incident_id: issuesIncidentId,
    incident_namespace: "shop",
    incident_resource_kind: "Deployment",
    incident_resource_name: "checkout-api",
    incident_symptom: issuesSymptom,
    evidence_ref: "visual-evidence",
    current_subject: issuesSubject,
    status: "investigating",
    root_cause: null,
    confidence: null,
    supporting_evidence: [],
    missing_evidence: ["Pod metrics"],
    action_route: `/issues/${issuesIncidentId}`,
    command_id: null,
    pr_url: null,
    error_reason: null,
    updated_at: "2026-07-13T10:30:00Z",
    ...overrides,
  };
}

function visualInventoryResource(overrides = {}) {
  return {
    inventory_key: "visual-pod-checkout",
    snapshot_id: "visual-snapshot",
    workspace_id: "visual-workspace",
    cluster_id: homeClusterId,
    resource_type: "pod",
    api_version: "v1",
    kind: "Pod",
    namespace: "shop",
    name: homePodName,
    uid: "visual-pod-checkout-uid",
    resource_version: "10",
    status: "Running",
    health: "degraded",
    labels: { app: "checkout" },
    annotations: { "kubectl.kubernetes.io/last-applied-configuration": "visual-secret-must-not-render" },
    summary: {
      phase: "Running",
      node_name: homeNodeName,
      owner_kind: "Deployment",
      owner_name: "checkout-api",
      restart_total: 3,
      cpu_mcores: 245.5,
      mem_mib: 382,
      waiting_reasons: ["CrashLoopBackOff"],
      terminated_reasons: [],
    },
    observed_at: "2026-07-12T10:00:00Z",
    first_seen_at: "2026-07-12T09:00:00Z",
    last_seen_at: "2026-07-12T10:00:00Z",
    deleted_at: null,
    created_at: "2026-07-12T09:00:00Z",
    updated_at: "2026-07-12T10:00:00Z",
    ...overrides,
  };
}

const server = spawn(
  "npm",
  ["run", "dev", "--", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    detached: process.platform !== "win32",
    env: { ...process.env, VITE_VISUAL_GATE_NONCE: runNonce },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
let browser;
let serverExit;
let serverReady = false;
let rejectStartup;
const startupFailure = new Promise((_, reject) => { rejectStartup = reject; });
server.stdout.on("data", (chunk) => { output += chunk.toString(); });
server.stderr.on("data", (chunk) => { output += chunk.toString(); });
server.on("error", (error) => {
  serverExit = { error };
  if (!serverReady) rejectStartup(error);
});
server.on("exit", (code, signal) => {
  serverExit = { code, signal };
  if (!serverReady) {
    rejectStartup(new Error(`visual Vite exited before ownership verification: code=${code} signal=${signal}`));
  }
});

try {
  await mkdir(outputDir, { recursive: true });
  await Promise.race([waitForOwnedServer(stateHarnessUrl, runNonce), startupFailure]);
  serverReady = true;
  assertServerAlive();
  browser = await chromium.launch({ headless: true });
  for (const scenario of visualScenarios) {
    assertServerAlive();
    await runVisualScenario(browser, scenario);
  }
  assertServerAlive();
  const expectedLayoutShiftMeasurements = visualScenarios.filter(
    ({ layoutShiftBudget }) => layoutShiftBudget !== undefined,
  ).length;
  if (layoutShiftMeasurements.length !== expectedLayoutShiftMeasurements) {
    throw new Error(
      `initial CLS coverage mismatch: expected ${expectedLayoutShiftMeasurements}, `
      + `received ${layoutShiftMeasurements.length}`,
    );
  }

  console.log(
    `product visual gate passed (${visualScenarios.map(({ id }) => id).join(", ")}; isolated contexts; exact scenario API requests; unexpected feature-network/websocket-silent; initial CLS ${formatLayoutShiftMeasurements()})`,
  );
} finally {
  try {
    await browser?.close();
  } finally {
    try {
      await stopOwnedServer();
    } finally {
      if (output.includes("error")) process.stderr.write(output);
    }
  }
}

async function runVisualScenario(browserInstance, scenario) {
  const navigatorLocale = scenario.navigatorLocale ?? scenario.locale;
  const persistedLocale = scenario.persistedLocale ?? scenario.locale;
  const browserLocale = browserLocales[navigatorLocale];
  if (!browserLocale) {
    throw new Error(`${scenario.id}: unsupported or missing navigator locale ${navigatorLocale}`);
  }
  const context = await browserInstance.newContext({
    colorScheme: scenario.colorScheme,
    forcedColors: scenario.forcedColors,
    locale: browserLocale,
    reducedMotion: "reduce",
    viewport: scenario.viewport,
  });
  await context.addInitScript(({ locale, localeStorageKey, rootFontScale, theme }) => {
    localStorage.setItem("kubeheal-theme", theme);
    if (localStorage.getItem(localeStorageKey) === null) {
      localStorage.setItem(localeStorageKey, locale);
    }
    const applyRootFontScale = () => {
      if (!(document.documentElement instanceof HTMLElement)) return false;
      const baselineRootFontSize = Number.parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      globalThis.__productVisualBaselineRootFontSize = baselineRootFontSize;
      if (rootFontScale !== undefined) {
        document.documentElement.style.fontSize = `${baselineRootFontSize * rootFontScale}px`;
      }
      return true;
    };
    if (!applyRootFontScale()) {
      const observer = new MutationObserver(() => {
        if (applyRootFontScale()) observer.disconnect();
      });
      observer.observe(document, { childList: true });
    }
  }, {
    locale: persistedLocale,
    localeStorageKey,
    rootFontScale: scenario.rootFontScale,
    theme: scenario.theme,
  });
  if (scenario.layoutShiftBudget !== undefined) {
    await context.addInitScript(() => {
      const supported = PerformanceObserver.supportedEntryTypes.includes("layout-shift");
      const state = { entries: [], supported };
      globalThis.__productVisualLayoutShift = state;
      if (!supported) return;

      const serializeRect = (rect) => ({
        height: rect.height,
        width: rect.width,
        x: rect.x,
        y: rect.y,
      });
      const sourceSelector = (node) => {
        const element = node instanceof Element
          ? node
          : node?.parentElement instanceof Element
            ? node.parentElement
            : null;
        if (!element) return null;
        if (element.id) return `#${CSS.escape(element.id)}`;
        const testIdElement = element.closest("[data-testid]");
        const testId = testIdElement?.getAttribute("data-testid");
        if (testId) return `[data-testid="${CSS.escape(testId)}"]`;
        const slotElement = element.closest("[data-slot]");
        const slot = slotElement?.getAttribute("data-slot");
        if (slot) return `[data-slot="${CSS.escape(slot)}"]`;
        const roleElement = element.closest("[role]");
        const role = roleElement?.getAttribute("role");
        if (role) return `[role="${CSS.escape(role)}"]`;
        return element.tagName.toLowerCase();
      };
      const recordEntries = (entries) => {
        for (const entry of entries) {
          state.entries.push({
            hadRecentInput: entry.hadRecentInput,
            sources: (entry.sources ?? []).map((source) => ({
              currentRect: serializeRect(source.currentRect),
              previousRect: serializeRect(source.previousRect),
              selector: sourceSelector(source.node),
            })),
            startTime: entry.startTime,
            value: entry.value,
          });
        }
      };
      const observer = new PerformanceObserver((list) => recordEntries(list.getEntries()));
      state.flush = () => recordEntries(observer.takeRecords());
      observer.observe({ buffered: true, type: "layout-shift" });
    });
  }

  const page = await context.newPage();
  const errors = [];
  const apiRequests = [];
  const networkRequests = [];
  const sockets = [];
  const apiFixtures = await installScenarioApiFixtures(page, scenario);

  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error"
      && !text.includes("favicon")
      && !isExpectedAuthSessionConsoleNoise(text, scenario.authSession)
      && !isExpectedHomeFeatureConsoleNoise(text, scenario)) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const record = `${request.method()} ${request.url()} (${request.resourceType()})`;
    if (isApiPath(request.url())) {
      apiRequests.push({
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
      });
    }
    if (!isExpectedScenarioApiRequest(scenario, request)
      && isUnexpectedFeatureNetworkRequest(request)) {
      networkRequests.push(record);
    }
  });
  page.on("websocket", (socket) => {
    if (!isViteDevelopmentSocket(socket.url())) sockets.push(socket.url());
  });

  try {
    await captureScenario(page, scenario);
    assertScenarioNetworkContract(scenario, {
      apiRequests,
      errors,
      networkRequests,
      sockets,
    });
  } finally {
    await apiFixtures.release();
    await context.close();
  }
}

function isExpectedHomeFeatureConsoleNoise(text, scenario) {
  return scenario.homeFeatureState === "cluster-forbidden"
    && /Failed to load resource:.*403 \(Forbidden\)/u.test(text);
}

async function installScenarioApiFixtures(page, scenario) {
  const authFixture = await installAuthSessionStub(page, scenario.authSession);
  if (scenario.homeScenario) {
    for (const [path, body] of homeFeatureApiFixtures) {
      const forbiddenOverview = scenario.homeFeatureState === "cluster-forbidden"
        && path === homeBaseApiPaths[1];
      await installExactJsonGetFixture(page, path, {
        body: forbiddenOverview
          ? { detail: "visual gate overview permission denied" }
          : body,
        status: forbiddenOverview ? 403 : 200,
        delayMs: scenario.apiDelayMsByPath?.[path] ?? 0,
      });
    }
  }
  if (scenario.resourcesScenario) {
    for (const [path, body] of resourcesFeatureApiFixtures) {
      const fixtureBody = scenario.resourcesLongIdentity && path === resourcesDetailApiPath
        ? resourcesLongDetailApiFixture
        : body;
      await installExactJsonGetFixture(page, path, {
        body: fixtureBody,
        delayMs: scenario.apiDelayMsByPath?.[path] ?? 0,
        status: 200,
      });
    }
  }
  if (scenario.issuesScenario) {
    for (const [path, body] of issuesFeatureApiFixtures) {
      await installExactJsonGetFixture(page, path, {
        body,
        delayMs: scenario.apiDelayMsByPath?.[path] ?? 0,
        status: 200,
      });
    }
  }
  return authFixture;
}

async function installAuthSessionStub(page, authSession) {
  if (!authSession) return { release: async () => {} };

  let releaseLoading = () => {};
  let loadingRouteCompletion = null;
  const loadingGate = authSession === "loading"
    ? new Promise((resolve) => { releaseLoading = resolve; })
    : null;

  await page.route((url) => isExactProductApiUrl(url, authSessionPath), async (route) => {
    if (route.request().method() !== "GET") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    if (authSession === "loading") {
      loadingRouteCompletion = (async () => {
        await loadingGate;
        try {
          await route.abort("timedout");
        } catch {
          // The isolated context may already be closing after the loading screenshot.
        }
      })();
      await loadingRouteCompletion;
      return;
    }

    if (authSession === "authenticated") {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          authenticated: true,
          user_id: "visual-gate-user",
          roles: ["viewer"],
          workspace_id: "visual-gate-workspace",
        }),
      });
      return;
    }

    if (authSession === "unauthenticated") {
      await route.fulfill({
        contentType: "application/json",
        status: 401,
        body: JSON.stringify({ detail: "visual gate unauthenticated session" }),
      });
      return;
    }

    if (authSession === "error") {
      await route.fulfill({
        contentType: "application/json",
        status: 503,
        body: JSON.stringify({ detail: "visual gate session unavailable" }),
      });
      return;
    }

    throw new Error(`Unsupported visual auth session state: ${authSession}`);
  });

  return {
    async release() {
      releaseLoading();
      await loadingRouteCompletion;
    },
  };
}

async function installExactJsonGetFixture(page, path, { body, delayMs = 0, status }) {
  await page.route((url) => isExactProductApiUrl(url, path), async (route) => {
    if (route.request().method() !== "GET") {
      await fulfillMethodNotAllowed(route);
      return;
    }
    if (!Number.isInteger(delayMs) || delayMs < 0) {
      throw new Error(`${path}: fixture delay must be a non-negative integer`);
    }
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    await route.fulfill({
      body: JSON.stringify(body),
      contentType: "application/json",
      status,
    });
  });
}

async function fulfillMethodNotAllowed(route) {
  await route.fulfill({
    body: JSON.stringify({ detail: "visual gate fixtures only allow GET" }),
    contentType: "application/json",
    headers: { allow: "GET" },
    status: 405,
  });
}

function assertScenarioNetworkContract(
  scenario,
  { apiRequests, errors, networkRequests, sockets },
) {
  const expectedApiPaths = expectedScenarioApiPaths(scenario);
  const featureApiRequests = apiRequests.filter(
    (request) => !isExactProductApiUrl(request.url, authSessionPath),
  );
  const unexpectedApiRequests = apiRequests.filter((request) => (
    request.method !== "GET"
    || !expectedApiPaths.some((path) => isExactProductApiUrl(request.url, path))
  ));
  const formatRequests = (requests) => requests.map((request) => (
    typeof request === "string"
      ? request
      : `${request.method} ${request.url} (${request.resourceType})`
  )).join("\n");

  if (errors.length) {
    throw new Error(`${scenario.id}: visual console errors\n${errors.join("\n")}`);
  }
  if (!scenario.homeScenario
    && !scenario.resourcesScenario
    && !scenario.issuesScenario
    && featureApiRequests.length !== 0) {
    throw new Error(
      `${scenario.id}: expected 0 feature API requests, received ${featureApiRequests.length}\n`
      + formatRequests(featureApiRequests),
    );
  }
  if (unexpectedApiRequests.length) {
    throw new Error(
      `${scenario.id}: visual gate made unexpected API requests\n${formatRequests(unexpectedApiRequests)}`,
    );
  }
  for (const path of expectedApiPaths) {
    const expectedRequestCount = scenario.expectedApiRequestCounts?.[path]
      ?? scenario.expectedApiRequestCount
      ?? 1;
    const matchingRequests = apiRequests.filter((request) => (
      request.method === "GET" && isExactProductApiUrl(request.url, path)
    ));
    if (matchingRequests.length !== expectedRequestCount) {
      throw new Error(
        `${scenario.id}: expected ${expectedRequestCount} exact GET ${path} requests, `
        + `received ${matchingRequests.length}\n${formatRequests(apiRequests)}`,
      );
    }
  }
  if (networkRequests.length) {
    throw new Error(
      `${scenario.id}: visual gate made unexpected feature or external network requests\n`
      + formatRequests(networkRequests),
    );
  }
  if (sockets.length) {
    throw new Error(
      `${scenario.id}: visual gate opened unexpected WebSockets\n${sockets.join("\n")}`,
    );
  }
}

function expectedScenarioApiPaths(scenario) {
  return [
    ...(scenario.authSession ? [authSessionPath] : []),
    ...(scenario.homeScenario ? homeBaseApiPaths : []),
    ...(scenario.homeFrame === "pods" ? [homePodApiPath] : []),
    ...(scenario.resourcesScenario ? resourcesBaseApiPaths : []),
    ...(scenario.resourcesDetail ? [resourcesDetailApiPath] : []),
    ...(scenario.issuesScenario ? [...issuesBaseApiPaths, ...issuesDetailApiPaths] : []),
  ];
}

function isExpectedScenarioApiRequest(scenario, request) {
  return request.method() === "GET"
    && expectedScenarioApiPaths(scenario).some(
      (path) => isExactProductApiUrl(request.url(), path),
    );
}

async function captureScenario(page, scenario) {
  const delayedApiPaths = Object.keys(scenario.apiDelayMsByPath ?? {});
  const initialDelayedRequest = delayedApiPaths.length > 0
    ? page.waitForRequest((request) => (
      request.method() === "GET"
      && isExactProductApiUrl(request.url(), delayedApiPaths[0])
    ))
    : null;
  await page.goto(scenario.url, {
    waitUntil: scenario.authSession === "loading" || initialDelayedRequest
      ? "domcontentloaded"
      : "networkidle",
  });
  if (initialDelayedRequest) {
    await initialDelayedRequest;
    await assertInitialLoadingPreview(page, scenario);
    await page.waitForLoadState("networkidle");
  }
  const baselineRootFontSize = await page.evaluate(() => (
    globalThis.__productVisualBaselineRootFontSize
      ?? Number.parseFloat(getComputedStyle(document.documentElement).fontSize)
  ));

  if (scenario.status) {
    await page.getByRole("status", { name: scenario.status }).waitFor();
  } else if (scenario.issuesScenario) {
    await page.getByRole("region", { name: scenario.accessibleTarget }).waitFor();
  } else if (scenario.resourcesDetail) {
    await page.getByRole("dialog", { name: scenario.heading }).waitFor();
  } else {
    await page.getByRole("heading", { name: scenario.heading }).waitFor();
  }
  await assertScenarioEnvironment(page, scenario, baselineRootFontSize);
  if (scenario.layoutShiftBudget !== undefined) {
    await assertInitialLayoutShift(page, scenario);
  }
  if (scenario.shellMode) {
    await prepareProductShellScenario(page, scenario);
  } else if (scenario.localeSmoke) {
    await prepareProductLocaleSmokeScenario(page, scenario);
  } else if (scenario.homeScenario) {
    await prepareProductHomeScenario(page, scenario);
  } else if (scenario.resourcesScenario) {
    await prepareProductResourcesScenario(page, scenario);
  } else if (scenario.issuesScenario) {
    await prepareProductIssuesScenario(page, scenario);
  } else if (!scenario.authSession || scenario.authSession === "authenticated") {
    await page.keyboard.press("?");
    if (await page.getByRole("dialog").count()) {
      throw new Error(`${scenario.id}: release-only shortcut dialog mounted unexpectedly`);
    }
  }
  const mainCount = scenario.shellMode || scenario.resourcesDetail
    ? await page.locator("main").count()
    : await page.getByRole("main").count();
  if (mainCount !== 1) {
    throw new Error(`${scenario.id}: visual surface must expose one main landmark`);
  }

  if (scenario.loadingAssertions) {
    await assertProductLoadingScreenContracts(page, scenario);
  }
  if (scenario.stateAssertions) {
    await assertStatePrimitiveContracts(page, scenario.id);
    await assertInteractionPrimitiveContracts(page, scenario.id);
  }
  if (scenario.shellMode) {
    await assertProductShellContracts(page, scenario);
  }
  await assertNoOverflow(page, scenario.id, scenario.requiredSelectors);
  if (scenario.forcedColors === "active") {
    if (scenario.shellMode) await assertProductShellForcedColors(page, scenario.id);
    else if (scenario.homeScenario) await assertProductHomeForcedColors(page, scenario.id);
    else if (scenario.resourcesScenario) await assertProductResourcesForcedColors(page, scenario.id);
    else if (scenario.issuesScenario) await assertProductIssuesForcedColors(page, scenario.id);
    else if (scenario.authSession === "unauthenticated") {
      await assertAuthForcedColors(page, scenario.id);
    }
    else await assertForcedColors(page, scenario.id);
  }
  await page.screenshot({
    path: `${outputDir}product-${scenario.id}.png`,
    fullPage: true,
  });
}

async function assertInitialLoadingPreview(page, scenario) {
  await page.locator("[data-slot='loading-preview']").waitFor({ state: "visible" });
  const result = await page.evaluate(() => {
    const preview = document.querySelector("[data-slot='loading-preview']");
    const skeletons = [...document.querySelectorAll(
      "[data-slot='loading-preview'] [data-slot='skeleton']",
    )];
    const visibleSkeletons = skeletons.filter((skeleton) => {
      const bounds = skeleton.getBoundingClientRect();
      return bounds.height > 0 && bounds.width > 0;
    });
    return {
      previewAriaHidden: preview?.getAttribute("aria-hidden") ?? null,
      previewInert: preview?.hasAttribute("inert") ?? false,
      skeletonCount: skeletons.length,
      visibleSkeletonCount: visibleSkeletons.length,
    };
  });
  if (result.previewAriaHidden !== "true"
    || !result.previewInert
    || result.skeletonCount === 0
    || result.visibleSkeletonCount !== result.skeletonCount) {
    throw new Error(
      `${scenario.id}: delayed API loading preview contract failed ${JSON.stringify(result)}`,
    );
  }
}

async function assertInitialLayoutShift(page, scenario) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  const measurement = await page.evaluate(() => {
    const state = globalThis.__productVisualLayoutShift;
    if (!state) return null;
    state.flush?.();
    const eligibleEntries = state.entries
      .filter((entry) => !entry.hadRecentInput)
      .sort((left, right) => left.startTime - right.startTime);
    let activeSession = null;
    let maximumSession = { entries: [], value: 0 };

    for (const entry of eligibleEntries) {
      const startsNewSession = activeSession === null
        || entry.startTime - activeSession.lastEntryTime >= 1_000
        || entry.startTime - activeSession.startTime >= 5_000;
      if (startsNewSession) {
        activeSession = {
          entries: [],
          lastEntryTime: entry.startTime,
          startTime: entry.startTime,
          value: 0,
        };
      }
      activeSession.entries.push(entry);
      activeSession.lastEntryTime = entry.startTime;
      activeSession.value += entry.value;
      if (activeSession.value > maximumSession.value) {
        maximumSession = {
          entries: [...activeSession.entries],
          value: activeSession.value,
        };
      }
    }

    return {
      excludedRecentInputCount: state.entries.length - eligibleEntries.length,
      supported: state.supported,
      value: maximumSession.value,
      worstSessionEntries: maximumSession.entries,
    };
  });
  if (!measurement?.supported) {
    throw new Error(`${scenario.id}: layout-shift PerformanceObserver is unavailable`);
  }
  const sourceSelectors = [...new Set(
    measurement.worstSessionEntries.flatMap(({ sources }) => (
      sources.map(({ selector }) => selector).filter(Boolean)
    )),
  )];
  layoutShiftMeasurements.push({
    id: scenario.id,
    sourceSelectors,
    value: measurement.value,
  });
  const sourceDiagnostics = measurement.worstSessionEntries.map((entry) => ({
    sources: entry.sources,
    startTime: entry.startTime,
    value: entry.value,
  }));
  console.log(
    `[CLS] ${scenario.id}=${measurement.value.toFixed(6)} `
    + `sources=${JSON.stringify(sourceSelectors)} `
    + `diagnostics=${JSON.stringify(sourceDiagnostics)}`,
  );
  if (measurement.value >= scenario.layoutShiftBudget) {
    throw new Error(
      `${scenario.id}: initial CLS ${measurement.value.toFixed(6)} must be below `
      + `${scenario.layoutShiftBudget.toFixed(3)}; sources=`
      + JSON.stringify(measurement.worstSessionEntries),
    );
  }
}

function formatLayoutShiftMeasurements() {
  if (layoutShiftMeasurements.length === 0) return "not-measured";
  return layoutShiftMeasurements
    .map(({ id, value }) => `${id}=${value.toFixed(6)}`)
    .join(", ");
}

async function assertProductLoadingScreenContracts(page, scenario) {
  const result = await page.evaluate(() => {
    const main = document.querySelector("main[aria-busy='true']");
    const preview = document.querySelector("[data-slot='loading-preview']");
    const shell = document.querySelector("[data-slot='product-shell-loading']");
    const shellSidebar = shell?.querySelector("aside");
    const shellHeader = shell?.querySelector("header");
    const clusterScope = shellHeader?.querySelector("[data-slot='loading-cluster-scope']");
    const sessionIdentity = shell?.querySelector("[data-slot='loading-session-identity']");
    const pageFrame = shell?.querySelector("[data-slot='product-page-frame']");
    const status = document.querySelector("[role='status']");
    const skeletons = [...document.querySelectorAll("[data-slot='skeleton']")];
    const rect = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
      };
    };
    const rootStyle = getComputedStyle(document.documentElement);
    const sidebarWidthToken = rootStyle
      .getPropertyValue("--product-sidebar-width")
      .trim();
    const sidebarWidth = sidebarWidthToken.endsWith("rem")
      ? Number.parseFloat(sidebarWidthToken) * Number.parseFloat(rootStyle.fontSize)
      : Number.parseFloat(sidebarWidthToken);
    const rootFontSize = Number.parseFloat(rootStyle.fontSize);
    const identityWidthToken = rootStyle
      .getPropertyValue("--product-toolbar-identity-width")
      .trim();
    const expectedIdentityWidth = matchMedia("(min-width: 64rem)").matches
      ? identityWidthToken.endsWith("rem")
        ? Number.parseFloat(identityWidthToken) * rootFontSize
        : Number.parseFloat(identityWidthToken)
      : 0;
    return {
      legacyContentCount: document.querySelectorAll("[data-slot='empty'], h1, p").length,
      mainCount: document.querySelectorAll("main[aria-busy='true']").length,
      mainLabel: main?.getAttribute("aria-label") ?? null,
      previewAriaHidden: preview?.getAttribute("aria-hidden") ?? null,
      previewContainsAllSkeletons: preview instanceof HTMLElement
        && skeletons.every((skeleton) => preview.contains(skeleton)),
      previewInert: preview?.hasAttribute("inert") ?? false,
      skeletonCount: skeletons.length,
      skeletonsAreHidden: skeletons.every(
        (skeleton) => skeleton.getAttribute("aria-hidden") === "true",
      ),
      shellFrameRect: rect(pageFrame),
      shellHeaderRect: rect(shellHeader),
      shellClusterScopeRect: rect(clusterScope),
      shellIdentityRect: rect(sessionIdentity),
      shellRect: rect(shell),
      shellSidebarRect: rect(shellSidebar),
      expectedHeaderHeight: 3.5 * rootFontSize,
      expectedClusterScopeHeight: 2 * rootFontSize,
      expectedIdentityWidth,
      sidebarWidth,
      statusLabel: status?.getAttribute("aria-label") ?? null,
      statusText: status?.textContent?.trim() ?? null,
    };
  });
  if (result.mainCount !== 1
    || result.mainLabel !== scenario.status
    || result.statusLabel !== scenario.status
    || result.statusText !== scenario.status
    || result.skeletonCount === 0
    || !result.skeletonsAreHidden
    || !result.previewContainsAllSkeletons
    || result.previewAriaHidden !== "true"
    || !result.previewInert
    || result.legacyContentCount !== 0) {
    throw new Error(
      `${scenario.id}: ProductLoadingScreen skeleton contract failed ${JSON.stringify(result)}`,
    );
  }
  if (scenario.viewport.width >= 768 && result.shellRect) {
    if (!result.shellSidebarRect || !result.shellFrameRect
      || Math.abs(result.shellSidebarRect.width - result.sidebarWidth) > 1
      || Math.abs(result.shellFrameRect.left - result.sidebarWidth) > 1
      || Math.abs(result.shellFrameRect.right - result.shellRect.right) > 1) {
      throw new Error(
        `${scenario.id}: loading shell geometry diverged from product tokens ${JSON.stringify(result)}`,
      );
    }
  }
  if (result.expectedIdentityWidth > 0
    && (!result.shellIdentityRect || !result.shellHeaderRect
      || Math.abs(result.shellIdentityRect.width - result.expectedIdentityWidth) > 1
      || Math.abs(result.shellHeaderRect.height - result.expectedHeaderHeight) > 1)) {
    throw new Error(
      `${scenario.id}: loading toolbar did not reserve ready-state geometry ${JSON.stringify(result)}`,
    );
  }
  if (!result.shellClusterScopeRect || !result.shellHeaderRect
    || result.shellClusterScopeRect.width <= 0
    || Math.abs(result.shellClusterScopeRect.height - result.expectedClusterScopeHeight) > 1
    || result.shellClusterScopeRect.left < result.shellHeaderRect.left - 1
    || result.shellClusterScopeRect.right > result.shellHeaderRect.right + 1) {
    throw new Error(
      `${scenario.id}: loading cluster scope did not reserve shell-header geometry ${JSON.stringify(result)}`,
    );
  }
}

async function prepareProductLocaleSmokeScenario(page, scenario) {
  const copy = localeSmokeCopy[scenario.locale]?.[scenario.localeSmoke];
  if (!copy) {
    throw new Error(
      `${scenario.id}: locale smoke copy is missing for ${scenario.locale}/${scenario.localeSmoke}`,
    );
  }
  await page.waitForFunction(() => document.title === "Opsia");
  await assertPageLocaleState(
    page,
    scenario,
    scenario.locale,
    scenario.persistedLocale ?? scenario.locale,
    "initial",
  );
  if (scenario.verifyPersistedLocalePrecedence) {
    if (scenario.locale !== "en"
      || scenario.persistedLocale !== "en"
      || scenario.navigatorLocale !== "ko") {
      throw new Error(`${scenario.id}: persisted-locale precedence fixture must be ko navigator + en storage`);
    }
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("heading", { name: copy.heading }).waitFor();
    await assertPageLocaleState(page, scenario, "en", "en", "precedence reload");
  }

  await assertLocalizedRouteCurrent(page, scenario.localeSmoke, scenario.locale, scenario.id);

  await page.getByText("Opsia", { exact: true }).waitFor();
  if (scenario.localeSmoke === "home") {
    await assertGlobalClusterScopePicker(page, scenario.id, scenario.locale);
    await page.getByRole("button", { name: new RegExp(`^${homeNodeName}(?:\\s|$)`, "u") }).waitFor();
  } else if (scenario.localeSmoke === "resources") {
    await page.locator("table[data-slot='table']").waitFor();
    await page.getByText(homePodName, { exact: true }).first().waitFor();
  } else {
    throw new Error(`${scenario.id}: unsupported locale smoke surface ${scenario.localeSmoke}`);
  }

  // Brand and Kubernetes fixture identities are source data, not translation targets.
  const immutableText = await page.locator("body").innerText();
  const requiredSourceText = scenario.localeSmoke === "home"
    ? ["Opsia", homeClusterId, homeNodeName]
    : ["Opsia", homeClusterId, homePodName];
  const missingSourceText = requiredSourceText.filter((value) => !immutableText.includes(value));
  if (missingSourceText.length) {
    throw new Error(
      `${scenario.id}: locale smoke changed or omitted source text ${missingSourceText.join(", ")}`,
    );
  }
  if (scenario.verifyLocaleTogglePersistence) {
    await assertLocaleToggleReloadPersistence(
      page,
      scenario,
      scenario.verifyLocaleTogglePersistence,
    );
  }
}

async function assertPageLocaleState(
  page,
  scenario,
  expectedLocale,
  expectedPersistedLocale,
  phase,
) {
  const localeState = await page.evaluate((storageKey) => ({
    browserLocale: navigator.language,
    documentLocale: document.documentElement.lang,
    persistedLocale: localStorage.getItem(storageKey),
  }), localeStorageKey);
  const expectedBrowserLocale = browserLocales[scenario.navigatorLocale ?? scenario.locale];
  if (localeState.browserLocale !== expectedBrowserLocale
    || localeState.documentLocale !== expectedLocale
    || localeState.persistedLocale !== expectedPersistedLocale) {
    throw new Error(
      `${scenario.id}: ${phase} locale state mismatch ${JSON.stringify(localeState)}`,
    );
  }
}

async function assertLocalizedRouteCurrent(page, surface, locale, label) {
  const copy = localeSmokeCopy[locale]?.[surface];
  if (!copy) throw new Error(`${label}: missing ${locale}/${surface} locale route copy`);
  const navigation = page.getByRole("navigation", { name: copy.navigation });
  await navigation.waitFor();
  const activeRoute = navigation.getByRole("link", { name: copy.route, exact: true });
  if (await activeRoute.getAttribute("aria-current") !== "page") {
    throw new Error(`${label}: localized ${copy.route} route must be current`);
  }
}

async function assertLocaleToggleReloadPersistence(page, scenario, targetLocale) {
  const initialLocale = scenario.locale;
  if (targetLocale === initialLocale
    || !localeControlCopy[initialLocale]
    || !localeControlCopy[targetLocale]) {
    throw new Error(`${scenario.id}: invalid locale-toggle persistence fixture ${targetLocale}`);
  }
  const initialGeometry = await captureLocalizedGeometry(page, initialLocale);
  await selectLocale(page, initialLocale, targetLocale);
  await waitForStableLayout(page);
  const targetGeometry = await captureLocalizedGeometry(page, targetLocale);
  assertStableGeometry(initialGeometry, targetGeometry, scenario.id);
  await assertPageLocaleState(page, scenario, targetLocale, targetLocale, "after locale toggle");

  await page.reload({ waitUntil: "networkidle" });
  const targetCopy = localeSmokeCopy[targetLocale]?.[scenario.localeSmoke];
  if (!targetCopy) throw new Error(`${scenario.id}: missing target locale smoke copy`);
  await page.getByRole("heading", { name: targetCopy.heading }).waitFor();
  await assertPageLocaleState(page, scenario, targetLocale, targetLocale, "toggle reload");
  await assertLocalizedRouteCurrent(page, scenario.localeSmoke, targetLocale, scenario.id);

  await selectLocale(page, targetLocale, initialLocale);
  await page.getByRole("heading", { name: localeSmokeCopy[initialLocale][scenario.localeSmoke].heading }).waitFor();
  await assertPageLocaleState(page, scenario, initialLocale, initialLocale, "locale restore");
  await assertLocalizedRouteCurrent(page, scenario.localeSmoke, initialLocale, scenario.id);
}

async function captureLocalizedGeometry(page, locale) {
  const control = localeControlCopy[locale];
  return page.evaluate((controlLabel) => {
    const rect = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const bounds = element.getBoundingClientRect();
      return {
        height: bounds.height,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const shellHeader = document.querySelector("[data-slot='sidebar-inset'] > header");
    const clusterPicker = shellHeader?.querySelector("[data-slot='cluster-scope-picker']");
    const clusterTrigger = clusterPicker?.querySelector("[data-slot='select-trigger']");
    const localeTrigger = [...document.querySelectorAll("[data-slot='select-trigger']")]
      .find((element) => element.getAttribute("aria-label") === controlLabel);
    return {
      clusterPicker: rect(clusterPicker),
      clusterTrigger: rect(clusterTrigger),
      localeTrigger: rect(localeTrigger),
      shellHeader: rect(shellHeader),
    };
  }, control.control);
}

function assertStableGeometry(before, after, label) {
  for (const key of Object.keys(before)) {
    const left = before[key];
    const right = after[key];
    if (!left || !right) {
      throw new Error(`${label}: locale geometry fixture missing ${key}`);
    }
    for (const axis of ["height", "left", "top", "width"]) {
      if (Math.abs(left[axis] - right[axis]) > 1) {
        throw new Error(
          `${label}: locale changed ${key}.${axis} ${JSON.stringify({ before: left, after: right })}`,
        );
      }
    }
  }
}

async function waitForStableLayout(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => (
      requestAnimationFrame(resolve)
    )));
  });
}

async function selectLocale(page, currentLocale, targetLocale) {
  const currentCopy = localeControlCopy[currentLocale];
  const targetCopy = localeControlCopy[targetLocale];
  const trigger = page.getByRole("combobox", { name: currentCopy.control });
  await trigger.click();
  await page.getByRole("option", {
    name: currentCopy.options[targetLocale],
    exact: true,
  }).click();
  await page.getByRole("combobox", { name: targetCopy.control }).waitFor();
}

async function prepareProductHomeScenario(page, scenario) {
  await page.waitForFunction(() => document.title === "Opsia");
  if (scenario.homeFeatureState === "cluster-forbidden") {
    await assertProductHomeClusterForbidden(page, scenario.id);
    return;
  }
  await assertGlobalClusterScopePicker(page, scenario.id, scenario.locale);

  const desktop = scenario.viewport.width >= 768;
  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  if (desktop) {
    if (await navigation.count() !== 1) {
      throw new Error(`${scenario.id}: desktop Home must expose one primary navigation`);
    }
    const homeLink = page.getByRole("link", { name: "홈", exact: true });
    if (await homeLink.getAttribute("aria-current") !== "page") {
      throw new Error(`${scenario.id}: desktop Home link must be current`);
    }
    const visibleHomeLabels = await visibleExactTextCount(page, "홈");
    if (visibleHomeLabels !== 1) {
      throw new Error(
        `${scenario.id}: visible Home location label must appear only in the sidebar; `
        + `received ${visibleHomeLabels}`,
      );
    }
  } else {
    if (await navigation.count() !== 0) {
      throw new Error(`${scenario.id}: closed mobile Home must not mount drawer navigation`);
    }
    if (await page.getByRole("button", { name: "모바일 사이드바 열기" }).count() !== 1) {
      throw new Error(`${scenario.id}: mobile Home must expose its sidebar trigger`);
    }
    if (await visibleExactTextCount(page, "홈") !== 0) {
      throw new Error(`${scenario.id}: closed mobile sidebar must not duplicate the Home label`);
    }
  }

  const node = page.getByRole("button", { name: /^visual-node(?:\s|$)/u });
  await node.waitFor();
  if (await node.count() !== 1) {
    throw new Error(`${scenario.id}: expected exactly one ${homeNodeName} Node control`);
  }
  await assertProductHomeReducedMotion(page, `${scenario.id}:node`);
  await assertProductHomeFreshnessContract(page, scenario.id);
  await assertProductHomeNodeFrame(page, scenario.id);
  if (scenario.sidebarReflowAssertions) {
    await assertProductHomeSidebarReflow(page, scenario.id);
  }

  if (scenario.homeFrame === "nodes") {
    const currentUrl = new URL(page.url());
    if (currentUrl.origin !== baseUrl
      || currentUrl.pathname !== "/product"
      || currentUrl.searchParams.size !== 1
      || currentUrl.searchParams.get("cluster") !== homeClusterId
      || currentUrl.searchParams.has("node")) {
      throw new Error(`${scenario.id}: Node frame URL is not exact: ${currentUrl.href}`);
    }
    if (await page.getByRole("heading", { name: `${homeNodeName}의 Pod` }).count()) {
      throw new Error(`${scenario.id}: Node frame mounted a Pod drill-in before selection`);
    }
    return;
  }

  if (scenario.homeFrame !== "pods") {
    throw new Error(`${scenario.id}: unsupported Home frame ${scenario.homeFrame}`);
  }

  await node.click();
  await assertProductHomePodFrame(page, scenario.id);

  const currentUrl = new URL(page.url());
  if (currentUrl.origin !== baseUrl
    || currentUrl.pathname !== "/product"
    || currentUrl.searchParams.size !== 2
    || currentUrl.searchParams.get("cluster") !== homeClusterId
    || currentUrl.searchParams.get("node") !== homeNodeName) {
    throw new Error(`${scenario.id}: Node drill-in URL is not exact: ${currentUrl.href}`);
  }
  await assertProductHomeReducedMotion(page, `${scenario.id}:pods`);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  });
}

async function assertProductHomeSidebarReflow(page, label) {
  const capture = () => page.evaluate(() => {
    const rect = (element) => {
      if (!(element instanceof HTMLElement)) return null;
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        width: bounds.width,
      };
    };
    const rootStyle = getComputedStyle(document.documentElement);
    const toPixels = (token) => {
      const value = rootStyle.getPropertyValue(token).trim();
      return value.endsWith("rem")
        ? Number.parseFloat(value) * Number.parseFloat(rootStyle.fontSize)
        : Number.parseFloat(value);
    };
    return {
      expectedCollapsedWidth: toPixels("--product-sidebar-width-collapsed"),
      expectedExpandedWidth: toPixels("--product-sidebar-width"),
      frame: rect(document.querySelector("[data-slot='product-page-frame']")),
      inset: rect(document.querySelector("[data-slot='sidebar-inset']")),
      main: rect(document.querySelector("#product-main")),
      sidebar: rect(document.querySelector("[data-slot='sidebar']")),
    };
  });
  const expanded = await capture();
  await page.getByRole("button", { name: "사이드바 접기" }).click();
  await page.getByRole("button", { name: "사이드바 펼치기" }).waitFor();
  await page.waitForFunction(() => {
    const sidebar = document.querySelector("[data-slot='sidebar']");
    if (!(sidebar instanceof HTMLElement)) return false;
    const rootStyle = getComputedStyle(document.documentElement);
    const value = rootStyle.getPropertyValue("--product-sidebar-width-collapsed").trim();
    const expected = value.endsWith("rem")
      ? Number.parseFloat(value) * Number.parseFloat(rootStyle.fontSize)
      : Number.parseFloat(value);
    return Math.abs(sidebar.getBoundingClientRect().width - expected) <= 1;
  });
  await waitForStableLayout(page);
  const collapsed = await capture();
  const required = [expanded.frame, expanded.inset, expanded.main, expanded.sidebar,
    collapsed.frame, collapsed.inset, collapsed.main, collapsed.sidebar];
  if (required.some((value) => value === null)) {
    throw new Error(`${label}: sidebar reflow fixture is incomplete`);
  }
  const delta = expanded.sidebar.width - collapsed.sidebar.width;
  const expectedDelta = expanded.expectedExpandedWidth - collapsed.expectedCollapsedWidth;
  const close = (left, right) => Math.abs(left - right) <= 1;
  if (!close(expanded.sidebar.width, expanded.expectedExpandedWidth)
    || !close(collapsed.sidebar.width, collapsed.expectedCollapsedWidth)
    || !close(delta, expectedDelta)
    || !close(collapsed.inset.width, expanded.inset.width + delta)
    || !close(collapsed.inset.left, expanded.inset.left - delta)
    || !close(collapsed.inset.right, expanded.inset.right)
    || !close(collapsed.main.width, expanded.main.width + delta)
    || !close(collapsed.main.left, expanded.main.left - delta)
    || !close(collapsed.main.right, expanded.main.right)
    || !close(collapsed.frame.width, expanded.frame.width + delta)
    || !close(collapsed.frame.left, expanded.frame.left - delta)
    || !close(collapsed.frame.right, expanded.frame.right)) {
    throw new Error(
      `${label}: sidebar collapse did not redistribute width ${JSON.stringify({ expanded, collapsed, delta })}`,
    );
  }
}

async function visibleExactTextCount(page, text) {
  return page.locator("body *").evaluateAll((elements, expected) => elements.filter((element) => {
    const ownText = [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join("")
      .trim();
    if (ownText !== expected) return false;
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return bounds.width > 2 && bounds.height > 2
      && style.display !== "none"
      && style.visibility !== "hidden"
      && style.opacity !== "0";
  }).length, text);
}

async function prepareProductResourcesScenario(page, scenario) {
  await page.waitForFunction(() => document.title === "Opsia");
  const table = scenario.resourcesDetail
    ? page.locator("table[data-slot='table'][aria-label='리소스 목록']")
    : page.getByRole("table", { name: "리소스 목록" });
  await table.waitFor({ state: scenario.resourcesDetail ? "attached" : "visible" });
  await page.getByText(homePodName, { exact: true }).first().waitFor();

  await assertGlobalClusterScopePicker(page, scenario.id, scenario.locale, {
    state: scenario.resourcesDetail ? "attached" : "visible",
  });

  const scopeText = await page.locator("[role='status'][aria-label='목록 범위']").innerText();
  if (!/표시\s*2/u.test(scopeText) || !/전체 수 미확인/u.test(scopeText)) {
    throw new Error(
      `${scenario.id}: Resources unknown-completeness list copy is dishonest ${JSON.stringify(scopeText)}`,
    );
  }
  const productText = await page.locator("main").innerText();
  if (productText.includes("visual-secret-must-not-render")) {
    throw new Error(`${scenario.id}: unredacted annotation reached the Resources DOM`);
  }
  const desktop = scenario.viewport.width >= 768;
  const navigation = page.getByRole("navigation", { name: "주요 메뉴" });
  if (desktop) {
    const resourcesLink = page.getByRole("link", { name: "리소스", exact: true });
    if (await resourcesLink.getAttribute("aria-current") !== "page") {
      throw new Error(`${scenario.id}: desktop Resources link must be current`);
    }
    const visibleResourcesLabels = await visibleExactTextCount(page, "리소스");
    if (visibleResourcesLabels !== 1) {
      throw new Error(
        `${scenario.id}: visible Resources location label must appear only in the sidebar; `
        + `received ${visibleResourcesLabels}`,
      );
    }
  } else {
    if (await navigation.count() !== 0) {
      throw new Error(`${scenario.id}: closed mobile Resources must not mount drawer navigation`);
    }
    if (await visibleExactTextCount(page, "리소스") !== 0) {
      throw new Error(`${scenario.id}: closed mobile sidebar must not duplicate the Resources label`);
    }
  }

  if (scenario.resourcesDetail) {
    const dialog = page.getByRole("dialog", { name: `${homePodName} 상세` });
    await dialog.waitFor();
    const bounds = await dialog.boundingBox();
    if (!bounds || bounds.width < scenario.viewport.width - 2) {
      throw new Error(
        `${scenario.id}: 320px detail Sheet must use the viewport width ${JSON.stringify(bounds)}`,
      );
    }
    if (await dialog.getByRole("tab", { name: /개요/u }).count() !== 1) {
      throw new Error(`${scenario.id}: Resources detail tabs are missing`);
    }
    const url = new URL(page.url());
    if (url.searchParams.get("resource") !== `shop/${homePodName}`
      || url.searchParams.get("kind") !== "Pod"
      || (scenario.resourcesFull && url.searchParams.get("full") !== "1")) {
      throw new Error(`${scenario.id}: detail URL identity is not exact: ${url.href}`);
    }
    if (scenario.resourcesLongIdentity) {
      await prepareLongResourceDetailTab(page, scenario, dialog);
    }
  } else {
    const url = new URL(page.url());
    if (url.pathname !== "/product/resources/pod"
      || url.searchParams.get("cluster") !== homeClusterId
      || url.searchParams.has("resource")) {
      throw new Error(`${scenario.id}: Resources list URL is not exact: ${url.href}`);
    }
  }

  await assertProductResourcesReducedMotion(page, scenario.id);
}

async function prepareLongResourceDetailTab(page, scenario, dialog) {
  if (scenario.resourcesDetailTab === "overview") {
    await dialog.getByText(resourcesLongUid, { exact: true }).waitFor();
    await dialog.getByText(`Deployment/${resourcesLongOwner}`, { exact: true }).waitFor();
    await assertNoOverflow(page, `${scenario.id}-overview`, [
      ...resourcesDetailSelectors,
      "[data-slot='resource-definition-value']",
    ]);
    return;
  }
  if (scenario.resourcesDetailTab === "relations") {
    await dialog.getByRole("tab", { name: "관계 1", exact: true }).dispatchEvent("click");
    await dialog.getByText(
      `Service · shop/${resourcesLongRelatedName}`,
      { exact: true },
    ).waitFor();
    await assertNoOverflow(page, `${scenario.id}-relations`, [
      ...resourcesDetailSelectors,
      "[data-slot='resource-related-identity']",
    ]);
    return;
  }
  if (scenario.resourcesDetailTab === "events") {
    await dialog.getByRole("tab", { name: "이벤트 1", exact: true }).dispatchEvent("click");
    await dialog.getByText(resourcesLongEventReason, { exact: true }).waitFor();
    await dialog.getByText(resourcesLongEventMessage, { exact: true }).waitFor();
    await assertNoOverflow(page, `${scenario.id}-events`, [
      ...resourcesDetailSelectors,
      "[data-slot='resource-event-title']",
      "[data-slot='resource-event-message']",
    ]);
    return;
  }
  throw new Error(`${scenario.id}: unknown long-detail tab ${scenario.resourcesDetailTab}`);
}

async function prepareProductIssuesScenario(page, scenario) {
  await page.waitForFunction(() => document.title === "Opsia");
  await assertGlobalClusterScopePicker(page, scenario.id, scenario.locale);

  const listRegion = page.getByRole("region", { name: scenario.accessibleTarget });
  await listRegion.waitFor();
  const issuesLink = page.getByRole("link", { name: "Issues", exact: true });
  if (scenario.viewport.width >= 768) {
    if (await issuesLink.getAttribute("aria-current") !== "page") {
      throw new Error(`${scenario.id}: desktop Issues link must be current`);
    }
  } else if (await issuesLink.count() !== 0) {
    throw new Error(`${scenario.id}: closed mobile Issues sidebar link must not be mounted`);
  }

  const firstIssue = listRegion.getByRole("button", {
    name: issuesSymptom,
    exact: true,
  });
  await firstIssue.waitFor();
  if (await firstIssue.count() !== 1) {
    throw new Error(`${scenario.id}: expected one deterministic Issue control`);
  }
  await firstIssue.click();

  const detailRegion = page.getByRole("region", { name: "Issue details" });
  await detailRegion.waitFor();
  const controlledId = await firstIssue.getAttribute("aria-controls");
  if (!controlledId
    || await firstIssue.getAttribute("aria-current") !== "true"
    || await detailRegion.getAttribute("id") !== controlledId) {
    throw new Error(`${scenario.id}: selected Issue control does not own its detail region`);
  }
  await page.waitForFunction((detailId) => document.activeElement?.id === detailId, controlledId);
  const auditSubject = page.getByTestId("audit-event-subject");
  await auditSubject.waitFor();
  if (await auditSubject.innerText() !== issuesAuditSubject) {
    throw new Error(`${scenario.id}: audit event subject is not exact`);
  }
  await page.getByText("Kubernetes evidence collected", { exact: true }).waitFor();
  await page.getByText("Increase memory limit after approval", { exact: true }).waitFor();
  await page.getByText("Increase memory limit", { exact: true }).waitFor();
  const recentChangesRegion = page.getByRole("region", { name: "Recent changes" });
  await recentChangesRegion.waitFor();
  await recentChangesRegion.locator("time[datetime='2026-07-13T09:55:00Z']").waitFor();
  const recentChangeItem = recentChangesRegion.getByRole("listitem");
  await recentChangeItem.waitFor();
  const recentChangeText = await recentChangeItem.innerText();
  for (const requiredText of [
    "shop",
    "Deployment",
    "checkout-api",
    "registry.example/checkout:v1",
    "registry.example/checkout:v2",
    "0123456789abcdef",
    "visual-workflow-run",
  ]) {
    if (!recentChangeText.includes(requiredText)) {
      throw new Error(`${scenario.id}: recent change omitted ${requiredText}`);
    }
  }
  const pullRequest = recentChangesRegion.getByRole("link", {
    name: "Open pull request",
    exact: true,
  });
  await pullRequest.waitFor();
  if (await pullRequest.getAttribute("href") !== "https://github.com/acme/platform/pull/42") {
    throw new Error(`${scenario.id}: recent change PR link is not the verified fixture URL`);
  }
  if (await pullRequest.getAttribute("target") !== "_blank"
    || await pullRequest.getAttribute("rel") !== "noopener noreferrer") {
    throw new Error(`${scenario.id}: recent change PR link must isolate its external context`);
  }
  await page.waitForLoadState("networkidle");

  const detailTitle = page.locator("[data-slot='card-title']", {
    hasText: issuesSubject,
  });
  if (await detailTitle.count() !== 1) {
    throw new Error(`${scenario.id}: selected Issue subject was not exposed once`);
  }
  const currentUrl = new URL(page.url());
  if (currentUrl.origin !== baseUrl
    || currentUrl.pathname !== "/product/issues"
    || currentUrl.searchParams.size !== 1
    || currentUrl.searchParams.get("cluster") !== homeClusterId) {
    throw new Error(`${scenario.id}: Issues route URL is not exact: ${currentUrl.href}`);
  }
}

async function assertProductResourcesReducedMotion(page, label) {
  const result = await page.evaluate(() => {
    const requiredSlots = [
      "sidebar-trigger",
      "select-trigger",
      "button",
      "input",
      "table-row",
      "toggle",
    ];
    const optionalSlots = ["accordion-trigger", "sheet-content", "sheet-overlay"];
    const selector = [...requiredSlots, ...optionalSlots]
      .map((slot) => `[data-slot='${slot}']`).join(",");
    const elements = [...document.querySelectorAll(selector)].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0
        && style.display !== "none" && style.visibility !== "hidden";
    });
    const presentSlots = new Set(elements.map((element) => element.getAttribute("data-slot")));
    return {
      active: matchMedia("(prefers-reduced-motion: reduce)").matches,
      count: elements.length,
      missingSlots: requiredSlots.filter((slot) => !presentSlots.has(slot)),
      motion: elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          animationName: style.animationName,
          slot: element.getAttribute("data-slot"),
          transitionDuration: style.transitionDuration,
          transitionProperty: style.transitionProperty,
        };
      }),
    };
  });
  if (!result.active || result.count === 0 || result.missingSlots.length > 0) {
    throw new Error(
      `${label}: Resources reduced-motion fixture is incomplete `
      + `${JSON.stringify(result.missingSlots)}`,
    );
  }
  for (const motion of result.motion) {
    if (motion.transitionProperty !== "none"
      && maxCssTimeMilliseconds(motion.transitionDuration) > 1) {
      throw new Error(
        `${label}: ${motion.slot} reduced-motion transition remains ${motion.transitionDuration}`,
      );
    }
    if (motion.animationName !== "none"
      && maxCssTimeMilliseconds(motion.animationDuration) > 1) {
      throw new Error(
        `${label}: ${motion.slot} reduced-motion animation remains ${motion.animationDuration}`,
      );
    }
  }
}

async function assertProductHomeFreshnessContract(page, label) {
  const refresh = page.getByRole("button", { name: /새로\s*고침/u });
  if (await refresh.count() !== 1) {
    throw new Error(`${label}: Home must expose one manual refresh action`);
  }
  await refresh.waitFor();

  const mainText = await page.getByRole("main").innerText();
  if (/30\s*초[^\n]*자동 갱신|실 API|LIVE API|Fleet Home|CLUSTER HEALTH|ATTENTION|RESOURCE SNAPSHOT/u
    .test(mainText)) {
    throw new Error(`${label}: Home rendered a prohibited standing label or transport badge`);
  }
  const clusterTrigger = page.locator(clusterScopeTriggerSelector);
  if (await clusterTrigger.count() !== 1) {
    throw new Error(`${label}: shell must expose one cluster scope freshness control`);
  }
  await clusterTrigger.focus();
  const tooltip = page.locator("[data-slot='tooltip-content']");
  await tooltip.waitFor();
  const tooltipText = await tooltip.textContent() ?? "";
  if (!/연결 단계:\s*Ready/u.test(tooltipText)) {
    throw new Error(`${label}: cluster freshness Tooltip omitted the canonical connection stage`);
  }
  const motion = await tooltip.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      animationDuration: style.animationDuration,
      animationName: style.animationName,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
    };
  });
  if (!motion.reducedMotion
    || (motion.transitionProperty !== "none"
      && maxCssTimeMilliseconds(motion.transitionDuration) > 1)
    || (motion.animationName !== "none"
      && maxCssTimeMilliseconds(motion.animationDuration) > 1)) {
    throw new Error(
      `${label}: cluster freshness Tooltip retained reduced-motion timing `
      + `${JSON.stringify(motion)}`,
    );
  }
}

async function assertProductHomeNodeFrame(page, label) {
  const section = page.locator("section[aria-labelledby='node-list-title']");
  await section.waitFor();
  const text = await section.textContent() ?? "";
  if (!/표시\s*2/u.test(text) || !/전체 수 미확인/u.test(text)) {
    throw new Error(
      `${label}: Node collection with unknown completeness must say `
      + `"표시 2 · 전체 수 미확인"; received ${JSON.stringify(text)}`,
    );
  }
  if (!/Node/u.test(text) || !/Pod/u.test(text)) {
    throw new Error(`${label}: Node frame must keep Node and Pod resource-type context`);
  }
}

async function assertProductHomePodFrame(page, label) {
  const podHeading = page.getByRole("heading", { name: `${homeNodeName}의 Pod` });
  await podHeading.waitFor();
  await page.getByText(homePodName, { exact: true }).waitFor();
  await page.waitForFunction((headingId) => (
    document.activeElement?.id === headingId
  ), "pod-list-title");

  const section = page.locator("section[aria-labelledby='pod-list-title']");
  const text = await section.textContent() ?? "";
  if (!/표시\s*2/u.test(text) || !/전체 수 미확인/u.test(text)) {
    throw new Error(
      `${label}: Pod collection with unknown completeness must say `
      + `"표시 2 · 전체 수 미확인"; received ${JSON.stringify(text)}`,
    );
  }
}

async function assertProductHomeClusterForbidden(page, label) {
  const alert = page.getByRole("alert");
  await alert.waitFor();
  const mainText = await page.getByRole("main").innerText();
  if (!/필요한 조회 권한/u.test(mainText)) {
    throw new Error(`${label}: cluster forbidden state needs a permission reason`);
  }
  const picker = page.locator(clusterScopePickerSelector);
  const trigger = page.locator(clusterScopeTriggerSelector);
  if (await picker.count() !== 1 || await trigger.count() !== 1) {
    throw new Error(`${label}: cluster forbidden state must retain one global cluster picker`);
  }
  if (!(await trigger.textContent())?.includes(homeClusterId)) {
    throw new Error(`${label}: cluster forbidden state lost the selected global cluster scope`);
  }
  if (await page.getByRole("heading", { name: "클러스터 상태" }).count()
    || await page.getByRole("heading", { name: "Node" }).count()
    || await page.getByText(homeNodeName, { exact: true }).count()) {
    throw new Error(`${label}: cluster forbidden state leaked cached cluster content`);
  }
}

async function assertGlobalClusterScopePicker(page, label, locale, options = {}) {
  const picker = page.locator(clusterScopePickerSelector);
  const trigger = page.locator(clusterScopeTriggerSelector);
  await picker.waitFor(options);
  await trigger.waitFor(options);
  if (await picker.count() !== 1 || await trigger.count() !== 1) {
    throw new Error(`${label}: shell must expose exactly one global cluster scope picker`);
  }
  const text = await trigger.textContent() ?? "";
  const accessibleName = await trigger.getAttribute("aria-label") ?? "";
  const connection = locale === "en" ? "Connected" : "연결됨";
  const stage = "Ready";
  if (!text.includes(homeClusterId)
    || !accessibleName.includes(homeClusterId)
    || !accessibleName.includes(connection)
    || !accessibleName.includes(stage)) {
    throw new Error(
      `${label}: global cluster scope omitted canonical identity, connection, or stage `
      + `${JSON.stringify({ accessibleName, text })}`,
    );
  }
  const providerIcon = trigger.locator("[data-slot='cluster-provider-icon']");
  if (await providerIcon.count() !== 1
    || await providerIcon.getAttribute("data-provider") !== "eks") {
    throw new Error(`${label}: global cluster scope omitted the verified provider icon`);
  }
}

async function assertProductHomeReducedMotion(page, label) {
  const result = await page.evaluate(() => {
    const requiredSlots = ["sidebar-trigger", "select-trigger", "progress-indicator", "item"];
    const selector = requiredSlots.map((slot) => `[data-slot='${slot}']`).join(",");
    const elements = [...document.querySelectorAll(selector)].filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0
        && style.display !== "none" && style.visibility !== "hidden";
    });
    const presentSlots = new Set(elements.map((element) => element.getAttribute("data-slot")));
    return {
      missingSlots: requiredSlots.filter((slot) => !presentSlots.has(slot)),
      motion: elements.map((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          animationName: style.animationName,
          slot: element.getAttribute("data-slot"),
          transitionDuration: style.transitionDuration,
          transitionProperty: style.transitionProperty,
        };
      }),
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    };
  });

  if (!result.reducedMotion || result.missingSlots.length) {
    throw new Error(
      `${label}: Home reduced-motion fixture is incomplete ${JSON.stringify(result.missingSlots)}`,
    );
  }
  for (const motion of result.motion) {
    if (motion.transitionProperty !== "none"
      && maxCssTimeMilliseconds(motion.transitionDuration) > 1) {
      throw new Error(
        `${label}: ${motion.slot} reduced-motion transition remains ${motion.transitionDuration}`,
      );
    }
    if (motion.animationName !== "none"
      && maxCssTimeMilliseconds(motion.animationDuration) > 1) {
      throw new Error(
        `${label}: ${motion.slot} reduced-motion animation remains ${motion.animationDuration}`,
      );
    }
  }
}

async function prepareProductShellScenario(page, scenario) {
  if (scenario.shellMode === "desktop-collapsed") {
    const trigger = page.getByRole("button", { name: "사이드바 접기" });
    await trigger.click();
    await page.getByRole("button", { name: "사이드바 펼치기" }).waitFor();
  }
  if (scenario.shellMode === "mobile-open") {
    await page.getByRole("button", { name: "모바일 사이드바 열기" }).click();
    const dialog = page.getByRole("dialog", { name: "제품 탐색" });
    await dialog.waitFor();
    await page.waitForFunction(() => {
      const popup = document.querySelector("[data-slot='dialog-content']");
      return popup instanceof HTMLElement
        && popup.contains(document.activeElement)
        && popup.getBoundingClientRect().width > 0;
    });
  }
}

async function assertProductShellContracts(page, scenario) {
  if (scenario.shellMode === "mobile-open") await assertMobileFocusTrap(page, scenario.id);
  const result = await page.evaluate((mode) => {
    const provider = document.querySelector("[data-slot='sidebar-provider']");
    const inset = document.querySelector("[data-slot='sidebar-inset']");
    const main = document.querySelector("main");
    const navigation = document.querySelector("[data-slot='sidebar-navigation']");
    const menu = document.querySelector("[data-slot='sidebar-menu']");
    const desktopSidebar = document.querySelector("[data-slot='sidebar']");
    const mobileSidebar = document.querySelector("[data-slot='sidebar-mobile']");
    const trigger = document.querySelector("[data-slot='sidebar-trigger']");
    const dialog = document.querySelector("[data-slot='dialog-content']");
    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    const required = [provider, inset, main, navigation, menu, trigger];
    if (required.some((element) => !(element instanceof HTMLElement))) return { missing: true };

    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const links = [...menu.querySelectorAll("a[href]")];
    const items = [...menu.children];
    const currentLinks = links.filter((link) => link.getAttribute("aria-current") === "page");
    const motion = [desktopSidebar, mobileSidebar, trigger, dialog, overlay, ...links]
      .filter((element) => element instanceof HTMLElement)
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          animationDuration: style.animationDuration,
          animationName: style.animationName,
          slot: element.getAttribute("data-slot") ?? element.tagName.toLowerCase(),
          transitionDuration: style.transitionDuration,
          transitionProperty: style.transitionProperty,
        };
      });
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      missing: false,
      currentHref: currentLinks[0]?.getAttribute("href") ?? null,
      currentLabel: currentLinks[0]?.textContent?.trim() ?? null,
      currentLinks: currentLinks.length,
      desktopSidebarCount: desktopSidebar ? 1 : 0,
      dialogRect: dialog instanceof HTMLElement ? rect(dialog) : null,
      insetRect: rect(inset),
      itemCount: items.length,
      itemTags: items.map((item) => item.tagName),
      linkCount: links.length,
      linkLabels: links.map((link) => link.getAttribute("aria-label") ?? link.textContent?.trim()),
      mainRect: rect(main),
      mobileSidebarCount: mobileSidebar ? 1 : 0,
      motion,
      navigationLabel: navigation.getAttribute("aria-label"),
      navigationRole: navigation.getAttribute("role") ?? navigation.tagName.toLowerCase(),
      overlayRect: overlay instanceof HTMLElement ? rect(overlay) : null,
      providerRect: rect(provider),
      rootFontSize: Number.parseFloat(rootStyle.fontSize),
      sidebarRect: desktopSidebar instanceof HTMLElement ? rect(desktopSidebar) : null,
      sidebarState: (desktopSidebar ?? mobileSidebar)?.getAttribute("data-state") ?? null,
      sidebarWidthCollapsed: rootStyle.getPropertyValue("--product-sidebar-width-collapsed").trim(),
      sidebarWidthExpanded: rootStyle.getPropertyValue("--product-sidebar-width").trim(),
      sidebarWidthMobile: rootStyle.getPropertyValue("--product-sidebar-width-mobile").trim(),
      triggerControls: trigger.getAttribute("aria-controls"),
      triggerExpanded: trigger.getAttribute("aria-expanded"),
      triggerFocused: document.activeElement === trigger,
      triggerLabel: trigger.getAttribute("aria-label"),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      mode,
    };
  }, scenario.shellMode);

  if (result.missing) throw new Error(`${scenario.id}: ProductShell fixture is incomplete`);
  if (result.navigationRole !== "nav" || result.navigationLabel !== "주요 메뉴"
    || result.itemCount !== 3 || result.linkCount !== 3
    || result.currentLinks !== 1 || result.currentHref !== "/product?cluster=cluster-1"
    || result.currentLabel !== "홈"
    || result.itemTags.some((tag) => tag !== "LI")
    || result.linkLabels.join("|") !== "홈|인시던트|타임라인") {
    throw new Error(`${scenario.id}: navigation/list/current semantics failed ${JSON.stringify(result)}`);
  }
  if (result.sidebarWidthExpanded !== "11rem"
    || result.sidebarWidthCollapsed !== "3.5rem"
    || result.sidebarWidthMobile !== "17rem") {
    throw new Error(`${scenario.id}: sidebar token contract changed ${JSON.stringify(result)}`);
  }
  if (!rectContains(result.providerRect, result.insetRect, 1)
    || !rectContains(result.insetRect, result.mainRect, 1)) {
    throw new Error(`${scenario.id}: provider/inset/main containment failed ${JSON.stringify(result)}`);
  }

  if (scenario.shellMode.startsWith("desktop")) {
    const collapsed = scenario.shellMode === "desktop-collapsed";
    const expectedWidth = result.rootFontSize * (collapsed ? 3.5 : 11);
    if (!result.sidebarRect || Math.abs(result.sidebarRect.width - expectedWidth) > 1
      || result.desktopSidebarCount !== 1 || result.mobileSidebarCount !== 0
      || result.sidebarState !== (collapsed ? "collapsed" : "expanded")
      || result.triggerExpanded !== String(!collapsed)
      || result.triggerLabel !== (collapsed ? "사이드바 펼치기" : "사이드바 접기")
      || result.triggerControls !== "product-primary-navigation") {
      throw new Error(`${scenario.id}: desktop sidebar geometry/state failed ${JSON.stringify(result)}`);
    }
    if (collapsed && !result.triggerFocused) {
      throw new Error(`${scenario.id}: collapse action must retain focus on its trigger`);
    }
  } else {
    const expectedWidth = Math.min(result.rootFontSize * 17, result.viewportWidth - result.rootFontSize);
    if (result.desktopSidebarCount !== 0 || result.mobileSidebarCount !== 1
      || !result.dialogRect || Math.abs(result.dialogRect.width - expectedWidth) > 1
      || !result.overlayRect || result.overlayRect.left > 1 || result.overlayRect.top > 1
      || result.overlayRect.width < result.viewportWidth - 1
      || result.overlayRect.height < result.viewportHeight - 1
      || result.triggerLabel !== "모바일 사이드바 닫기"
      || result.triggerExpanded !== "true") {
      throw new Error(`${scenario.id}: mobile dialog geometry/state failed ${JSON.stringify(result)}`);
    }
  }
  for (const motion of result.motion) {
    if (motion.transitionProperty !== "none"
      && maxCssTimeMilliseconds(motion.transitionDuration) > 1) {
      throw new Error(`${scenario.id}: ${motion.slot} reduced-motion transition remains ${motion.transitionDuration}`);
    }
    if (motion.animationName !== "none"
      && maxCssTimeMilliseconds(motion.animationDuration) > 1) {
      throw new Error(`${scenario.id}: ${motion.slot} reduced-motion animation remains ${motion.animationDuration}`);
    }
  }
}

async function assertMobileFocusTrap(page, label) {
  const dialog = page.getByRole("dialog", { name: "제품 탐색" });
  const focusable = dialog.locator("a[href], button:not(:disabled), [tabindex]:not([tabindex='-1'])");
  const count = await focusable.count();
  if (count < 2) throw new Error(`${label}: mobile dialog needs multiple focusable controls`);
  const last = focusable.nth(count - 1);
  await last.focus();
  await page.keyboard.press("Tab");
  const forwardStayedInside = await isInDialogFocusScope(dialog);
  const forwardMoved = !(await last.evaluate(
    (element) => element === document.activeElement,
  ));
  if (!forwardStayedInside || !forwardMoved) {
    throw new Error(`${label}: Tab did not move within the dialog focus trap`);
  }
  const first = focusable.nth(0);
  await first.focus();
  await page.keyboard.press("Shift+Tab");
  const backwardStayedInside = await isInDialogFocusScope(dialog);
  const backwardMoved = !(await first.evaluate(
    (element) => element === document.activeElement,
  ));
  if (!backwardStayedInside || !backwardMoved) {
    throw new Error(`${label}: Shift+Tab did not move within the dialog focus trap`);
  }
}

async function isInDialogFocusScope(dialog) {
  return dialog.evaluate((element) => {
    const active = document.activeElement;
    return element.contains(active)
      || (active instanceof HTMLElement && active.hasAttribute("data-base-ui-focus-guard"));
  });
}

async function assertProductShellForcedColors(page, label) {
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  const result = await page.evaluate(() => {
    const sidebar = document.querySelector("[data-slot='sidebar']");
    const trigger = document.querySelector("[data-slot='sidebar-trigger']");
    const current = document.querySelector("[data-slot='sidebar-menu-button'][aria-current='page'], [data-slot='sidebar-menu-link'][aria-current='page']");
    if (!(sidebar instanceof HTMLElement)
      || !(trigger instanceof HTMLElement)
      || !(current instanceof HTMLElement)) return { missing: true };
    const sidebarStyle = getComputedStyle(sidebar);
    const triggerStyle = getComputedStyle(trigger);
    const currentStyle = getComputedStyle(current);
    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      currentBackground: currentStyle.backgroundColor,
      currentColor: currentStyle.color,
      currentOpacity: Number.parseFloat(currentStyle.opacity),
      sidebarBackground: sidebarStyle.backgroundColor,
      sidebarBorderColor: sidebarStyle.borderRightColor,
      sidebarBorderStyle: sidebarStyle.borderRightStyle,
      sidebarBorderWidth: Number.parseFloat(sidebarStyle.borderRightWidth),
      triggerFocused: document.activeElement === trigger,
      triggerOpacity: Number.parseFloat(triggerStyle.opacity),
      triggerOutlineColor: triggerStyle.outlineColor,
      triggerOutlineStyle: triggerStyle.outlineStyle,
      triggerOutlineWidth: Number.parseFloat(triggerStyle.outlineWidth),
    };
  });
  if (result.missing || !result.active || !result.triggerFocused
    || result.sidebarBorderStyle === "none" || result.sidebarBorderWidth < 1
    || result.triggerOutlineStyle === "none" || result.triggerOutlineWidth < 2
    || result.currentOpacity !== 1 || result.triggerOpacity !== 1
    || result.currentBackground === result.sidebarBackground) {
    throw new Error(`${label}: forced-colors sidebar state is not preserved ${JSON.stringify(result)}`);
  }
  assertContrast(label, "sidebar border", result.sidebarBorderColor, result.sidebarBackground, 3);
  assertContrast(label, "sidebar trigger focus", result.triggerOutlineColor, result.sidebarBackground, 3);
  assertContrast(
    label,
    "current navigation",
    result.currentColor,
    result.currentBackground,
    4.5,
    result.sidebarBackground,
  );
}

async function assertProductHomeForcedColors(page, label) {
  const result = await page.evaluate(() => {
    const main = document.querySelector("main");
    const surface = document.querySelector("[data-slot='surface']");
    const select = document.querySelector(
      "[data-slot='sidebar-inset'] > header [data-slot='cluster-scope-picker'] [data-slot='select-trigger']",
    );
    const node = document.querySelector("section[aria-labelledby='node-list-title'] [data-slot='item']");
    const status = document.querySelector("[data-slot='status-mark']");
    const marker = status?.querySelector("[aria-hidden='true']");
    const required = [main, surface, select, node, status, marker];
    if (required.some((element) => !(element instanceof HTMLElement))) {
      return { missing: true };
    }

    node.focus();
    const mainStyle = getComputedStyle(main);
    const surfaceStyle = getComputedStyle(surface);
    const selectStyle = getComputedStyle(select);
    const nodeStyle = getComputedStyle(node);
    const statusStyle = getComputedStyle(status);
    const markerStyle = getComputedStyle(marker);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      mainBackground: mainStyle.backgroundColor,
      markerBackground: markerStyle.backgroundColor,
      markerBorderStyle: markerStyle.borderTopStyle,
      markerBorderWidth: Number.parseFloat(markerStyle.borderTopWidth),
      markerOpacity: Number.parseFloat(markerStyle.opacity),
      nodeBackground: nodeStyle.backgroundColor,
      nodeBorderColor: nodeStyle.borderTopColor,
      nodeBorderStyle: nodeStyle.borderTopStyle,
      nodeBorderWidth: Number.parseFloat(nodeStyle.borderTopWidth),
      nodeColor: nodeStyle.color,
      nodeFocused: document.activeElement === node,
      nodeOpacity: Number.parseFloat(nodeStyle.opacity),
      nodeOutlineColor: nodeStyle.outlineColor,
      nodeOutlineStyle: nodeStyle.outlineStyle,
      nodeOutlineWidth: Number.parseFloat(nodeStyle.outlineWidth),
      nodeVisible: visible(node),
      selectBorderStyle: selectStyle.borderTopStyle,
      selectBorderWidth: Number.parseFloat(selectStyle.borderTopWidth),
      selectOpacity: Number.parseFloat(selectStyle.opacity),
      selectVisible: visible(select),
      statusOpacity: Number.parseFloat(statusStyle.opacity),
      statusVisible: visible(status),
      surfaceBackground: surfaceStyle.backgroundColor,
      surfaceBorderColor: surfaceStyle.borderTopColor,
      surfaceBorderStyle: surfaceStyle.borderTopStyle,
      surfaceBorderWidth: Number.parseFloat(surfaceStyle.borderTopWidth),
      surfaceOpacity: Number.parseFloat(surfaceStyle.opacity),
      surfaceVisible: visible(surface),
    };
  });

  if (result.missing || !result.active
    || !result.surfaceVisible || !result.selectVisible
    || !result.nodeVisible || !result.statusVisible || !result.nodeFocused) {
    throw new Error(`${label}: forced-colors Home surface is incomplete ${JSON.stringify(result)}`);
  }
  if (result.surfaceBorderStyle === "none" || result.surfaceBorderWidth < 1
    || result.selectBorderStyle === "none" || result.selectBorderWidth < 1
    || result.nodeBorderStyle === "none" || result.nodeBorderWidth < 1
    || result.markerBorderStyle === "none" || result.markerBorderWidth < 1
    || result.nodeOutlineStyle === "none" || result.nodeOutlineWidth < 2) {
    throw new Error(`${label}: forced-colors Home borders or focus are missing ${JSON.stringify(result)}`);
  }
  for (const [name, opacity] of Object.entries({
    marker: result.markerOpacity,
    node: result.nodeOpacity,
    select: result.selectOpacity,
    status: result.statusOpacity,
    surface: result.surfaceOpacity,
  })) {
    if (Math.abs(opacity - 1) > 0.001) {
      throw new Error(`${label}: forced-colors Home ${name} uses group opacity ${opacity}`);
    }
  }
  assertContrast(label, "Home surface border", result.surfaceBorderColor, result.surfaceBackground, 3);
  assertContrast(
    label,
    "Home Node border",
    result.nodeBorderColor,
    result.nodeBackground,
    3,
    result.surfaceBackground,
  );
  assertContrast(
    label,
    "Home Node text",
    result.nodeColor,
    result.nodeBackground,
    4.5,
    result.surfaceBackground,
  );
  assertContrast(label, "Home Node focus", result.nodeOutlineColor, result.surfaceBackground, 3);
}

async function assertStatePrimitiveContracts(page, label) {
  await page.waitForFunction(() => {
    const viewport = document.querySelector("[data-slot='scroll-area-viewport']");
    const scrollbar = document.querySelector("[data-slot='scroll-area-scrollbar']");
    const thumb = document.querySelector("[data-slot='scroll-area-thumb']");
    if (!(viewport instanceof HTMLElement)
      || !(scrollbar instanceof HTMLElement)
      || !(thumb instanceof HTMLElement)) return false;
    const scrollbarRect = scrollbar.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    return viewport.hasAttribute("data-has-overflow-y")
      && scrollbar.hasAttribute("data-has-overflow-y")
      && viewport.tabIndex === 0
      && scrollbarRect.width > 0
      && scrollbarRect.height > 0
      && thumbRect.width > 0
      && thumbRect.height > 0;
  });

  const result = await page.evaluate(() => {
    const item = document.querySelector("[data-visual-disabled-item]");
    const viewport = document.querySelector("[data-slot='scroll-area-viewport']");
    const scrollbar = document.querySelector("[data-slot='scroll-area-scrollbar']");
    const thumb = document.querySelector("[data-slot='scroll-area-thumb']");
    if (!(item instanceof HTMLButtonElement)
      || !(viewport instanceof HTMLElement)
      || !(scrollbar instanceof HTMLElement)
      || !(thumb instanceof HTMLElement)) return { missing: true };

    const itemStyle = getComputedStyle(item);
    const viewportStyle = getComputedStyle(viewport);
    const scrollbarStyle = getComputedStyle(scrollbar);
    const scrollbarRect = scrollbar.getBoundingClientRect();
    const thumbRect = thumb.getBoundingClientRect();
    return {
      missing: false,
      itemDisabled: item.disabled,
      itemTransitionDuration: itemStyle.transitionDuration,
      itemTransitionProperty: itemStyle.transitionProperty,
      scrollbarDisplay: scrollbarStyle.display,
      scrollbarHasOverflowY: scrollbar.hasAttribute("data-has-overflow-y"),
      scrollbarHeight: scrollbarRect.height,
      scrollbarTransitionDuration: scrollbarStyle.transitionDuration,
      scrollbarTransitionProperty: scrollbarStyle.transitionProperty,
      scrollbarVisibility: scrollbarStyle.visibility,
      scrollbarWidth: scrollbarRect.width,
      thumbHeight: thumbRect.height,
      thumbWidth: thumbRect.width,
      viewportClientHeight: viewport.clientHeight,
      viewportHasOverflowY: viewport.hasAttribute("data-has-overflow-y"),
      viewportScrollHeight: viewport.scrollHeight,
      viewportTabIndex: viewport.tabIndex,
      viewportTransitionDuration: viewportStyle.transitionDuration,
      viewportTransitionProperty: viewportStyle.transitionProperty,
    };
  });

  if (result.missing) throw new Error(`${label}: Item or ScrollArea visual fixture is missing`);
  if (!result.itemDisabled) throw new Error(`${label}: Item fixture must be a disabled button`);
  if (!result.viewportHasOverflowY
    || !result.scrollbarHasOverflowY
    || result.viewportTabIndex !== 0
    || result.viewportScrollHeight <= result.viewportClientHeight + 1) {
    throw new Error(
      `${label}: ScrollArea must expose real vertical overflow and a keyboard viewport `
      + JSON.stringify(result),
    );
  }
  if (result.scrollbarDisplay === "none"
    || result.scrollbarVisibility === "hidden"
    || result.scrollbarWidth < 1
    || result.scrollbarHeight < 1
    || result.thumbWidth < 1
    || result.thumbHeight < 1
    || result.thumbHeight >= result.scrollbarHeight) {
    throw new Error(
      `${label}: ScrollArea scrollbar and thumb need visible overflow geometry `
      + JSON.stringify(result),
    );
  }
  for (const [name, property, duration] of [
    ["Item", result.itemTransitionProperty, result.itemTransitionDuration],
    ["ScrollArea viewport", result.viewportTransitionProperty, result.viewportTransitionDuration],
    ["ScrollArea scrollbar", result.scrollbarTransitionProperty, result.scrollbarTransitionDuration],
  ]) {
    if (property !== "none" && maxCssTimeMilliseconds(duration) > 1) {
      throw new Error(`${label}: ${name} reduced-motion transition remains ${duration}`);
    }
  }
}

async function assertInteractionPrimitiveContracts(page, label) {
  await page.waitForFunction(() => {
    const horizontal = document.querySelector("[data-visual-button-group='horizontal']");
    const vertical = document.querySelector("[data-visual-button-group='vertical']");
    const defaultTabs = document.querySelector("[data-visual-tabs='default']");
    const lineTabs = document.querySelector("[data-visual-tabs='line']");
    const defaultContent = document.querySelector("[data-visual-tabs-content='default']");
    const lineContent = document.querySelector("[data-visual-tabs-content='line']");
    return horizontal instanceof HTMLElement
      && vertical instanceof HTMLElement
      && defaultTabs instanceof HTMLElement
      && lineTabs instanceof HTMLElement
      && defaultContent instanceof HTMLElement
      && lineContent instanceof HTMLElement
      && defaultContent.getBoundingClientRect().height > 0
      && lineContent.getBoundingClientRect().height > 0;
  });

  const result = await page.evaluate(() => {
    const horizontal = document.querySelector("[data-visual-button-group='horizontal']");
    const vertical = document.querySelector("[data-visual-button-group='vertical']");
    const defaultTabs = document.querySelector("[data-visual-tabs='default']");
    const lineTabs = document.querySelector("[data-visual-tabs='line']");
    const defaultList = document.querySelector("[data-visual-tabs-list='default']");
    const lineList = document.querySelector("[data-visual-tabs-list='line']");
    const defaultActive = document.querySelector("[data-visual-tabs-active='default']");
    const defaultFocus = document.querySelector("[data-visual-tabs-focus]");
    const defaultDisabled = document.querySelector("[data-visual-tabs-disabled]");
    const lineActive = document.querySelector("[data-visual-tabs-active='line']");
    const lineInactive = lineList?.querySelector("[data-slot='tabs-trigger']:not([data-active]):not(:disabled)");
    const defaultContent = document.querySelector("[data-visual-tabs-content='default']");
    const lineContent = document.querySelector("[data-visual-tabs-content='line']");
    const required = [
      horizontal,
      vertical,
      defaultTabs,
      lineTabs,
      defaultList,
      lineList,
      defaultActive,
      defaultFocus,
      defaultDisabled,
      lineActive,
      lineInactive,
      defaultContent,
      lineContent,
    ];
    if (required.some((element) => !(element instanceof HTMLElement))) {
      return { missing: true };
    }

    const horizontalChildren = [...horizontal.children].filter(
      (element) => element instanceof HTMLElement,
    );
    const verticalChildren = [...vertical.children].filter(
      (element) => element instanceof HTMLElement,
    );
    if (horizontalChildren.length !== 4 || verticalChildren.length !== 4) {
      return { missing: true };
    }

    const rect = (element) => {
      const bounds = element.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const motionTargets = [
      ...horizontalChildren,
      ...verticalChildren,
      defaultList,
      lineList,
      defaultActive,
      defaultFocus,
      defaultDisabled,
      lineActive,
      lineInactive,
      defaultContent,
      lineContent,
    ];
    const motion = motionTargets.map((element) => {
      const style = getComputedStyle(element);
      return {
        animationDuration: style.animationDuration,
        animationName: style.animationName,
        slot: element.getAttribute("data-slot") ?? element.tagName.toLowerCase(),
        transitionDuration: style.transitionDuration,
        transitionProperty: style.transitionProperty,
      };
    });
    const horizontalSecondStyle = getComputedStyle(horizontalChildren[1]);
    const verticalSecondStyle = getComputedStyle(verticalChildren[1]);
    const lineActiveIndicatorStyle = getComputedStyle(lineActive, "::after");
    const lineInactiveIndicatorStyle = getComputedStyle(lineInactive, "::after");
    motion.push({
      animationDuration: lineActiveIndicatorStyle.animationDuration,
      animationName: lineActiveIndicatorStyle.animationName,
      slot: "tabs-trigger::after",
      transitionDuration: lineActiveIndicatorStyle.transitionDuration,
      transitionProperty: lineActiveIndicatorStyle.transitionProperty,
    });

    return {
      missing: false,
      defaultActiveData: defaultActive.hasAttribute("data-active"),
      defaultActiveSelected: defaultActive.getAttribute("aria-selected"),
      defaultContentRole: defaultContent.getAttribute("role"),
      defaultContentVisible: defaultContent.getBoundingClientRect().height > 0
        && !defaultContent.hidden,
      defaultDisabled: defaultDisabled instanceof HTMLButtonElement
        && (defaultDisabled.disabled || defaultDisabled.getAttribute("aria-disabled") === "true"),
      defaultListLabel: defaultList.getAttribute("aria-label"),
      defaultListRole: defaultList.getAttribute("role"),
      defaultListVariant: defaultList.getAttribute("data-variant"),
      defaultListRect: rect(defaultList),
      defaultRootOrientation: defaultTabs.getAttribute("data-orientation"),
      defaultTriggerRects: [...defaultList.querySelectorAll("[data-slot='tabs-trigger']")].map(rect),
      horizontalLabel: horizontal.getAttribute("aria-label"),
      horizontalOrientation: horizontal.getAttribute("data-orientation"),
      horizontalRects: horizontalChildren.map(rect),
      horizontalRole: horizontal.getAttribute("role"),
      horizontalRootRect: rect(horizontal),
      horizontalSeparatorOrientation: horizontalChildren[1].getAttribute("aria-orientation"),
      horizontalSecondBorderLeftWidth: Number.parseFloat(horizontalSecondStyle.borderLeftWidth),
      lineActiveData: lineActive.hasAttribute("data-active"),
      lineActiveIndicatorBackground: lineActiveIndicatorStyle.backgroundColor,
      lineActiveIndicatorHeight: Number.parseFloat(lineActiveIndicatorStyle.height),
      lineActiveIndicatorOpacity: Number.parseFloat(lineActiveIndicatorStyle.opacity),
      lineActiveIndicatorWidth: Number.parseFloat(lineActiveIndicatorStyle.width),
      lineActiveSelected: lineActive.getAttribute("aria-selected"),
      lineContentRole: lineContent.getAttribute("role"),
      lineContentVisible: lineContent.getBoundingClientRect().height > 0 && !lineContent.hidden,
      lineInactiveIndicatorBackground: lineInactiveIndicatorStyle.backgroundColor,
      lineInactiveIndicatorOpacity: Number.parseFloat(lineInactiveIndicatorStyle.opacity),
      lineListLabel: lineList.getAttribute("aria-label"),
      lineListRole: lineList.getAttribute("role"),
      lineListVariant: lineList.getAttribute("data-variant"),
      lineListRect: rect(lineList),
      lineRootOrientation: lineTabs.getAttribute("data-orientation"),
      lineTriggerRects: [...lineList.querySelectorAll("[data-slot='tabs-trigger']")].map(rect),
      motion,
      verticalLabel: vertical.getAttribute("aria-label"),
      verticalOrientation: vertical.getAttribute("data-orientation"),
      verticalRects: verticalChildren.map(rect),
      verticalRole: vertical.getAttribute("role"),
      verticalRootRect: rect(vertical),
      verticalSeparatorOrientation: verticalChildren[1].getAttribute("aria-orientation"),
      verticalSecondBorderTopWidth: Number.parseFloat(verticalSecondStyle.borderTopWidth),
    };
  });

  if (result.missing) {
    throw new Error(`${label}: ButtonGroup or Tabs visual fixture is missing`);
  }
  if (result.horizontalRole !== "group"
    || result.horizontalLabel !== "기간 선택"
    || result.horizontalOrientation !== "horizontal"
    || result.horizontalSeparatorOrientation !== "vertical"
    || result.verticalRole !== "group"
    || result.verticalLabel !== "표시 방식"
    || result.verticalOrientation !== "vertical"
    || result.verticalSeparatorOrientation !== "horizontal") {
    throw new Error(`${label}: ButtonGroup semantics are incomplete ${JSON.stringify(result)}`);
  }
  for (const [name, rootRect, childRects] of [
    ["horizontal ButtonGroup", result.horizontalRootRect, result.horizontalRects],
    ["vertical ButtonGroup", result.verticalRootRect, result.verticalRects],
    ["default TabsList", result.defaultListRect, result.defaultTriggerRects],
    ["line TabsList", result.lineListRect, result.lineTriggerRects],
  ]) {
    for (const childRect of childRects) {
      if (!rectContains(rootRect, childRect, 1)) {
        throw new Error(`${label}: ${name} does not contain child geometry ${JSON.stringify({ childRect, rootRect })}`);
      }
    }
  }
  for (let index = 1; index < result.horizontalRects.length; index += 1) {
    const previous = result.horizontalRects[index - 1];
    const current = result.horizontalRects[index];
    if (Math.abs(previous.right - current.left) > 1) {
      throw new Error(`${label}: horizontal ButtonGroup is not edge-joined ${JSON.stringify(result.horizontalRects)}`);
    }
  }
  for (let index = 1; index < result.verticalRects.length; index += 1) {
    const previous = result.verticalRects[index - 1];
    const current = result.verticalRects[index];
    if (Math.abs(previous.bottom - current.top) > 1) {
      throw new Error(`${label}: vertical ButtonGroup is not edge-joined ${JSON.stringify(result.verticalRects)}`);
    }
  }
  if (result.horizontalSecondBorderLeftWidth > 0.1
    || result.verticalSecondBorderTopWidth > 0.1) {
    throw new Error(`${label}: ButtonGroup adjacent borders were not collapsed ${JSON.stringify(result)}`);
  }
  if (result.defaultListRole !== "tablist"
    || result.defaultListLabel !== "기본 리소스 탭"
    || result.defaultListVariant !== "default"
    || result.defaultRootOrientation !== "horizontal"
    || result.defaultActiveSelected !== "true"
    || !result.defaultActiveData
    || !result.defaultDisabled
    || result.defaultContentRole !== "tabpanel"
    || !result.defaultContentVisible) {
    throw new Error(`${label}: default Tabs state contract failed ${JSON.stringify(result)}`);
  }
  if (result.lineListRole !== "tablist"
    || result.lineListLabel !== "선형 트래픽 탭"
    || result.lineListVariant !== "line"
    || result.lineRootOrientation !== "horizontal"
    || result.lineActiveSelected !== "true"
    || !result.lineActiveData
    || result.lineContentRole !== "tabpanel"
    || !result.lineContentVisible
    || result.lineActiveIndicatorOpacity < 0.99
    || result.lineInactiveIndicatorOpacity > 0.01
    || result.lineActiveIndicatorHeight < 1
    || result.lineActiveIndicatorWidth < 1) {
    throw new Error(`${label}: line Tabs visual distinction failed ${JSON.stringify(result)}`);
  }
  for (const motion of result.motion) {
    if (motion.transitionProperty !== "none"
      && maxCssTimeMilliseconds(motion.transitionDuration) > 1) {
      throw new Error(
        `${label}: ${motion.slot} reduced-motion transition remains ${motion.transitionDuration}`,
      );
    }
    if (motion.animationName !== "none"
      && maxCssTimeMilliseconds(motion.animationDuration) > 1) {
      throw new Error(
        `${label}: ${motion.slot} reduced-motion animation remains ${motion.animationDuration}`,
      );
    }
  }
}

function rectContains(outer, inner, tolerance = 0) {
  return inner.left >= outer.left - tolerance
    && inner.right <= outer.right + tolerance
    && inner.top >= outer.top - tolerance
    && inner.bottom <= outer.bottom + tolerance;
}

function maxCssTimeMilliseconds(value) {
  return Math.max(...value.split(",").map((part) => {
    const token = part.trim();
    if (token.endsWith("ms")) return Number.parseFloat(token);
    if (token.endsWith("s")) return Number.parseFloat(token) * 1_000;
    return Number.POSITIVE_INFINITY;
  }));
}

async function assertScenarioEnvironment(page, scenario, baselineRootFontSize) {
  const result = await page.evaluate((storageKey) => ({
    browserLocale: navigator.language,
    documentLocale: document.documentElement.lang,
    viewportWidth: window.innerWidth,
    light: matchMedia("(prefers-color-scheme: light)").matches,
    dark: matchMedia("(prefers-color-scheme: dark)").matches,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    forcedColors: matchMedia("(forced-colors: active)").matches,
    rootFontSize: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    persistedLocale: localStorage.getItem(storageKey),
    themeClasses: [...document.documentElement.classList],
  }), localeStorageKey);
  const expectedRootFontSize = baselineRootFontSize * (scenario.rootFontScale ?? 1);
  const expectedBrowserLocale = browserLocales[scenario.navigatorLocale ?? scenario.locale];
  const expectedPersistedLocale = scenario.persistedLocale ?? scenario.locale;

  if (result.viewportWidth !== scenario.viewport.width) {
    throw new Error(`${scenario.id}: viewport ${result.viewportWidth}px != ${scenario.viewport.width}px`);
  }
  if (result.browserLocale !== expectedBrowserLocale
    || result.documentLocale !== scenario.locale
    || result.persistedLocale !== expectedPersistedLocale) {
    throw new Error(
      `${scenario.id}: locale environment does not match ${scenario.locale} `
      + JSON.stringify({
        browserLocale: result.browserLocale,
        documentLocale: result.documentLocale,
        persistedLocale: result.persistedLocale,
      }),
    );
  }
  if (!result.reducedMotion) throw new Error(`${scenario.id}: reduced-motion is not active`);
  if ((scenario.forcedColors === "active") !== result.forcedColors) {
    throw new Error(`${scenario.id}: forced-colors state does not match the scenario`);
  }
  if ((scenario.colorScheme === "dark" && !result.dark)
    || (scenario.colorScheme === "light" && !result.light)) {
    throw new Error(`${scenario.id}: color scheme does not match the scenario`);
  }
  if (!result.themeClasses.includes(scenario.theme)) {
    throw new Error(`${scenario.id}: ${scenario.theme} theme class is not active`);
  }
  if (Math.abs(result.rootFontSize - expectedRootFontSize) > 0.1) {
    throw new Error(
      `${scenario.id}: root font ${result.rootFontSize}px != ${expectedRootFontSize}px`,
    );
  }
}

async function assertNoOverflow(page, label, requiredSelectors) {
  const result = await page.evaluate(({ required, scenarioId }) => {
    const ignoreShellOutletText = scenarioId.startsWith("shell-mobile-")
      || scenarioId.startsWith("shell-text-resize-");
    const viewportWidth = document.documentElement.clientWidth;
    const documentOverflow = document.documentElement.scrollWidth - viewportWidth;
    const selectors = new Set([
      ...required,
      "[data-slot='empty']",
      "[data-slot='surface']",
      "[data-slot='button']",
      "[role='alert']",
      "h1",
      "h2",
      "p",
      "code",
      "dd",
    ]);
    const missingSelectors = required.filter((selector) => document.querySelectorAll(selector).length === 0);
    const violations = [];
    let checkedVisibleDisabled = 0;

    for (const element of document.querySelectorAll([...selectors].join(","))) {
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (ignoreShellOutletText && element.closest("[data-shell-harness-outlet]")) continue;
      if (element.closest(".sr-only")) continue;
      const style = getComputedStyle(element);
      const ownOverflow = element.scrollWidth - element.clientWidth;
      const exemption = element.getAttribute("data-reflow-exempt");
      const isHorizontalScrollOwner = style.overflowX === "auto" || style.overflowX === "scroll";
      const labelledBy = element.getAttribute("aria-labelledby")
        ?.split(/\s+/)
        .filter(Boolean)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ")
        .trim();
      const hasAccessibleName = Boolean(element.getAttribute("aria-label")?.trim() || labelledBy);
      const isInteractionDisabled = element.matches(":disabled,[aria-disabled='true']");
      const isLayoutSuppressed = element.matches("[hidden]")
        || Boolean(element.closest("[aria-hidden='true'],[inert]"))
        || style.display === "none"
        || style.visibility === "hidden";
      const isFocusSuppressed = isInteractionDisabled || isLayoutSuppressed;
      if (isInteractionDisabled && !isLayoutSuppressed) checkedVisibleDisabled += 1;
      let acceptsFocus = false;
      if (exemption !== null && !isFocusSuppressed && element.tabIndex >= 0) {
        const previousFocus = document.activeElement;
        element.focus({ preventScroll: true });
        acceptsFocus = document.activeElement === element;
        if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true });
        else element.blur();
      }
      if (exemption !== null && !isLayoutSuppressed && (
        exemption.trim().length === 0
        || !isHorizontalScrollOwner
        || element.tabIndex < 0
        || !acceptsFocus
        || !hasAccessibleName
      )) {
        violations.push(
          `${element.tagName.toLowerCase()} invalid reflow exemption: reason=${JSON.stringify(exemption)} overflow-x=${style.overflowX} tabIndex=${element.tabIndex} focus=${acceptsFocus} named=${hasAccessibleName} focus-suppressed=${isFocusSuppressed}`,
        );
      }
      if (isLayoutSuppressed) continue;
      const exemptScrollAncestor = exemption === null
        ? element.closest("[data-reflow-exempt]")
        : null;
      if (exemptScrollAncestor) continue;
      if (exemption === null && ownOverflow > 1) {
        const diagnosticText = (element.textContent ?? "").trim().replace(/\s+/gu, " ").slice(0, 80);
        violations.push(
          `${element.tagName.toLowerCase()} own overflow ${ownOverflow}px text=${JSON.stringify(diagnosticText)}`,
        );
      }
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        violations.push(
          `${element.tagName.toLowerCase()} viewport bounds ${rect.left.toFixed(1)}..${rect.right.toFixed(1)}`,
        );
      }
    }

    return { checkedVisibleDisabled, documentOverflow, missingSelectors, violations };
  }, { required: requiredSelectors, scenarioId: label });

  if (result.missingSelectors.length) {
    throw new Error(`${label}: required reflow selectors are missing\n${result.missingSelectors.join("\n")}`);
  }
  if (label.startsWith("state-") && result.checkedVisibleDisabled < 1) {
    throw new Error(`${label}: visual gate did not inspect a visible disabled element`);
  }
  if (result.documentOverflow > 1 || result.violations.length) {
    throw new Error(
      `${label} reflow failure: document=${result.documentOverflow}px\n${result.violations.join("\n")}`,
    );
  }
}

async function assertProductResourcesForcedColors(page, label) {
  const result = await page.evaluate(() => {
    const select = document.querySelector(
      "[data-slot='sidebar-inset'] > header [data-slot='cluster-scope-picker'] [data-slot='select-trigger']",
    );
    const row = document.querySelector("[data-slot='table-row']");
    const action = document.querySelector("[data-slot='table-body'] [data-slot='button']");
    const status = document.querySelector("[data-slot='status-mark']");
    const marker = status?.querySelector("[aria-hidden='true']");
    const required = [select, row, action, status, marker];
    if (required.some((element) => !(element instanceof HTMLElement))) {
      return { missing: true };
    }
    action.focus();
    const selectStyle = getComputedStyle(select);
    const rowStyle = getComputedStyle(row);
    const actionStyle = getComputedStyle(action);
    const markerStyle = getComputedStyle(marker);
    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      actionFocused: document.activeElement === action,
      actionOutlineStyle: actionStyle.outlineStyle,
      actionOutlineWidth: Number.parseFloat(actionStyle.outlineWidth),
      markerBorderStyle: markerStyle.borderTopStyle,
      markerBorderWidth: Number.parseFloat(markerStyle.borderTopWidth),
      rowBorderStyle: rowStyle.borderBottomStyle,
      rowBorderWidth: Number.parseFloat(rowStyle.borderBottomWidth),
      selectBorderStyle: selectStyle.borderTopStyle,
      selectBorderWidth: Number.parseFloat(selectStyle.borderTopWidth),
    };
  });
  if (result.missing || !result.active || !result.actionFocused
    || result.selectBorderStyle === "none" || result.selectBorderWidth < 1
    || result.rowBorderStyle === "none" || result.rowBorderWidth < 1
    || result.markerBorderStyle === "none" || result.markerBorderWidth < 1
    || result.actionOutlineStyle === "none" || result.actionOutlineWidth < 2) {
    throw new Error(
      `${label}: forced-colors Resources state is not preserved ${JSON.stringify(result)}`,
    );
  }
}

async function assertProductIssuesForcedColors(page, label) {
  await page.keyboard.press("Tab");
  const result = await page.evaluate(() => {
    const select = document.querySelector(
      "[data-slot='sidebar-inset'] > header [data-slot='cluster-scope-picker'] [data-slot='select-trigger']",
    );
    const list = document.querySelector("[role='region'][aria-label='Issues']");
    const issue = list?.querySelector("button");
    const detail = document.querySelector("[role='region'][aria-label='Issue details']");
    const recentChanges = document.querySelector("[data-testid='issue-recent-changes']");
    const pullRequest = recentChanges?.querySelector("a[target='_blank']");
    const required = [select, list, issue, detail, recentChanges, pullRequest];
    if (required.some((element) => !(element instanceof HTMLElement))) {
      return { missing: true };
    }

    issue.focus();
    const selectStyle = getComputedStyle(select);
    const listStyle = getComputedStyle(list);
    const issueStyle = getComputedStyle(issue);
    const detailStyle = getComputedStyle(detail);
    const recentChangesStyle = getComputedStyle(recentChanges);
    const pullRequestStyle = getComputedStyle(pullRequest);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      detailVisible: visible(detail),
      issueFocused: document.activeElement === issue,
      issueOpacity: Number.parseFloat(issueStyle.opacity),
      issueOutlineStyle: issueStyle.outlineStyle,
      issueOutlineWidth: Number.parseFloat(issueStyle.outlineWidth),
      listBorderStyle: listStyle.borderTopStyle,
      listBorderWidth: Number.parseFloat(listStyle.borderTopWidth),
      pullRequestOpacity: Number.parseFloat(pullRequestStyle.opacity),
      pullRequestVisible: visible(pullRequest),
      recentChangesBorderStyle: recentChangesStyle.borderTopStyle,
      recentChangesBorderWidth: Number.parseFloat(recentChangesStyle.borderTopWidth),
      recentChangesOpacity: Number.parseFloat(recentChangesStyle.opacity),
      selectBorderStyle: selectStyle.borderTopStyle,
      selectBorderWidth: Number.parseFloat(selectStyle.borderTopWidth),
      selectOpacity: Number.parseFloat(selectStyle.opacity),
      detailOpacity: Number.parseFloat(detailStyle.opacity),
    };
  });

  if (result.missing || !result.active || !result.detailVisible
    || !result.pullRequestVisible || !result.issueFocused
    || result.selectBorderStyle === "none" || result.selectBorderWidth < 1
    || result.listBorderStyle === "none" || result.listBorderWidth < 1
    || result.recentChangesBorderStyle === "none" || result.recentChangesBorderWidth < 1
    || result.issueOutlineStyle === "none" || result.issueOutlineWidth < 2) {
    throw new Error(
      `${label}: forced-colors Issues state is not preserved ${JSON.stringify(result)}`,
    );
  }
  for (const [name, opacity] of Object.entries({
    detail: result.detailOpacity,
    issue: result.issueOpacity,
    pullRequest: result.pullRequestOpacity,
    recentChanges: result.recentChangesOpacity,
    select: result.selectOpacity,
  })) {
    if (Math.abs(opacity - 1) > 0.001) {
      throw new Error(`${label}: forced-colors Issues ${name} uses group opacity ${opacity}`);
    }
  }
}

async function assertAuthForcedColors(page, label) {
  const result = await page.evaluate(() => {
    const main = document.querySelector("main");
    const card = document.querySelector("[data-slot='card']");
    const heading = document.querySelector("h1");
    const email = document.querySelector("#product-auth-email");
    const password = document.querySelector("#product-auth-password");
    const submit = document.querySelector("form [data-slot='button']");
    if (!(main instanceof HTMLElement)
      || !(card instanceof HTMLElement)
      || !(heading instanceof HTMLElement)
      || !(email instanceof HTMLInputElement)
      || !(password instanceof HTMLInputElement)
      || !(submit instanceof HTMLButtonElement)) {
      return { missing: true };
    }

    email.focus();
    const mainStyle = getComputedStyle(main);
    const cardStyle = getComputedStyle(card);
    const headingStyle = getComputedStyle(heading);
    const emailStyle = getComputedStyle(email);
    const passwordStyle = getComputedStyle(password);
    const submitStyle = getComputedStyle(submit);
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      cardVisible: visible(card),
      emailBackground: emailStyle.backgroundColor,
      emailBorderStyle: emailStyle.borderTopStyle,
      emailBorderWidth: Number.parseFloat(emailStyle.borderTopWidth),
      emailColor: emailStyle.color,
      emailFocused: document.activeElement === email,
      emailOpacity: Number.parseFloat(emailStyle.opacity),
      emailOutlineColor: emailStyle.outlineColor,
      emailOutlineStyle: emailStyle.outlineStyle,
      emailOutlineWidth: Number.parseFloat(emailStyle.outlineWidth),
      emailVisible: visible(email),
      headingColor: headingStyle.color,
      headingOpacity: Number.parseFloat(headingStyle.opacity),
      headingVisible: visible(heading),
      mainBackground: mainStyle.backgroundColor,
      passwordBorderStyle: passwordStyle.borderTopStyle,
      passwordBorderWidth: Number.parseFloat(passwordStyle.borderTopWidth),
      passwordVisible: visible(password),
      submitBackground: submitStyle.backgroundColor,
      submitBorderStyle: submitStyle.borderTopStyle,
      submitBorderWidth: Number.parseFloat(submitStyle.borderTopWidth),
      submitColor: submitStyle.color,
      submitOpacity: Number.parseFloat(submitStyle.opacity),
      submitVisible: visible(submit),
      cardBackground: cardStyle.backgroundColor,
    };
  });

  if (result.missing || !result.active
    || !result.cardVisible || !result.headingVisible
    || !result.emailVisible || !result.passwordVisible || !result.submitVisible
    || !result.emailFocused) {
    throw new Error(`${label}: forced-colors login surface is incomplete ${JSON.stringify(result)}`);
  }
  if (result.emailBorderStyle === "none" || result.emailBorderWidth < 1
    || result.passwordBorderStyle === "none" || result.passwordBorderWidth < 1
    || result.emailOutlineStyle === "none" || result.emailOutlineWidth < 2) {
    throw new Error(`${label}: forced-colors login borders or focus are missing ${JSON.stringify(result)}`);
  }
  if (Math.abs(result.emailOpacity - 1) > 0.001
    || Math.abs(result.headingOpacity - 1) > 0.001
    || Math.abs(result.submitOpacity - 1) > 0.001) {
    throw new Error(`${label}: forced-colors login controls use group opacity ${JSON.stringify(result)}`);
  }
  assertContrast(label, "login heading", result.headingColor, result.mainBackground, 4.5);
  assertContrast(label, "login input", result.emailColor, result.emailBackground, 4.5);
  assertContrast(label, "login input focus", result.emailOutlineColor, result.emailBackground, 3);
  assertContrast(label, "login action", result.submitColor, result.submitBackground, 4.5);
}

async function assertForcedColors(page, label) {
  const result = await page.evaluate(() => {
    const elements = {
      main: document.querySelector("main"),
      empty: document.querySelector("[data-slot='empty']"),
      surface: document.querySelector("[data-slot='surface']"),
      alert: document.querySelector("[role='alert']"),
      heading: document.querySelector("h1"),
      status: document.querySelector("[data-slot='status-mark']"),
      focusTarget: document.querySelector("[data-visual-focus-target]"),
      disabledButton: document.querySelector("[data-slot='button'][disabled]"),
      disabledItem: document.querySelector("[data-visual-disabled-item]"),
      disabledItemTitle: document.querySelector(
        "[data-visual-disabled-item] [data-slot='item-title']",
      ),
      disabledItemDescription: document.querySelector(
        "[data-visual-disabled-item] [data-slot='item-description']",
      ),
      scrollArea: document.querySelector("[data-visual-scroll-area]"),
      scrollViewport: document.querySelector("[data-slot='scroll-area-viewport']"),
      scrollBar: document.querySelector("[data-slot='scroll-area-scrollbar']"),
      scrollThumb: document.querySelector("[data-slot='scroll-area-thumb']"),
      completeProgressIndicator: document.querySelector(
        "[data-visual-progress='complete'] [data-slot='progress-indicator']",
      ),
      completeProgressTrack: document.querySelector(
        "[data-visual-progress='complete'] [data-slot='progress-track']",
      ),
      indeterminateProgressIndicator: document.querySelector(
        "[data-visual-progress='indeterminate'] [data-slot='progress-indicator']",
      ),
      tabsActive: document.querySelector("[data-visual-tabs-active='default']"),
      tabsFocus: document.querySelector("[data-visual-tabs-focus]"),
      tabsDisabled: document.querySelector("[data-visual-tabs-disabled]"),
      groupFocus: document.querySelector("[data-visual-button-group-focus]"),
      groupDisabled: document.querySelector(
        "[data-visual-button-group='horizontal'] [data-slot='button']:disabled",
      ),
    };
    if (Object.values(elements).some((element) => !(element instanceof HTMLElement))) {
      return { missing: true };
    }

    const {
      main,
      empty,
      surface,
      alert,
      heading,
      status,
      focusTarget,
      disabledButton,
      disabledItem,
      disabledItemTitle,
      disabledItemDescription,
      scrollArea,
      scrollViewport,
      scrollBar,
      scrollThumb,
      completeProgressIndicator,
      completeProgressTrack,
      indeterminateProgressIndicator,
      tabsActive,
      tabsFocus,
      tabsDisabled,
      groupFocus,
      groupDisabled,
    } = elements;
    focusTarget.focus();
    const emptyStyle = getComputedStyle(empty);
    const surfaceStyle = getComputedStyle(surface);
    const alertStyle = getComputedStyle(alert);
    const headingStyle = getComputedStyle(heading);
    const focusStyle = getComputedStyle(focusTarget);
    const focusOutlineColor = focusStyle.outlineColor;
    const focusOutlineStyle = focusStyle.outlineStyle;
    const focusOutlineWidth = Number.parseFloat(focusStyle.outlineWidth);
    const disabledStyle = getComputedStyle(disabledButton);
    const disabledItemStyle = getComputedStyle(disabledItem);
    const disabledItemTitleStyle = getComputedStyle(disabledItemTitle);
    const disabledItemDescriptionStyle = getComputedStyle(disabledItemDescription);
    const scrollAreaStyle = getComputedStyle(scrollArea);
    const scrollViewportStyle = getComputedStyle(scrollViewport);
    const scrollBarStyle = getComputedStyle(scrollBar);
    const scrollThumbStyle = getComputedStyle(scrollThumb);
    const scrollBarRect = scrollBar.getBoundingClientRect();
    const scrollThumbRect = scrollThumb.getBoundingClientRect();
    const completeProgressStyle = getComputedStyle(completeProgressIndicator);
    const completeProgressTrackStyle = getComputedStyle(completeProgressTrack);
    const indeterminateProgressStyle = getComputedStyle(indeterminateProgressIndicator);
    const selectionStyle = getComputedStyle(heading, "::selection");
    const marker = status.querySelector("[aria-hidden='true']");
    if (!(marker instanceof HTMLElement)) return { missing: true };
    const markerStyle = getComputedStyle(marker);

    function parseColor(color) {
      const channels = color.match(/[\d.]+/g)?.map(Number) ?? [];
      return {
        alpha: color === "transparent" ? 0 : channels.length >= 4 ? channels[3] : 1,
        blue: channels[2] ?? 0,
        green: channels[1] ?? 0,
        red: channels[0] ?? 0,
      };
    }

    function composite(top, bottom) {
      const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
      if (alpha === 0) return { alpha: 0, blue: 0, green: 0, red: 0 };
      return {
        alpha,
        blue: (top.blue * top.alpha + bottom.blue * bottom.alpha * (1 - top.alpha)) / alpha,
        green: (top.green * top.alpha + bottom.green * bottom.alpha * (1 - top.alpha)) / alpha,
        red: (top.red * top.alpha + bottom.red * bottom.alpha * (1 - top.alpha)) / alpha,
      };
    }

    function effectiveBackground(element) {
      const ancestry = [];
      let current = element;
      while (current instanceof HTMLElement) {
        ancestry.push(current);
        current = current.parentElement;
      }
      let result = { alpha: 0, blue: 0, green: 0, red: 0 };
      for (const ancestor of ancestry.reverse()) {
        const style = getComputedStyle(ancestor);
        const layer = parseColor(style.backgroundColor);
        result = composite(layer, result);
      }
      const alpha = Number(result.alpha.toFixed(4));
      return alpha >= 0.999
        ? `rgb(${result.red}, ${result.green}, ${result.blue})`
        : `rgba(${result.red}, ${result.green}, ${result.blue}, ${alpha})`;
    }

    function effectiveOpacity(element) {
      let opacity = 1;
      let current = element;
      while (current instanceof HTMLElement) {
        opacity *= Number.parseFloat(getComputedStyle(current).opacity || "1");
        current = current.parentElement;
      }
      return opacity;
    }

    const tabsActiveStyle = getComputedStyle(tabsActive);
    const tabsDisabledStyle = getComputedStyle(tabsDisabled);
    const groupDisabledStyle = getComputedStyle(groupDisabled);
    tabsFocus.focus();
    const tabsFocusStyle = getComputedStyle(tabsFocus);
    const tabsFocusOutline = {
      color: tabsFocusStyle.outlineColor,
      style: tabsFocusStyle.outlineStyle,
      width: Number.parseFloat(tabsFocusStyle.outlineWidth),
    };
    groupFocus.focus();
    const groupFocusStyle = getComputedStyle(groupFocus);
    const groupFocusOutline = {
      color: groupFocusStyle.outlineColor,
      style: groupFocusStyle.outlineStyle,
      width: Number.parseFloat(groupFocusStyle.outlineWidth),
    };

    return {
      missing: false,
      active: matchMedia("(forced-colors: active)").matches,
      mainBackground: effectiveBackground(main),
      emptyBackground: effectiveBackground(empty),
      emptyBorderColor: emptyStyle.borderTopColor,
      emptyOpacity: effectiveOpacity(empty),
      emptyBorderStyle: emptyStyle.borderTopStyle,
      emptyBorderWidth: Number.parseFloat(emptyStyle.borderTopWidth),
      surfaceBackground: effectiveBackground(surface),
      surfaceBorderColor: surfaceStyle.borderTopColor,
      surfaceOpacity: effectiveOpacity(surface),
      surfaceBorderStyle: surfaceStyle.borderTopStyle,
      surfaceBorderWidth: Number.parseFloat(surfaceStyle.borderTopWidth),
      alertBackground: effectiveBackground(alert),
      alertBorderColor: alertStyle.borderTopColor,
      alertOpacity: effectiveOpacity(alert),
      alertBorderStyle: alertStyle.borderTopStyle,
      alertBorderWidth: Number.parseFloat(alertStyle.borderTopWidth),
      headingColor: headingStyle.color,
      headingOpacity: effectiveOpacity(heading),
      headingVisible: heading.getBoundingClientRect().width > 0,
      focusBackground: effectiveBackground(focusTarget),
      focusOutlineColor,
      focusOpacity: effectiveOpacity(focusTarget),
      focusOutlineStyle,
      focusOutlineWidth,
      disabledBackground: effectiveBackground(disabledButton),
      disabledColor: disabledStyle.color,
      disabledOpacity: effectiveOpacity(disabledButton),
      disabledVisible: disabledButton.getBoundingClientRect().width > 0,
      disabledItemBackground: effectiveBackground(disabledItem),
      disabledItemBorderColor: disabledItemStyle.borderTopColor,
      disabledItemBorderStyle: disabledItemStyle.borderTopStyle,
      disabledItemBorderWidth: Number.parseFloat(disabledItemStyle.borderTopWidth),
      disabledItemDescriptionColor: disabledItemDescriptionStyle.color,
      disabledItemOpacity: effectiveOpacity(disabledItem),
      disabledItemTitleColor: disabledItemTitleStyle.color,
      disabledItemVisible: disabledItem.getBoundingClientRect().width > 0,
      scrollAreaBackground: effectiveBackground(scrollArea),
      scrollAreaBorderColor: scrollAreaStyle.borderTopColor,
      scrollAreaBorderStyle: scrollAreaStyle.borderTopStyle,
      scrollAreaBorderWidth: Number.parseFloat(scrollAreaStyle.borderTopWidth),
      scrollAreaOpacity: effectiveOpacity(scrollArea),
      scrollBarBackground: effectiveBackground(scrollBar),
      scrollBarBorderColor: scrollBarStyle.borderTopColor,
      scrollBarBorderStyle: scrollBarStyle.borderTopStyle,
      scrollBarBorderWidth: Number.parseFloat(scrollBarStyle.borderTopWidth),
      scrollBarDisplay: scrollBarStyle.display,
      scrollBarHasOverflowY: scrollBar.hasAttribute("data-has-overflow-y"),
      scrollBarHeight: scrollBarRect.height,
      scrollBarOpacity: effectiveOpacity(scrollBar),
      scrollBarVisibility: scrollBarStyle.visibility,
      scrollBarWidth: scrollBarRect.width,
      scrollThumbBackground: scrollThumbStyle.backgroundColor,
      scrollThumbHeight: scrollThumbRect.height,
      scrollThumbOpacity: effectiveOpacity(scrollThumb),
      scrollThumbWidth: scrollThumbRect.width,
      scrollViewportHasOverflowY: scrollViewport.hasAttribute("data-has-overflow-y"),
      scrollViewportOpacity: effectiveOpacity(scrollViewport),
      scrollViewportOverflowY: scrollViewportStyle.overflowY,
      scrollViewportTabIndex: scrollViewport.tabIndex,
      completeProgressWidth: completeProgressIndicator.getBoundingClientRect().width,
      indeterminateProgressAnimationName: indeterminateProgressStyle.animationName,
      indeterminateProgressBackgroundClip: indeterminateProgressStyle.backgroundClip,
      indeterminateProgressBorderColor: indeterminateProgressStyle.borderTopColor,
      indeterminateProgressBorderStyle: indeterminateProgressStyle.borderTopStyle,
      indeterminateProgressBorderWidth: Number.parseFloat(indeterminateProgressStyle.borderTopWidth),
      indeterminateProgressOpacity: effectiveOpacity(indeterminateProgressIndicator),
      indeterminateProgressWidth: indeterminateProgressIndicator.getBoundingClientRect().width,
      progressTrackWidth: completeProgressIndicator.parentElement?.getBoundingClientRect().width ?? 0,
      progressTrackBackground: effectiveBackground(completeProgressTrack),
      progressTrackBorderColor: completeProgressTrackStyle.borderTopColor,
      progressTrackBorderStyle: completeProgressTrackStyle.borderTopStyle,
      progressTrackBorderWidth: Number.parseFloat(completeProgressTrackStyle.borderTopWidth),
      progressTrackOpacity: effectiveOpacity(completeProgressTrack),
      completeProgressVisible: completeProgressStyle.display !== "none"
        && completeProgressStyle.visibility !== "hidden",
      markerBackground: effectiveBackground(marker),
      markerBorderColor: markerStyle.borderTopColor,
      markerOpacity: effectiveOpacity(marker),
      markerBorderStyle: markerStyle.borderTopStyle,
      markerBorderWidth: Number.parseFloat(markerStyle.borderTopWidth),
      selectionBackground: selectionStyle.backgroundColor,
      selectionColor: selectionStyle.color,
      selectionOpacity: effectiveOpacity(heading),
      selectionUnderlay: effectiveBackground(heading),
      statusText: status.textContent?.trim() ?? "",
      tabsActiveBackground: effectiveBackground(tabsActive),
      tabsActiveColor: tabsActiveStyle.color,
      tabsActiveOpacity: effectiveOpacity(tabsActive),
      tabsDisabledBackground: effectiveBackground(tabsDisabled),
      tabsDisabledBorderColor: tabsDisabledStyle.borderTopColor,
      tabsDisabledBorderStyle: tabsDisabledStyle.borderTopStyle,
      tabsDisabledBorderWidth: Number.parseFloat(tabsDisabledStyle.borderTopWidth),
      tabsDisabledColor: tabsDisabledStyle.color,
      tabsDisabledOpacity: effectiveOpacity(tabsDisabled),
      tabsFocusBackground: effectiveBackground(tabsFocus),
      tabsFocusOutlineColor: tabsFocusOutline.color,
      tabsFocusOutlineStyle: tabsFocusOutline.style,
      tabsFocusOutlineWidth: tabsFocusOutline.width,
      groupDisabledBackground: effectiveBackground(groupDisabled),
      groupDisabledBorderColor: groupDisabledStyle.borderTopColor,
      groupDisabledBorderStyle: groupDisabledStyle.borderTopStyle,
      groupDisabledBorderWidth: Number.parseFloat(groupDisabledStyle.borderTopWidth),
      groupDisabledColor: groupDisabledStyle.color,
      groupDisabledOpacity: effectiveOpacity(groupDisabled),
      groupFocusBackground: effectiveBackground(groupFocus),
      groupFocusOutlineColor: groupFocusOutline.color,
      groupFocusOutlineStyle: groupFocusOutline.style,
      groupFocusOutlineWidth: groupFocusOutline.width,
    };
  });

  if (result.missing) throw new Error(`${label}: required forced-colors elements are missing`);
  if (!result.active) throw new Error(`${label}: forced-colors media query is not active`);
  const opacityChecks = {
    alert: result.alertOpacity,
    disabled: result.disabledOpacity,
    disabledItem: result.disabledItemOpacity,
    groupDisabled: result.groupDisabledOpacity,
    empty: result.emptyOpacity,
    focus: result.focusOpacity,
    heading: result.headingOpacity,
    indeterminateProgress: result.indeterminateProgressOpacity,
    progressTrack: result.progressTrackOpacity,
    selection: result.selectionOpacity,
    scrollArea: result.scrollAreaOpacity,
    scrollBar: result.scrollBarOpacity,
    scrollThumb: result.scrollThumbOpacity,
    scrollViewport: result.scrollViewportOpacity,
    status: result.markerOpacity,
    surface: result.surfaceOpacity,
    tabsActive: result.tabsActiveOpacity,
    tabsDisabled: result.tabsDisabledOpacity,
  };
  for (const [element, opacity] of Object.entries(opacityChecks)) {
    if (Math.abs(opacity - 1) > 0.001) {
      throw new Error(`${label}: ${element} uses group opacity ${opacity}; forced-colors contrast must be opaque`);
    }
  }
  assertContrast(label, "heading", result.headingColor, result.mainBackground, 4.5);
  assertContrast(label, "empty border", result.emptyBorderColor, result.emptyBackground, 3);
  assertContrast(label, "surface border", result.surfaceBorderColor, result.surfaceBackground, 3);
  assertContrast(label, "alert border", result.alertBorderColor, result.alertBackground, 3);
  assertContrast(label, "focus outline", result.focusOutlineColor, result.focusBackground, 3);
  assertContrast(label, "disabled text", result.disabledColor, result.disabledBackground, 3);
  assertContrast(
    label,
    "disabled Item title",
    result.disabledItemTitleColor,
    result.disabledItemBackground,
    3,
  );
  assertContrast(
    label,
    "disabled Item description",
    result.disabledItemDescriptionColor,
    result.disabledItemBackground,
    3,
  );
  assertContrast(
    label,
    "disabled Item border",
    result.disabledItemBorderColor,
    result.disabledItemBackground,
    3,
  );
  assertContrast(
    label,
    "ScrollArea border",
    result.scrollAreaBorderColor,
    result.scrollAreaBackground,
    3,
  );
  assertContrast(
    label,
    "ScrollArea scrollbar border",
    result.scrollBarBorderColor,
    result.scrollBarBackground,
    3,
  );
  assertContrast(
    label,
    "ScrollArea thumb",
    result.scrollThumbBackground,
    result.scrollBarBackground,
    3,
  );
  assertContrast(label, "status marker", result.markerBorderColor, result.markerBackground, 3);
  assertContrast(
    label,
    "progress track border",
    result.progressTrackBorderColor,
    result.progressTrackBackground,
    3,
  );
  assertContrast(
    label,
    "indeterminate progress border",
    result.indeterminateProgressBorderColor,
    result.progressTrackBackground,
    3,
  );
  assertContrast(
    label,
    "selection",
    result.selectionColor,
    result.selectionBackground,
    4.5,
    result.selectionUnderlay,
  );
  for (const [name, foreground, background, minimum] of [
    ["Tabs active text", result.tabsActiveColor, result.tabsActiveBackground, 4.5],
    ["Tabs focus outline", result.tabsFocusOutlineColor, result.tabsFocusBackground, 3],
    ["Tabs disabled text", result.tabsDisabledColor, result.tabsDisabledBackground, 3],
    ["Tabs disabled border", result.tabsDisabledBorderColor, result.tabsDisabledBackground, 3],
    ["ButtonGroup focus outline", result.groupFocusOutlineColor, result.groupFocusBackground, 3],
    ["ButtonGroup disabled text", result.groupDisabledColor, result.groupDisabledBackground, 3],
    ["ButtonGroup disabled border", result.groupDisabledBorderColor, result.groupDisabledBackground, 3],
  ]) {
    assertContrast(label, name, foreground, background, minimum);
  }
  if (!result.headingVisible
    || !result.disabledVisible
    || !result.disabledItemVisible
    || !result.statusText) {
    throw new Error(`${label}: forced-colors text or controls are not visible`);
  }
  if (!result.scrollViewportHasOverflowY
    || !result.scrollBarHasOverflowY
    || result.scrollViewportTabIndex !== 0
    || result.scrollBarDisplay === "none"
    || result.scrollBarVisibility === "hidden"
    || result.scrollBarWidth < 1
    || result.scrollBarHeight < 1
    || result.scrollThumbWidth < 1
    || result.scrollThumbHeight < 1
    || result.scrollThumbHeight >= result.scrollBarHeight) {
    throw new Error(
      `${label}: forced-colors ScrollArea geometry or keyboard overflow contract failed `
      + JSON.stringify({
        barDisplay: result.scrollBarDisplay,
        barHasOverflowY: result.scrollBarHasOverflowY,
        barHeight: result.scrollBarHeight,
        barVisibility: result.scrollBarVisibility,
        barWidth: result.scrollBarWidth,
        thumbHeight: result.scrollThumbHeight,
        thumbWidth: result.scrollThumbWidth,
        viewportHasOverflowY: result.scrollViewportHasOverflowY,
        viewportOverflowY: result.scrollViewportOverflowY,
        viewportTabIndex: result.scrollViewportTabIndex,
      }),
    );
  }
  const indeterminateRatio = result.progressTrackWidth > 0
    ? result.indeterminateProgressWidth / result.progressTrackWidth
    : 0;
  const completeRatio = result.progressTrackWidth > 0
    ? result.completeProgressWidth / result.progressTrackWidth
    : 0;
  if (!result.completeProgressVisible
    || completeRatio < 0.98
    || indeterminateRatio < 0.25
    || indeterminateRatio > 0.45
    || result.indeterminateProgressBackgroundClip !== "padding-box"
    || result.indeterminateProgressBorderStyle !== "dashed"
    || result.indeterminateProgressBorderWidth < 1
    || result.progressTrackBorderStyle === "none"
    || result.progressTrackBorderWidth < 1
    || result.indeterminateProgressAnimationName !== "none") {
    throw new Error(
      `${label}: indeterminate progress must remain a static partial dashed shape in reduced-motion forced-colors `
      + JSON.stringify({
        animationName: result.indeterminateProgressAnimationName,
        backgroundClip: result.indeterminateProgressBackgroundClip,
        borderStyle: result.indeterminateProgressBorderStyle,
        borderWidth: result.indeterminateProgressBorderWidth,
        completeRatio,
        completeWidth: result.completeProgressWidth,
        ratio: indeterminateRatio,
        trackWidth: result.progressTrackWidth,
        trackBorderStyle: result.progressTrackBorderStyle,
        trackBorderWidth: result.progressTrackBorderWidth,
      }),
    );
  }
  if (result.focusOutlineStyle === "none" || result.focusOutlineWidth < 2
    || result.tabsFocusOutlineStyle === "none" || result.tabsFocusOutlineWidth < 2
    || result.groupFocusOutlineStyle === "none" || result.groupFocusOutlineWidth < 2) {
    throw new Error(`${label}: focus outline is not preserved`);
  }
  if (result.emptyBorderStyle === "none" || result.emptyBorderWidth < 1
    || result.surfaceBorderStyle === "none" || result.surfaceBorderWidth < 1
    || result.alertBorderStyle === "none" || result.alertBorderWidth < 1
    || result.disabledItemBorderStyle === "none" || result.disabledItemBorderWidth < 1
    || result.scrollAreaBorderStyle === "none" || result.scrollAreaBorderWidth < 1
    || result.scrollBarBorderStyle === "none" || result.scrollBarBorderWidth < 1
    || result.markerBorderStyle === "none" || result.markerBorderWidth < 1
    || result.tabsDisabledBorderStyle === "none" || result.tabsDisabledBorderWidth < 1
    || result.groupDisabledBorderStyle === "none" || result.groupDisabledBorderWidth < 1) {
    throw new Error(`${label}: a required forced-colors border is not preserved`);
  }
  if (result.tabsActiveBackground === result.tabsFocusBackground
    || result.tabsActiveBackground === result.tabsDisabledBackground
    || result.tabsDisabledColor === result.tabsActiveColor) {
    throw new Error(`${label}: Tabs active, focused, and disabled states are not distinct`);
  }
}

function assertContrast(label, element, foreground, background, minimum, underlay) {
  const ratio = contrastRatio(foreground, background, underlay);
  if (ratio < minimum) {
    throw new Error(
      `${label}: ${element} contrast ${ratio.toFixed(2)} < ${minimum} (${foreground} on ${background})`,
    );
  }
}

function contrastRatio(foreground, background, underlay) {
  const underlayColor = underlay ? opaqueColor(parseCssColor(underlay), underlay) : undefined;
  const parsedBackground = parseCssColor(background);
  if (parsedBackground.alpha < 0.99 && !underlayColor) {
    throw new Error(`Semi-transparent background requires an opaque underlay: ${background}`);
  }
  const backgroundColor = parsedBackground.alpha >= 0.99
    ? parsedBackground.channels
    : blendColor(parsedBackground, underlayColor);
  const parsedForeground = parseCssColor(foreground);
  const foregroundColor = parsedForeground.alpha >= 0.99
    ? parsedForeground.channels
    : blendColor(parsedForeground, backgroundColor);
  const lighter = Math.max(relativeLuminance(foregroundColor), relativeLuminance(backgroundColor));
  const darker = Math.min(relativeLuminance(foregroundColor), relativeLuminance(backgroundColor));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseCssColor(color) {
  const channels = color?.match(/[\d.]+/g)?.map(Number) ?? [];
  if (channels.length < 3) {
    throw new Error(`forced-colors value is not RGB: ${color}`);
  }
  return {
    alpha: channels.length >= 4 ? channels[3] : 1,
    channels: channels.slice(0, 3),
  };
}

function opaqueColor(color, source) {
  if (color.alpha < 0.99) throw new Error(`forced-colors underlay is not opaque: ${source}`);
  return color.channels;
}

function blendColor(foreground, background) {
  return foreground.channels.map(
    (channel, index) => channel * foreground.alpha + background[index] * (1 - foreground.alpha),
  );
}

function relativeLuminance([red, green, blue]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isApiPath(url) {
  const pathname = new URL(url).pathname;
  return pathname === "/api" || pathname.startsWith("/api/");
}

function isExactProductApiUrl(url, path) {
  const parsed = url instanceof URL ? url : new URL(url);
  const expected = new URL(path, baseUrl);
  return parsed.origin === expected.origin
    && parsed.pathname === expected.pathname
    && parsed.search === expected.search;
}

function isExpectedAuthSessionConsoleNoise(text, authSession) {
  if (!text.startsWith("Failed to load resource: the server responded with a status of ")) {
    return false;
  }
  if (authSession === "unauthenticated") return text.includes("401 (Unauthorized)");
  if (authSession === "error") return text.includes("503 (Service Unavailable)");
  return false;
}

function isUnexpectedFeatureNetworkRequest(request) {
  const parsed = new URL(request.url());
  return parsed.origin !== baseUrl
    || ["eventsource", "fetch", "xhr"].includes(request.resourceType());
}

function isViteDevelopmentSocket(url) {
  const parsed = new URL(url);
  const serverUrl = new URL(baseUrl);
  return parsed.hostname === serverUrl.hostname
    && parsed.port === serverUrl.port
    && parsed.pathname === "/"
    && parsed.searchParams.has("token");
}

async function stopOwnedServer() {
  if (serverExit && !(await isOwnedServerResponding())) return;
  await signalOwnedServer("SIGTERM");
  if (await waitForOwnedServerStop(3_000)) return;

  await signalOwnedServer("SIGKILL");
  if (await waitForOwnedServerStop(1_000)) return;
  throw new Error("Owned visual Vite did not exit after SIGTERM and SIGKILL");
}

async function signalOwnedServer(signal) {
  if (!server.pid) throw new Error(`Owned visual Vite has no pid for ${signal}`);
  if (process.platform === "win32") {
    await runWindowsTreeKill(signal);
    return;
  }
  try {
    process.kill(-server.pid, signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

async function runWindowsTreeKill(signal) {
  const args = ["/PID", String(server.pid), "/T"];
  if (signal === "SIGKILL") args.push("/F");
  await new Promise((resolve, reject) => {
    const killer = spawn("taskkill", args, { stdio: "ignore" });
    killer.once("error", reject);
    killer.once("exit", resolve);
  });
}

async function waitForOwnedServerStop(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (serverExit && !(await isOwnedServerResponding())) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

async function isOwnedServerResponding() {
  try {
    const response = await fetch(stateHarnessUrl);
    return response.ok && (await response.text()).includes(runNonce);
  } catch {
    return false;
  }
}

function assertServerAlive() {
  if (!serverExit) return;
  const detail = serverExit.error?.message
    ?? `code=${serverExit.code ?? "unknown"} signal=${serverExit.signal ?? "none"}`;
  throw new Error(`owned visual Vite is not running: ${detail}`);
}

async function findAvailablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const address = listener.address();
  if (!address || typeof address === "string") {
    listener.close();
    throw new Error("Could not reserve a visual gate port");
  }
  await new Promise((resolve, reject) => {
    listener.close((error) => error ? reject(error) : resolve());
  });
  return address.port;
}

async function waitForOwnedServer(url, nonce) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok && (await response.text()).includes(nonce)) return;
    } catch { /* vite is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Owned visual Vite did not publish nonce ${nonce} at ${url}`);
}
