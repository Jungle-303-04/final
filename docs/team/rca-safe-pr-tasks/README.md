# RCA / Safe PR 선형 작업 가이드

이 디렉터리는 `ummfieg` 작업자가 긴 가이드 문서를 다시 해석하지 않고, 한 페이지씩 끝내며 진행할 수 있게 만든 작업 목록이다.

원본 설계 문서:

- [RCA / Safe PR 멤버 가이드](../member-guides/rca-safe-pr.md)
- [팀 간 구현 연결과 테스트 가이드](../cross-role-implementation-test-guide.md)

## 사용 방법

1. 아래 순서대로 한 파일씩 연다.
2. 현재 파일의 `완료 기준`을 만족할 때까지 다음 파일로 넘어가지 않는다.
3. 새 event/body/schema를 만들면 `src/packages/contracts/event_bus`, `docs/events.md`, 테스트를 같은 PR에 넣는다.
4. 외부 GitHub write는 항상 feature flag, policy, token reference 뒤에 둔다.
5. 각 PR은 가능하면 이 표의 한 줄만 끝낸다.

## 전체 흐름

```text
cluster.evidence.received
  -> evidence.built
  -> evidence.bundle.built
  -> rca.candidates.planned
  -> rca.candidates.evaluated
  -> rca.completed 또는 rca.action_required 또는 rca.analysis_blocked
  -> command.requested 또는 safe_pr.requested
  -> safe_pr.patch_prepared 또는 safe_pr.failed
  -> safe_pr.ready_for_creation 또는 safe_pr.failed
  -> safe_pr.created 또는 safe_pr.failed
  -> audit timeline
```

## 작업 순서

| 순서 | 파일 | 끝 상태 |
| --- | --- | --- |
| 0 | [현재 코드 지도와 테스트 기준](00-current-code-map.md) | 실제 body/worker/test 위치를 확인함 |
| 1 | [Evidence 입력 계약](01-evidence-input-contract.md) | RCA가 받는 evidence shape와 거부 기준이 고정됨 |
| 2 | [Evidence Builder](02-evidence-builder.md) | raw evidence가 RCA용 Evidence DTO로 정규화됨 |
| 3 | [RCA Result와 Deterministic Analyzer](03-rca-result-deterministic-analyzer.md) | AI 없이도 deterministic RCA 결과를 만들 수 있음 |
| 4 | [RCA Completed Event](04-rca-completed-event.md) | `rca.completed`와 `rca.action_required`/`rca.analysis_blocked` 상태가 event로 표현됨 |
| 5 | [Safe PR Proposal](05-safe-pr-proposal.md) | 실제 PR write 전 proposal payload가 고정됨 |
| 6 | [Guarded GitHub PR Adapter](06-guarded-github-pr-adapter.md) | `GithubScmProvider`와 feature-flag-off fail-closed가 있음 |
| 7 | [Audit Timeline Projection](07-audit-timeline-projection.md) | command/RCA/PR event가 correlation timeline에 남음 |
| 8 | [Chain Test](08-rca-safe-pr-chain-test.md) | evidence 입력부터 GitHub provider transport, audit까지 한 줄로 검증됨 |

## 하드닝 후속 작업

8번 이후에는 [production-readiness](../../production-readiness.md)의 release gate를 따른다.

- Safe PR은 실제 manifest patch 또는 rollback patch를 포함해야 한다.
- AI fallback은 실제 tool pipeline에 연결하거나 미검증 claim에서 제거한다.
- AI tool은 input/output schema, authorization, cost guardrail, malformed reply 테스트를 가진다.
- RCA는 profile별 expected label과 top-k hit rate를 기록한다.

## 공통 금지 사항

- raw token, PAT, kubeconfig, provider response 전체를 event, response, log, audit에 넣지 않는다.
- RCA worker에서 직접 GitHub PR을 만들지 않는다.
- evidence reference 없이 높은 confidence의 root cause를 만들지 않는다.
- envelope의 `correlation_id`를 새로 갈아끼우지 않는다. body에 `correlation_id` 필드를 추가하려면 계약 변경으로 다룬다.
