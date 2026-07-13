import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const checkoutRoot = resolve(process.argv[2] ?? "/tmp/shadcn-ui-official")
const appRoot = join(checkoutRoot, "apps/v4")
const registryRoot = join(appRoot, "registry/new-york-v4")
const vendorRoot = join(projectRoot, "vendor/shadcn")
const upstreamRoot = join(vendorRoot, "upstream")
const targetRegistryRoot = join(upstreamRoot, "registry/new-york-v4")
const pinnedCommit =
  process.env.SHADCN_UPSTREAM_COMMIT ?? "21e4ceb94418096e21a7f1990027741a8f9b085d"
const commit = execFileSync("git", ["-C", checkoutRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim()

if (commit !== pinnedCommit) {
  throw new Error(
    `Expected shadcn commit ${pinnedCommit}, received ${commit}. Set SHADCN_UPSTREAM_COMMIT explicitly for a deliberate snapshot update.`
  )
}

function copyTrackedFile(relativePath, targetPath) {
  const sourcePath = join(checkoutRoot, relativePath)
  mkdirSync(dirname(targetPath), { recursive: true })
  if (existsSync(sourcePath)) {
    copyFileSync(sourcePath, targetPath)
    return
  }
  writeFileSync(
    targetPath,
    execFileSync("git", ["-C", checkoutRoot, "show", `HEAD:${relativePath}`])
  )
}

function trackedFileNames(prefix) {
  const output = execFileSync(
    "git",
    ["-C", checkoutRoot, "ls-tree", "-r", "--name-only", "HEAD", prefix],
    { encoding: "utf8" }
  ).trim()
  return output ? output.split("\n") : []
}

function copyTrackedTree(prefix, targetRoot) {
  for (const relativePath of trackedFileNames(prefix)) {
    copyTrackedFile(relativePath, join(targetRoot, relativePath.slice(prefix.length + 1)))
  }
}

if (!existsSync(registryRoot)) {
  throw new Error(
    `Official shadcn checkout not found at ${registryRoot}. Pass the checkout path as the first argument.`
  )
}

rmSync(upstreamRoot, { force: true, recursive: true })
mkdirSync(targetRegistryRoot, { recursive: true })

for (const directory of ["ui", "examples", "blocks", "hooks", "lib"]) {
  copyTrackedTree(
    `apps/v4/registry/new-york-v4/${directory}`,
    join(targetRegistryRoot, directory)
  )
}

const baseTargetRoot = join(upstreamRoot, "registry/bases/base")
mkdirSync(baseTargetRoot, { recursive: true })
for (const directory of ["ui", "examples", "components", "hooks", "lib"]) {
  copyTrackedTree(
    `apps/v4/registry/bases/base/${directory}`,
    join(baseTargetRoot, directory)
  )
}

copyTrackedTree("apps/v4/examples/base", join(upstreamRoot, "examples/base"))
copyTrackedTree(
  "apps/v4/content/docs/components/base",
  join(upstreamRoot, "docs/components/base")
)
for (const style of ["base-nova", "base-rhea", "radix-nova", "radix-rhea"]) {
  copyTrackedTree(`apps/v4/styles/${style}`, join(upstreamRoot, "styles", style))
}

mkdirSync(join(targetRegistryRoot, "charts"), { recursive: true })
for (const filename of readdirSync(join(registryRoot, "charts"))) {
  if (filename.startsWith("chart-area-") && filename.endsWith(".tsx")) {
    copyFileSync(
      join(registryRoot, "charts", filename),
      join(targetRegistryRoot, "charts", filename)
    )
  }
}

mkdirSync(join(upstreamRoot, "support"), { recursive: true })
copyTrackedFile(
  "apps/v4/hooks/use-media-query.tsx",
  join(upstreamRoot, "support/use-media-query.tsx")
)
copyTrackedFile(
  "apps/v4/hooks/use-copy-to-clipboard.ts",
  join(upstreamRoot, "support/use-copy-to-clipboard.ts")
)
copyTrackedFile(
  "apps/v4/app/globals.css",
  join(upstreamRoot, "support/official-globals.css")
)
copyTrackedFile(
  "apps/v4/registry/styles/style-nova.css",
  join(upstreamRoot, "support/style-nova.css")
)
copyTrackedFile("apps/v4/lib/ai.ts", join(upstreamRoot, "support/ai.ts"))
copyTrackedFile(
  "apps/v4/components/message-parts.tsx",
  join(upstreamRoot, "support/message-parts.tsx")
)
copyTrackedFile(
  "apps/v4/components/language-selector.tsx",
  join(upstreamRoot, "support/language-selector.tsx")
)
copyTrackedFile(
  "apps/v4/components/markdown.tsx",
  join(upstreamRoot, "support/markdown.tsx")
)
copyTrackedFile(
  "apps/v4/components/message-animated.tsx",
  join(upstreamRoot, "support/message-animated.tsx")
)
copyTrackedFile(
  "apps/v4/lib/message-animations.ts",
  join(upstreamRoot, "support/message-animations.ts")
)
copyTrackedFile(
  "apps/v4/registry/icons/__lucide__.ts",
  join(upstreamRoot, "support/__lucide__.ts")
)
copyTrackedFile(
  "apps/v4/public/r/styles/new-york-v4/theme-neutral.json",
  join(upstreamRoot, "support/theme-neutral.json")
)

mkdirSync(join(upstreamRoot, "public/avatars"), { recursive: true })
copyTrackedFile(
  "apps/v4/public/avatars/shadcn.jpg",
  join(upstreamRoot, "public/avatars/shadcn.jpg")
)
copyTrackedFile(
  "apps/v4/public/placeholder.svg",
  join(upstreamRoot, "public/placeholder.svg")
)
copyTrackedFile("LICENSE.md", join(vendorRoot, "LICENSE.md"))

mkdirSync(join(projectRoot, "public/avatars"), { recursive: true })
copyTrackedFile(
  "apps/v4/public/avatars/shadcn.jpg",
  join(projectRoot, "public/avatars/shadcn.jpg")
)
copyTrackedFile(
  "apps/v4/public/placeholder.svg",
  join(projectRoot, "public/placeholder.svg")
)

const listFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  })

const sourceFiles = listFiles(upstreamRoot).sort()
const hashes = Object.fromEntries(
  sourceFiles.map((path) => [
    relative(vendorRoot, path),
    createHash("sha256").update(readFileSync(path)).digest("hex"),
  ])
)

const exampleNames = readdirSync(join(targetRegistryRoot, "examples"))
  .filter((name) => name.endsWith(".tsx") && name !== "_registry.ts")
  .map((name) => name.replace(/\.tsx$/, ""))
  .sort()
const baseExampleNames = readdirSync(join(baseTargetRoot, "examples"))
  .filter((name) => name.endsWith(".tsx") && name !== "_registry.ts")
  .map((name) => name.replace(/\.tsx$/, ""))
  .sort()
const componentDocsRoot = join(upstreamRoot, "docs/components/base")
const currentExampleRoot = join(upstreamRoot, "examples/base")
const componentExamplesByName = new Map()
for (const path of listFiles(componentDocsRoot).filter((path) => path.endsWith(".mdx"))) {
  const content = readFileSync(path, "utf8")
  for (const match of content.matchAll(/<ComponentPreview\b([^>]*)>/gs)) {
    const attributes = match[1]
    const name = attributes.match(/\bname="([^"]+)"/)?.[1]
    if (!name) continue
    const style = attributes.match(/\bstyleName="([^"]+)"/)?.[1] ?? "base-nova"
    const previous = componentExamplesByName.get(name)
    if (previous && previous.style !== style) {
      throw new Error(`Component example ${name} is referenced with multiple styles.`)
    }
    componentExamplesByName.set(name, {
      name,
      style,
      page: relative(componentDocsRoot, path).replace(/\.mdx$/, ""),
    })
  }
}
const componentExamples = [...componentExamplesByName.values()].sort((a, b) =>
  a.name.localeCompare(b.name)
)
for (const example of componentExamples) {
  if (!existsSync(join(currentExampleRoot, `${example.name}.tsx`))) {
    throw new Error(`Missing source for documented component example: ${example.name}`)
  }
}
const componentPages = readdirSync(componentDocsRoot)
  .filter((name) => name.endsWith(".mdx"))
  .map((name) => name.replace(/\.mdx$/, ""))
  .sort()
const chartNames = readdirSync(join(targetRegistryRoot, "charts"))
  .filter((name) => name.endsWith(".tsx"))
  .map((name) => name.replace(/\.tsx$/, ""))
  .sort()
const blockNames = readdirSync(join(targetRegistryRoot, "blocks"))
  .filter((name) => statSync(join(targetRegistryRoot, "blocks", name)).isDirectory())
  .sort()
const componentNames = readdirSync(join(targetRegistryRoot, "ui"))
  .filter((name) => name.endsWith(".tsx") && name !== "_registry.ts")
  .map((name) => name.replace(/\.tsx$/, ""))
  .sort()

const inventory = {
  upstream: "https://github.com/shadcn-ui/ui",
  commit,
  sources: [
    "https://ui.shadcn.com/charts/area",
    "https://ui.shadcn.com/blocks",
    "https://ui.shadcn.com/docs/components",
    "https://ui.shadcn.com/docs/installation",
  ],
  counts: {
    componentPages: componentPages.length,
    componentOverviewExamples: baseExampleNames.length,
    componentExamples: componentExamples.length,
    legacyComponentExamples: exampleNames.length,
    areaCharts: chartNames.length,
    blocks: blockNames.length,
  },
  componentPages,
  primitiveSources: componentNames,
  componentOverviewExamples: baseExampleNames,
  componentExamples,
  legacyComponentExamples: exampleNames,
  areaCharts: chartNames,
  blocks: blockNames,
  files: hashes,
}

writeFileSync(join(vendorRoot, "inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`)

console.log(
  `Synced shadcn ${commit}: ${componentPages.length} component pages, ${componentExamples.length} documented examples, ${chartNames.length} area charts, ${blockNames.length} blocks.`
)
