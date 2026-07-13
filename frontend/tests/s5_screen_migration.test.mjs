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

test('Resources cluster registration wizard is composed only from accessible shadcn primitives', async () => {
  const [source, mainSource] = await Promise.all([
    readFile(
      new URL('src/features/resources/RegisterClusterWizard.tsx', frontendRoot),
      'utf8',
    ),
    readFile(new URL('src/main.tsx', frontendRoot), 'utf8'),
  ]);

  assert.doesNotMatch(source, /from ['"]@\/ui(?:['"/])/);
  assert.doesNotMatch(source, /\buseToast\b/);
  assert.doesNotMatch(source, /<(?:Modal|ConfirmDialog|Field|CodeBlock|KeyValueList|EmptyState)\b/);
  assert.doesNotMatch(source, /\bcx\s*\(/);

  for (const primitive of [
    'alert-dialog',
    'alert',
    'badge',
    'button',
    'card',
    'checkbox',
    'collapsible',
    'dialog',
    'input',
    'label',
    'select',
    'skeleton',
  ]) {
    assert.match(
      source,
      new RegExp(`from ['"]@/components/ui/${primitive}['"]`),
      `RegisterClusterWizard must import the ${primitive} shadcn primitive`,
    );
  }

  assert.match(source, /from ['"]sonner['"]/);
  assert.match(source, /\btoast\.(?:success|error)\s*\(/);
  assert.match(source, /<SelectItem\b/);
  assert.match(source, /\bonValueChange=/);
  assert.match(source, /\bonCheckedChange=/);
  assert.match(source, /<DialogTitle\b/);
  assert.match(source, /<DialogDescription\b/);
  assert.match(source, /<AlertDialogTitle\b/);
  assert.match(source, /<AlertDialogDescription\b/);
  assert.match(source, /<CollapsibleTrigger\b/);
  assert.match(source, /<CollapsibleContent\b/);

  for (const testId of ['cluster-id', 'cluster-register-confirm', 'agent-token']) {
    assert.match(source, new RegExp(`data-testid=["']${testId}["']`));
  }

  assert.doesNotMatch(source, /#[\da-f]{3,8}\b/i);
  assert.doesNotMatch(source, /\b\d+(?:\.\d+)?(?:ms|px)\b/i);

  assert.match(mainSource, /from ['"]@\/components\/ui\/sonner['"]/);
  assert.match(mainSource, /<Toaster\b/);
});
