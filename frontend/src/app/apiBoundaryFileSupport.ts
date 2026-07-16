import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

export interface ApiSource {
  filePath: string;
  source: string;
}

export async function collectScripts(
  directory: string,
  scriptExtensions: ReadonlySet<string>,
): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectScripts(entryPath, scriptExtensions));
    if (entry.isFile() && scriptExtensions.has(extname(entry.name))) files.push(entryPath);
  }
  return files.sort();
}

export async function collectApiSources(filePaths: readonly string[]): Promise<ApiSource[]> {
  return Promise.all(filePaths.map(async (filePath) => ({
    filePath,
    source: await readFile(filePath, "utf8"),
  })));
}
