import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);

async function collectTsxFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return collectTsxFiles(url);
    return entry.name.endsWith('.tsx') ? [url] : [];
  }));
  return nested.flat();
}

test('product source uses lucide instead of handwritten inline SVG icons', async () => {
  const files = await collectTsxFiles(sourceRoot);
  const violations = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (source.includes('<svg')) {
      violations.push(file.pathname.replace(sourceRoot.pathname, 'src/'));
    }
  }

  assert.deepEqual(violations, []);
});
