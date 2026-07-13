import { Badge } from "@/components/ui/badge"

import { installationSources, upstreamInventory } from "./catalog"
import { SourceViewer } from "./SourceViewer"

export function InstallationView() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Vite</Badge>
          <Badge variant="outline">Base UI · Nova</Badge>
          <Badge variant="outline">Tailwind CSS v4</Badge>
          <Badge variant="outline">React 19</Badge>
        </div>
        <h2 className="mt-4 text-2xl font-semibold tracking-tight">Official installation, checked in</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          The project was initialized with the official shadcn CLI. Components use the Base UI
          namespace, while Blocks and Area Charts retain their official new-york-v4 namespace to
          prevent incompatible primitives from overwriting each other.
        </p>
        <div className="mt-5 rounded-lg bg-muted px-4 py-3 font-mono text-sm">
          npx shadcn@latest init -d --base base
          <br />
          npx shadcn@latest add --all -o
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Upstream commit: {upstreamInventory.commit}
        </p>
      </div>
      <SourceViewer files={installationSources} />
    </div>
  )
}
