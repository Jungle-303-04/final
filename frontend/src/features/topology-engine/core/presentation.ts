import type { EntityKey, Revision } from "./brand"

export type PlacementLens = Readonly<{ kind: "placement" }>

export type FoldLens =
  | Readonly<{
      kind: "network"
      mode: "configured" | "effective" | "observed" | "combined"
    }>
  | Readonly<{ kind: "ownership" }>
  | Readonly<{ kind: "dependency" }>
  | Readonly<{ kind: "storage" }>
  | Readonly<{ kind: "gitops" }>
  | Readonly<{
      kind: "butterfly"
      left: "network"
      right: "ownership-gitops"
    }>

export type Lens = PlacementLens | FoldLens

export type MapPresentation = Readonly<{
  mode: "map"
  lens: PlacementLens
}>

export type FocusSankeyPresentation = Readonly<{
  mode: "focus-sankey"
  lens: PlacementLens
  focusEntityKey: EntityKey
}>

export type FoldLensPresentation = Readonly<{
  mode: "fold-lens"
  lens: FoldLens
  anchorEntityKey: EntityKey | null
  capabilityRevision: Revision<"capability">
}>

export type TopologyPresentation =
  | MapPresentation
  | FocusSankeyPresentation
  | FoldLensPresentation

export const MAP_PRESENTATION: MapPresentation = Object.freeze({
  mode: "map",
  lens: Object.freeze({ kind: "placement" }),
})
