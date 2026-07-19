# Home surface numeric cross-check — live `333c65734`

Checked at 2026-07-19 23:24–23:30 KST. Source, deployed frontend bundle and live evidence digest are `333c657345271e5d924fbb9e01983f9142335098`. Dev Gate `29689900163` and Dev Deploy `29690120559` succeeded.

## Digest and backend health

| Evidence | Observation | Result |
| --- | --- | --- |
| Live bundle | `index-BKNoNEP4.js` contains full SHA `333c657345271e5d924fbb9e01983f9142335098` | match |
| `/api/healthz` | `status=ok`, `service=api-gateway` | pass |
| `/api/readyz` | `status=ready` | pass |
| `/api/activity/overview` | 2026 window, 5-minute bucket, 12 buckets, HTTP 200 | backend pass |

## Summary, card and fleet API cross-check

The selected live scope is `demo-server`. The browser values are from `home-live-333c65734-1920.jpg`; the API values were read immediately afterward from the same deployed SHA.

| Fact | Live summary/card | `/api/fleet/summary` | Result |
| --- | ---: | ---: | --- |
| Visible clusters | summary `1`, three cards rendered | total clusters `3` | scope label is selected-only; cards are fleet-wide |
| Fleet health | cards critical `1`, critical `2`, normal `0` | healthy `0`, warning `1`, critical `2` | **mismatch**: game card says normal while API says critical; management warning is rendered as critical count |
| demo nodes | `0/0` | `2/3` | **mismatch** |
| demo pods | `21` | running/total `11/36` | **mismatch** |
| management nodes | `0/0` | `2/2` | **mismatch** |
| management pods | `66` | running/total `728/793` | **mismatch** |
| game nodes | `0/0` | `3/4` | **mismatch** |
| game pods | `23` | running/total `13/13` | **mismatch** |
| CPU/MEM | all `—` | all `null` | honest unavailable |
| Open incidents | cards `1 + 2 + 0` | total `3` | match |

The rendered cards currently use per-cluster legacy overview/workload projections. The new fleet contract is present and healthy but unused by the Home surface. G4 requires one numeric source, so this is a product mismatch rather than acceptable fixture variance.

## W2–W8 live board

| Widget | Live observation | Cross-check result |
| --- | --- | --- |
| W2 issues | two `Pod readiness failure` rows for demo-server | real rows; count agrees with rendered list |
| W3 sync | `데이터 없음`, real `열기` action | no fabricated count |
| W4 activity | initial chart renders; after first 30-second refresh becomes `사용할 수 없음` | **frontend refresh failure** despite backend 200 |
| W5 namespace pods | total `36`, `yaml-demo 32`, `target 4` | `32 + 4 = 36`, match |
| W6 critical resource kinds | `일부 데이터` and empty state | honest partial, exact count unavailable |
| W7 cost | `사용할 수 없음` with retry | honest unavailable |
| W8 recent changes | five Kubernetes event rows | requested top-five presentation is present |
| Bell badge | count `0`; zero badge is hidden | zero-state presentation is consistent |

The activity failure is deterministic: initial capture `home-live-333c65734-activity-initial.jpg` shows the chart; `home-live-333c65734-activity-after-refresh.jpg` shows the unavailable state after one 30-second scheduler cycle. `useHomeBoardData.ts` passes `boardRefreshRevision=1` as epoch-ms instead of using current time.

## Verdict

Home remains **partial**. The backend activity regression is resolved and deployed, but fleet/card numeric drift and the 30-second activity refresh regression prevent G4 completion. Demo/live screenshots also use different viewports, so they are not claimed as the strengthened same-viewport side-by-side completion pack.
