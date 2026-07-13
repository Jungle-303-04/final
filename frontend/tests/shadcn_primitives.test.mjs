import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const requested = [
  'button', 'card', 'dropdown-menu', 'dialog', 'alert-dialog', 'sheet', 'tabs',
  'table', 'badge', 'tooltip', 'input', 'select', 'textarea', 'checkbox', 'label',
  'separator', 'skeleton', 'breadcrumb', 'collapsible', 'command', 'popover',
  'toggle-group', 'radio-group', 'alert', 'scroll-area', 'avatar', 'switch',
  'sonner', 'chart',
];
const support = ['toggle', 'input-group'];

test('the complete S2 primitive set and its local support files are installed', async () => {
  for (const name of [...requested, ...support]) {
    await access(new URL(`src/components/ui/${name}.tsx`, root));
  }

  const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(packageJson.dependencies['@base-ui/react'], '^1.6.0');

  const sources = await Promise.all(
    [...requested, ...support].map((name) =>
      readFile(new URL(`src/components/ui/${name}.tsx`, root), 'utf8')
    )
  );
  const joined = sources.join('\n');
  assert.doesNotMatch(joined, /next-themes/);
  assert.doesNotMatch(joined, /var\(--ui-/);
  assert.match(joined, /(?:bg|text|border|ring)-(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|border|input|ring)/);
});
