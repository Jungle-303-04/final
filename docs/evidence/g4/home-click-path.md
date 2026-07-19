# Home surface click-path and resize check — P0 candidate

Product code digest: `ed2de67b1` (with its ancestors). Checked in headless Chrome against the live API on 2026-07-19 KST.

| Control/path | Observed result | Result |
| --- | --- | --- |
| `클러스터 연결` | opens the real three-step connection modal; step 1 offers EKS/GKE/AKS/server and command creation | pass |
| `오늘` → `7일` | URL changes from `/home` to `/home?home.period=7d` | pass |
| cluster card | real link to `/resources?clusters=<cluster-id>` | pass |
| sync empty state `열기` | real link to `/deploy?section=repositories` | pass |
| critical empty/partial state `열기` | real link to `/resources?resources.health=critical` | pass |
| activity/cost retry | invokes the adapter again and preserves explicit error state when the live API fails | pass; no fabricated fallback |
| route transition | `#product-main` scrollTop resets to 0 on Resources and Home navigation | pass |

## Responsive measurements

| Viewport | document client/scroll | main client/scroll | Horizontal overflow |
| ---: | ---: | ---: | --- |
| 1280 | 1280 / 1269 | 1025 / 1025 | 0 |
| 1440 | 1440 / 1429 | 1185 / 1185 | 0 |
| 1920 | 1920 / 1909 | 1665 / 1665 | 0 |

Page errors were 0. The known live activity endpoint returned HTTP 500; the surface rendered `사용할 수 없음` with a real retry action, which is the required honest error behavior.
