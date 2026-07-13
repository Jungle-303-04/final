import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendRoot = new URL('../', import.meta.url);

test('DrilldownHeatmap uses only the shadcn UI boundary and semantic tokens', async () => {
  const source = await readFile(
    new URL('src/features/fleet/DrilldownHeatmap.tsx', frontendRoot),
    'utf8',
  );

  assert.doesNotMatch(source, /from ['"]@\/ui(?:['"/])/);
  assert.doesNotMatch(source, /\b(?:EmptyState|listItem|listStagger|transitions|cx)\b/);

  for (const primitive of ['alert', 'badge', 'button', 'skeleton']) {
    assert.match(
      source,
      new RegExp(`from ['"]@/components/ui/${primitive}['"]`),
      `DrilldownHeatmap must import the ${primitive} shadcn primitive`,
    );
  }

  assert.match(source, /from ['"]@\/lib\/utils['"]/);
  assert.match(source, /from ['"]motion\/react['"]/);
  assert.match(source, /motion\.create\(Button\)/);
  assert.match(source, /\buseReducedMotion\b/);
  assert.match(source, /\bAnimatePresence\b/);

  assert.doesNotMatch(source, /<(?:button|motion\.button)\b/);
  assert.doesNotMatch(source, /\bstagger\b/i);
  assert.doesNotMatch(source, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(source, /\b\d+(?:\.\d+)?(?:ms|px)\b/i);
});

test('DrilldownHeatmap keeps keyboard focus and semantic health feedback', async () => {
  const source = await readFile(
    new URL('src/features/fleet/DrilldownHeatmap.tsx', frontendRoot),
    'utf8',
  );

  assert.match(source, /aria-label=["']히트맵 경로["']/);
  assert.match(source, /focus-visible:/);
  assert.match(source, /healthBorderClass\(tile\.health\)/);
  assert.match(source, /healthBarClass\(tile\.health, tile\.pulse\)/);
  assert.match(source, /onClick=\{\(\) => onTileClick\(tile\)\}/);
});
