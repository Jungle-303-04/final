import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "src");
const liveEntry = join(sourceRoot, "main.tsx");
const sourceExtensions = [".ts", ".tsx"];
const importPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

function resolveImport(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    ...sourceExtensions.map((extension) => `${base}${extension}`),
    ...sourceExtensions.map((extension) => join(base, `index${extension}`)),
  ];
  return (
    candidates.find(
      (candidate) => existsSync(candidate) && statSync(candidate).isFile(),
    ) ?? null
  );
}

function collectGraph(entry) {
  const visited = new Set();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || visited.has(file)) continue;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const target = resolveImport(file, match[1]);
      if (target !== null) queue.push(target);
    }
  }

  return visited;
}

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return sourceExtensions.includes(extname(path)) ? [path] : [];
  });
}

const errors = [];
const liveGraph = collectGraph(liveEntry);

for (const file of liveGraph) {
  const relative = normalize(file.slice(sourceRoot.length + 1));
  const pathSegments = relative.split(/[\\/]/u);
  const syntheticModule = pathSegments.some((segment) =>
    /^(?:demo|fixtures?)$/iu.test(segment),
  ) || /(?:^|[\\/])Synthetic[^\\/]*\.[tj]sx?$/u.test(relative);
  if (syntheticModule) {
    errors.push(`live dependency graph reaches synthetic/demo code: ${relative}`);
  }
}

for (const file of walk(sourceRoot)) {
  const relative = normalize(file.slice(sourceRoot.length + 1));
  const source = readFileSync(file, "utf8");
  if (!relative.startsWith(`demo${normalize("/")}`) && /\bfetch\s*\(/.test(source)) {
    const allowed = relative.includes(`${normalize("/adapters/")}`);
    if (!allowed) errors.push(`fetch outside adapter boundary: ${relative}`);
  }
  if (/\b(?:aws|gcp|azure)\b/i.test(source) && !relative.startsWith(`demo${normalize("/")}`)) {
    errors.push(`provider name branch/literal outside demo adapter: ${relative}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Architecture guard passed (${liveGraph.size} live modules checked).`);
