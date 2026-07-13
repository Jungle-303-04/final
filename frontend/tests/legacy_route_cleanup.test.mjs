import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('removed legacy screens have no route or entry-link references', async () => {
  const deleted = [
    'src/features/console/pages/HomePage.tsx',
    'src/features/console/pages/homeCharts.ts',
    'src/features/metrics/MetricsView.tsx',
    'src/features/workflow/WorkflowListView.tsx',
    'src/features/release/ReleaseFlowView.tsx',
  ];

  for (const path of deleted) {
    await assert.rejects(access(new URL(path, root)));
  }

  const entryPoints = await Promise.all([
    'src/app/router.tsx',
    'src/features/console/ui.tsx',
    'src/features/cluster/ClusterDetailView.tsx',
    'src/features/repo/RepoDetailView.tsx',
    'src/features/notifications/api.ts',
  ].map((path) => readFile(new URL(path, root), 'utf8')));
  const source = entryPoints.join('\n');

  assert.doesNotMatch(source, /['"]\/(?:metrics|workflows|release-flows)(?:[/?'"]|$)/);
  assert.match(entryPoints[0], /index:\s*true,\s*element:\s*<Navigate to=\{`\$\{basePath\}\/clusters`\}/);
});
