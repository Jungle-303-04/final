import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = join(root, "src");
const liveEntry = join(sourceRoot, "main.tsx");
const sourceExtensions = [".ts", ".tsx"];
const designSourceExtensions = new Set([".css", ...sourceExtensions]);
const importPattern = /(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

const designTokenSource = normalize("styles/design-system.css");
const designMotionSource = normalize("design-system/motion.ts");
const buttonPrimitiveSource = normalize("design-system/Button.tsx");
const selectPrimitiveSource = normalize("design-system/NativeSelect.tsx");
const shellScrimSource = normalize("app/AppShell.tsx");
const hierarchyRendererSource = normalize(
  "features/topology/hierarchy/HierarchyTreemap.tsx",
);

const rawColorPattern =
  /#[\da-f]{3,8}\b|(?:rgb|hsl)a?\s*\(|oklch\s*\(/giu;
const rawCssDurationPattern = /\b(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)\b/giu;
const rawScriptTimingPattern =
  /\b(?:duration|delay|transitionDuration|animationDuration)\s*:\s*(?:(?:\d+(?:\.\d+)?|\.\d+)\b|["'`]\s*(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)\b)/gu;
const rawScriptTransitionPattern =
  /\b(?:transition|animation)\s*:\s*["'`][^"'`\n]*\b(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)\b/gu;
const nativeButtonPattern = /<button(?:\s|>)[\s\S]*?>/gu;
const nativeSelectPattern = /<select(?:\s|>)[\s\S]*?>/gu;
const motionButtonPattern = /<motion\.button(?:\s|>)/gu;

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

function walk(directory, extensions = new Set(sourceExtensions)) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path, extensions);
    return extensions.has(extname(path)) ? [path] : [];
  });
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function reportMatches({ source, relative, pattern, message }) {
  pattern.lastIndex = 0;
  for (const match of source.matchAll(pattern)) {
    errors.push(`${message}: ${relative}:${lineNumberAt(source, match.index)}`);
  }
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

for (const file of walk(sourceRoot, designSourceExtensions)) {
  const relative = normalize(file.slice(sourceRoot.length + 1));
  const source = readFileSync(file, "utf8");

  if (relative !== designTokenSource) {
    reportMatches({
      source,
      relative,
      pattern: rawColorPattern,
      message: "raw color outside the design-system token source",
    });
  }

  if (extname(file) === ".css" && relative !== designTokenSource) {
    reportMatches({
      source,
      relative,
      pattern: rawCssDurationPattern,
      message: "raw CSS duration outside the design-system token source",
    });
  }

  if (
    sourceExtensions.includes(extname(file)) &&
    relative !== designMotionSource
  ) {
    reportMatches({
      source,
      relative,
      pattern: rawScriptTimingPattern,
      message: "raw script timing outside the design-system motion source",
    });
    reportMatches({
      source,
      relative,
      pattern: rawScriptTransitionPattern,
      message: "raw script transition outside the design-system motion source",
    });
  }

  nativeSelectPattern.lastIndex = 0;
  if (relative !== selectPrimitiveSource && nativeSelectPattern.test(source)) {
    reportMatches({
      source,
      relative,
      pattern: nativeSelectPattern,
      message: "native select outside the design-system NativeSelect primitive",
    });
  }

  nativeButtonPattern.lastIndex = 0;
  for (const match of source.matchAll(nativeButtonPattern)) {
    const isPrimitiveOwner = relative === buttonPrimitiveSource;
    const isSemanticScrim =
      relative === shellScrimSource &&
      match[0].includes('className="app-shell__scrim"') &&
      match[0].includes('type="button"');

    if (!isPrimitiveOwner && !isSemanticScrim) {
      errors.push(
        `native button outside the design-system Button primitive: ${relative}:${lineNumberAt(source, match.index)}`,
      );
    }
  }

  motionButtonPattern.lastIndex = 0;
  if (
    relative !== hierarchyRendererSource &&
    motionButtonPattern.test(source)
  ) {
    reportMatches({
      source,
      relative,
      pattern: motionButtonPattern,
      message: "motion.button outside the topology domain renderer exception",
    });
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`Architecture guard passed (${liveGraph.size} live modules checked).`);
