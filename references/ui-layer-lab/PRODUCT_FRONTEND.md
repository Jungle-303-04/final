# Product frontend foundation

## Product frame

The first production surface is an operations control room for people responsible for Kubernetes fleet health and remediation.

- Primary question: **What needs attention now?**
- Secondary question: **Which cluster should I inspect next?**
- Tone: calm, industrial, precise, and evidence-led.
- Visual direction: dense operational editorial rather than a generic card dashboard.
- Memorable element: a fleet status field where health, freshness, incidents, and measured capacity can be scanned without opening each cluster.

## Backend-backed first slice

The product screen at `/product` is driven by backend contracts only. The demo catalog at `/` is intentionally backend-independent.

| UI need | Backend contract | Use |
| --- | --- | --- |
| Session and workspace | `GET /auth/session` | user, roles, workspace scope |
| Fleet rollup | `GET /fleet/summary` | cluster rows and all top-level counts |
| Incident queue | `GET /dashboard/rca/timeline?limit=6` | optional list when the user has RCA read access |
| Live connection | `WS /api/live/browser?workspace_id=...` | connection freshness and bounded live summaries |

The fleet endpoint is the authoritative root-screen projection. Health means:

- `critical`: degraded workload or a not-ready node exists.
- `warning`: recent restarts or an open incident exists.
- `stale`: observations exist but the agent is not online.
- `unknown`: no pod, node, or usage observation exists yet.
- `healthy`: none of the above.

CPU and memory are nullable measurements. A missing value is shown as unavailable, never as zero.

There is no global approval list, global workflow list, command history list, or persistent notification inbox endpoint. The root may show their backend-provided counts but must not fabricate list items or read state.

## First-screen composition

```text
top utility bar: product context | workspace | API/live state

fleet headline + concise health statement
status index: critical / warning / stale / unknown / healthy

main field                              attention rail
cluster scan rows                       real incident rows when allowed
pods · nodes · incidents                approval/workflow/DLQ counts
measured CPU · memory · last seen       honest unavailable states
```

The layout uses one dominant field and one narrower attention rail. It avoids a symmetric pile of cards. On small screens the attention rail follows the fleet list, and scan rows become two-level summaries without horizontal scrolling.

## Runtime boundaries

```text
src/
  main.tsx                    # loads official lab at / and product at /product
  shadcn-lab/                 # reference host; forbidden product dependency
  components/ui/             # generated lab primitives; forbidden product dependency
  product/
    ProductApp.tsx
    api/                      # transport, schemas, endpoint functions
    features/fleet/           # root vertical slice
    shared/ui/                # domain-free primitives
    styles/                   # tokens, foundation, shared UI, page layout
vendor/shadcn/                # immutable official source; never imported by product
```

The official reference catalogue remains available under `/` and is code-split away from the product entry.

## First-slice acceptance

- The product entry imports no reference-lab component or stylesheet.
- The screen renders loading, unauthenticated, offline, forbidden, empty, stale, and populated states honestly.
- No product metric or incident is hardcoded.
- API responses are runtime-validated.
- The app has no page-level overflow at 390px, 768px, or 1440px.
- Keyboard focus is visible; status is conveyed by text as well as color.
- Reduced-motion users receive no pulsing or staged entrance animation.
- `/` renders the pinned official shadcn catalogue without backend requests.
