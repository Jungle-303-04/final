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

test('metrics context preset narrows PromQL by real drilldown subject', async () => {
  const { buildContextPreset } = await vite.ssrLoadModule('/src/features/metrics/MetricsView.tsx');

  assert.equal(
    buildContextPreset('pod', 'checkout-api-123', 'prod').promql,
    'sum by (pod) (rate(kube_pod_container_status_restarts_total{namespace="prod",pod="checkout-api-123"}[5m]))',
  );
  assert.equal(
    buildContextPreset('node', 'ip-10-0-1-1', '').promql,
    '1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle",instance=~".*ip-10-0-1-1.*"}[5m]))',
  );
});

test('cluster drill actions keep real subject context across events metrics and ai', async () => {
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
  assert.equal(hrefs.metrics, '/metrics?cluster=cluster-1&subject=pod&name=checkout-abc&namespace=prod');
  assert.equal(decodeURIComponent(hrefs.ai), '/ai?prefill=cluster-1 prod/checkout-abc pod 상태 분석');
});

test('resource wizards keep exact real discovery selections', async () => {
  const { repositoryManifestCandidateValue } = await vite.ssrLoadModule('/src/features/resources/ConnectRepoWizard.tsx');
  const { preferredDeployProvider } = await vite.ssrLoadModule('/src/features/resources/RegisterClusterWizard.tsx');

  assert.equal(
    repositoryManifestCandidateValue({ source_type: 'kustomize', path: 'deploy', display_name: 'deploy', reason: 'kustomization' }),
    'kustomize:deploy',
  );
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

test('fleet cluster stat chip does not report stale or unknown as normal', async () => {
  const { fleetClusterChip } = await vite.ssrLoadModule('/src/features/console/pages/HomePage.tsx');

  assert.deepEqual(
    fleetClusterChip({ clusters: 2, critical: 0, warning: 0, stale: 1, unknown: 0 }),
    { chip: '스테일 1', severity: 'warning' },
  );
  assert.deepEqual(
    fleetClusterChip({ clusters: 2, critical: 0, warning: 0, stale: 0, unknown: 2 }),
    { chip: '미확인 2', severity: 'neutral' },
  );
  assert.deepEqual(
    fleetClusterChip({ clusters: 2, critical: 0, warning: 0, stale: 0, unknown: 0 }),
    { chip: '모두 정상', severity: 'success' },
  );
});
