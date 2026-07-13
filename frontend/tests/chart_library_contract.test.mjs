import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const frontendRoot = new URL('../', import.meta.url);
const sourceRoot = new URL('src/', frontendRoot);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return collectSourceFiles(url);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [url] : [];
  }));
  return nested.flat();
}

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
  const chartDependencyPattern = /^(?:@nivo\/|@visx\/|recharts$|victory|echarts|highcharts|plotly|chart\.js$|d3$)/;
  const chartDependencies = Object.keys(dependencies)
    .filter((name) => chartDependencyPattern.test(name))
    .sort();
  const sourceViolations = [];

  for (const file of await collectSourceFiles(sourceRoot)) {
    const source = await readFile(file, 'utf8');
    if (/\bnivo\b|@nivo\//i.test(source)) {
      sourceViolations.push(file.pathname.replace(sourceRoot.pathname, 'src/'));
    }
  }

  assert.deepEqual(Object.keys(dependencies).filter((name) => name.startsWith('@nivo/')), []);
  assert.deepEqual(chartDependencies, ['recharts']);
  assert.deepEqual(sourceViolations, []);
  assert.doesNotMatch(packageLock, /node_modules\/@nivo\//);
});
