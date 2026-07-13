# 06. Guarded GitHub PR Adapter

## 목표

`safe-pr-worker`와 `ai-diff-worker`가 `safe_pr.requested`를 `safe_pr.ready_for_creation`까지
검증해 넘기고, `scm-worker`가 `GithubScmProvider`로 실제 GitHub branch, commit,
PR 생성을 처리하게 한다. 외부 호출은 token reference, repo allowlist, provider 설정
검증 뒤에만 실행한다.

## 먼저 읽을 파일

- `src/services/gitops/scm-worker/app.py`
- `src/services/gitops/safe-pr-worker/app.py`
- `src/services/ai/diff-worker/app.py`
- `src/domains/scm`
- `src/packages/contracts/auth.py`
- `docs/secrets.md`
- `docs/rca-production-onboarding/06-chanbin-permission-dashboard.md`
- [05. Safe PR Proposal](05-safe-pr-proposal.md)

## 수정 후보

- `src/domains/scm/repository.py`
- `src/services/gitops/scm-worker/app.py`
- `src/services/gitops/safe-pr-worker/app.py`
- `src/services/ai/diff-worker/app.py`
- `src/packages/contracts/scm/`
- `tests/test_repo_gateway_worker.py`
- `tests/test_webhook_signature.py`가 아니라 SCM worker 관련 테스트

## 선형 절차

1. `safe_pr.requested -> safe_pr.patch_prepared -> safe_pr.ready_for_creation` 게이트가 통과해야 실제 write가 가능하다는 것을 먼저 확인한다.
2. `PullRequestClient` Protocol을 정의한다.
3. 현재 구현 기준에서는 `packages.contracts.scm.provider.ScmProvider`와
   `GithubScmProvider.create_pull_request()`를 먼저 확인한다.
4. `SCM_PROVIDER=github`, `SCM_REPO`, `GITHUB_TOKEN_REF` 또는 `GITHUB_TOKEN` 설정을 정한다.
5. provider 이름이 registry에 없으면 worker가 fail-fast해야 한다.
6. token/repo가 없으면 worker 부팅 실패가 아니라 요청별 `safe_pr.failed`로 남긴다.
7. 실제 write 경로는 token 원문이 아니라 `TokenVaultPort`/`SecretRef`를 통해 읽는다.
8. PR 생성 결과 event에는 PR URL, provider, mode 같은 reference만 남긴다.
9. 같은 proposal 재처리 시 branch/contents/PR 422를 멱등 성공으로 처리한다.
10. missing credential, unsafe path, provider mismatch, injected transport success 테스트를 추가한다.

## 예시 인터페이스

```python
class PullRequestClient(Protocol):
    async def create_pull_request(self, proposal: SafePrProposal) -> PullRequestResult: ...
```

## 검증

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_repo_gateway_worker.py -q
PYTHONPATH=src .venv/bin/ruff check src tests
```

테스트 파일명이 다르면 SCM worker의 safe PR 생성 테스트를 실행한다.

## 완료 기준

- 기본 설정에서 실제 GitHub write가 일어나지 않는다.
- `GithubScmProvider`는 주입 가능한 HTTP transport로 `safe_pr.created` 흐름을 검증할 수 있다.
- 자격 증명 누락, provider mismatch, 안전하지 않은 path가 `safe_pr.failed`로 검증된다.
- PAT, provider token, kubeconfig가 event/log/audit에 남지 않는다.

## 다음 작업

[07. Audit Timeline Projection](07-audit-timeline-projection.md)
