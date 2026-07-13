import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const vendorRoot = join(projectRoot, "vendor/shadcn")
const inventory = JSON.parse(readFileSync(join(vendorRoot, "inventory.json"), "utf8"))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const expectedCounts = {
  componentPages: 64,
  componentExamples: 445,
  areaCharts: 10,
  blocks: 27,
}

for (const [key, expected] of Object.entries(expectedCounts)) {
  assert(
    inventory.counts[key] === expected,
    `Expected ${expected} ${key}, received ${inventory.counts[key]}.`
  )
}

const styles = inventory.componentExamples.reduce((counts, example) => {
  counts[example.style] = (counts[example.style] ?? 0) + 1
  return counts
}, {})
assert(styles["base-nova"] === 397, "Expected 397 base-nova component examples.")
assert(styles["base-rhea"] === 47, "Expected 47 base-rhea component examples.")
assert(styles["radix-nova"] === 1, "Expected one radix-nova component example.")

for (const example of inventory.componentExamples) {
  assert(
    existsSync(join(vendorRoot, "upstream/examples/base", `${example.name}.tsx`)),
    `Missing documented component example source: ${example.name}`
  )
}

for (const [path, expectedHash] of Object.entries(inventory.files)) {
  const absolutePath = join(vendorRoot, path)
  assert(existsSync(absolutePath), `Missing vendored upstream file: ${path}`)
  const actualHash = createHash("sha256").update(readFileSync(absolutePath)).digest("hex")
  assert(actualHash === expectedHash, `Upstream source was modified: ${path}`)
}

for (const removedPath of [
  "src/examples",
  "src/styles",
  "src/components/ExampleSection.tsx",
  "src/components/SearchBar.tsx",
]) {
  assert(!existsSync(join(projectRoot, removedPath)), `Legacy example path still exists: ${removedPath}`)
}

assert(existsSync(join(vendorRoot, "LICENSE.md")), "The upstream MIT license is missing.")

const visualExampleCount =
  inventory.counts.componentExamples + inventory.counts.areaCharts + inventory.counts.blocks

console.log(
  `shadcn source audit passed: ${visualExampleCount} documented previews (${inventory.counts.componentExamples} components + ${inventory.counts.areaCharts} area charts + ${inventory.counts.blocks} blocks), commit ${inventory.commit.slice(0, 7)}.`
)
