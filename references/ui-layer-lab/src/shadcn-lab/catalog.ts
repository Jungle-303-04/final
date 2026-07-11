import type * as React from "react"

import componentsConfig from "../../components.json?raw"
import viteConfig from "../../vite.config.ts?raw"
import inventory from "../../vendor/shadcn/inventory.json"
import indexCss from "../index.css?raw"
import utilsSource from "../lib/utils.ts?raw"

export type CatalogKind = "overview" | "example" | "chart" | "block"

type PreviewModule = Record<string, unknown> & {
  default?: React.ComponentType
}

type PreviewLoader = () => Promise<PreviewModule>

export type SourceFile = {
  path: string
  load: () => Promise<string>
}

export type CatalogItem = {
  id: string
  kind: CatalogKind
  title: string
  page?: string
  style?: string
  sourceFiles: SourceFile[]
}

const overviewLoaders = import.meta.glob<PreviewModule>([
  "../../vendor/shadcn/upstream/registry/bases/base/examples/*.tsx",
  "!../../vendor/shadcn/upstream/registry/bases/base/examples/_registry.ts",
]) as Record<string, PreviewLoader>

const exampleLoaders = import.meta.glob<PreviewModule>([
  "../../vendor/shadcn/upstream/examples/base/*.tsx",
]) as Record<string, PreviewLoader>

const chartLoaders = import.meta.glob<PreviewModule>(
  "../../vendor/shadcn/upstream/registry/new-york-v4/charts/chart-area-*.tsx"
) as Record<string, PreviewLoader>

const blockLoaders = import.meta.glob<PreviewModule>(
  "../../vendor/shadcn/upstream/registry/new-york-v4/blocks/*/page.tsx"
) as Record<string, PreviewLoader>

const rawSources = import.meta.glob(
  [
    "../../vendor/shadcn/upstream/registry/**/*.{ts,tsx,json}",
    "../../vendor/shadcn/upstream/examples/base/*.tsx",
    "../../vendor/shadcn/upstream/styles/**/*.{ts,tsx}",
    "../../vendor/shadcn/upstream/support/*.{ts,tsx,css}",
  ],
  { import: "default", query: "?raw" }
) as Record<string, () => Promise<string>>

function filename(path: string) {
  const parts = path.split("/")
  return parts[parts.length - 1] ?? path
}

function idFromPath(path: string) {
  return filename(path).replace(/\.(tsx|ts)$/, "")
}

function titleFromId(id: string) {
  return id
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function sourceFilesFor(kind: CatalogKind, id: string): SourceFile[] {
  const entries = Object.entries(rawSources).filter(([path]) => {
    if (kind === "overview") {
      return path.endsWith(`/registry/bases/base/examples/${id}.tsx`)
    }
    if (kind === "example") {
      return path.endsWith(`/examples/base/${id}.tsx`)
    }
    if (kind === "chart") {
      return path.endsWith(`/registry/new-york-v4/charts/${id}.tsx`)
    }
    return path.includes(`/registry/new-york-v4/blocks/${id}/`)
  })

  return entries
    .map(([path, load]) => ({
      path: path.replace(/^.*\/vendor\/shadcn\/upstream\//, "upstream/"),
      load,
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

function itemsFromLoaders(
  kind: CatalogKind,
  loaders: Record<string, PreviewLoader>,
  blockPath = false
) {
  return Object.keys(loaders)
    .map((path) => {
      const parts = path.split("/")
      const id = blockPath ? parts[parts.length - 2] ?? "" : idFromPath(path)
      return {
        id,
        kind,
        title: titleFromId(id),
        sourceFiles: sourceFilesFor(kind, id),
      } satisfies CatalogItem
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export const catalog: Record<CatalogKind, CatalogItem[]> = {
  overview: itemsFromLoaders("overview", overviewLoaders),
  example: inventory.componentExamples.map(({ name, page, style }) => ({
    id: name,
    kind: "example" as const,
    title: titleFromId(name),
    page,
    style,
    sourceFiles: sourceFilesFor("example", name),
  })),
  chart: itemsFromLoaders("chart", chartLoaders),
  block: itemsFromLoaders("block", blockLoaders, true),
}

const loaderGroups: Record<CatalogKind, Record<string, PreviewLoader>> = {
  overview: overviewLoaders,
  example: exampleLoaders,
  chart: chartLoaders,
  block: blockLoaders,
}

export function getPreviewLoader(kind: CatalogKind, id: string) {
  return Object.entries(loaderGroups[kind]).find(([path]) => {
    if (kind === "block") return path.includes(`/blocks/${id}/page.tsx`)
    return idFromPath(path) === id
  })?.[1]
}

export function getCatalogItem(kind: CatalogKind, id: string) {
  return catalog[kind].find((item) => item.id === id)
}

export const installationSources: SourceFile[] = [
  { path: "components.json", load: async () => componentsConfig },
  { path: "src/index.css", load: async () => indexCss },
  { path: "src/lib/utils.ts", load: async () => utilsSource },
  { path: "vite.config.ts", load: async () => viteConfig },
]

export const upstreamInventory = inventory
