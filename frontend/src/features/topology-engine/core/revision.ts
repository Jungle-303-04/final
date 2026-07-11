import type { Revision } from "./brand"

/** Every layout-affecting input owns an independent revision cut. */
export type LayoutRevision = Readonly<{
  structureRevision: Revision<"structure">
  logicalMetricRevision: Revision<"logical-metric">
  geometryMetricRevision: Revision<"geometry-metric">
  presentationGroupingRevision: Revision<"presentation-grouping">
  dataQueryHash: Revision<"data-query-hash">
  projectionHash: Revision<"projection-hash">
  presentationHash: Revision<"presentation-hash">
  viewportRevision: Revision<"viewport">
  policyRevision: Revision<"layout-policy">
}>

const LAYOUT_REVISION_KEYS = [
  "structureRevision",
  "logicalMetricRevision",
  "geometryMetricRevision",
  "presentationGroupingRevision",
  "dataQueryHash",
  "projectionHash",
  "presentationHash",
  "viewportRevision",
  "policyRevision",
] as const satisfies readonly (keyof LayoutRevision)[]

export function equalLayoutRevision(
  left: LayoutRevision,
  right: LayoutRevision,
): boolean {
  return LAYOUT_REVISION_KEYS.every((key) => left[key] === right[key])
}
