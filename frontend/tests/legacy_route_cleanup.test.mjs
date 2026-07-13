import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const frontendRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.join(frontendRoot, 'src');

const FORBIDDEN_DIRECTORIES = [
  'src/features/release',
  'src/features/metrics',
  'src/features/workflow',
  'docs/screenshots',
];

const FORBIDDEN_FILES = [
  'src/features/console/pages/HomePage.tsx',
  'src/features/console/pages/homeCharts.ts',
  'AUDIT.md',
];

const SOURCE_EXTENSIONS = new Set(['.cjs', '.js', '.jsx', '.mjs', '.ts', '.tsx']);
const LEGACY_UI_IMPORT_FILE_CAP = 34;

// The current product mark is composed from lucide primitives, not handwritten SVG.
// Keep this allowlist explicit and empty until an approved logo source file exists.
const INLINE_SVG_ALLOWLIST = new Set();

async function listFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const nestedFiles = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(entryPath) : [entryPath];
  }));

  return nestedFiles.flat();
}

function relativeToFrontend(filePath) {
  return path.relative(frontendRoot, filePath).split(path.sep).join('/');
}

test('retired product surfaces cannot be resurrected by a branch merge', async () => {
  const forbiddenFiles = [...FORBIDDEN_FILES];

  for (const directory of FORBIDDEN_DIRECTORIES) {
    const files = await listFiles(path.join(frontendRoot, directory));
    forbiddenFiles.push(...files.map(relativeToFrontend));
  }

  const existingForbiddenFiles = [];
  for (const relativePath of forbiddenFiles) {
    try {
      await readFile(path.join(frontendRoot, relativePath));
      existingForbiddenFiles.push(relativePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }

  assert.deepEqual(
    [...new Set(existingForbiddenFiles)].sort(),
    [],
    `retired files must stay deleted:\n${[...new Set(existingForbiddenFiles)].sort().join('\n')}`,
  );
});

test('product source cannot add standalone CSS outside the canonical theme', async () => {
  const cssFiles = (await listFiles(sourceRoot))
    .filter((filePath) => path.extname(filePath) === '.css')
    .map(relativeToFrontend)
    .filter((relativePath) => relativePath !== 'src/ui/theme.css')
    .sort();

  assert.deepEqual(cssFiles, [], `standalone product CSS is forbidden:\n${cssFiles.join('\n')}`);
});

test('retired chart packages and handwritten inline SVG cannot return', async () => {
  const sourceFiles = (await listFiles(sourceRoot))
    .filter((filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath)));
  const nivoImports = [];
  const inlineSvgFiles = [];

  for (const filePath of sourceFiles) {
    const source = await readFile(filePath, 'utf8');
    const relativePath = relativeToFrontend(filePath);

    if (/\b(?:from\s+|import\s*\(\s*|import\s+)['"]@nivo\//.test(source)) {
      nivoImports.push(relativePath);
    }
    if (/<svg\b/i.test(source) && !INLINE_SVG_ALLOWLIST.has(relativePath)) {
      inlineSvgFiles.push(relativePath);
    }
  }

  assert.deepEqual(nivoImports.sort(), [], `@nivo imports are forbidden:\n${nivoImports.sort().join('\n')}`);
  assert.deepEqual(
    inlineSvgFiles.sort(),
    [],
    `handwritten inline SVG is forbidden outside the explicit product-logo allowlist:\n${inlineSvgFiles.sort().join('\n')}`,
  );
});

test(`legacy @/ui import file count never exceeds ${LEGACY_UI_IMPORT_FILE_CAP}`, async () => {
  const sourceFiles = (await listFiles(sourceRoot))
    .filter((filePath) => SOURCE_EXTENSIONS.has(path.extname(filePath)));
  const legacyImportFiles = [];

  for (const filePath of sourceFiles) {
    const source = (await readFile(filePath, 'utf8'))
      // The canonical theme side-effect import is not a legacy component dependency.
      .replace(/\bimport\s+['"]@\/ui\/theme\.css['"];?/g, '');
    if (/\b(?:from\s+|import\s*\(\s*|import\s+)['"]@\/ui(?:\/[^'"]*)?['"]/.test(source)) {
      legacyImportFiles.push(relativeToFrontend(filePath));
    }
  }

  assert.ok(
    legacyImportFiles.length <= LEGACY_UI_IMPORT_FILE_CAP,
    `legacy @/ui import file cap increased: ${legacyImportFiles.length} > ${LEGACY_UI_IMPORT_FILE_CAP}\n${legacyImportFiles.sort().join('\n')}`,
  );
});
