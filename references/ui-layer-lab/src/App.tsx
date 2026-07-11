import "./index.css"

import { PreviewRoute } from "./shadcn-lab/PreviewRoute"
import { ShadcnLabApp } from "./shadcn-lab/ShadcnLabApp"
import type { CatalogKind } from "./shadcn-lab/catalog"

function previewRoute() {
  const match = window.location.pathname.match(
    /^\/preview\/(overview|example|chart|block)\/([^/]+)\/?$/
  )
  if (!match) return null
  return { kind: match[1] as CatalogKind, id: decodeURIComponent(match[2]) }
}

export default function App() {
  const preview = previewRoute()
  return preview ? <PreviewRoute kind={preview.kind} id={preview.id} /> : <ShadcnLabApp />
}
