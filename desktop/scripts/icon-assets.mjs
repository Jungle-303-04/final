import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

export const desktopDirectory = resolve(scriptDirectory, "..");
export const repositoryDirectory = resolve(desktopDirectory, "..");
export const canonicalIconSource = resolve(
  repositoryDirectory,
  "frontend/public/favicon.svg",
);
export const iconDirectory = resolve(desktopDirectory, "src-tauri/icons");
export const tauriConfigPath = resolve(desktopDirectory, "src-tauri/tauri.conf.json");

export const bundleIcons = [
  { fileName: "32x32.png", configPath: "icons/32x32.png", pixelSize: 32 },
  { fileName: "128x128.png", configPath: "icons/128x128.png", pixelSize: 128 },
  {
    fileName: "128x128@2x.png",
    configPath: "icons/128x128@2x.png",
    pixelSize: 256,
  },
  { fileName: "icon.icns", configPath: "icons/icon.icns" },
  { fileName: "icon.ico", configPath: "icons/icon.ico" },
];

export const legacyUnmanagedIcon = resolve(iconDirectory, "icon.png");

export async function withGeneratedIconDirectory(action) {
  const generatedDirectory = await mkdtemp(join(tmpdir(), "opsia-tauri-icons-"));

  try {
    await execFile(
      "cargo",
      ["tauri", "icon", canonicalIconSource, "--output", generatedDirectory],
      { cwd: desktopDirectory },
    );
    return await action(generatedDirectory);
  } finally {
    await rm(generatedDirectory, { force: true, recursive: true });
  }
}

export async function writeGeneratedBundleIcons() {
  await mkdir(iconDirectory, { recursive: true });

  await withGeneratedIconDirectory(async (generatedDirectory) => {
    await Promise.all(
      bundleIcons.map(({ fileName }) =>
        copyFile(join(generatedDirectory, fileName), join(iconDirectory, fileName)),
      ),
    );
  });

  await rm(legacyUnmanagedIcon, { force: true });
}
