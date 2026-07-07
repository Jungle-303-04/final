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
