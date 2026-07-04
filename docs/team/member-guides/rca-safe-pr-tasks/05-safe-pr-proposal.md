# 05. Safe PR Proposal

## 목표

RCA 결과를 실제 GitHub write로 바로 연결하지 않고, 먼저 안전한 PR 제안 payload로 고정한다.

## 먼저 읽을 파일

- `src/domains/scm`
- `src/services/gitops/scm-worker/app.py`
- `src/packages/contracts/event_bus/bodies/`
- [04. RCA Completed Event](04-rca-completed-event.md)

## 수정 후보

- `src/domains/scm/models.py`
- `src/domains/scm/events.py`
- `src/packages/contracts/event_bus/bodies/`
- `src/services/ai/rca-worker/app.py`
- `tests/test_rca_evidence.py`
- SCM worker 테스트

## 선형 절차

1. `RcaCompletedBody`를 입력으로 받는 Safe PR 정책 함수를 만든다.
2. `recommended_fix`가 없거나 confidence가 낮으면 PR 제안을 만들지 않는다.
3. 현재 `SafePrRequestedBody`가 가진 필드를 확인한다.
   - `title`
   - `body`
   - `provider`
   - `workspace_id`
   - `repository_id`
   - `binding_id`
   - `application_id`
   - `workflow_run_id`
   - `environment`
   - `manifest_path`
   - `next_alert`
4. patch/file change가 필요하면 현재 구조의 `SafePrPatchPreparedBody`를 먼저 사용한다.
5. branch name, file changes를 `SafePrRequestedBody`에 직접 넣고 싶으면 계약 변경 PR로 분리한다.
6. `safe_pr.requested`는 요청이고, `safe_pr.created`는 실제 provider write 완료라는 차이를 문서화한다.
7. title/body/provider shape 검증 테스트를 추가한다.

## 예시 request

```json
{
  "title": "KubeHeal RCA fix proposal",
  "body": "RCA evidence indicates crash loop in checkout deployment.",
  "provider": "github",
  "workspace_id": "workspace-1",
  "repository_id": "default-repository",
  "manifest_path": "deployments/checkout.yaml"
}
```

## 검증

```bash
uv run pytest tests/test_rca_evidence.py tests/test_gitops_diffing.py
uv run ruff check src tests
```

관련 SCM 테스트가 있으면 함께 실행한다.

## 완료 기준

- RCA result에서 proposal을 만들 수 있다.
- no recommended fix 또는 insufficient 상태에서는 PR 제안이 나오지 않는다.
- proposal payload에 provider token이 없다.
- `safe_pr.requested`와 `safe_pr.created` 의미가 분리되어 있다.
- patch/file change 필드가 필요하면 별도 계약 변경으로 추적되어 있다.

## 다음 작업

[06. Guarded GitHub PR Adapter](06-guarded-github-pr-adapter.md)
