import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const source = (path) => readFile(new URL(path, root), 'utf8');

test('workflow workspace keeps one canonical navigation vocabulary', async () => {
  const model = await source('src/features/release/model.ts');
  const views = model.match(/export const WORKSPACE_VIEWS:[\s\S]*?\];/)?.[0] ?? '';
  const labels = [...views.matchAll(/label: '([^']+)'/g)].map((match) => match[1]);

  assert.deepEqual(labels, ['현황', '플랜 편집', '실행', 'YAML/PR']);
  assert.doesNotMatch(views, /현재 상황|실행 관리|플랜 정보|플랜 선택/);
  assert.match(model, /\{ value: 'review', label: '검토' \}/);
});

test('workflow overlays and narrow layouts retain their visibility contracts', async () => {
  const [graph, css] = await Promise.all([
    source('src/features/release/WorkflowGraph.tsx'),
    source('src/features/release/ReleaseFlowView.css'),
  ]);

  assert.match(graph, /<Popover\.Portal>/);
  assert.match(graph, /collisionPadding=\{\{ top: 16, right: 16, bottom: 16, left: 72 \}\}/);
  assert.match(css, /\.workflow-view-popover \{[\s\S]*?z-index: 100;/);
  assert.match(css, /\.workflow-page__nav \[role="tab"\] \{ min-width: 0; flex: 1 1 0;/);
  assert.match(css, /@media \(max-width: 900px\) \{\s*\.workflow-wizard__footer \{ position: static; \}/);
  assert.match(css, /\.workflow-wizard__steps li \{ min-width: 0; flex: 1 1 0; \}/);
});

test('workflow editing and persistence avoid invalid controls and response-only fields', async () => {
  const [editor, model, api, runPanel] = await Promise.all([
    source('src/features/release/PlanEditor.tsx'),
    source('src/features/release/model.ts'),
    source('src/features/release/api.ts'),
    source('src/features/release/RunPanel.tsx'),
  ]);

  assert.match(editor, /workflow-step-list__item/);
  assert.match(editor, /className="workflow-step-list__select"/);
  assert.doesNotMatch(editor, /<button key=\{id\}[^>]*className=\{selectedStepId/);
  assert.match(model, /export function releasePlanPayload/);
  assert.match(model, /steps: plan\.steps\.map\(\(step\) => \(\{/);
  assert.match(model, /export function releaseWaves/);
  assert.match(api, /releasePlanPayload\(plan\)/);
  assert.doesNotMatch(api, /withoutServerFields/);
  assert.doesNotMatch(runPanel, /<main className="workflow-run-detail">/);
});
