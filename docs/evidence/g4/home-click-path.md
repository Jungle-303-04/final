# Home surface click-path and resize check — live `333c65734`

Checked with the real Chrome session at `https://k8s.woonyong.org/home?clusters=demo-server` on 2026-07-19 KST. Source, deployed bundle and screenshots point to `333c657345271e5d924fbb9e01983f9142335098`.

## Live paths

| Control/path | Observed live destination or effect | Result |
| --- | --- | --- |
| cluster cards | `/resources?clusters=demo-server`, `/resources?clusters=management-server`, `/resources?clusters=game-server` | real destinations |
| W2 issue rows | `/issues?clusters=demo-server` | real destination |
| W3 sync title/empty action | `/deploy?clusters=demo-server&section=repositories`; visible `열기` action | real destination |
| W4 activity title | `/timeline?clusters=demo-server` | real destination |
| W5 namespace pods title | `/resources?clusters=demo-server` | real destination |
| W6 critical title/empty action | `/resources?clusters=demo-server&resources.health=critical`; visible `열기` action | real destination |
| W7 cost title/retry | `/cost?clusters=demo-server`; visible `다시 시도` action | real destination/action |
| W8 five event rows | `/timeline?clusters=demo-server&event=<canonical-event-id>` | real per-event destinations |
| W4 activity retry | live button click re-issued the adapter request | action executes, but remains failed because the refresh window is invalid |

No Home empty-state control in the captured board points to a removed legacy route. The unresolved activity retry is not a dead button; it faithfully repeats a malformed frontend time-window request and therefore remains a product defect.

## Activity refresh sequence

1. A fresh navigation renders the activity chart from the now-healthy 2026 backend contract.
2. The client `useServerRefreshScheduler`, following the server-provided 30-second cadence, increments `boardRefreshRevision` from `0` to `1`.
3. `useHomeBoardData.ts` uses that counter as the reference epoch, producing an invalid activity window.
4. The widget changes to `사용할 수 없음`; retry repeats the invalid window.

Evidence: `home-live-333c65734-activity-initial.jpg` and `home-live-333c65734-activity-after-refresh.jpg`.

## Responsive measurements

| Evidence type | Viewport | document client/scroll | main client/scroll | Horizontal overflow |
| --- | ---: | ---: | ---: | ---: |
| same-SHA live | 1920 | 1920 / 1909 | 1665 / 1665 | 0 |
| pre-deploy candidate | 1280 | 1280 / 1269 | 1025 / 1025 | 0 |
| pre-deploy candidate | 1440 | 1440 / 1429 | 1185 / 1185 | 0 |

Only the 1920 row is claimed as deployed-digest evidence. The 1280 and 1440 rows remain useful pre-deploy checks but do not satisfy same-SHA completion evidence. G4 Home therefore remains partial.
