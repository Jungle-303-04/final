# 08. RCA / Safe PR Chain Test

## 목표

evidence 입력에서 RCA 결과, Safe PR 제안, fake PR 생성, audit append까지 한 줄로 검증한다.

이 작업은 앞선 1-7번 작업이 실제로 연결되는지 확인하는 엔드 기준 작업이다.

## 먼저 읽을 파일

- `tests/test_rca_evidence.py`
- `tests/test_event_golden_path.py`
- `tests/test_projection.py`
- `src/services/ai/rca-worker/app.py`
- `src/services/gitops/scm-worker/app.py`
- `src/services/projection/audit-worker/app.py`

## 수정 후보

- `tests/test_rca_evidence.py`
- `tests/test_event_golden_path.py`
- `tests/test_projection.py`
- 필요한 경우 worker fixture

## 선형 절차

1. fake `cluster.evidence.received` payload를 준비한다.
2. RCA worker가 `evidence.built` 또는 내부 정규화 결과를 만들게 한다.
3. RCA worker가 `rca.completed`를 발행하는지 확인한다.
4. Safe PR 정책이 `safe_pr.requested`를 만드는지 확인한다.
5. SCM fake adapter가 `safe_pr.created`를 만드는지 확인한다.
6. audit worker가 각 event를 같은 `correlation_id`로 저장하는지 확인한다.
7. feature flag off 테스트에서 실제 GitHub write가 없음을 확인한다.
8. insufficient evidence 테스트에서 PR 제안이 나오지 않음을 확인한다.

## 예시 시나리오

```text
Given pod evidence with CrashLoopBackOff
When RCA/Safe PR chain runs with fake PR adapter
Then rca.completed is emitted
And safe_pr.requested is emitted
And safe_pr.created is emitted by fake adapter
And audit timeline has all rows with the same correlation_id
```

## 검증

```bash
uv run pytest tests/test_rca_evidence.py tests/test_event_golden_path.py tests/test_projection.py
uv run ruff check src tests
```

최종 통합 전에는 전체 테스트를 실행한다.

```bash
make test
```

## 완료 기준

- evidence에서 fake PR 생성까지 외부 GitHub 없이 재현된다.
- insufficient evidence는 RCA completed/safe PR success처럼 보이지 않는다.
- feature flag off에서 provider write가 일어나지 않는다.
- audit timeline으로 사용자가 “왜 이 PR이 제안됐는가”를 추적할 수 있다.

## 다음 작업

RCA / Safe PR 선형 작업은 여기서 끝난다. 이후에는 AI fallback, 추가 장애 profile, 실제 GitHub adapter hardening을 별도 작업 페이지로 추가한다.
