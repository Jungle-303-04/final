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

There are currently no completion records. Therefore `/product` renders a release gate, performs no
product API request, opens no product WebSocket, and exposes no unfinished navigation. This is the
required safe state, not a fallback.

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
endpoint without a matching completion record.

## Runtime composition

```text
src/
  main.tsx
  product/
    ProductApp.tsx                 # theme and router root
    api/                           # API-worker-owned transport and wire schemas
    app/
      apiComposition.ts            # the only approved API import boundary
      productComposition.ts        # registered surface/capability set
      ProductRouter.tsx            # release gate or registered routes
      ProductShell.tsx             # navigation derived from registered capabilities
      productRoutes.ts             # canonical route metadata
    shared/ui/
      primitives/                  # product-owned shadcn adaptations
    styles/                        # product-owned light/dark tokens and foundations
```

The official component catalog remains available at `/` and is code-split from the product entry.
Product code must not import `src/components/ui`, `src/shadcn-lab`, `vendor`, or catalog styles.

## Surface registration rule

`createProductComposition` is the single source for released product surfaces. A registration
contains a canonical capability ID and a component. The composition derives both the router and the
sidebar from that same list, so a route cannot exist without navigation metadata and an unsupported
menu cannot remain visible.

Provider names are never route conditions. A surface is registered from canonical capabilities only.
Target-level permission and partial-data states stay inside a released surface; build-time absence of
an approved API keeps the entire surface unregistered.

## Design foundation

- Product primitives are local adaptations under `src/product/shared/ui/primitives`.
- Light and dark are the only theme states; system is not a third selectable mode.
- The shell uses the benchmark-minimum shadcn token vocabulary.
- Keyboard focus, skip navigation, reduced motion, forced colors, and 390/768/1440 layouts are release
  requirements.
- Third-party provenance and modifications are recorded in `THIRD_PARTY_NOTICES.md`.

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
- Navigation contains exactly the registered capability set.
- Product CSS is isolated from the reference catalog.
- `npm run check` passes with no warning promoted by the product design guard.
