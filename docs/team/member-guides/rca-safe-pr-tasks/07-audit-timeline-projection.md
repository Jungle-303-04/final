# 07. Audit Timeline Projection

## 목표

command, RCA, Safe PR 상태 변화를 `correlation_id` 기준 timeline으로 조회할 수 있게 audit projection을 보강한다.

## 먼저 읽을 파일

- `src/services/projection/audit-worker/app.py`
- `src/domains/audit`
- `src/packages/contracts/event_bus/bodies/`
- [06. Guarded GitHub PR Adapter](06-guarded-github-pr-adapter.md)

## 수정 후보

- `src/services/projection/audit-worker/app.py`
- `src/domains/audit/models.py`
- `src/domains/audit/repository.py`
- `tests/test_projection.py`
- `tests/test_rca_evidence.py`

## 선형 절차

1. audit worker가 어떤 event를 구독하는지 확인한다.
2. `rca.completed`, `safe_pr.requested`, `safe_pr.created`, `safe_pr.failed`가 timeline에 남는지 확인한다.
3. 저장 row에는 최소한 아래 필드를 둔다.
   - `event_id`
   - `subject`
   - `source`
   - `correlation_id`
   - `causation_id`
   - `created_at`
   - `message`
   - `safe_payload`
4. payload 전체 저장 대신 사람이 읽을 수 있는 subset과 redaction을 적용한다.
5. duplicate event id가 들어와도 timeline이 중복 오염되지 않게 한다.
6. correlation별 조회 테스트를 추가한다.

## 예시 message

```text
RCA completed: pod restart loop detected
Safe PR requested: kubeheal/corr-123-rca-fix
Safe PR failed: token scope denied
```

## 검증

```bash
uv run pytest tests/test_projection.py tests/test_rca_evidence.py
uv run ruff check src tests
```

## 완료 기준

- command/RCA/PR event가 같은 `correlation_id` timeline으로 묶인다.
- audit payload에 token, password, kubeconfig가 없다.
- audit 실패가 원본 workflow를 과하게 막지 않는다.
- duplicate event 처리가 테스트로 고정되어 있다.

## 다음 작업

[08. RCA/Safe PR Chain Test](08-rca-safe-pr-chain-test.md)
