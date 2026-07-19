# Home surface numeric cross-check — P0 candidate

Product code digest: `ed2de67b1` (with its ancestors). Source was the live API at `https://k8s.woonyong.org` on 2026-07-19 KST.

| Fact | Summary chip | Card/widget detail | API observation | Result |
| --- | ---: | ---: | ---: | --- |
| Clusters | 3 | 3 cluster cards | `/api/clusters?limit=100` = 3 | match |
| Nodes ready/total | 0/0 | 0/0 + 0/0 + 0/0 | three cluster summaries = 0/0 | match |
| Pods | 108 | 21 + 64 + 23 | cluster summaries = 21, 64, 23 | match |
| OutOfSync | 0 | sync widget has no rows | GitOps overview = 0 OutOfSync | match |
| Critical | `—` | card facts = 1 + 1 + 0; W6 reports partial data | resource contract reports incomplete total | honest unknown, not a false exact total |
| Namespace pods | — | W5 total 707; 660 + 29 + 10 + 8 | inventory projection = 707 | match |

The demo values are frozen fixture values (clusters 2, nodes 6, pods 78) and therefore are not copied into the product. The comparison criterion is that every product representation tells the same live fact; unavailable or incomplete contracts render `—`/partial instead of fabricated numbers.
