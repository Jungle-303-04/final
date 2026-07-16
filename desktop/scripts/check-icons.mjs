import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  bundleIcons,
  canonicalIconSource,
  iconDirectory,
  legacyUnmanagedIcon,
  tauriConfigPath,
  withGeneratedIconDirectory,
} from "./icon-assets.mjs";

const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function hash(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function fail(message) {
  throw new Error(`Desktop icon validation failed: ${message}`);
}

async function readRequired(path, description) {
  try {
    return await readFile(path);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      fail(`${description} is missing at ${path}`);
    }
    throw error;
  }
}

function verifyPng(contents, fileName, pixelSize) {
  if (!contents.subarray(0, pngSignature.length).equals(pngSignature)) {
    fail(`${fileName} is not a PNG file`);
  }

  const width = contents.readUInt32BE(16);
  const height = contents.readUInt32BE(20);
  if (width !== pixelSize || height !== pixelSize) {
    fail(`${fileName} must be ${pixelSize}x${pixelSize}, received ${width}x${height}`);
  }
}

function verifyIco(contents) {
  if (
    contents.length < 6 ||
    contents.readUInt16LE(0) !== 0 ||
    contents.readUInt16LE(2) !== 1 ||
    contents.readUInt16LE(4) < 1
  ) {
    fail("icon.ico is not a Windows icon with at least one image");
  }
}

function verifyIcns(contents) {
  if (
    contents.length < 16 ||
    contents.subarray(0, 4).toString("ascii") !== "icns" ||
    contents.readUInt32BE(4) !== contents.length
  ) {
    fail("icon.icns is not an Apple icon container");
  }

  let offset = 8;
  while (offset < contents.length) {
    if (offset + 8 > contents.length) {
      fail("icon.icns contains a truncated image entry");
    }

    const entryLength = contents.readUInt32BE(offset + 4);
    if (entryLength < 8 || offset + entryLength > contents.length) {
      fail("icon.icns contains an invalid image entry length");
    }
    offset += entryLength;
  }
}

async function assertAbsent(path, description) {
  try {
    await access(path);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  fail(`${description} must not exist at ${path}`);
}

const configContents = await readRequired(tauriConfigPath, "Tauri bundle configuration");
const config = JSON.parse(configContents.toString("utf8"));
const configuredIcons = config?.bundle?.icon;
const expectedConfigPaths = bundleIcons.map(({ configPath }) => configPath);

if (
  !Array.isArray(configuredIcons) ||
  configuredIcons.length !== expectedConfigPaths.length ||
  configuredIcons.some((icon, index) => icon !== expectedConfigPaths[index])
) {
  fail(`bundle.icon must exactly declare ${expectedConfigPaths.join(", ")}`);
}

await readRequired(canonicalIconSource, "canonical frontend SVG icon source");
await assertAbsent(legacyUnmanagedIcon, "legacy unmanaged icon.png");

await withGeneratedIconDirectory(async (generatedDirectory) => {
  for (const { fileName, pixelSize } of bundleIcons) {
    const checkedIn = await readRequired(join(iconDirectory, fileName), `checked-in ${fileName}`);
    const regenerated = await readRequired(
      join(generatedDirectory, fileName),
      `regenerated ${fileName}`,
    );

    if (pixelSize !== undefined) {
      verifyPng(checkedIn, fileName, pixelSize);
    } else if (fileName.endsWith(".ico")) {
      verifyIco(checkedIn);
    } else {
      verifyIcns(checkedIn);
    }

    // Tauri's ICNS encoder can choose different lossless compression bytes for
    // the same source image. Its container is verified above; PNG and ICO are
    // byte-stable outputs and therefore prove the checked-in platform set is
    // generated from the canonical SVG.
    if (fileName !== "icon.icns" && hash(checkedIn) !== hash(regenerated)) {
      fail(`${fileName} does not match the Tauri-generated artifact from the canonical SVG`);
    }
  }
});

console.log(`Validated ${bundleIcons.length} generated desktop icon artifacts.`);
