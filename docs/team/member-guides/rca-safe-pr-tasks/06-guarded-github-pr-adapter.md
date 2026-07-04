# 06. Guarded GitHub PR Adapter

## 목표

Fake GitHub adapter를 먼저 만들고, 실제 PR 생성은 feature flag와 token reference 검증 뒤에서만 실행한다.

## 먼저 읽을 파일

- `src/services/gitops/scm-worker/app.py`
- `src/domains/scm`
- `src/packages/contracts/auth.py`
- `docs/team/member-guides/gateway-auth.md`의 Token Broker 관련 부분
- [05. Safe PR Proposal](05-safe-pr-proposal.md)

## 수정 후보

- `src/domains/scm/repository.py`
- `src/services/gitops/scm-worker/app.py`
- `src/packages/contracts/scm/`
- `tests/test_repo_gateway_worker.py`
- `tests/test_webhook_signature.py`가 아니라 SCM worker 관련 테스트

## 선형 절차

1. `PullRequestClient` Protocol을 정의한다.
2. `FakePullRequestClient`를 먼저 구현한다.
3. 실제 client skeleton은 만들 수 있지만 기본 실행 경로에 넣지 않는다.
4. `SAFE_PR_WRITE_ENABLED` feature flag를 둔다.
5. feature flag off에서는 provider write 없이 skipped/proposal-only 결과를 남긴다.
6. 실제 write 경로는 token 원문이 아니라 credential/token reference를 받게 한다.
7. PR 생성 결과 event에는 PR URL, branch, commit SHA 같은 reference만 남긴다.
8. 같은 proposal 재처리 시 중복 PR이 생기지 않도록 idempotency key를 둔다.
9. feature-flag-off, fake write success, 권한 실패 테스트를 추가한다.

## 예시 인터페이스

```python
class PullRequestClient(Protocol):
    async def create_pull_request(self, proposal: SafePrProposal) -> PullRequestResult: ...
```

## 검증

```bash
uv run pytest tests/test_repo_gateway_worker.py
uv run ruff check src tests
```

테스트 파일명이 다르면 SCM worker의 safe PR 생성 테스트를 실행한다.

## 완료 기준

- 기본 설정에서 실제 GitHub write가 일어나지 않는다.
- fake adapter로 `safe_pr.created` 흐름을 테스트할 수 있다.
- feature flag off가 fail-closed로 검증된다.
- PAT, provider token, kubeconfig가 event/log/audit에 남지 않는다.

## 다음 작업

[07. Audit Timeline Projection](07-audit-timeline-projection.md)
