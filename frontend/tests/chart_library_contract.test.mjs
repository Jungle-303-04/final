import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendRoot = new URL('../', import.meta.url);

test('product charts use the shadcn chart boundary and canonical palette', async () => {
  const source = await readFile(new URL('src/ui/charts.tsx', frontendRoot), 'utf8');

  assert.match(source, /from ['"]@\/components\/ui\/chart['"]/);
  assert.equal(source.match(/<ChartContainer\b/g)?.length, 2);
  assert.match(source, /<ChartTooltip\b/);
  assert.doesNotMatch(source, /\bResponsiveContainer\b/);
  assert.doesNotMatch(source, /\bTooltip\b[^\n]*from ['"]recharts['"]/);

  for (let index = 1; index <= 5; index += 1) {
    assert.match(source, new RegExp(`var\\(--chart-${index}\\)`));
  }
});

test('Nivo cannot return through direct or transitive frontend dependencies', async () => {
  const packageJson = JSON.parse(await readFile(new URL('package.json', frontendRoot), 'utf8'));
  const packageLock = await readFile(new URL('package-lock.json', frontendRoot), 'utf8');
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  assert.deepEqual(Object.keys(dependencies).filter((name) => name.startsWith('@nivo/')), []);
  assert.doesNotMatch(packageLock, /node_modules\/@nivo\//);
});
