import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendRoot = new URL('../', import.meta.url);

test('Resources cluster list is composed only from the shadcn UI boundary', async () => {
  const source = await readFile(
    new URL('src/features/cluster/ClusterListView.tsx', frontendRoot),
    'utf8',
  );

  assert.doesNotMatch(source, /from ['"]@\/ui(?:['"/])/);
  assert.match(source, /from ['"]@\/components\/ui\/card['"]/);
  assert.match(source, /from ['"]@\/components\/ui\/table['"]/);
  assert.match(source, /from ['"]@\/components\/ui\/button['"]/);
  assert.match(source, /from ['"]@\/components\/ui\/badge['"]/);
  assert.match(source, /from ['"]@\/components\/ui\/input-group['"]/);
  assert.match(source, /from ['"]@\/components\/ui\/skeleton['"]/);
  assert.match(source, /from ['"]@\/components\/ui\/alert['"]/);
  assert.match(source, /from ['"]@\/lib\/utils['"]/);
  assert.match(source, /aria-sort=/);
  assert.match(source, /<Link\b/);
  assert.doesNotMatch(source, /<TableRow[^>]*(?:role=['"]button|tabIndex)/);
});
