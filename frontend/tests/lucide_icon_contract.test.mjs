import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceRoot = new URL('../src/', import.meta.url);

// 제품 로고가 자체 도형을 다시 필요로 할 때만 정확한 파일 경로를 이 목록에 추가한다.
// 현재 제품 로고도 CSS/Lucide 조합이므로 허용된 inline SVG 파일은 없다.
const inlineSvgAllowlist = new Set([]);

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
  const inlineSvgFiles = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (source.includes('<svg')) {
      inlineSvgFiles.push(file.pathname.replace(sourceRoot.pathname, 'src/'));
    }
  }

  assert.deepEqual(inlineSvgFiles.sort(), [...inlineSvgAllowlist].sort());
});
