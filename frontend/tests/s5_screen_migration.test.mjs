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

test('Resources mutations publish feedback through the canonical Sonner boundary', async () => {
  const source = await readFile(
    new URL('src/features/cluster/api.ts', frontendRoot),
    'utf8',
  );

  assert.doesNotMatch(source, /from ['"]@\/ui(?:['"/])/);
  assert.doesNotMatch(source, /\buseToast\b/);
  assert.match(source, /from ['"]sonner['"]/);
  assert.match(source, /\btoast\.info\s*\(/);
  assert.match(source, /\btoast\.success\s*\(/);
  assert.match(source, /\btoast\.error\s*\(/);
});

test('Issues list is composed only from accessible shadcn primitives', async () => {
  const source = await readFile(
    new URL('src/features/notifications/NotificationsView.tsx', frontendRoot),
    'utf8',
  );

  assert.doesNotMatch(source, /from ['"]@\/ui(?:['"/])/);
  assert.doesNotMatch(source, /<(?:EmptyState|PageHeader)\b/);
  assert.doesNotMatch(source, /\buseNavigate\b/);
  assert.doesNotMatch(source, /\btone=/);

  for (const primitive of ['badge', 'button', 'card', 'toggle-group']) {
    assert.match(
      source,
      new RegExp(`from ['"]@/components/ui/${primitive}['"]`),
      `NotificationsView must import the ${primitive} shadcn primitive`,
    );
  }

  assert.doesNotMatch(source, /<Tabs(?:List|Trigger)?\b/);
  assert.match(source, /<ToggleGroup\b/);
  assert.match(source, /<ToggleGroupItem\b/);
  assert.match(source, /<Link\b/);
  assert.match(source, /nativeButton=\{false\}/);
  assert.match(source, /role=['"]status['"]/);
  assert.match(source, /aria-live=['"]polite['"]/);
});

test('Issues mutations publish feedback through the canonical Sonner boundary', async () => {
  const source = await readFile(
    new URL('src/features/notifications/api.ts', frontendRoot),
    'utf8',
  );

  assert.doesNotMatch(source, /from ['"]@\/ui(?:['"/])/);
  assert.doesNotMatch(source, /\buseToast\b/);
  assert.match(source, /from ['"]sonner['"]/);
  assert.equal((source.match(/\btoast\.success\s*\(/g) ?? []).length, 4);
  assert.equal((source.match(/\btoast\.error\s*\(/g) ?? []).length, 4);
});

test('Settings navigation is composed from the shadcn button boundary', async () => {
  const source = await readFile(
    new URL('src/features/org/SettingsNav.tsx', frontendRoot),
    'utf8',
  );

  assert.doesNotMatch(source, /from ['"]@\/ui(?:['"/])/);
  assert.doesNotMatch(source, /from ['"]@\/ui\/motion['"]/);
  assert.doesNotMatch(source, /\b(?:PageHeader|cx|motion)\b/);
  assert.match(source, /from ['"]@\/components\/ui\/button['"]/);
  assert.match(source, /<NavLink\b/);
  assert.match(source, /nativeButton=\{false\}/);
  assert.match(source, /aria-current=/);
});

test('Issues operations queue is composed only from accessible shadcn primitives', async () => {
  const source = await readFile(
    new URL('src/features/notifications/OpsView.tsx', frontendRoot),
    'utf8',
  );

  assert.doesNotMatch(source, /from ['"]@\/ui(?:['"/])/);
  assert.doesNotMatch(source, /\b(?:EmptyState|KeyValueList|Modal|TableColumn)\b/);

  for (const primitive of ['alert', 'badge', 'button', 'card', 'dialog', 'skeleton', 'table']) {
    assert.match(
      source,
      new RegExp(`from ['"]@/components/ui/${primitive}['"]`),
      `OpsView must import the ${primitive} shadcn primitive`,
    );
  }

  assert.match(source, /aria-sort=/);
  assert.match(source, /<DialogTitle\b/);
  assert.match(source, /<DialogDescription\b/);
  assert.match(source, /<dl\b/);
  assert.match(source, /aria-busy=/);
  assert.match(source, /role=['"]status['"]/);
});
