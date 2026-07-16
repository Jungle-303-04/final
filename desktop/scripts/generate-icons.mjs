import {
  bundleIcons,
  canonicalIconSource,
  iconDirectory,
  writeGeneratedBundleIcons,
} from "./icon-assets.mjs";

await writeGeneratedBundleIcons();

console.log(
  `Generated ${bundleIcons.length} desktop icon artifacts from ${canonicalIconSource} into ${iconDirectory}.`,
);
