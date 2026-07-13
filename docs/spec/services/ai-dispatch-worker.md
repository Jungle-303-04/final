---
source_commit: 9af57b639
status: synced
---

# dispatch-worker — 선택된 복구 조치 → 명령/Safe PR 디스패치

> 소스: `src/services/ai/dispatch-worker/app.py` · 테스트: `tests/`

## 책임 (Responsibility)

- `recovery.action_selected` 를 받아 [`RecoveryDispatcher`](ai-agent.md#recoverydispatchpy--recoverydispatcher)로
  후보의 `route` 에 따라 명령 요청(`command.requested`), Safe PR 요청(`safe_pr.requested`),
  또는 사람 조치 요청(`rca.action_required`)을 발행한다.
- Safe PR action이면 ctx의 DB를 `DatabaseGitOpsAuthorityReadPort`로 감싸 dispatcher에
  주입한다. DB 쓰기는 없고 실제 PR 생성은 scm-worker의 몫이다.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains.rca.events` | [../../domains/rca.md](../domains/rca.md) | `RecoveryActionSelectedBody` |
| import | `packages.runtime.app` | [../../packages/runtime.md](../packages/runtime.md) | `App` |
| import | `services.ai.agent.recovery.dispatch` | [agent.md](ai-agent.md#recoverydispatchpy--recoverydispatcher) | `RecoveryDispatcher` |
| (간접) | `domains.command` | [../../domains/command.md](../domains/command.md) | `CommandRequestedBody`, 명령 카탈로그 매핑 |
| (간접) | `domains.scm.events` | [../../domains/scm.md](../domains/scm.md) | `SafePrRequestedBody`, `SafePrFilePatch` |
| (간접) | `domains.gitops.events` | [../../domains/gitops.md](../domains/gitops.md) | `Diff` 값 객체 |
| (간접) | `packages.config.constants` | [../../packages/config.md](../packages/config.md) | `GitHub.PROVIDER`, `Sandbox.NAMESPACE/RISK_TAG`, `Target.DEFAULT_CLUSTER_ID` |

## 공개 인터페이스 (Public API)

| 심볼 | 앵커 | 설명 |
|---|---|---|
| `app` | `src/services/ai/dispatch-worker/app.py :: app` | `App("dispatch-worker")` |
| `dispatcher` | `src/services/ai/dispatch-worker/app.py :: dispatcher` | `RecoveryDispatcher()` |
| `on_recovery_action_selected(evt, ctx)` | `src/services/ai/dispatch-worker/app.py :: on_recovery_action_selected` | 권위 read port를 주입하는 유일한 핸들러, body 1건 yield |

## 이벤트 (Events)

### 구독 (Consumes)

| 이벤트 | 라우팅 키 | body |
|---|---|---|
| `RecoveryActionSelectedBody` | `recovery.action_selected` | `plan: RecoveryPlan, selected: RecoveryActionCandidate, selected_by, auto_selected, reason, workspace_id` |

### 발행 (Publishes)

`selected.route` 별 정확히 1건:

| route | 이벤트 | 라우팅 키 | 비고 |
|---|---|---|---|
| `auto` | `CommandRequestedBody` | `command.requested` | 카탈로그 매핑 실패 시 대신 `rca.action_required`(reason=`"자동 실행 대상 command action으로 변환할 수 없습니다.: {action_type}"`) |
| `draft_pr` | `SafePrRequestedBody(title=f"{selected.title}: {resource_name}", body=요약/조치/대상/위험도/검증/롤백 텍스트, provider="github", patches)` | `safe_pr.requested` | 실제 action 6종은 patch 시점 권위 조회 후 `GitOpsScalarPatch` 생성. `gitops_recovery_review`만 `.gitops/recovery/*.md` 검토 문서를 만든다. |
| `approval_required` | `RcaActionRequiredBody(reason=f"승인 필요: {title}")` | `rca.action_required` | |
| `forbidden` | `RcaActionRequiredBody(reason=f"자동 조치 차단: {title}")` | `rca.action_required` | |
| 미지 route | `RcaActionRequiredBody(reason=f"선택된 복구 후보의 route를 처리할 수 없습니다.: {route}")` | `rca.action_required` | |

## 동작 (Behavior)

1. `DatabaseGitOpsAuthorityReadPort(ctx.db)`를 주입하고
   `yield await dispatcher.dispatch_body(evt, authority=..., correlation_id=...)` — 분기 로직 전체는
   [agent.md의 RecoveryDispatcher 절](ai-agent.md#recoverydispatchpy--recoverydispatcher) 참조.
2. `command.requested` 구성 요점: `cluster_id = plan.target["cluster_id"] or "default-target-cluster"`,
   `namespace = draft.namespace or "sandbox"`, `diff.status="recovery_action"`,
   `diff.risk=RiskLevel.SANDBOX_ONLY`, `diff.basis={"source": "rca_recovery", plan_id, action_id, root_cause}`,
   `actor={"plan_id", "action_id", "auto_selected"}`, `environment` 기본 `"sandbox"`.
   `rollout_restart` 와 `deployment_scale` 은 조치 대상이 Pod/ReplicaSet이면 이름 패턴에서 소유 Deployment를 추정해
   `diff.resource="deployment/{deployment}"` 와 payload `name` 에 사용한다. `draft.params` 의
   `deployment`/`deployment_name`/`workload_name`/`target_deployment` 값이 있으면 이를 우선한다.

## 불변식·오류 (Invariants & Errors)

- Safe PR 은 **구체적 파일 패치가 있을 때만** 요청된다(빈 patch 차단 — scm 게이트 이전 1차 방어).
- Safe PR 실제 patch는 이벤트의 manifest/patch content를 신뢰하지 않는다. 현재 workflow,
  active binding, repository, 승인 snapshot/provenance가 모두 target과 일치해야 한다.
- 권위 부재·불일치·미지원 field는 `rca.action_required`로 fail-closed한다. 일반 action을
  `.md` 문서 PR로 대체하지 않는다.
- auto 명령은 명령 카탈로그(`command_action_for_recovery`)에 등록된 액션으로만 변환된다.
- 어떤 입력이든 발행 이벤트는 정확히 1건 — 실패 경로도 이벤트로 수렴.

## 설정 (Settings)

서비스 고유 환경변수 없음. 공통 워커 런타임 설정은
[evidence-worker의 표](ai-evidence-worker.md#설정-settings)와 동일
(`SERVICE_NAME=dispatch-worker`).
