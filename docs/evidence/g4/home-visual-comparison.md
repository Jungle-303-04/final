# Home surface visual comparison — P0 candidate

- Reference: read-only `demo-freeze-v3`, `/devpreview-unified.html`, 1440 px
- Product candidate: `ed2de67b1` (with its ancestors), `/home`, live API, 1440 px, light theme
- Reference capture: `home-demo-v3-1440.png`
- Product capture: `home-product-candidate-light-1440.png`
- Dark-theme token check: `home-product-candidate-1440.png`

## P0 result

| Element | v3 rule | Product candidate | Result |
| --- | --- | --- | --- |
| Fleet summary | one-row chips, period segment, actions on the right | same structure; values use the live API | pass |
| Cluster cards | two-column maximum, status/provider/version/usage, connection empty tile | same information grammar; unavailable live CPU/MEM stays `—` | pass with honest unavailable data |
| Widget board | W2–W8 visible, shared card/chart primitives | W2–W8 visible and Recharts-backed shared primitives used | P0 pass |
| Theme | one token system across the surface | light and dark are both rendered by the same tokens | pass |
| Motion | token durations only, reduced-motion retained | release design gate passes | pass |

This is a local P0 candidate comparison, not a G4 Home completion declaration. The live capture on the deployed digest and the remaining detailed widget/card parity pass are still required before declaring the Home surface complete.
