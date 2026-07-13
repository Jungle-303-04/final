import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let vite;

before(async () => {
  vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, entries: [] },
    server: { middlewareMode: true },
  });
});

after(async () => {
  await vite?.close();
});

test('timeAgo renders missing or invalid timestamps as empty actual value', async () => {
  const { timeAgo } = await vite.ssrLoadModule('/src/shared/lib/format.ts');

  assert.equal(timeAgo(''), '—');
  assert.equal(timeAgo(null), '—');
  assert.equal(timeAgo('not-a-date'), '—');
});

test('adapters do not synthesize current timestamps when backend omits them', async () => {
  const { adaptCluster, adaptConversationSummary } = await vite.ssrLoadModule('/src/shared/lib/adapt.ts');

  assert.equal(adaptCluster({ cluster_id: 'cluster-a' }).registered_at, '');
  assert.equal(adaptConversationSummary({ conversation_id: 'aic-1' }).updated_at, '');
});

test('ai conversation detail adapter unwraps real backend envelope and message metadata', async () => {
  const { adaptConversationDetail } = await vite.ssrLoadModule('/src/features/chat/api.ts');

  const detail = adaptConversationDetail({
    conversation: {
      conversation_id: 'aic-1',
      title: 'checkout incident',
      status: 'completed',
      updated_at: '2026-07-07T10:00:00Z',
    },
    messages: [
      {
        message_id: 'aim-1',
        role: 'assistant',
        content: 'restart is allowed',
        created_at: '2026-07-07T10:00:01Z',
        metadata: {
          tool_trace: [
            { tool: 'list_command_actions', arguments: { limit: 2 }, ok: true },
            { tool: 'missing_tool', arguments: {}, ok: false, error: 'unknown ai tool' },
          ],
        },
      },
    ],
  });

  assert.equal(detail.conversation_id, 'aic-1');
  assert.equal(detail.status, 'idle');
  assert.equal(detail.messages[0].role, 'assistant');
  assert.deepEqual(detail.messages[0].tool_calls, [
    { name: 'list_command_actions', args: '{"limit":2}', status: 'ok' },
    { name: 'missing_tool', args: '{}', status: 'danger' },
  ]);
});

test('timeline evidence-only rows are not presented as incidents', async () => {
  const { adaptIncident, isIncidentTimelineItem } = await vite.ssrLoadModule('/src/shared/lib/adapt.ts');

  const evidenceOnly = {
    correlation_id: 'corr-evidence',
    incident_id: null,
    current_subject: 'evidence.built',
    status: 'evidence_built',
    root_cause: null,
  };
  const completed = {
    correlation_id: 'corr-rca',
    incident_id: null,
    current_subject: 'rca.completed',
    status: 'rca_completed',
    root_cause: 'config_env_error',
  };

  assert.equal(isIncidentTimelineItem(evidenceOnly), false);
  assert.equal(isIncidentTimelineItem(completed), true);
  assert.equal(adaptIncident(completed).summary, 'config_env_error');
});

test('workflow adapter reads open approval references from backend run payloads', async () => {
  const { adaptRun } = await vite.ssrLoadModule('/src/shared/lib/adapt.ts');

  assert.equal(adaptRun({
    workflow_run_id: 'workflow-1',
    status: 'waiting_for_approval',
    approval: { approval_id: 'approval-direct', status: 'requested' },
  }).approval_id, 'approval-direct');

  assert.equal(adaptRun({
    workflow_run_id: 'workflow-2',
    status: 'waiting_for_approval',
    approvals: [
      { approval_id: 'approval-old', status: 'granted' },
      { approval_id: 'approval-open', status: 'requested' },
    ],
  }).approval_id, 'approval-open');
});

test('ai message payload keeps title out of existing conversation sends', async () => {
  const { aiMessagePayload } = await vite.ssrLoadModule('/src/features/chat/api.ts');

  const input = { message: '분석해줘', title: '초기 제목', context: { cluster_id: 'cluster-1' } };
  assert.deepEqual(aiMessagePayload(input), {
    message: '분석해줘',
    context: { cluster_id: 'cluster-1' },
  });
  assert.deepEqual(aiMessagePayload(input, { includeTitle: true }), input);
  assert.deepEqual(aiMessagePayload('안녕'), { message: '안녕' });
});

test('sparkline presence requires measured numeric points', async () => {
  const { buildTimeSeriesRows, hasSparklinePoints } = await vite.ssrLoadModule('/src/ui/charts.tsx');

  assert.equal(hasSparklinePoints([null, undefined]), false);
  assert.equal(hasSparklinePoints([null, undefined, Number.NaN]), false);
  assert.equal(hasSparklinePoints([Number.POSITIVE_INFINITY]), false);
  assert.equal(hasSparklinePoints([-1, null]), false);
  assert.equal(hasSparklinePoints([null, 0]), true);
  assert.equal(hasSparklinePoints([undefined, 42]), true);

  const chart = buildTimeSeriesRows([
    { id: 'ready', data: [{ x: 2, y: 3 }, { x: 1, y: 2 }] },
    { id: 'missing-at-1', data: [{ x: 2, y: 8 }, { x: 3, y: Number.NaN }] },
  ], true);
  assert.deepEqual(chart.lines, [
    { id: 'ready', dataKey: 'series-0' },
    { id: 'missing-at-1', dataKey: 'series-1' },
  ]);
  assert.deepEqual(chart.rows, [
    { x: 1, 'series-0': 2 },
    { x: 2, 'series-0': 3, 'series-1': 8 },
  ]);
});

test('live stream applies initial snapshot summaries to chart history', async () => {
  const { applyRealtimeMessage, liveStore } = await vite.ssrLoadModule('/src/shared/lib/live.ts');

  liveStore.setState({ status: 'closed', snapshot: null, history: [] });
  applyRealtimeMessage({
    type: 'snapshot',
    seq: 12,
    state: {
      clusters: {
        'cluster-1': { cluster_id: 'cluster-1', pods_ready: 17, restart_delta: 2 },
        'cluster-2': { pods_ready: 13, restart_delta: 0 },
      },
      resources: {},
    },
  });

  assert.deepEqual(
    liveStore.getState().history.map(({ clusterId, restarts, running }) => ({ clusterId, restarts, running })),
    [
      { clusterId: 'cluster-1', restarts: 2, running: 17 },
      { clusterId: 'cluster-2', restarts: 0, running: 13 },
    ],
  );

  applyRealtimeMessage({
    type: 'live.summary',
    cluster_id: 'cluster-1',
    summary: { cluster_id: 'cluster-1', pods_ready: 18, restart_delta: 1 },
  });

  const lastPoint = liveStore.getState().history.at(-1);
  assert.equal(lastPoint.clusterId, 'cluster-1');
  assert.equal(lastPoint.restarts, 1);
  assert.equal(lastPoint.running, 18);
  liveStore.setState({ status: 'closed', snapshot: null, history: [] });
});

test('cluster drill actions keep real subject context across events and ai', async () => {
  const { contextActionHrefs, deploymentTargetFromWorkload } = await vite.ssrLoadModule('/src/features/cluster/ClusterDetailView.tsx');
  const { adaptWorkloadResource } = await vite.ssrLoadModule('/src/shared/lib/adapt.ts');

  const workload = adaptWorkloadResource({
    resource_type: 'workload',
    kind: 'Deployment',
    namespace: 'prod',
    name: 'checkout',
    status: '2/3',
    health: 'degraded',
    summary: { desired_replicas: 3, ready_replicas: 2, available_replicas: 2, updated_replicas: 3 },
  });
  assert.equal(workload.ready, 2);
  assert.deepEqual(deploymentTargetFromWorkload(workload), { ns: 'prod', name: 'checkout', podCount: 2 });

  const hrefs = contextActionHrefs('cluster-1', 'pod', 'checkout-abc', 'prod');
  assert.equal(hrefs.events, '/clusters/cluster-1?tab=events&q=checkout-abc');
  const aiUrl = new URL(hrefs.ai, 'https://console.test');
  assert.equal(aiUrl.pathname, '/ai');
  assert.equal(aiUrl.searchParams.get('prefill'), 'cluster-1 prod/checkout-abc pod 상태 분석');
  assert.deepEqual(JSON.parse(aiUrl.searchParams.get('context')), {
    cluster_id: 'cluster-1',
    resource_type: 'pod',
    kind: 'Pod',
    namespace: 'prod',
    name: 'checkout-abc',
  });
});

test('cluster drilldown uses deterministic namespace color and real service selector fields', async () => {
  const { namespaceColor, selectorRecord, serviceMatches, textMatches } = await vite.ssrLoadModule('/src/features/cluster/ClusterDetailView.tsx');
  const { adaptServiceResource } = await vite.ssrLoadModule('/src/shared/lib/adapt.ts');

  assert.equal(namespaceColor('payments'), namespaceColor('payments'));
  assert.notEqual(namespaceColor('payments'), namespaceColor('observability'));
  assert.deepEqual(selectorRecord({ matchLabels: { app: 'checkout', tier: 'api' } }), { app: 'checkout', tier: 'api' });

  const service = adaptServiceResource({
    kind: 'Service',
    namespace: 'prod',
    name: 'checkout',
    status: 'ClusterIP',
    summary: {
      type: 'ClusterIP',
      cluster_ip: '10.96.0.12',
      ports: [{ port: 80, protocol: 'TCP' }],
      selector: { matchLabels: { app: 'checkout' } },
    },
  });

  assert.equal(service.ports, '80/TCP');
  assert.deepEqual(service.selector, { app: 'checkout' });
  assert.equal(serviceMatches(service, 'app=checkout'), true);
  assert.equal(serviceMatches(service, 'sandbox'), false);
  assert.equal(textMatches('READY', 'NotReady'), true);
});

test('cluster detail never invents unavailable values, commands, or pod weights', async () => {
  const { clusterRemoveCommand, podTiles, statValue } = await vite.ssrLoadModule('/src/features/cluster/ClusterDetailView.tsx');

  assert.equal(statValue({ isPending: false, isError: false }, undefined), '—');
  assert.equal(clusterRemoveCommand(undefined), null);
  assert.equal(clusterRemoveCommand({ agent_remove_command: '' }), null);
  assert.equal(
    clusterRemoveCommand({ agent_remove_command: 'kubectl delete deployment/cluster-agent' }),
    'kubectl delete deployment/cluster-agent',
  );

  const tiles = podTiles([
    { id: 'prod/api-1', name: 'api-1', namespace: 'prod', phase: 'Running', ready: '1/1', owner: 'api', owner_kind: 'Deployment', restarts: 0, cpu_pct: 91, mem_pct: 20, cpu_mcores: 600, mem_mib: 512, health: 'healthy' },
    { id: 'prod/api-2', name: 'api-2', namespace: 'prod', phase: 'Running', ready: '1/1', owner: 'api', owner_kind: 'Deployment', restarts: 0, cpu_pct: 3, mem_pct: 80, cpu_mcores: 10, mem_mib: 2048, health: 'healthy' },
  ]);
  assert.deepEqual(tiles.map((tile) => tile.size), [1, 1]);
});

test('resource wizards keep exact real discovery selections', async () => {
  const { repositoryManifestCandidateValue } = await vite.ssrLoadModule('/src/features/resources/ConnectRepoWizard.tsx');
  const { clusterImportCandidateMatches, preferredDeployProvider, registrationStatusTone } = await vite.ssrLoadModule('/src/features/resources/RegisterClusterWizard.tsx');

  assert.equal(
    repositoryManifestCandidateValue({ source_type: 'kustomize', path: 'deploy', display_name: 'deploy', reason: 'kustomization' }),
    'kustomize:deploy',
  );
  const candidate = {
    cluster_id: 'prod-seoul-01',
    name: 'prod seoul',
    source: 'env:CLUSTER_CONTEXTS',
    cloud_provider: 'existing-k8s',
    deploy_provider: 'kube-context',
    kube_context: 'arn:aws:eks:ap-northeast-2:183548421506:cluster/kubernetes-ops',
    external_handle: null,
    console_url: null,
    direct_apply_available: true,
    labels: { region: 'ap-northeast-2', owner: 'platform' },
  };
  assert.equal(clusterImportCandidateMatches(candidate, 'prod platform'), true);
  assert.equal(clusterImportCandidateMatches(candidate, 'plural'), false);
  assert.equal(registrationStatusTone('available'), 'ok');
  assert.equal(registrationStatusTone('unavailable'), 'danger');
  assert.equal(registrationStatusTone('stale'), 'warn');
  assert.equal(
    preferredDeployProvider({
      default_deploy_provider: 'kube-context',
      deploy_providers: [
        { key: 'kube-context', label: 'direct', status: 'unavailable' },
        { key: 'manual-manifest', label: 'manual', status: 'available' },
      ],
    }),
    'manual-manifest',
  );
});
