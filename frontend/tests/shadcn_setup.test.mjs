import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('shadcn configuration owns the frontend component aliases', async () => {
  const config = JSON.parse(await readFile(new URL('components.json', root), 'utf8'));

  assert.equal(config.style, 'new-york');
  assert.equal(config.rsc, false);
  assert.equal(config.tailwind.css, 'src/ui/theme.css');
  assert.equal(config.tailwind.cssVariables, true);
  assert.equal(config.iconLibrary, 'lucide');
  assert.deepEqual(config.aliases, {
    components: '@/components',
    utils: '@/lib/utils',
    ui: '@/components/ui',
    lib: '@/lib',
    hooks: '@/hooks',
  });
});

test('shadcn foundation dependencies and cn utility are present', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  const dependencies = pkg.dependencies ?? {};
  const required = [
    '@radix-ui/react-accordion',
    '@radix-ui/react-alert-dialog',
    '@radix-ui/react-dialog',
    '@radix-ui/react-dropdown-menu',
    '@radix-ui/react-tooltip',
    'class-variance-authority',
    'clsx',
    'lucide-react',
    'recharts',
    'sonner',
    'tailwind-merge',
  ];

  for (const name of required) assert.equal(typeof dependencies[name], 'string', name);

  const utils = await readFile(new URL('src/lib/utils.ts', root), 'utf8');
  assert.match(utils, /export function cn/);
  assert.match(utils, /twMerge\(clsx\(inputs\)\)/);
});
