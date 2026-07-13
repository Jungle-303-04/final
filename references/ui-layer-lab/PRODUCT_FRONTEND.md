# Product frontend foundation

This file explains the runtime boundary for contributors working in
`references/ui-layer-lab/src/product`. Product scope and screen semantics remain authoritative in
`docs/spec/frontend/codex-directive-goalmode-20260711.md` and its active-document allowlist.

## Current release state

The product entry is `/product`. It is not a demo route and must never render catalog fixtures,
synthetic Kubernetes resources, or guessed API values.

The frontend may register a product surface only after every endpoint function required by that
surface has an anchored completion record in:

```text
docs/spec/frontend/codex-progress-20260711.md

API 완성: functionName (commitHash)
```

The released composition currently contains two real-API surfaces:

- `Home` consumes the anchored cluster list, cluster summary, Node summary, and Node Pod summary
  contracts. It keeps cluster and Node selection in the URL and never substitutes synthetic data.
- `Resources` consumes the anchored inventory summary, resource list, and resource-detail contracts.
  The list and URL-backed detail Sheet share one route; relations and events come only from the
  backend detail read model.

Only these surfaces appear in navigation. An unfinished surface still remains absent from routing,
navigation, and runtime requests. API failures render explicit loading, forbidden, unavailable, or
partial states and never activate a fallback adapter. `APIQ-028` tracks the remaining transport-schema
change required to preserve the non-usage parts of Home when `usage.pods_total` is absent.

## API coordination

The ownership rule is defined by goalmode §6b.

- API transport functions and wire schemas under `src/product/api/**` belong to the API integration
  worker.
- Missing or unapproved functions are requested only through
  `docs/spec/frontend/api-needs.md`.
- Frontend contributors do not add duplicate queue rows and do not infer response shapes.
- `src/product/api/client.ts` and `src/product/api/url.ts` are frozen for both sides.
- Product adapters and view-model conversion remain frontend-owned.
- A live API failure never falls back to synthetic data.

The approval path is:

```text
api-needs.md requested row
  -> API worker implementation and contract tests
  -> anchored API 완성 record in codex-progress-20260711.md
  -> endpoint import in app/apiComposition.ts
  -> canonical adapter
  -> surface registration
  -> route and navigation become visible together
```

`src/product/app/apiBoundary.test.ts` enforces this path. Product code outside
`app/apiComposition.ts` cannot import `product/api`, and the composition root cannot value-import an
endpoint without a matching completion record. The record hash must be an ancestor commit whose API
barrel exports that endpoint and whose changed contract test references the same function. Computed
dynamic imports are prohibited; code splitting uses statically analyzable literal imports.

The product design guard separately rejects direct `fetch`, WebSocket, EventSource, XHR, and beacon
access outside `src/product/api`. This prevents a surface from bypassing the composition root by
opening its own transport.

## Runtime composition

```text
src/
  main.tsx
  product/
    ProductApp.tsx                 # theme and router root
    api/                           # API-worker-owned transport and wire schemas
    app/
      apiComposition.ts            # the only approved API import boundary
      productComposition.ts        # released surface set
      ProductRouter.tsx            # release gate or registered routes
      ProductShell.tsx             # navigation derived from released surfaces
      productRoutes.ts             # canonical route metadata
    features/
      home/                         # Home canonical DTO, port, validation, adapter
      resources/                    # inventory canonical DTO, port, validation, adapter
    pages/
      home/                         # cluster -> Node -> Pod interaction
      resources/                    # catalog, bounded list, same-route detail Sheet
    shared/data/                    # shared request and async refresh state machinery
    shared/ui/
      primitives/                  # product-owned shadcn adaptations
    styles/                        # product-owned light/dark tokens and foundations
```

The official component catalog remains available at `/` and is code-split from the product entry.
Product code must not import `src/components/ui`, `src/shadcn-lab`, `vendor`, or catalog styles.

## Surface registration rule

`createProductComposition` is the single source for released product surfaces. A registration
contains a canonical surface ID and a component. The composition derives both the router and the
sidebar from that same list, so a route cannot exist without navigation metadata and an unsupported
menu cannot remain visible.

Released surface IDs and target runtime capabilities are deliberately separate contracts. API
approval decides whether a screen can ship; the selected cluster/binding capability and permission
set decides which controls inside that screen are visible or disabled. Provider names are never route
conditions. Target-level permission and partial-data states stay inside a released surface;
build-time absence of an approved API keeps the entire surface unregistered.

## Design foundation

- Product primitives are local adaptations under `src/product/shared/ui/primitives`.
- Light and dark are the only theme states; system is not a third selectable mode.
- The shell uses the benchmark-minimum shadcn token vocabulary.
- Keyboard focus, skip navigation, reduced motion, forced colors, and 390/768/1440 layouts are release
  requirements.
- Third-party provenance and modifications are recorded in `THIRD_PARTY_NOTICES.md`.
- Open API records are never rendered directly. In particular, Resources suppresses labels and
  annotations until the backend provides an explicit redacted presentation contract.

## Contributor workflow

1. Read `AGENTS.md` and the active goalmode documents.
2. Check `codex-progress-20260711.md` for anchored `API 완성:` records.
3. If an endpoint is missing, append one non-duplicate request to `api-needs.md`; do not edit
   `src/product/api/**` before the 24-hour exception applies.
4. Add a failing contract or interaction test outside the API directory.
5. Implement the adapter and surface through `apiComposition.ts` only after approval.
6. Run `npm run check` before every commit.
7. Verify the production bundle at 390px, 768px, and 1440px in light/dark, keyboard, and
   reduced-motion modes.
8. Append the screen commit, gate output, and reference-equivalence result to the progress log.

## Baseline acceptance

- No product API import exists outside `app/apiComposition.ts`.
- Every endpoint value import has an anchored completion record.
- No synthetic, fixture, dummy, or guessed production data is rendered.
- Zero approved surfaces produce a network-silent release gate.
- Navigation contains exactly the released surface set.
- Product CSS is isolated from the reference catalog.
- `npm run check` passes with no warning promoted by the product design guard.
