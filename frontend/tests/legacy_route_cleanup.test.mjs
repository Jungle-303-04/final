import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('removed legacy screens stay removed while the new workflow workspace is canonical', async () => {
  const deleted = [
    'src/features/console/pages/HomePage.tsx',
    'src/features/console/pages/homeCharts.ts',
    'src/features/metrics/MetricsView.tsx',
    'src/features/workflow/WorkflowListView.tsx',
  ];

  for (const path of deleted) {
    await assert.rejects(access(new URL(path, root)));
  }

  await access(new URL('src/features/release/ReleaseFlowView.tsx', root));

  const entryPoints = await Promise.all([
    'src/app/router.tsx',
    'src/features/console/ui.tsx',
    'src/features/cluster/ClusterDetailView.tsx',
    'src/features/repo/RepoDetailView.tsx',
    'src/features/notifications/api.ts',
  ].map((path) => readFile(new URL(path, root), 'utf8')));
  const source = entryPoints.join('\n');

  assert.doesNotMatch(source, /['"]\/metrics(?:[/?'"]|$)/);
  assert.match(entryPoints[0], /path:\s*'workflows'/);
  assert.match(entryPoints[1], /to:\s*'\/workflows',\s*label:\s*'워크플로우'/);
  assert.match(entryPoints[0], /path:\s*'release-flows',\s*element:\s*<Navigate to=\{`\$\{basePath\}\/workflows`\}/);
  assert.match(entryPoints[0], /index:\s*true,\s*element:\s*<Navigate to=\{`\$\{basePath\}\/clusters`\}/);
});
