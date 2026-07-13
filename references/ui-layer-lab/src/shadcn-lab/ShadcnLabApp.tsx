import * as React from "react"
import { Code2, ExternalLink, Moon, Search, Sun } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

import {
  catalog,
  upstreamInventory,
  type CatalogItem,
  type CatalogKind,
} from "./catalog"
import { InstallationView } from "./InstallationView"
import { SourceViewer } from "./SourceViewer"

type Section = CatalogKind | "installation"

const sections: Array<{
  id: Section
  href: string
  label: string
  description: string
  count?: number
}> = [
  {
    id: "overview",
    href: "/components",
    label: "Components",
    description: "Base Nova overview",
    count: catalog.overview.length,
  },
  {
    id: "example",
    href: "/components/examples",
    label: "Component examples",
    description: "Official docs previews",
    count: catalog.example.length,
  },
  {
    id: "chart",
    href: "/charts/area",
    label: "Area charts",
    description: "new-york-v4 + Recharts",
    count: catalog.chart.length,
  },
  {
    id: "block",
    href: "/blocks",
    label: "Blocks",
    description: "All public official blocks",
    count: catalog.block.length,
  },
  {
    id: "installation",
    href: "/installation",
    label: "Installation",
    description: "CLI and local configuration",
  },
]

function sectionFromPath(pathname: string): Section {
  if (pathname.startsWith("/components/examples")) return "example"
  if (pathname.startsWith("/charts/area")) return "chart"
  if (pathname.startsWith("/blocks")) return "block"
  if (pathname.startsWith("/installation")) return "installation"
  return "overview"
}

function selectedId(items: CatalogItem[]) {
  const requested = new URLSearchParams(window.location.search).get("item")
  return items.some((item) => item.id === requested) ? requested! : items[0]?.id ?? ""
}

export function ShadcnLabApp() {
  const section = sectionFromPath(window.location.pathname)
  const items = section === "installation" ? [] : catalog[section]
  const [query, setQuery] = React.useState("")
  const [activeId, setActiveId] = React.useState(() => selectedId(items))
  const [tab, setTab] = React.useState<"preview" | "code">("preview")
  const [mobileBrowserOpen, setMobileBrowserOpen] = React.useState(false)
  const [theme, setTheme] = React.useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  )

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark")
    document.documentElement.classList.add("style-nova")
  }, [theme])

  const filteredItems = items.filter((item) =>
    `${item.id} ${item.title}`.toLowerCase().includes(query.trim().toLowerCase())
  )
  const activeItem = items.find((item) => item.id === activeId) ?? items[0]

  function chooseItem(item: CatalogItem) {
    setActiveId(item.id)
    setTab("preview")
    setMobileBrowserOpen(false)
    const url = new URL(window.location.href)
    url.searchParams.set("item", item.id)
    window.history.replaceState(null, "", url)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 md:px-6">
          <a href="/" className="flex min-w-0 items-center gap-2 font-semibold">
            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-background">
              <Code2 className="size-4" />
            </span>
            <span className="truncate">shadcn/ui official lab</span>
          </a>
          <Badge variant="outline" className="hidden font-mono text-[10px] sm:inline-flex">
            {upstreamInventory.commit.slice(0, 7)}
          </Badge>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
              onClick={() => setTheme((value) => (value === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </Button>
            <Button
              render={<a href="https://ui.shadcn.com" target="_blank" rel="noreferrer" />}
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
              Official site <ExternalLink />
            </Button>
            <Button
              render={<a href="/product" />}
              nativeButton={false}
              variant="outline"
              size="sm"
            >
              Product
            </Button>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[minmax(0,1fr)] md:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-w-0 border-b bg-muted/20 md:border-r md:border-b-0">
          <nav className="flex gap-1 overflow-x-auto p-3 md:grid md:overflow-visible">
            {sections.map((item) => (
              <a
                key={item.id}
                href={item.href}
                data-active={section === item.id}
                className="flex min-w-52 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-muted data-[active=true]:bg-accent data-[active=true]:font-medium md:min-w-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                {item.count !== undefined ? (
                  <Badge variant="secondary" className="tabular-nums">
                    {item.count}
                  </Badge>
                ) : null}
              </a>
            ))}
          </nav>

          {section !== "installation" ? (
            <>
              <Separator />
              <div className="p-3 md:hidden">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => setMobileBrowserOpen((value) => !value)}
                >
                  Browse {items.length} items
                  <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    {mobileBrowserOpen ? "Close" : activeItem?.id}
                  </span>
                </Button>
              </div>
              <div className={`${mobileBrowserOpen ? "block" : "hidden"} p-3 pt-0 md:block md:pt-3`}>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search official items…"
                    className="pl-9"
                  />
                </div>
                <div className="mt-3 grid max-h-72 gap-0.5 overflow-y-auto md:max-h-[calc(100vh-360px)]">
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      data-active={activeItem?.id === item.id}
                      className="truncate rounded-md px-3 py-2 text-left font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
                      onClick={() => chooseItem(item)}
                    >
                      {item.id}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </aside>

        <main className="min-w-0 p-4 md:p-8">
          {section === "installation" ? (
            <InstallationView />
          ) : activeItem ? (
            <div className="mx-auto max-w-7xl">
              <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{activeItem.kind}</Badge>
                    {activeItem.style ? <Badge variant="outline">{activeItem.style}</Badge> : null}
                    <span className="font-mono text-xs text-muted-foreground">{activeItem.id}</span>
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
                    {activeItem.title}
                  </h1>
                </div>
                <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
                  <Button
                    size="sm"
                    variant={tab === "preview" ? "secondary" : "ghost"}
                    onClick={() => setTab("preview")}
                  >
                    Preview
                  </Button>
                  <Button
                    size="sm"
                    variant={tab === "code" ? "secondary" : "ghost"}
                    onClick={() => setTab("code")}
                  >
                    Source ({activeItem.sourceFiles.length})
                  </Button>
                </div>
              </div>

              <div className="pt-6">
                {tab === "preview" ? (
                  <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
                    <iframe
                      key={`${activeItem.kind}-${activeItem.id}-${theme}`}
                      title={`${activeItem.title} official preview`}
                      src={`/preview/${activeItem.kind}/${activeItem.id}?theme=${theme}`}
                      className={`w-full bg-background ${
                        activeItem.kind === "block"
                          ? "h-[800px]"
                          : activeItem.kind === "overview"
                            ? "h-[760px]"
                            : "h-[600px]"
                      }`}
                    />
                  </div>
                ) : (
                  <SourceViewer key={`${activeItem.kind}-${activeItem.id}`} files={activeItem.sourceFiles} />
                )}
              </div>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  )
}
