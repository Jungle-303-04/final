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
  const { contextActionHrefs, deploymentTargetsFromPods } = await vite.ssrLoadModule('/src/features/cluster/ClusterDetailView.tsx');

  assert.deepEqual(
    deploymentTargetsFromPods([
      { namespace: 'prod', name: 'checkout-abc', workload_name: 'checkout', phase: 'Running', restarts: 0 },
      { namespace: 'prod', name: 'checkout-def', workload_name: 'checkout', phase: 'Running', restarts: 1 },
      { namespace: 'ops', name: 'agent-1', phase: 'Running', restarts: 0 },
    ]),
    [
      { ns: 'prod', name: 'checkout', podCount: 2 },
      { ns: 'ops', name: 'agent-1', podCount: 1 },
    ],
  );

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
