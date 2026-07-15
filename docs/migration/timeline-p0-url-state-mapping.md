# Timeline P0 URL State Mapping

This scoped mapping records only the first Timeline vertical slice. It does not classify the central migration ledger and must not be read as full Timeline parity.

| Source key | Upstream source | Product target | Verification | Status |
| --- | --- | --- | --- | --- |
| `upstream-ui:timeline:state:url-roundtrip-history:v1` | `references/upstream/web/src/components/timeline/TimelineView.tsx` (`parseTimelineParams`, `writeTimelineParams`, URL synchronization) | `frontend/src/features/timeline/timelineUrlState.ts`, `frontend/src/features/timeline/useTimelineUrlState.ts` | `frontend/src/features/timeline/timelineUrlState.test.ts`, `frontend/src/pages/timeline/TimelineSurface.test.tsx` | P0 implemented |
| `upstream-ui:timeline:state:loading-error-empty-gap:v1` | `references/upstream/web/src/components/timeline/TimelineView.tsx` (source state boundaries) | `frontend/src/features/timeline/timelineContract.ts`, `frontend/src/pages/timeline/TimelineSurface.tsx` | `frontend/src/pages/timeline/TimelineSurface.test.tsx` | P0 implemented |
| `upstream-ui:timeline:source:provider-mode:v1` | `references/upstream/web/src/api/timelineSource.ts` (source provider selection) | `TimelineQuery.scopes: readonly ClusterScope[]` from `frontend/src/shared/parity/referenceParity.ts` | `frontend/src/pages/timeline/TimelineSurface.test.tsx` | P0 contract only |

## Canonical scope conversion

`TimelineQuery` and `TimelineSurface` accept only `readonly ClusterScope[]` from the shared parity contract. Composition must translate each selected product cluster directly into `{ workspaceId, clusterId, namespaces, freshness }` using that existing type; it must not introduce a Timeline-specific range, freshness, or cluster identifier type. Multi-cluster selection is represented by one canonical scope per selected cluster. Provider/API composition remains incomplete in this P0 slice.

## Explicitly incomplete upstream interactions

- `upstream-ui:timeline:source:provider-mode:v1`: retained/local provider selection and API composition.
- `upstream-ui:timeline:source:retained-ndjson-window:v1`: retained NDJSON window loading.
- `upstream-ui:timeline:source:retained-overview-live-merge:v1`: overview and live event merge.
- `upstream-ui:timeline:view:mode-and-namespace-gate:v1`: source-equivalent list/swimlane physical rendering; P0 only keeps the URL mode gate.
- `upstream-ui:timeline:filter:search-activity-kind-deleted:v1`: visual filter controls beyond URL parsing.
- `upstream-ui:timeline:lanes:persistent-pins:v1`: pins and persistence.
- `upstream-ui:timeline:time:query-preset-custom-range:v1`: presets, custom range selection, scrubber, zoom and drag interactions.
- `upstream-ui:timeline:list:scroll-window-sync:v1`: list virtualization and scroll/window synchronization.
- `upstream-ui:timeline:lanes:group-sort-expand-and-navigation:v1`: lane grouping, sorting, expansion, navigation and resource relationships.
- `upstream-ui:timeline:drawer:marker-cluster-deeplink-keyboard:v1`: event drawer, marker cluster, deep links, Escape and focus-return behavior.
- `upstream-ui:timeline:motion:live-order-hysteresis-reduced:v1`: live-motion ordering, hysteresis and reduced-motion rendering.

The P0 surface has no dialog, drawer, menu, or focus-trap source equivalent; therefore it adds no synthetic Escape handling. Its standard input/button focus follows browser semantics. API integration is intentionally a `TimelinePort` dependency injection boundary; it contains no endpoint, fixture, or inline event data.
