import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const sourceRoot = new URL('src/', root);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const url = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) return sourceFiles(url);
    return ['.css', '.ts', '.tsx'].includes(extname(entry.name)) ? [url] : [];
  }));
  return nested.flat();
}

test('legacy text utilities and the removed accent-hover token are absent', async () => {
  const legacyUtility = /(?<![-\w])(?:text-(?:muted|primary|secondary)|(?:bg|border|caret|fill|from|outline|ring|shadow|stroke|text|to|via)-accent-hover)(?![-\w])/;
  const violations = [];

  for (const file of await sourceFiles(sourceRoot)) {
    if (file.pathname.endsWith('/ui/theme.css')) continue;
    const source = await readFile(file, 'utf8');
    if (legacyUtility.test(source)) violations.push(file.pathname);
  }

  assert.deepEqual(violations, []);
});

test('shadcn semantic tokens map to the established ui palette', async () => {
  const css = await readFile(new URL('src/ui/theme.css', root), 'utf8');

  assert.match(css, /--color-text-primary:\s*var\(--ui-text-primary\)/);
  assert.match(css, /--color-text-secondary:\s*var\(--ui-text-secondary\)/);
  assert.match(css, /--color-text-muted:\s*var\(--ui-text-muted\)/);
  assert.match(css, /--color-brand:\s*var\(--ui-accent\)/);
  assert.match(css, /--color-brand-hover:\s*var\(--ui-accent-hover\)/);
  assert.doesNotMatch(css, /--color-primary:\s*var\(--ui-text-primary\)/);
  assert.doesNotMatch(css, /--color-accent:\s*var\(--ui-accent\)/);

  const expected = {
    background: '--ui-bg',
    foreground: '--ui-text-primary',
    card: '--ui-surface',
    popover: '--ui-surface',
    primary: '--ui-accent',
    secondary: '--ui-raised',
    muted: '--ui-raised',
    accent: '--ui-raised',
    destructive: '--ui-danger',
    border: '--ui-border',
    input: '--ui-border',
    ring: '--ui-ring',
  };

  for (const [token, source] of Object.entries(expected)) {
    assert.match(css, new RegExp(`--${token}:\\s*var\\(${source}\\)`), token);
  }
});

test('theme mode and opaque palette are installed before the app module loads', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  const bootstrapIndex = html.indexOf('localStorage.getItem("theme-mode")');
  const moduleIndex = html.indexOf('src="/src/main.tsx"');

  assert.notEqual(bootstrapIndex, -1);
  assert.ok(bootstrapIndex < moduleIndex);
  assert.match(html, /document\.documentElement\.dataset\.themeMode = mode/);
  assert.match(html, /background:\s*var\(--background\)/);
  assert.match(html, /color:\s*var\(--foreground\)/);
});
