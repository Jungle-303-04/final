import * as React from "react"
import { Tooltip as RadixTooltip } from "radix-ui"
import { Toaster } from "sonner"

import { TooltipProvider as BaseTooltipProvider } from "@/components/ui/tooltip"

import { getCatalogItem, getPreviewLoader, type CatalogKind } from "./catalog"

function resolveComponent(module: Record<string, unknown>) {
  if (typeof module.default === "function") {
    return module.default as React.ComponentType
  }

  const namedComponent = Object.entries(module).find(
    ([name, value]) => /^[A-Z]/.test(name) && typeof value === "function"
  )?.[1]

  if (typeof namedComponent !== "function") {
    throw new Error("The official registry module does not export a React component.")
  }

  return namedComponent as React.ComponentType
}

class PreviewErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <main className="grid min-h-screen place-items-center bg-background p-8 text-foreground">
          <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
            <p className="text-sm font-medium text-destructive">Preview runtime error</p>
            <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}

function PreviewFrame({ kind, children }: { kind: CatalogKind; children: React.ReactNode }) {
  if (kind === "overview") return children
  if (kind === "block") return <div className="min-h-screen w-full">{children}</div>
  if (kind === "chart") {
    return (
      <div className="mx-auto grid min-h-screen w-full max-w-5xl place-items-center p-4 md:p-8">
        <div className="w-full">{children}</div>
      </div>
    )
  }
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center p-6 md:p-12">
      {children}
    </div>
  )
}

export function PreviewRoute({ kind, id }: { kind: CatalogKind; id: string }) {
  const loader = getPreviewLoader(kind, id)
  const catalogItem = getCatalogItem(kind, id)
  const [Component, setComponent] = React.useState<React.ComponentType | null>(null)
  const [loadError, setLoadError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    let current = true
    if (!loader) return
    void loader()
      .then((module) => {
        if (current) setComponent(() => resolveComponent(module))
      })
      .catch((error: unknown) => {
        if (current) setLoadError(error instanceof Error ? error : new Error(String(error)))
      })
    return () => {
      current = false
    }
  }, [loader])

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    document.documentElement.classList.toggle("dark", params.get("theme") === "dark")
    document.documentElement.classList.toggle(
      "preview-new-york",
      kind === "chart" || kind === "block"
    )
    document.documentElement.dataset.previewStyle = catalogItem?.style ?? "new-york-v4"
  }, [catalogItem?.style, kind])

  if (!loader) {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <p className="text-sm text-muted-foreground">Unknown official registry item.</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-8 text-foreground">
        <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-destructive">Preview runtime error</p>
          <p className="mt-2 text-sm text-muted-foreground">{loadError.message}</p>
        </div>
      </main>
    )
  }

  const content = (
    <>
      {Component ? (
        <PreviewFrame kind={kind}>
          <Component />
        </PreviewFrame>
      ) : (
        <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
          Loading official source…
        </div>
      )}
      <Toaster richColors closeButton />
    </>
  )

  return (
    <PreviewErrorBoundary>
      {kind === "overview" || kind === "example" ? (
        <BaseTooltipProvider>{content}</BaseTooltipProvider>
      ) : (
        <RadixTooltip.Provider delayDuration={0}>{content}</RadixTooltip.Provider>
      )}
    </PreviewErrorBoundary>
  )
}
