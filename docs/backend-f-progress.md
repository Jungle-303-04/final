---
title: 백엔드 F 진행 현황
status: active-progress
date: 2026-07-13
governing: docs/f-coordination-plan.md · docs/backend-f-workqueue.md
---

# 백엔드 F 진행 현황

현재 상태: **앵커 45건**

## 역사적 Delta-green baseline (BQ-001~003)

이 기준은 BQ-001~003 수행 당시의 회귀 허용 목록이며 [D-012]의 baseline 공집합 전환으로
만료됐다. 신규 작업의 완료 판정에 재사용하지 않는다.

- 측정 기준 commit: `e3c1de4a8eeb49a4630bab816d2bbd18444c80a5`
- pytest: `uv run python -m pytest -q` → `6 failed, 1630 passed, 3 skipped`
- Ruff lint: `uv run ruff check src scripts tests` → PASS
- Ruff format: `uv run ruff format --check src scripts tests` → 기존 대상 2개
- import-linter: `PYTHONPATH=src uv run lint-imports --config .importlinter` → 기존 위반 계약 1개
- compileall: `uv run python -m compileall -q src scripts` → PASS
- manifest: `bash scripts/manifest-check.sh` → PASS (management 68개, target 20개)
- 판정 규칙: 완료 후 전 게이트 실패 집합이 아래 목록과 동일하거나 축소돼야 한다.

### 허용된 기존 실패 node

- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[crashloop]` — RCA 작업열
- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[imagepull]` — RCA 작업열
- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[oom]` — RCA 작업열
- `tests/test_incident_symptom_derivation.py::test_fault_snapshot_derives_catalog_symptom_and_plans_candidates[sched-fail]` — RCA 작업열
- `tests/test_rca_evidence.py::test_crashloop_flow_auto_selects_restart_and_queues_command` — RCA 작업열
- `tests/test_rca_scenario_cli.py::test_validate_checks_scenario_adapter_cause_evidence_and_recovery_contracts` — RCA 작업열

### 허용된 기존 Ruff format 대상

- `tests/test_bruno_collection.py` — Bruno/API 계약 작업열
- `tests/test_rca_rule_catalog.py` — RCA 작업열

### 허용된 기존 import-linter 위반 계약

- `domains.rca.router -> services (l.77)` — RCA 작업열

### Manifest baseline

- `scripts/manifest-check.sh` PASS — 배포 manifest 작업열, 실패 0건

## 현재 full-green baseline

- 측정 기준: `origin/dev@a1e37d34308192a6d5c363983a370209ab4813be`를 합친 S4 lane
- Ruff lint/format: PASS
- import-linter: 8 kept, 0 broken
- pytest: `1901 passed, 3 skipped`
- manifest: management 69, target 20
- 판정 규칙: 실패 허용 목록은 공집합이다. 신규 실패가 있으면 착륙하지 않는다.

## 완료 앵커

### BQ-001

- 완료 후 측정: `6 failed, 1626 passed, 3 skipped`
- delta-green 판정: baseline 실패 node 6개 동일, 신규 실패 0건
- `command_id` non-null: recorded approval이 필요하지 않은 command 제출 경로
- `command_id` null: recorded approval이 필요한 경로. 제출 시점에는 worker가 확정하는
  `approval_decided_by`와 `approval_expires_at`가 없어 정확한 ID를 파생할 수 없다.

계약 완성: AcceptedResponse.command_id receipt (4e6216052f4505fa247d9ed8be033477447696d7) [delta-green]

### BQ-002

- canonical 착륙 commit: `1080363a735e42a4cf542a11400a32ddaa0e9437`
- 완료 후 측정: `6 failed, 1630 passed, 3 skipped`
- delta-green 판정: 상단 RCA pytest 6개, Ruff format 2파일, import-linter 1계약과
  실패 집합이 동일하며 신규 실패 0건
- 프론트 인계: `ix_audit_log_correlation_id_created_at`는 BQ-004 correlation 타임라인
  조회의 선행 조건이다. `causation_id`는 nullable이므로 기존 행은 `null`이다.
- API 영향: 신규 route가 없어 Bruno 변경 없음
- 후속 검증: 실 PostgreSQL online upgrade/downgrade/upgrade는 Alembic revision 전환
  작업의 필수 게이트로 이관한다. 현재 스키마 부트스트랩은 `create_all` 경로를 사용한다.

계약 완성: audit_log.causation_id + ix_audit_log_correlation_id_created_at (1080363a735e42a4cf542a11400a32ddaa0e9437) [delta-green]

### BQ-003

- canonical 착륙 commit: `44f35234e7dcd9c8d221242d7688556e2d30e819`
- 완료 후 측정: `6 failed, 1640 passed, 3 skipped`
- delta-green 판정: 상단 RCA pytest 6개, Ruff format 2파일, import-linter 1계약과
  실패 집합이 동일하며 신규 실패 0건
- gateway 계약 lock: BQ-003을 `completed`로 전환해 해제
- route: `GET /api/rca/bundles/{correlation_id}`
- JSON Schema: `docs/spec/remediation-bundle.schema.json`
- Bruno: `docs/api/05-rca-dashboard/13-remediation-bundle.bru`

#### 프론트 인계 — RemediationBundleResponse 3계층

- `meta`
  - `correlation_id: string`
  - `incident_id: string | null`
  - `cluster_id: string`
  - `workspace_id: string`
  - `created_at: string | null`
- `diagnosis`
  - `root_cause: string`
  - `confidence: number | null`
  - `supporting_evidence: string[]`
  - `missing_evidence: string[]`
  - `supporting_evidence_refs: RcaEvidenceRefItem[]`
  - `missing_evidence_checks: RcaMissingCheckItem[]`
  - `selected_candidate_id: string | null`
- `RcaEvidenceRefItem`
  - 필수: `source: string`, `name: string`
  - 선택: `check_id`, `summary`, `query`, `evidence_ref`, `source_version`, `collector`,
    `collector_version`, `query_version`, `collected_at`, `evidence_key`, `source_id`,
    `agent_id`, `window_start`는 `string | null`
  - 선택: `schema_version: integer | null`
- `RcaMissingCheckItem`
  - `check_id: string`
  - `source: string | null`
  - `status: string | null`
  - `reason: string | null`
- `remediation: null | object`
  - `status: string`
  - `selected_action_id: string | null`
  - `selected_by: string | null`
  - `candidates: RemediationBundleRecoveryCandidate[]`
  - `evidence_ref: string`
- `RemediationBundleRecoveryCandidate`
  - `action_id: string`
  - `title: string`
  - `description: string`
  - `route: string`
  - `rank: integer`
  - `score: number`
  - `risk_level: string`
  - `blast_radius: string`
  - `approval_required: boolean`
  - `prerequisites: string[]`
  - `validation_checks: string[]`
  - `rollback_plan: string`
  - `evidence_refs: string[]`
  - `draft.action_type: string`
  - `draft.namespace: string`

  - `draft.resource_kind: string`
  - `draft.resource_name: string`
  - `draft.reason: string`
  - `draft.risk_level: string`
  - `draft.dry_run: boolean`
  - `draft.source_evidence: string[]`
  - `draft.params: JSON object`

`diagnosis.selected_candidate_id`는 RCA 진단 후보 선택이고,
`remediation.selected_action_id`는 복구 실행 후보 선택이다. 서로 다른 계층이므로 병합하거나
대체하지 않는다. recovery plan이 생성되지 않은 정상 상태에서는 `remediation`이 `null`이며
Bundle route는 200을 반환한다.

#### 알려진 결합 및 후속 전달

`RemediationBundleRecoveryCandidate`의 shape는
`recovery_plans.payload.candidates`를 그대로 투영한다. 이 payload 구조는 RCA 작업열이 쓰므로
가인 님이 candidate payload 구조를 바꾸면 프론트에 노출된 Bundle 계약의 breaking change가
된다. 후속 전달 항목: 가인 님에게 "recovery candidate payload 구조 변경은 BQ-003 Bundle
계약의 breaking change"임을 전달한다. 이 앵커에서는 RCA 작업열 코드를 변경하지 않는다.

계약 완성: RCA_BUNDLE_PATH + RemediationBundleResponse (44f35234e7dcd9c8d221242d7688556e2d30e819) [delta-green]

### H1 — 이벤트 테넌시·감사 타임라인·변경 상관

- canonical merge: `17ac2b7a32413579f2570218a99bf50f34d162c3`
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1701 passed, 3 skipped`
- 실측 계약: `docs/api/05-rca-dashboard/14-audit-timeline.bru`,
  `docs/api/05-rca-dashboard/15-recent-changes.bru`
- C 증거 해시 정합: [D-020]에 기록된 `7d74d765c`는 이전 rebase의 동등 커밋이며
  최신 `origin/dev` 재배치 후 실물은 `66cbe8dec`다. `7d74d765c`는 canonical ancestor가
  아니고 `66cbe8dec`는 ancestor exit 0이므로 후자를 유효 증거로 사용한다.
- 프론트 인계: 감사 타임라인은 subject/source/created_at/causation_id와 allowlist payload
  요약을 keyset cursor로 반환한다. 최근 변경은 incident event-time 이전의 성공 배포만
  반환하며 image before/after, commit, workflow run, 허용된 repository/PR 참조를 포함한다.

계약 완성: EventEnvelope.workspace_id + audit_log.workspace_id (625c382941f81b28d95bc4cde4e3c47155ef1eec) [green]

계약 완성: AUDIT_TIMELINE_PATH + AuditTimelineResponse (66cbe8dec7cb478f5b0774bb5e7bbaab5f616894) [green]

계약 완성: RCA_RECENT_CHANGES_PATH + RecentChangeListResponse (81969f23e46cb40743af08ffbc1affe556bd5c5e) [green]

### H2 — in-process event bus

- canonical merge: `5f2393667ece3607e75674fcf8c9be9d9c1773b9`
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1708 passed, 3 skipped`
- 기존 NATS 기본 경로는 유지하고 명시적으로 bus를 주입한 단일 프로세스 실행만
  in-memory 구현을 사용한다. ack/nak, 지연 재배달, 구독 생명주기, 기본 App 경로를
  `tests/test_in_memory_event_bus.py`에서 재현한다.
- 신규 route·DB 변경이 없어 Bruno·migration 변경 없음.

계약 완성: InMemoryEventBus + App.run bus injection (b6fac1dd742f3c5c88fee1db87e3e081fb1bc794) [green]

### BQ-006

- canonical 착륙 commit: `8cd0b18e96f1266873d1632486472d0d22c18477`
- 판정 단일 원천: `packages.contracts.gitops.promotion_gate_from_command_result`
- 공개 필드: workflow run의 optional `promotion_gate` — completed/applied/failed resources/
  rollout ready 검사와 `eligible`을 구조화
- 전체 게이트: Ruff·format PASS, import-linter 2 kept/0 broken, pytest
  `1720 passed, 3 skipped`
- 실측: `docs/api/10-applications/06-list-runs.bru`가 구조와 eligible 계산을 검산

계약 완성: WorkflowRun.promotion_gate (8cd0b18e96f1266873d1632486472d0d22c18477) [green]

### BQ-016 — OSS 안전 프로파일과 단일 controller 조립

- canonical origin: `f0c3b4e42f29c4f011d4d70910b083f7acc031e0`
- 공개 기본값: in-process event bus, agent read-only/direct command off, remediation PR-only,
  production auto-merge 금지
- 조립: 발견된 40 entrypoint를 controller 38(worker 32, async 4, HTTP 2)과 agent 2에
  정확히 한 번 배정. NATS/in-process 모드의 service signature는 동일하다.
- 설치: `deploy/oss/kubeheal-oss.yaml`의 controller Deployment + PostgreSQL StatefulSet +
  agent DaemonSet 3컴포넌트. NATS/Redis 의존은 공개 프로파일에 없다.
- 실제 기동: PostgreSQL 16과 controller 조립 루트를 연결해 API/realtime gateway의
  `/healthz`, `/readyz` 4개 응답이 모두 HTTP 200이고 SIGINT 후 두 서버가 graceful
  shutdown 되는 것을 확인했다. macOS arm64에서 드러난 SQLAlchemy async `greenlet`
  marker 누락은 직접 런타임 의존성으로 고정했다.
- 실측: 실제 `make demo`가 `kind-cluster-ready` → `bad-rollout-observed` →
  `mock-rollback-pr-created` → `workload-normalized`를 완료하고 cluster를 정리했다.
  canonical RemediationBundle checksum은
  `a0b2b2857701655e9c09ef51ad9cdf5a0e04a87d26a17cad6861d4e0bee897c9`다.
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken, pytest
  `1735 passed, 3 skipped`.

계약 완성: OSS PR-only profile + ControllerRuntime + make demo (f0c3b4e42f29c4f011d4d70910b083f7acc031e0) [green]

### OSS Helm 설치 재검증 — 완료 판정 정정

- 코드 `7bb74d71fad1101b8818b07c1dfb6797f28141d5`는 로컬 Helm chart를 추가하고 fresh
  Kind에서 controller 1/1, PostgreSQL 1/1, agent 1/1 Ready를 실증했다. controller는
  PostgreSQL readiness를 기다린 뒤 관리자·self-agent를 bootstrap하며 공개 프로파일은
  NATS/Redis/MinIO 없이 in-process bus와 `DEV_AUTH_BYPASS=0`을 사용한다.
- 실제 `make demo`는 Helm install 이후 bad rollout과 정상화까지 종료 코드 0으로 끝났고,
  전체 게이트는 `1968 passed, 3 skipped`, import-linter 8 kept/0 broken이었다.
- 기존 완료 판정은 철회한다. 공개 OCI chart URL은 anonymous pull에서 403이고,
  현재 데모는 rollback PR 문서를 로컬에서 만들고 `kubectl set image`로 직접 정상화한다.
  동일 artifact의 공개 OCI 설치, 실제 safe-pr 여정, NATS/in-process 결과 동등성까지 남아 있다.
- 이 기록은 완료 앵커가 아니다. 외부 container registry namespace/package 권한이 확보되고 남은 제품 여정이
  실증된 뒤 canonical hash로 새 앵커를 기록한다.
- 로컬 Helm 설치 기반 canonical merge는 `d86117efc8d00c09e7f75ca01f2b51cb95465a7b`이며
  `origin/dev` ancestor exit 0을 확인했다.
- `82a7f29f29c9ce38aa5d8b196449f2e53182bd71`는 격리된 실제 NATS JetStream 컨테이너와
  in-process bus에 동일한 publish→NAK→redelivery→child publish→ACK 시나리오를 실행한다.
  payload·correlation·causation·workspace와 재전달 원문 보존 결과는 양쪽이 동일했다.
- 재현 명령은 `make event-bus-equivalence`다. 이 검증은 clean-run outcome 동등성이다.
  in-process bus는 프로세스 메모리, JetStream은 영속 broker이므로 controller crash 시
  내구성까지 동등하다고 주장하지 않는다.
- canonical merge `66e8c08e688658e3c41034b6fd8c7e5068edf084`와 GREEN `82a7f29f2`의
  `origin/dev` ancestor exit 0을 확인했다. BQ-016은 남은 OCI·실제 safe-pr·lifecycle 때문에
  계속 `in_progress`다.

### OSS Safe PR 로컬 실증 — mock·직접 정상화 제거

- 코드 `9b107d8e9`은 `make demo`의 Markdown mock PR과 `kubectl set image`를 제거했다.
  실제 API 로그인·application 등록·manifest render·DB outbox·in-process worker chain·기존
  `GithubScmProvider`/`scm-worker`를 거쳐 `safe_pr.created`를 관측한다.
- demo-only GitHub-compatible fixture는 real Git branch/file/merge commit을 사용한다. writer,
  harness-admin, reviewer capability token은 상호 다르고 controller에는 writer만 주입한다.
  writer의 reset/main commit/merge는 401이며, reviewer merge는 검토한 base/head SHA가 바뀌면
  409다. 감사 중 재현된 `.git/config` metadata write 경로는 모든 depth·case에서 차단했다.
- Kind 실측은 `bad_revision=89b931cb5865582b3084572240e4cf3a7825fa9d`,
  `merged_revision=9a66b083b37416ca2d61ff71ccd7b18b9b67f1d4`로 종료 코드 0이었다. merge SHA의
  exact manifest만 외부 `opsia-demo-gitops` actor가 적용했고 최종 Deployment는 Ready 1,
  `opsia-demo-workload:local`, spec Apply writer `opsia-demo-gitops` 단일임을 확인했다.
- bootstrap password/session cookie/SCM token은 artifact에 0건이고 0600 runtime 디렉터리를
  종료 시 폐기한다. SCM credential hash가 fixture/controller Pod template에 들어가 재실행 시
  Secret rotation과 Pod 교체가 함께 일어난다. 관련 표적 테스트는 21건 통과했다.
- 이 실증은 local SCM fixture와 외부 GitOps actor 시뮬레이션이다. hosted forge, 실제 Argo
  외부 CD continuous reconcile, rollout 진단부터 PR까지의 완전 자율 경로, public OCI artifact는
  아직 증명하지 않았다. 따라서 BQ-016은 `in_progress`를 유지하며 이 절은 완료 앵커가 아니다.
- 비완료 착륙 증거: canonical merge `15379d94f`, 코드 `9b107d8e9`, lane HEAD
  `16aad904c`가 모두 `origin/dev` ancestor exit 0이다. 최신 dev 재base 뒤 전체 게이트는
  Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest `1985 passed, 3 skipped`였고
  manifest 69/20, Helm lint PASS, merge-tree clean, 삭제·frozen 변경 0건이었다.

### H3 — BQ-007/009/010 권위 patch 엔진

- canonical merge: `6d68325bf1cc47f55810e5dc2189e51a6fe916c0`
- 전체 게이트: Ruff lint/format PASS(499 files), import-linter 2 kept/0 broken,
  pytest `1820 passed, 3 skipped`; recovery patch scorer 6/6, compileall PASS,
  manifest management 69 / target 20.
- 권위 계약: patch 시점에 workflow/diff/active binding/repository/provenance를 다시 읽고,
  exact base 원문의 scalar span만 수정한다. 모든 forward patch는 exact inverse rollback을
  포함한다.
- 프론트 unsupported 조건: 권위 correlation 또는 현재 snapshot이 없으면
  `gitops_authority_unavailable`, workspace/cluster/kind/name이 다르면
  `gitops_authority_mismatch`, action이 미지원이거나 snapshot에서 안전하게 patch할 수 없으면
  `safe_pr_patch_unsupported`다. 세 경우 모두 가짜 document PR 대신
  `rca.action_required`를 발행한다.
- 프론트 action 파라미터:
  - `oom_memory`: `strategy=usage_headroom`, `headroom_ratio=1.25`, `max_memory=4Gi`
  - `replica_scale`: `strategy=increment_one`, `max_replicas=10`
  - `image_rollback`, `image_tag_fix`: `strategy=last_approved_snapshot`
  - `probe_fix`: `strategy=approved_value_or_bounded_timeout`
  - `selector_fix`: `strategy=match_template_label`, `max_fields=1`
  - `gitops_recovery_review`: `document_type=recovery_review`인 검토 전용 action이며 실제
    patch action보다 score가 낮다.

계약 완성: BQ-009/010 권위 patch 엔진 6종 (6d68325bf1cc47f55810e5dc2189e51a6fe916c0) [green]

### BQ-017 — provider 1급화와 연결 단계

- 상태: landed, gateway 계약 lock 해제
- 담당 lane: `codex/f-provider-connection-stage`
- 착수 기준: `origin/dev@a65c66c7102fb453e583ed4ec44f1950a9df9ba2`
- 전체 게이트 baseline: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1735 passed, 3 skipped`
- manifest baseline: management 68, target 20
- canonical merge: `d507ca6d47a0e953f6d1a0ad6931d576738c18cc`
- 코드: `db4798d4e4973ec3d384d71eca08aba6d4e9f6b7`
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1831 passed, 3 skipped`; manifest management 69, target 20
- 프론트 호환 증거: `origin/woonyong/ui-layer-lab@bfaf03901`에서
  `ClusterSummary.provider`·`ClusterSummary.connection_stage`·
  `ClusterConnectionStatusResponse.connection_stage`를 optional로 수용한다.
- `provider` 허용값은 `eks/gke/aks/onprem/kind/unknown`이다. 구체적인 등록값을
  agent의 providerID·vendor label 감지보다 우선하고, 일반 클러스터는 `onprem`,
  판정할 수 없는 경우는 `unknown`으로 투영한다.
- `connection_stage` 허용값은 `token_issued/awaiting_install/agent_connected/`
  `snapshot_received/ready/expired/error`다. 기존 `connection_status`는 보존한다.
  `token_issued`는 등록 직후 응답에만 사용하고, `ready`는 현재 연결 epoch의 snapshot과
  후속 heartbeat가 모두 확인된 상태다. `expired`는 UX 상태이며 인증 만료 경계가 아니다.
- 신규 route·DB 변경은 없다. 기존 Bruno
  `docs/api/11-clusters/01-list-clusters.bru`, `02-get-cluster.bru`,
  `03-connection-status.bru`에서 additive 응답을 검산한다.

계약 완성: ClusterSummary.provider + connection_stage (db4798d4e4973ec3d384d71eca08aba6d4e9f6b7) [green]

### BQ-014 — 외부 GitOps observer 어댑터

- 상태: landed
- 담당 lane: `codex/f-argocd-observer`
- 착수 기준: `origin/dev@621a60a1c83bf12b2cb93fc50439f5a7fc4df00d`
- 전체 게이트 baseline: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1735 passed, 3 skipped`
- 범위: `reconciler_mode=argocd`에서 외부 GitOps Application과 Rollout stable revision을
  읽기만 하며 Kubernetes/외부 GitOps 쓰기 호출은 0건으로 고정한다.
- canonical merge: `0b4298c4e2dbc57815a4c484ac7efa3491ed01db`
- 코드: `16c58de5634b2ee49a93c884e73bebb2348b04f3`
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1838 passed, 3 skipped`; manifest management 69, target 20.
- Application 관측 불가는 fail-closed `failed`, 선택적인 Rollout CRD 부재는
  `available=false`로 유지한다. operation phase가 비어 있거나 `Succeeded`일 때만 ready이며,
  repository URL userinfo는 상태 보고 전에 제거한다.
- Application과 Rollout은 Kubernetes GET만 사용하고 RBAC는 `get/list`만 부여한다.
  `reconciler_mode=argocd`에서는 built-in apply 호출이 0건이다.
- gateway·RCA·AI·runtime worker 변경 0건, 신규 route·DB 변경 없음.

계약 완성: KubernetesArgoObserver + Argo reconcile status (16c58de5634b2ee49a93c884e73bebb2348b04f3) [green]

### BQ-018 — Opsia 이름 전파

- 상태: landed
- canonical merge: `ad28cc9457a094dda7ef8ce53d2184845bb25eb1`
- 문서: `46ea10f8f0648dd7c29be984b9845ae57938fb5e`
- 공개 표기: root/docs README와 `docs/oss/**`의 제품명을 Opsia로 통일하고 공개 벤치 이름은
  OpsiaBench로 정리했다. Helm OCI 예시는
  `oci://ghcr.io/opsia/charts/opsia`를 사용한다.
- 보존 경계: 코드 식별자·event subject·DB schema는 변경하지 않았고,
  `~/.reference/kubeheal-timeline.db` 레거시 저장 경로와 Apache License 원문도 유지했다.
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1838 passed, 3 skipped`; manifest management 69, target 20.

계약 완성: Opsia public docs + Helm OCI example (46ea10f8f0648dd7c29be984b9845ae57938fb5e) [green]

### BQ-015 — `.remediation.yaml` 소스 계약

- 상태: landed, gateway 계약 lock 비대상
- 담당 lane: `codex/remediation-source-contract`
- 착수 기준: `origin/dev@d385ae81f915e200fa6256789461ce268a431291`
- 전체 게이트 baseline: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1838 passed, 3 skipped`
- manifest baseline: management 69, target 20
- 범위: 저장소 소유자가 선언한 helm-values `imageTagPath`, kustomize
  `images[].newTag`, raw image scalar, replica, 제한된 probe 필드만 patch하며 미선언 필드는
  `unsupported`로 종료한다. 파일·필드 추측은 금지한다.
- canonical merge: `130e6755dcd4912c0d2e43ffdcc32b4082c74b7c`
- 코드·계약 문서 HEAD: `1300a5fe64c03aa05fe1f8d9cb94a92c2b254962`
- 계약 파일: `docs/spec/remediation-source-contract.md`; 저장소 root의
  `.remediation.yaml`은 `remediation.opsia.dev/v1alpha1` strict schema를 사용한다.
- SCM은 `expectedBaseSha`에서 계약과 선언 source를 읽는다. missing/malformed/미선언,
  raw container redirect, Helm/Kustomize repository·digest 변경은 branch·PUT·PR 전에
  `unsupported`로 종료한다.
- 기존 PR 재전달은 계약, render entrypoint, 선언 target 중 하나라도 base에서 바뀌면
  재사용하지 않는다. raw/Helm/Kustomize adapter와 미선언 차단 scorer는 6/6 PASS다.
- 전체 게이트: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1865 passed, 3 skipped`; manifest management 69, target 20.
- 기존 권위 patch scorer 6/6, source-contract scorer 6/6. 신규 route·DB 변경은 없다.

계약 완성: RemediationSourceContract + declared source adapters (1300a5fe64c03aa05fe1f8d9cb94a92c2b254962) [green]

### BQ-011 — release flow 내부 모듈 분해

- 상태: landed, gateway 계약 lock 비대상
- 담당 lane: `codex/release-flow-modules`
- 착수 기준: `origin/dev@6714fd3fb6946b36a1c793e402df2347cea65543`
- 전체 게이트 baseline: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1865 passed, 3 skipped`
- 분해 전 기준: `src/domains/release_flow/router.py` 5,297줄
- 범위: HTTP route·DB 조회·인가·상태 변경은 router에 남기고 policy/readiness/
  verification/report/_support를 내부 모듈로 behavior-preserving 추출한다. 기존 router 심볼
  re-export와 monkeypatch 관측점, blocker 순서·문구·ID·timeout fallback을 보존한다.
- 착륙 결과: feature HEAD `bd4730d850d21528a161b9f60e8da2905e4b56f8`, canonical
  no-ff merge `37498fc7115b430c86730847d1213affeed6c61d`.
- 분해 후 줄수: router 1,821, `_support` 120, policy 1,348, readiness 937,
  verification 297, report 1,110. 기존 router 공개 helper 208개와 이동 helper의 object identity를
  호환 export로 유지했다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1868 passed, 3 skipped`; manifest management 69, target 20.
- 4조건: merge-tree exit 0/tree `7ca5eda67e1666744f2a5d0f96f4585d2f7cc29e`, 파일 삭제 0건,
  gateway 계약·`src/domains/rca/**`·`src/services/ai/**`·
  `src/packages/runtime/worker.py` 변경 0건, feature와 merge commit의 `origin/dev` ancestor exit 0.
- 공개 route·response·DB schema 변경은 없다. 프론트 소비 계약도 동일하며 Bruno·migration 변경은
  필요하지 않다.

계약 완성: release_flow internal module boundaries (bd4730d850d21528a161b9f60e8da2905e4b56f8) [green]

### I단계 — production 배포 계획

- 상태: 계획 착륙 완료, 실제 배포는 사람 전용 J단계 대기
- canonical merge: `c2e2b552377ba508a535c9bd1b69c9e60fec522a`
- 현재 정본: `docs/operations-deployment.md`, `docs/production-readiness.md`
- 적용 경계: migration-first → consumer/worker → target agent → realtime gateway →
  API gateway. backend 공용 image workload 39개를 동일 immutable digest로 수렴한다.
- DB fail-closed: `alembic_version` 부재·불일치, 0140 partial DDL, concurrent index
  INVALID, 단일 head 불일치 시 workload rollout 전에 중단한다. production image에는
  Alembic asset이 없어 승인된 canonical operator runner와 direct PostgreSQL 연결을 쓴다.
- 보안 경계: raw management manifest의 `DEV_AUTH_BYPASS=1`을 production overlay에서
  `0`으로 강제하고 rendered/live 값을 모두 검사한다. target agent는 재등록·credential
  회전 없이 read-only Argo RBAC와 image만 target별 순차 갱신한다.
- rollback: DB schema는 additive로 유지하고 이전 workload digest로 복원한다.
  projection table 데이터를 지우는 production downgrade는 기본 rollback에 포함하지 않는다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1868 passed, 3 skipped`; manifest management 69 / target 20.
- J단계 blocker: GitHub Actions green 미증명, integration smoke off, 신규 3 route live
  200 미증명, live DB Alembic baseline 미확인, 이전 digest·backup·1-replica 위험 승인 미확보.

계약 완성: migration-first deploy plan + immutable rollback (0cc6af58c90140123dabd943c55b72b7b4b3bed9) [green]

### 보조 대기열 S1 — RCA 읽기 route의 Bruno 기본 실행 경로

- 상태: landed
- 담당 lane: `codex/bruno-route-runner`
- RED: `f3d2b4f9212c3dcfd86b95b03ac8251af744a060`
- Runner: `31b93edad5c1ef047b326dea66b68593e86e92cf`
- 인계 문서와 feature HEAD: `6d29a87021c9163c659bda548108576c8358e952`
- canonical no-ff merge: `6ea12f2635bf6b49879f93baeed4fa101c2b4bb4`
- `scripts/run-bruno-aws.sh`가 RemediationBundle → audit timeline → recent changes를
  기존 RCA 식별자 저장 흐름 뒤에서 순서대로 실행한다.
- Bruno의 401/404 허용은 계약 회귀 범위이며 production 승격은 실재 correlation·incident로
  세 요청 모두 200임을 별도 검증한다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1869 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `780b1e170691d3af359059fe08aba67e9840a85e`,
  파일 삭제·gateway 계약·RCA·AI·runtime worker 변경 0건, feature와 merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: RCA read-route Bruno runner coverage (6d29a87021c9163c659bda548108576c8358e952) [green]

### 보조 대기열 S2 — OpsiaBench scheduling·PVC 시나리오

- 상태: landed
- 담당 lane: `codex/benchmark-scheduling-pvc`
- RED: `fe08b641e9feab86b6a8e0ca207c56b2477876d3`
- 시나리오·채점기: `d6a3624a609fbf7d0eb8e775981483b54ec7334d`
- 공개명 정합: `3c80d57af52242c86b684a3b800d095897c06bf5`
- 문서: `949bcd6b17bcd483cbeedfd044c0d7b675eb1e68`
- feature HEAD: `075926e4d5da6dc59e67e865e293efdf00fb1d6c`
- canonical no-ff merge: `43867308ac4e0e38b57cf7d10c2aa5b4856e47fd`
- `failed_scheduling/insufficient_cpu`, `failed_scheduling/node_affinity_or_taint_mismatch`,
  `failed_scheduling/pvc_pending`, `volume_mount_failed/pvc_not_bound`의 실존 rule·candidate만
  사용해 scheduling과 PVC를 각각 2개씩 추가했다.
- snapshot은 scheduling 6개, volume mount 4개, volume attach 2개 후보 전체와 현재 recovery
  action을 고정한다. 기존 gold action drift 5건도 실제 catalog 값으로 정합화했다.
- 공개 scorer: 전체 `14 scenarios`, category별 scheduling 2 / PVC 2 PASS.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1872 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `0ff6d94d6c17b65bc40d05a9fa1965b79ff1061b`,
  파일 삭제·gateway 계약·RCA·AI·runtime worker 변경 0건, feature와 merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench scheduling + pvc scenarios (075926e4d5da6dc59e67e865e293efdf00fb1d6c) [green]

### 보조 대기열 S3 — rule candidate 상위 10개 안전 계약

- 상태: landed
- 담당 lane: `codex/candidate-contract-batch-one`
- RED·경계 테스트: `765c108c4`, `1fc338b46`, `818af89ea`, `1e61abbec`,
  `338dbc811`, `ca8f1c543`, `fa89c035a`, `4b60511f7`, `6b34e6f94`
- 구현·정합: `cdc577d56`, `3f5ea3a64`, `bc0c841be`
- 문서와 feature HEAD: `0a1a0b99a482d9bfbcaf394a32ec2ca392cd6611`
- canonical no-ff merge: `a77115d411bbc1de03304f190f124f8fbcfc14f2`
- 범위: 실제 catalog loader 순서의 후보 1~10만 계약화했다. 전체 후보는 87개이며 다음
  cursor는 `next_ordinal=11`이다. 87개 전체 계약 완료로 해석하지 않는다.
- `benchmark/candidate-contract-index.json`은 catalog 15개 원본 SHA와 rule·candidate 87개의
  정확한 순서·required evidence·supporting signal을 고정한다. 작성된 계약 10개는 live
  recovery의 허용 action, rollback, post-verification과 dispatcher의 실제 실행 capability를
  함께 검산한다.
- `config_fix`는 recovery route가 `draft_pr`이지만 현재 dispatcher가 patch를 지원하지 않아
  capability를 빈 값으로 둔다. 선언 route를 실제 실행 가능성으로 오인하지 않는다.
- contradicting signal은 runtime에 아직 모델링되지 않아
  `contradiction_policy=not_modeled_v0.1`로 명시했다. 빈 배열을 반증 부재의 증거로 과장하거나
  가짜 반증을 만들지 않는다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` PASS
  (`10 candidate contracts; ordinals=1..10`), 전체 scenario scorer `14 scenarios` PASS,
  `tests/test_benchmark_score.py` 30 passed.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1899 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `b5e31047498a18c660a51e184d13b1d25862a5b0`;
  파일 삭제·소유권 밖 변경·RCA/AI/runtime worker 변경 0건; feature와 merge commit의
  `origin/dev` ancestor exit 0.
- 후속 hardening: malformed snapshot의 구조화 오류, 미래 복수 fallback 누적, alias 없는
  canonical command 추출, CRLF checkout의 byte SHA 이식성은 다음 배치에서 보강 후보로 남긴다.

계약 완성: OpsiaBench candidate contracts 1..10 (0a1a0b99a482d9bfbcaf394a32ec2ca392cd6611) [green]

### 보조 대기열 S4 — 아침 요약·완료 상태 문서 정합

- 상태: landed
- 담당 lane: `codex/morning-summary-consistency`
- 상태 어휘 RED: `c29f4d3b5`; 앵커 수 RED: `c000af818`
- feature HEAD: `356bef2e29255fe5f8305fa61522865fb63bf3fc`
- canonical no-ff merge: `5aa8fa006280e7b6191832d0f5fea6d9108438f6`
- 작업 큐의 착륙 완료 BQ 5건을 선언된 `landed` 어휘로 정규화하고, 진행 문서의 선언
  앵커 수를 실물 20줄과 기계 대조한다.
- pipeline §3은 04:30 시작 snapshot, 현재 상태는 §4와 night-log 아침 요약이라는
  우선순위를 명시했다. A~I는 done, J는 사람 전용 `🔒waiting`, K는 pending이다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1901 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `ab67562c43f4c808674b59ff2c8a2393c52e03f2`;
  삭제·소유권 밖 코드·frozen 경로 변경 0건; feature와 merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: backend coordination status vocabulary + morning summary (356bef2e29255fe5f8305fa61522865fb63bf3fc) [green]

### 보조 대기열 S5 — rule candidate 11~20 안전 계약

- 상태: landed
- 계약 lane: `codex/candidate-contract-batch-two`; terminal hardening lane:
  `codex/candidate-contract-terminal-digest`
- RED: 두 번째 배치 `ddec4a7bb`, 완료 배치 변조 `b147ba64f`, 복수 fallback
  `8da455794`, terminal·잠금 누락 `9ec3fc14e`
- 데이터 feature HEAD: `d90ccac03f33dd2be7d21a01fd026849be63ea10`
- 최종 hardening HEAD: `b2b6baeb036fc251d7e9ca1d8dd204dd928878db`
- canonical no-ff merge: 데이터 `59a9c460b01e56d03e0f21da0e40999e2d078a36`,
  terminal hardening `5bc68f5cd7b6287e499c669c0c507912920debec`
- 범위: loader 순서 11~20을 추가해 누적 20/87, `next_ordinal=21`이다. 10개 모두
  명시 recovery가 없어 live `manual_analysis` fallback만 허용하며, 실제 command/Safe PR
  capability와 exact benchmark fixture는 없다. 빈 값으로 coverage gap을 숨기지 않는다.
- append-only 경계: 1~10 digest `8af3efce…4476`, 11~20 digest
  `3ffa57f4…bb0`을 canonical JSON으로 고정한다. 계약 수에서 필수 digest range를 계산해
  누락 lock을 거부하고 최종 tail은 정확히 81~87만 해시한다.
- 복수 fallback decorator는 선언 순서대로 누적한다. malformed snapshot 구조화 오류,
  alias 없는 canonical command 추출, CRLF checkout SHA 이식성은 별도 비차단 hardening으로 남긴다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` 20/20 PASS,
  전체 scenario scorer 14 PASS, `tests/test_benchmark_score.py` 37 passed.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1908 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: 데이터 merge-tree exit 0/tree `b46ca873badcbb8bc64c99027cee4ac852aad470`,
  hardening merge-tree exit 0/tree `78592de21d75cc6c51a20c26c51c5f5d59b2e641`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; 두 feature와 두 merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench candidate contracts 11..20 + batch digest coverage (b2b6baeb036fc251d7e9ca1d8dd204dd928878db) [green]

### 보조 대기열 S6 — rule candidate 21~30 안전 계약

- 상태: landed
- 담당 lane: `codex/candidate-contract-batch-three`
- RED: `3d39b3cf67579ecd0eeb823d29d9e1dd1a6e6c87`
- 구현·데이터: `9df3551d8dfdb9b18bb15c7d0c4364d83f2aad4f`
- 문서와 feature HEAD: `8f0ee335f1ba947d077c3b16b17267afde123de3`
- canonical no-ff merge: `efdde0a31fb1986c3d30083bf3dc895fd256aafd`
- 범위: loader 순서 21~30을 추가해 누적 30/87, `next_ordinal=31`이다. 21~24와
  28~30은 live `manual_analysis` fallback만 허용한다.
- 실제 실행 경계: 25번 `wrong_image_tag`만 dispatcher Safe PR allowlist와 교차해
  `safe_pr` capability가 있다. 26번 `missing_image_pull_secret`과 27번
  `registry_unavailable`은 승인형 recovery만 있고 실행 capability는 비어 있다.
- fixture는 실존하는 image pull scenario와 exact candidate가 일치하는 25·26번에만 연결했다.
  빈 capability·fixture를 추측으로 채우지 않는다.
- append-only 경계: 세 번째 canonical JSON digest
  `ba7e92d1b4468fa7a96d7e0256dab39509c8bd859114e52fd83967c394f7ac79`를 `(21, 30)`에
  고정하고 batch 3 변조 회귀를 추가했다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` 30/30 PASS,
  `tests/test_benchmark_score.py` 40 passed. 독립 감사 P0/P1 0건.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1911 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `c6d98ec1167434a3a51f3bb0cc77cb5c13350b8e`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; RED·feature·문서·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench candidate contracts 21..30 + image pull capability boundary (8f0ee335f1ba947d077c3b16b17267afde123de3) [green]

### 보조 대기열 S7 — rule candidate 31~40 안전 계약

- 상태: landed
- 담당 lane: `codex/candidate-contract-batch-four`
- RED: `85f9447c9ae1657f9a4f3013d8bb9420be3da14e`
- 구현·데이터: `1497b9bb3e3aa2819904c9e3636d21eb35c9da7c`
- 문서: `9afa9ce542abf5f2039a0609707188f8fb52d747`
- 최종 feature HEAD: `296e14c383ae949573f2ad5216af8874b1a923b8`
- canonical no-ff merge: `6ebd0f6bd7882bbed2b173d100fb6a26ebe4e0e5`
- 범위: loader 순서 31~40을 추가해 누적 40/87, `next_ordinal=41`이다. 31~35와
  39~40은 live `manual_analysis` fallback만 허용한다.
- 실제 실행 경계: 36번 `upstream_unavailable`과 37번 `backend_readiness_failure`는
  `command`, 38번 `application_5xx_spike`는 `command`와 `safe_pr` capability가 있다.
  `deployment_scale`의 `route=auto`, `approval_required=true` 원문도 그대로 보존한다.
- 31~40과 exact rule/candidate가 일치하는 기존 fixture는 0개다. 유사 시나리오를 추측 연결하지 않는다.
- 인간 검토 경계인 forbidden remediation도 후보별 실행 가능한 과잉 대응으로 감사했다.
  ordinal 35는 재시작 불가능한 Endpoint 대신 cluster 전체 backend workload 재시작 금지로 교정했다.
- append-only 경계: 네 번째 canonical JSON digest
  `32d4a8b485fa73c2dbba420e4fefdc4c56ca82d712e6bbe92954516a79aab73d`를 `(31, 40)`에
  고정하고 누락 lock·batch 4 변조 회귀를 추가했다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` 40/40 PASS,
  `tests/test_benchmark_score.py` 43 passed. 독립 재감사 P0/P1 0건.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1914 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `a9c271adfbed401a3dd8f04887c9a9cc765d5185`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; RED·구현·문서·수정·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench candidate contracts 31..40 + network execution boundary (296e14c383ae949573f2ad5216af8874b1a923b8) [green]

### 보조 대기열 S8 — rule candidate 41~50 안전 계약

- 상태: landed
- 담당 lane: `codex/candidate-contract-batch-five`
- RED: `0a86981fd9c37c22e4a6f04ea30034b564c8bce0`
- 구현·데이터: `1b4bfa7791ddb789b6c683ede8823619d2f56b73`
- 문서와 feature HEAD: `5995350c4d95eccade8f24a31870a6a9d2d0fc5d`
- canonical no-ff merge: `910825ec4a90be0403bae7c41d8bc0f09a23e7ee`
- 범위: loader 순서 41~50을 추가해 누적 50/87, `next_ordinal=51`이다. 41~49는
  live `manual_analysis` fallback만 허용한다.
- 실제 실행 경계: 50번 `probe_path_wrong`만 `probe_fix` Safe PR capability와
  `benchmark/scenarios/probe/probe-wrong-path/scenario.json` exact fixture를 가진다.
- forbidden remediation 의미 감사에서 ordinal 44를 실제 node reboot로, ordinal 46을
  action·reason·blast radius가 모두 fleet인 manifest 교체 금지로 정합화했다.
- append-only 경계: 다섯 번째 canonical JSON digest
  `f125aff8e7a7d72922f93ad60b542b9131ecccd279d8d8dc7b0c5f886a66e5fb`를 `(41, 50)`에
  고정하고 누락 lock·batch 5 변조 회귀를 추가했다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` 50/50 PASS,
  `tests/test_benchmark_score.py` 46 passed. 이중 독립 감사 P0/P1 0건.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1917 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `77dbb5e47763f69b28893631b09d7415464bcdc4`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; RED·구현·문서·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench candidate contracts 41..50 + probe safe-pr boundary (5995350c4d95eccade8f24a31870a6a9d2d0fc5d) [green]

### 보조 대기열 S9 — rule candidate 51~60 안전 계약

- 상태: landed
- 담당 lane: `codex/candidate-contract-batch-six`
- RED: `defe3751db251469f01b5e9899bab45f3c92bdca`
- 구현·데이터: `65f487ea96dfc08860e7749e212262954e7ec427`
- 문서와 feature HEAD: `5ce8132b0598797e73bb675a2ff49c66eef72167`
- canonical no-ff merge: `66115a2d7312ae09e9cf8a06b1369ddf051e7cd2`
- 범위: loader 순서 51~60을 추가해 누적 60/87, `next_ordinal=61`이다.
- 실제 실행 경계: 51~53번 probe 후보와 55번 selector 후보만 `safe_pr` capability가 있다.
  54번 실제 health 실패는 probe 수정 대상이 아니고, 56번은 fixture가 있어도 fallback-only,
  60번은 OOM 계열 이름이어도 live `oom_memory` recovery가 없다.
- exact fixture는 51번 probe port, 55번 selector mismatch, 56번 pods-not-ready에만 연결했다.
- forbidden remediation은 health gate 우회, cluster-wide EndpointSlice 삭제, fleet memory limit
  제거를 포함한 실제 실행 가능한 과잉 대응으로 독립 의미 감사를 통과했다.
- append-only 경계: 여섯 번째 canonical JSON digest
  `cc5f142232579553a3f6a7f0efd9fde1c0cca27dd1a3fba718a2eb68b706b0ae`를 `(51, 60)`에
  고정하고 누락 lock·batch 6 변조 회귀를 추가했다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` 60/60 PASS,
  `tests/test_benchmark_score.py` 49 passed. 독립 감사 P0/P1 0건.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1920 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `113e4e5166691df6ab5c2bd940a2b9e86487fb25`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; RED·구현·문서·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench candidate contracts 51..60 + probe and selector inference boundary (5ce8132b0598797e73bb675a2ff49c66eef72167) [green]

### 보조 대기열 S10 — rule candidate 61~70 안전 계약

- 상태: landed
- 담당 lane: `codex/candidate-contract-batch-seven`
- RED: `5c0d04120d443570e386c644ef3bf2f14aa9ab13`
- 구현·데이터: `95afd816309d3e0de73bedabd1b20af0d6078a5e`
- 문서와 feature HEAD: `aed4bf78b4e640af0b5ac55017f6a445b0a5013b`
- canonical no-ff merge: `de0b2760951bd654b597bbfc36ce0004b26bc5fb`
- 범위: loader 순서 61~70을 추가해 누적 70/87, `next_ordinal=71`이다.
- 10개 모두 exact `manual_analysis` fallback-only이고 capability·fixture가 비어 있다.
  resource pressure·bad release·runtime config 이름만 보고 `oom_memory`, `image_rollback`,
  `config_fix`를 추론하지 않는다.
- forbidden remediation은 leak 은폐용 fleet memory 증설, node data purge, cluster-wide
  ConfigMap 복제·변조처럼 실제 실행 가능한 과잉 대응으로 의미 감사를 통과했다.
- append-only 경계: 일곱 번째 canonical JSON digest
  `56882298c112280ea41f4346170ee0336b207797a1df15a0acac6bdc42378590`를 `(61, 70)`에
  고정하고 누락 lock·batch 7 변조 회귀를 추가했다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` 70/70 PASS,
  `tests/test_benchmark_score.py` 52 passed. 독립 감사 P0/P1 0건.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1923 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `df15a4c59d352feeab141aa9bc36034e501fea44`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; RED·구현·문서·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench candidate contracts 61..70 + fallback-only inference boundary (aed4bf78b4e640af0b5ac55017f6a445b0a5013b) [green]

### 보조 대기열 S11 — rule candidate 71~80 안전 계약

- 상태: landed
- 담당 lane: `codex/candidate-contract-batch-eight`
- RED: `3060b5f603280534b84723183dd4fa264ab413a8`
- 구현·데이터: `895f4185f3a1eda384d8fe20730b03170e0c9070`
- 문서와 feature HEAD: `dd2006904491f22113d4e84329f681a227e85d2e`
- canonical no-ff merge: `cb099e5eb161d740710c2b276b52bc85dc2006d9`
- 범위: loader 순서 71~80을 추가해 누적 80/87, `next_ordinal=81`이다.
- 71~72·76~77·79~80은 fallback-only다. 73~74의 `resource_request_tuning`과
  75의 `scheduling_constraint_fix`는 `draft_pr` route여도 dispatcher allowlist 밖이므로
  실제 capability가 없고, 78의 `pvc_binding_fix`도 승인형 수동 action이다.
- exact fixture는 73번 CPU 부족, 75번 affinity 불일치, 78번 PVC pending에만 연결했다.
- forbidden remediation은 fleet node pool 일괄 증설·변경, cluster-wide scheduling 제약 제거,
  PVC 전체 삭제, Secret 전역 복제·변조처럼 실제 실행 가능한 과잉 대응으로 의미 감사를 통과했다.
- append-only 경계: 여덟 번째 canonical JSON digest
  `7ebd96e2c186abd5d7093472a17ca06f6269a999ee6621e3b22864486fb351d6`를 `(71, 80)`에
  고정하고 누락 lock·batch 8 변조 회귀를 추가했다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` 80/80 PASS,
  `tests/test_benchmark_score.py` 54 passed. 독립 감사 P0/P1 0건.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1925 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `61250ee0eacdee280fd73e6f223a9273cb994f70`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; RED·구현·문서·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench candidate contracts 71..80 + scheduling and secret inference boundary (dd2006904491f22113d4e84329f681a227e85d2e) [green]

### 보조 대기열 S12 — rule candidate 81~87 terminal 안전 계약

- 상태: landed
- 담당 lane: `codex/candidate-contract-terminal`
- RED: `564deb9a3239143321e69986b284066eb97b30ed`
- 구현·데이터: `bd75854271f7c46de6c021d0e91f586c57e8a671`
- 문서와 feature HEAD: `aafc4a956bc03b85133cb6b46f3ba889dde532dc`
- canonical no-ff merge: `dc0b775ff0b4813e2599ea0c15f7bf574d830b0d`
- 범위: loader 순서 81~87을 추가해 87/87 전체를 완결했고 `next_ordinal=null`이다.
- 7개 모두 exact `manual_analysis` fallback-only이고 실제 patch capability가 비어 있다.
  82번 `pvc_not_bound`에만 exact fixture가 있으며, 78번의 `pvc_binding_fix`를 이름만 보고
  82번에 추론하지 않는다.
- forbidden remediation은 ExternalSecret controller fleet 재시작, CSI 전체 재시작,
  cluster volume 강제 detach, RWO 소비자 전역 삭제, VolumeAttachment finalizer 전역 제거처럼
  실제 실행 가능한 과잉 대응으로 의미 감사를 통과했다.
- append-only 경계: terminal canonical JSON digest
  `e3f38634a87f1f1ffba62d21e0150f1069fb21f783ae4fb0ea9ddd46fe34fe22`를 `(81, 87)`에
  고정하고 누락 lock·batch 9 변조 회귀를 추가했다.
- 고유 검증: `python3 -S benchmark/score.py --candidate-contracts` 87/87 PASS,
  `tests/test_benchmark_score.py` 56 passed. 독립 감사 P0/P1 0건.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1927 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `b2693f8c4aedb9d5004fd178c4435f10e492525f`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; RED·구현·문서·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench candidate contracts 81..87 + terminal storage inference boundary (aafc4a956bc03b85133cb6b46f3ba889dde532dc) [green]

### 보조 대기열 S13 — scheduling node selector 시나리오

- 상태: landed
- 담당 lane: `codex/benchmark-scheduling-memory`
- 초기 RED: `b07dcbb16fe8258a520d97737e54b63564446109`
- 독립 감사 후 selector RED 교정: `3d9899564f2f50dc7505b159cdf1ece0b21f8dab`
- 구현·데이터: `70d3478efb3a966a7f3f4c45d47c07972810444f`
- 문서와 feature HEAD: `dea2d4babb6882c2cf6b5ff8354060f8472bf6f7`
- canonical no-ff merge: `584e2eda0af8d0d6d862fffe6be836a1c925fbae`
- `node_selector_mismatch`를 scheduling 세 번째 시나리오로 추가했다. 정상 `general` pool,
  장애 `retired` pool, gold·rollback selector를 정적으로 고정해 외부 용량 가정이 없다.
- live recovery가 없는 후보이므로 `manual_analysis`와 `auto_apply=false`만 허용하고,
  cluster 전체 workload의 nodeSelector 제거를 금지했다.
- ordinal 76에 exact fixture를 연결하고 여덟 번째 batch 전체를 재감사해 digest를
  `8d19d8d9f67dfe24c700e3dd782f19290719c3f46bc154e4f9bb81f5d7125521`로 갱신했다.
  기존 후보 identity·evidence·signal·recovery·forbidden은 변경하지 않았다.
- 고유 검증: scheduling 3/3, 전체 scenario 15/15, candidate scorer 87/87,
  `tests/test_benchmark_score.py` 57 passed.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1928 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `9cb957b643ac84ccc8dffca6b9151a1569606698`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; RED·교정·구현·문서·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench scheduling node selector mismatch fixture + fallback boundary (dea2d4babb6882c2cf6b5ff8354060f8472bf6f7) [green]

### 보조 대기열 S14 — AsyncDb 호출 경계 직접 테스트

- 상태: landed
- 담당 lane: `codex/runtime-async-db-tests`
- 테스트와 feature HEAD: `effec9f6d98c0e56fc6bf10e5860b626e5d01077`
- canonical no-ff merge: `b37a94d958b7c56a8df8c8780bc1ff30a63b3d63`
- `src/packages/runtime/async_db.py` 소스 변경 없이 직접 테스트 5개를 추가했다.
- async method·비호출 속성은 thread hop 없이 전달하고, active connection이 없을 때 sync
  method는 `asyncio.to_thread`로 인자·결과를 전달하는 경계를 고정했다.
- active connection이 있으면 현재 thread를 재사용하며 `to_thread`를 호출하지 않고,
  sync 예외와 없는 속성의 `AttributeError`도 숨기지 않음을 검증했다.
- 고유 검증: `tests/test_async_db.py` 5 passed.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1933 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `41ae92a7d037bccfab7950b8d5ee70162ce0a39e`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; test·merge commit의 `origin/dev`
  ancestor exit 0.

계약 완성: AsyncDb thread-hop and active-connection reuse tests (effec9f6d98c0e56fc6bf10e5860b626e5d01077) [green]

### 보조 대기열 S15 — probe timeout 시나리오

- 상태: landed
- 담당 lane: `codex/benchmark-probe-timeout`
- RED: `bd864494d7786f94f8f17c3ba2234c0f63f9d488`
- 구현·데이터: `9171d600551389fe9611d2dda747cfb25bafef2a`
- 문서와 feature HEAD: `b96a6981079a4a144921d391f443d43e4306a05d`
- canonical no-ff merge: `2d9ef3fc2ddb17970d863dcadc995a7d6a6dfe3e`
- `timeout_too_short`를 probe 세 번째 시나리오로 추가했다. 정상 timeout 5초, 장애 1초,
  gold·rollback scalar를 고정해 target workload 외 변경이 없다.
- live `probe_fix`와 실제 dispatcher가 교차하므로 `safe_pr`, `auto_apply=false`만 허용하고
  fleet 전체 probe timeout 증가는 금지했다.
- ordinal 52에 exact fixture를 연결하고 여섯 번째 batch 전체를 재감사해 digest를
  `7920067d7675629e3e9ecaac2252b7825c4527420c8054a5d573e4d34a0f54d3`로 갱신했다.
  기존 후보 identity·evidence·signal·recovery·forbidden은 변경하지 않았다.
- 고유 검증: probe 3/3, 전체 scenario 16/16, candidate scorer 87/87,
  `tests/test_benchmark_score.py` 58 passed.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1934 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `3716fbc40341c0cb55b34669634e2d6c0418b90e`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; RED·구현·문서·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench probe timeout fixture + safe-pr boundary (b96a6981079a4a144921d391f443d43e4306a05d) [green]

### 보조 대기열 S16 — kubectl server dry-run adapter 직접 테스트

- 상태: superseded
- 당시 GitOps diff-worker의 gateway-side SSA adapter를 검증했으나, 현재 제품 경계에서는
  target Kubernetes 실행을 cluster-agent로 단일화했다.
- diff-worker의 직접 adapter와 전용 테스트는 제거됐고,
  `tests/test_gitops_agent_boundary.py`가 SSA 실행자가 cluster-agent 하나뿐임을 강제한다.

### 보조 대기열 S17 — probe startup window 시나리오

- 상태: landed
- 담당 lane: `codex/benchmark-probe-startup-window`
- 초기 RED: `f811610d16fb1e4d261e488c5df233096f0e8de8`
- 시나리오·후보·digest: `17cd32648630f65005f20c98cb1cd7acec69fd63`
- 최초 문서와 feature HEAD: `67014a02865118d9ccf01409d8798856cbd01173`
- capability 교정 RED: `728d23c35a16ce52f94b06c630d8517285ce432e`
- capability 교정과 문서 HEAD: `94c419a80601303e9a76b1b2ba42efd44e610d3d`
- canonical merges: `da5330778443902009d45154214ab692da08cb7c`,
  `8f84ecdc0ce64434afb22b3a207fd74f6c0cc582`
- 5초 초기화에 정상 8초·장애 4초의 startup probe window를 고정하고 fleet 전체 startup
  probe 비활성화를 금지했다. probe는 4개, 전체 scenario는 17개다.
- 독립 감사에서 frozen producer가 readiness/liveness replacement만 생성함을 확인했다.
  ordinal 53의 action-level `probe_fix` 선언은 보존하되 `patch_capabilities=[]`로 fail-closed
  교정하고 공개 scenario는 `manual_analysis` 승인 경로만 허용한다.
- ordinal 53 exact fixture 연결 후 여섯 번째 batch digest는
  `0d53d280da89cff0b2790ffa96ff271c3a5b46a265094ab3ea5cd91adeb69aea`다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1943 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `c0764350df4849f292bed6b5e4067cbc845121d1`;
  삭제·frozen 경로 변경 0건; 교정 feature·merge commit의 `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench startup window fixture + producer-aware manual boundary (94c419a80601303e9a76b1b2ba42efd44e610d3d) [green]

### 보조 대기열 S18 — outbound deliver 직접 테스트

- 상태: landed
- 담당 lane: `codex/runtime-outbound-tests`
- 기본 경계 테스트: `06cae9347a2faff2b64a7d4367f44277da1bc2db`
- identity·호출 횟수 보강: `52ad0d4db8f7513b855e0c8680ad228a2f5fb843`
- 문서와 feature HEAD: `e43920262b530937cee83432f2eaf38727333b5b`
- canonical no-ff merge: `784996ce76d963704118267952b326c1665726b4`
- `src/packages/runtime/outbound.py` 소스 변경 없이 외부 호출 1회, 성공 결과의 원형 전달,
  일반 예외의 동일 인스턴스 전달과 실패 body 1건을 직접 검증했다.
- `CancelledError`는 실패로 변환하지 않고 동일 인스턴스를 전파하며, 성공·실패 mapper 오류도
  숨기지 않고 각 mapper를 정확히 한 번 호출함을 고정했다.
- stale runtime 문서의 존재하지 않는 `Outbound`/`HttpOutbound` API를 제거하고 실제 `deliver`
  계약과 서비스별 I/O 주입 경계를 정합화했다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1948 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `1b237c85086a83fbb53f315644899075db2610fa`;
  source·삭제·frozen 경로 변경 0건; feature·merge commit의 `origin/dev` ancestor exit 0.

계약 완성: outbound deliver success, failure, cancellation and mapper propagation tests (e43920262b530937cee83432f2eaf38727333b5b) [green]

### 보조 대기열 S19 — crashloop 포트 bind 충돌 시나리오

- 상태: landed
- 담당 lane: `codex/benchmark-port-bind`
- RED 계약: `a2336a05d`, `fc7d32263`, `2d8cff0d7`, `0e0d94692`
- 시나리오·후보·digest: `919f7dddddfe0241b9bf54786ec4ee5482e0bfe9`
- 문서: `ac7c9749e357ccb03aa96f9f3b0084525159d251`
- merge-patch RED·교정과 feature HEAD: `d0fbbc792`,
  `ff3b52812905f09242ab05e2704f816ede52845f`
- canonical no-ff merge: `0dd8a200fbec4ab567c00af2e4e3053541163809`
- `app_port_bind_failed`를 crashloop 세 번째 시나리오로 추가했다. 한 프로세스가 같은 실제
  포트를 두 번 bind해 `address already in use`와 exit code 1을 외부 인프라 없이 재현한다.
- 실제 patch capability가 없으므로 `manual_analysis`, `approval_required`,
  `auto_apply=false`만 허용하고 cluster 전체 container port 개방은 금지했다.
- 독립 감사에서 partial `containers` 배열이 JSON merge patch에서 실행 필드를 지우는 결함을
  발견했다. fault·gold·rollback을 완전한 container 객체로 교정하고, fault runnable 보존 →
  gold=normal → rollback=fault 동등성을 실제 merge 알고리즘으로 고정했다.
- ordinal 7에 exact fixture를 연결하고 첫 batch digest를
  `c1917f0cfc9cbfa5b9dfa89a719b16ab0a5f50aee5a1dcfa168f61b197855481`로 갱신했다.
- 고유 검증: crashloop 3/3, 전체 scenario 18/18, candidate scorer 87/87,
  `tests/test_benchmark_score.py` 62 passed. 독립 재감사 PASS.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1951 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `3739c7061eb0e1df88ebd687879da0af7a3661c7`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; feature·merge commit의 `origin/dev`
  ancestor exit 0.

계약 완성: OpsiaBench crashloop port bind fixture + runnable merge-patch round trip (ff3b52812905f09242ab05e2704f816ede52845f) [green]

### 보조 대기열 S20 — target-agent SQLite 수명주기 테스트

- 상태: landed
- 담당 lane: `codex/target-agent-sqlite-lifecycle`
- 결정적 RED: `4a2ef92292a0e818f61ddb51ec3d0b916e891540`
- factory·idempotent close: `d05bc826e8254f7b85cc5f75c0b15e266a825854`
- 수명주기 문서: `ef2757edac3feb09244da04fdfc115f13c881d66`
- hook 격리 교정과 feature HEAD: `720dd55c0d00ec79b61a19bdd5682a2f553c5a96`
- canonical no-ff merge: `13c30723adaf025fd616c166a2507d03f90fef24`
- full `TargetClusterAgent` 생성 12곳을 factory 내부 단일 생성점으로 수렴하고, 테스트 teardown이
  생성 thread에서 두 SQLite store를 닫은 뒤 강한 참조를 제거하도록 고정했다.
- worker thread cyclic GC에서 두 target destructor의 thread-affinity `ProgrammingError`만 수집한다.
  unrelated unraisable은 기존 pytest hook으로 전달하고 `finally`에서 전역 hook을 복원한다.
- 독립 감사가 module autouse 전역 GC의 순서 의존·오귀속 위험을 차단했다. factory 사용 테스트에만
  guard를 한정하고 unrelated `ValueError` 전달 회귀를 추가한 뒤 재감사 PASS다.
- `close()` 두 번 호출 후 `AgentControlStore.conn`과 `CommandResultOutbox.conn`이 모두 `None`임을
  검증한다. 프로덕션 source 변경은 0건이며 `run()`의 기존 finally-close 계약은 보존했다.
- 고유 검증: warning-strict `tests/test_target_agent_client.py` 28 passed.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1953 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `857ee57075e2260222d78350e5d25eb839579bf6`;
  source·파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; feature·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: TargetClusterAgent same-thread SQLite lifecycle tests (720dd55c0d00ec79b61a19bdd5682a2f553c5a96) [green]

### 보조 대기열 S21 — crashloop 시작 권한 오류 시나리오

- 상태: landed
- 담당 lane: `codex/benchmark-permission-startup`
- 초기 RED: `958baa3687fc7be1235233adb5724dbed9444be2`
- crashloop 수량 RED: `be9a6da0a116aa769eca1b250deb02b9e75c6100`
- 시나리오·후보·digest: `85dae710b70169159329bf7a2bd5bd8738699e91`
- 문서와 feature HEAD: `268ca859e7266ec72780b2080904b5d8ba37c247`
- canonical no-ff merge: `de9e600c7a554b12208b46b022d3ca4b29601ce1`
- `permission_denied_startup`을 crashloop 네 번째 시나리오로 추가했다. 임시 script의
  실행 bit를 `0700`에서 `0600`으로 바꿔 실제 POSIX `PermissionError [Errno 13]`과
  exit code 1을 외부 인프라 없이 재현하고, 정상 경로 exit 0도 검증했다.
- last exit code 1로 generic `app_startup_failure`도 1.0인 동점 상황을 만든 뒤,
  catalog에서 먼저 선언된 구체 권한 후보가 최종 선택되는 계약을 고정했다.
- partial array 파괴를 막기 위해 fault·gold·rollback에 full container 객체를 사용했다.
  실제 JSON Merge Patch로 fault runnable 보존 → gold=normal → rollback=fault 왕복을
  검증했다.
- ordinal 8의 `patch_capabilities=[]`를 보존하고 승인형 `manual_analysis`,
  `auto_apply=false`만 허용했다. cluster-admin 권한 확대는 금지했다.
- 첫 batch digest는
  `316a78f9231269c189367ac9c7084e29abf87d7b0b30fc722d40fcc5b39c0ad1`로 재감사했다.
- 고유 검증: crashloop 4/4, 전체 scenario 19/19, candidate scorer 87/87,
  `tests/test_benchmark_score.py` 66 passed. 두 독립 재감사 PASS.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1957 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `428481b5a7d0bfcd0dc54c1a604c99fb2ca1ed34`;
  파일 삭제·소유권 밖 변경·frozen·gateway 계약 변경 0건; feature·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: OpsiaBench crashloop permission-denied startup fixture + concrete-candidate tie boundary (268ca859e7266ec72780b2080904b5d8ba37c247) [green]

### 보조 대기열 S22 — 의존성 기동 재시도 직접 테스트

- 상태: landed
- 담당 lane: `codex/config-retry-tests`
- 테스트: `82c07b920a4192e332794346107671292b7be5db`
- 문서와 feature HEAD: `80edc84495468440960f0590b7ca5eb7c5232e67`
- canonical no-ff merge: `d0953f2c6566c5761c5158e5a7a14ef7a54292b5`
- NATS와 PostgreSQL 기동이 공유하는 48줄 `retry_dependency()`의 직접 테스트 5개를
  추가했다. 첫 성공은 attempt 1회·sleep 0회, N-1 실패 후 성공은 정확한
  sleep 횟수와 dependency/attempt/limit/exception context를 검증한다.
- 한도 소진은 정확한 attempt 수와 `[event-system] <label> 연결 실패`를 고정하고,
  `limit=0`은 attempt·sleep 0회로 즉시 실패한다. 현행 구현의 마지막 실패 후
  sleep 횟수는 불필요하게 계약화하지 않았다.
- 실제 task cancellation은 `CancelledError`를 그대로 전파하고 추가 attempt·sleep·warning이
  없으며, cancel된 task를 await해 pending task를 남기지 않는지 검증했다.
- 성공 `return`을 제거한 비커밋 mutation probe에서 신규 테스트 2건이 실패했고,
  원복 후 focused 5 passed, warning-error·asyncio debug 및 10회 반복을 모두 통과했다.
- 프로덕션 source 변경 0건. 두 독립 재감사 PASS.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1962 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `70599e747873268d57d70886d98618cfdffc3cd6`;
  source·파일 삭제·소유권 밖·frozen·gateway 계약 변경 0건; feature·merge commit의
  `origin/dev` ancestor exit 0.

계약 완성: dependency startup retry limit, structured warning and cancellation propagation tests (80edc84495468440960f0590b7ca5eb7c5232e67) [green]

### BQ-019 — 감사 이벤트 여정 식별·분류 계약

- 상태: landed, gateway 계약 lock 해제
- 담당 lane: `codex/audit-journey-contract`
- RED: `1d0be030eff6661e2fbad46668f535be259a880d`
- 코드: `b729ee6e49963c0e0d4599744fd7d63a2e0b8104`
- 문서와 feature HEAD: `4432e3ca55ed0026dcc9c17a3b6a48b2555603c2`
- canonical no-ff merge: `29403eb8381280ddb75f3045118794d99b1d9eee`
- 기존 `audit_log.event_id` 전용 컬럼을 조회해 `AuditTimelineItem.event_id`로 non-empty
  자기 ID를 반환한다. `causation_id`는 직접 부모 ID이며 두 값을 합성·대체하지 않는다.
- `journey_stage` 허용값은 `alert/evidence/rca/recovery/command/pr/workflow/cluster/ai/`
  `notification/system/unknown`이다. 현재 `EventSubject` 65개를 exact key로 정확히 한 lane에
  배치하며 duplicate·미분류는 로딩과 테스트를 실패시킨다. enum 밖 subject만 `unknown`이다.
- stage는 시간 phase가 아닌 표시 lane이다. 서버의 `(created_at, id)` 순서를 유지하며
  클라이언트가 stage별로 재정렬하거나 subject prefix를 다시 해석하지 않는다.
- 프론트 인계: `references/ui-layer-lab/src/product/api/audit-timeline-schemas.ts`와
  `issuesEndpointContract.ts`의 strict item에 required non-empty `event_id`와 위 enum의
  `journey_stage`를 추가해야 한다. 이 소비자 호환 변경 전에는 새 백엔드 응답과 결합 배포하지 않는다.
- 고유 검증: `tests/test_audit_timeline.py` 10 passed, 알려진 subject 65/65 분류,
  `docs/api/05-rca-dashboard/14-audit-timeline.bru`가 새 필드와 enum을 검산한다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1963 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree clean/tree `46b4497f79d6b400003d669aef5779e5b49a45d6`,
  삭제·소유권 밖·frozen 변경 0건, feature·merge commit의 `origin/dev` ancestor exit 0.

계약 완성: AuditTimelineItem.event_id + journey_stage (b729ee6e49963c0e0d4599744fd7d63a2e0b8104) [green]

### OSS 접속 계약 — canonical 착륙 증거

- 상태: `landed`; gateway 계약 lock을 해제했다.
- RED: `894874e67`부터 `2d4cf3f71`까지 11개 경계 테스트, 보안 보완 RED `8051342a5`.
- GREEN: 동일 origin·self-only `ae9bc8d63`, URL/TLS/CSP 교정 `e480b3246`.
- 응답 계약: preflight/install의 optional `management_access`는 mode, external URL,
  agent server URL, `external|self_only` reachability와 제한 사유를 반환한다.
- Helm 계약: `auto|portforward|loadbalancer|ingress|nodeport`, 외부 TLS 종단 명시,
  provider annotation 전달, 내부 metrics/PostgreSQL, bootstrap Secret 조회 NOTES.
- 로컬 실측: fresh Kind에서 설치, controller/agent, bad rollout, safe PR, reviewer merge,
  GitOps sync, workload 정상화가 exit 0으로 끝났다.
- 공개 OCI는 chart/controller/console anonymous pull이 403이므로 BQ-016과 이 행의 공개 설치
  완료 조건은 충족되지 않았다. 외부 OCI registry publish와 package visibility 변경은 사람 권한 작업이다.
- 후속 보안: URL에 포함되는 install token을 단기 1회용 receipt로 분리해야 한다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest
  `2006 passed, 3 skipped`; manifest management 69/target 20, Helm lint PASS.
- D-024: merge-tree `9853698702e72a1b384d3ae6b68c28447905caf0`, 삭제·frozen 변경 0건.
  feature `cf69ffb5b`와 canonical merge `e8fc3c878`은 모두 `origin/dev` ancestor exit 0이다.

계약 완성: ManagementAccessResponse + Helm access modes (cf69ffb5bc9b98b3da1c0b221b6c9cd5b8c21872) [green]

### GAP-002/003/004 — Resources 필터 코어 claim

- 상태: `in_progress`; gateway 계약 lock은 이 행 하나가 보유한다.
- baseline: `origin/dev@b8bc27988`, 전체 `2006 passed, 3 skipped`, Ruff lint/format PASS,
  import-linter 8 kept/0 broken, manifest management 69/target 20.
- 범위: workspace filter facet catalog, multi-cluster resource list, Resources Label facet/count,
  snapshot-bound opaque cursor와 total/completeness. GAP-010 이후 항목은 건드리지 않는다.
- 권한: session workspace만 사용하고 `resolve_allowed_cluster_ids()`의 구체 set을 SQL에 강제한다.
  `None`이나 빈 권한을 wildcard로 전달하지 않는다.
- 성능: client fan-out과 JSONB Label 전수 집계를 금지한다. ingestion에서 정규화한 Label projection과
  복합 인덱스를 사용하고 projection 불완전은 exact 0으로 가장하지 않는다.

### Resources 필터 코어 — canonical 착륙 증거

- 상태: `landed`; gateway 계약 lock을 해제했다. RED `22c9e5d0a`, GREEN `cbf94623c`,
  snapshot·migration 교정 `87c0606e0`, canonical no-ff merge `d5517ec14`다.
- route: `GET /api/resources/filter-facets`, `GET /api/resources`,
  `GET /api/resources/label-facets`. 기존 단일 cluster inventory route와 응답은 바꾸지 않았다.
- 구조 축은 같은 축 OR·축 간 AND다. namespace는 `<cluster_id>/<namespace>`, application은
  stable ID다. Kubernetes equality Label은 전부 AND이며 `resources.types`,
  `resources.health`, `resources.q`, `resources.includeDeleted`를 canonical query로 쓴다.
- 모든 조회는 session workspace와 `inventory.read`/`application.read`의 구체 ID set을 SQL에
  강제한다. 빈 권한은 정확한 빈 결과이고, 요청한 비인가 cluster/application은 존재를
  노출하지 않는 404다. cursor는 workspace·user·권한 revision·surface·filter fingerprint·
  facet query·snapshot revision에 HMAC으로 결합하며 10분 뒤 만료된다.
- `counts.filtered_count`는 N, `counts.unfiltered_count`는 같은 권한·snapshot에서 cluster
  선택 전 전체 M이다. 각 count는 `exact|partial|unavailable`을 동반한다. 선택 Label은
  selector별로 `resolved|zero|unavailable`을 독립 판정한다.
- 응답의 `snapshot`은 `snapshot_revision`, `authorization_revision`, `filter_fingerprint`,
  `observed_at`, `stale`, `partial_reason_codes`를 제공한다. 부분 snapshot에서 보존된 row는
  실제 source snapshot/관측시각을 유지하고, 과거 cursor에는 미래 삭제시각을 노출하지 않는다.
- projection은 정규화 Label/application mapping과 temporal version을 사용한다. `pg_trgm`
  GIN substring index, validity·keyset B-tree, workspace별 revision lock으로 client 전수 수집과
  tenant 간 쓰기 직렬화를 피한다. migration `20260713_2215`는 신규 테이블·baseline·index를
  한 transaction으로 적용해 실패 시 전체 rollback되며 실 PostgreSQL online
  `upgrade → downgrade → upgrade`와 head `20260713_2215`를 확인했다.
- namespace/label 범위의 evidence query 성공은 full-cluster coverage가 아니므로 destructive
  replace를 금지한다. dedicated authoritative sweep가 생길 때까지 이 경로의 resource/Label
  completeness는 partial이며 프론트는 이를 exact 0으로 해석하면 안 된다.
- Bruno: `docs/api/17-resources-filter/01-filter-facets.bru`,
  `02-list-resources.bru`, `03-label-facets.bru`. GAP-004의 이번 착륙은 `surface=resources`만
  지원하며 Issues/Applications/GitOps/Checks 투영은 후속 GAP-005/006 소관이다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest
  `2051 passed, 3 skipped`; manifest management 69/target 20, Helm lint와 shell syntax PASS.
- D-024: merge-tree/tree `e0230e10dc598e5f2d6cebf3e6c0579994d13307`, 파일 삭제·
  RCA/AI/runtime worker 변경·정책 밖 충돌 0건. code `87c0606e0`과 merge `d5517ec14`는
  모두 `origin/dev` ancestor exit 0이다.

계약 완성: RESOURCES_FILTER_FACETS_PATH (87c0606e0) [green]

계약 완성: FILTERED_RESOURCES_PATH (87c0606e0) [green]

계약 완성: RESOURCE_LABEL_FACETS_PATH (87c0606e0) [green]

### Resources 단일 cluster 그래프 — claim

- 상태: `in_progress`; gateway 계약 lock은 이 행 하나가 보유한다.
- baseline: `origin/dev@e47b0e984`, 전체 `2051 passed, 3 skipped`, Ruff lint/format PASS,
  import-linter 8 kept/0 broken, manifest management 69/target 20, Helm lint PASS.
- 범위: Resources 필터와 같은 session workspace·권한·snapshot revision에서 single-cluster
  node/edge snapshot을 제공한다. stable drill-down identity와 relation evidence만 노출하고
  raw Kubernetes payload·cross-cluster edge·이름 유사도 추론은 금지한다.
- 완전성: filtered node budget, source resource/Label/application completeness, 관계 endpoint
  누락을 구조화 reason으로 반환한다. 증명되지 않은 관계를 합성하지 않는다.

### Resources 단일 cluster 그래프 — canonical 착륙 증거

- 상태: `landed`; gateway 계약 lock을 해제했다. RED `86ed85a06`, 계약 보강 RED
  `721604356`, GREEN `914d34ff6`, canonical no-ff merge `95ff11cc6`이다.
- route: `GET /api/resources/graph`. `clusters`는 정확히 1개가 필수이며 기존 Resources와
  같은 `namespaces`, `applications`, `resources.types`, `resources.health`, `labels`,
  `resources.q`, `resources.includeDeleted`를 사용한다. session workspace와 현재
  `inventory.read`/`application.read`의 구체 ID set을 강제하고, 비인가 cluster/application은
  data query 전 일반 404로 차단한다.
- 표 응답의 `snapshot.snapshot_revision`을 graph의 optional `snapshot_revision`으로 전달하면
  같은 global temporal cut을 고정한다. 존재하지 않거나 미래인 revision은 422다.
  `cluster_projection_revision`은 그 cut 이하에서 선택 cluster가 실제로 투영된 revision이라
  두 값을 합치거나 최신값으로 추측하면 안 된다.
- `ResourceGraphSnapshotResponse` 전체 필드: `graph_revision`, `cluster_projection_revision`,
  `cluster`, `nodes`, `edges`, `root_node_ids`, `counts`, `node_count`, `edge_count`,
  `omitted_node_count`, `omitted_edge_count`, `node_limit`, `edge_limit`, `truncated`,
  `relation_completeness`, `partial_reason_codes`, `snapshot`.
- node는 `node_id`, `category`, `identity{version,cluster_id,resource_type,api_version,kind,
  namespace,name,uid}`, `status`, `health`, `observed_at`, `deleted_at`, `application_ids`,
  `application_binding_completeness`만 제공한다. labels/annotations/summary/raw object는 graph에
  노출하지 않고 기존 detail route의 v1 identity로 drill-down한다.
- edge는 `edge_id`, `from_node_id`, `to_node_id`, `kind`, `plane`, `direction`, `state`,
  `evidence{type,authority,observed_at}`를 제공한다. 합법 관계는 owner UID 기반 `owns`, Pod의
  명시 node assignment 기반 `runs_on`, Kubernetes selector 전체를 3-state로 검증한 `selects`,
  EndpointSlice의 보존된 service-name label 기반 `routes_to`뿐이다. 이름 prefix·label 유사도·
  cross-namespace/cluster 추론은 하지 않는다. 삭제된 endpoint가 포함되면 `state=historical`이다.
- 기본 node 선택은 workload/pod/node/service/endpoint를 event보다 우선하되 필터 결과의 N/M은
  바꾸지 않는다. node/edge limit 초과는 dangling edge 없이 생략 수와 partial reason을 반환한다.
  현재 namespace/label-scoped evidence는 full-cluster sweep가 아니므로 실제 relation completeness가
  partial일 수 있으며 프론트는 이를 exact 0이나 관계 부재로 해석하면 안 된다.
- Bruno: `docs/api/17-resources-filter/04-resource-graph.bru`. 신규 DB schema와 migration은 없다.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest
  `2064 passed, 3 skipped`; manifest management 69/target 20. merge-tree
  `9a055ca263e9c215800531d239d1378037054fac`, 삭제·프론트 소유·RCA/AI/runtime worker 변경 0건.
  code `914d34ff6`과 merge `95ff11cc6`은 모두 `origin/dev` ancestor exit 0이다.

계약 완성: RESOURCES_GRAPH_PATH + ResourceGraphSnapshotResponse (914d34ff699a71d5b09039b42388ff62aebc8d12) [green]

### Issues 필터 계약 — claim

- 상태: `in_progress`; gateway 계약 lock은 이 행 하나가 보유한다. 기준점은
  `origin/dev@cf688f65b`이며 baseline은 전체 `2064 passed, 3 skipped`, Ruff lint/format PASS,
  import-linter 8 kept/0 broken, manifest management 69/target 20이다.
- 기존 `/dashboard/rca/timeline`과 detail route는 변경하지 않는다. 신규 strict route는 session
  workspace와 `RCA_READ`의 구체 cluster ID 집합을 SQL에 강제하고, 빈 집합은 결과 0건,
  비인가 selected scope는 데이터 조회 전에 404로 닫는다.
- `severity`는 incident event의 실제 필드만 투영한다. environment/application/Label처럼 구형
  row 또는 권위 snapshot에 없는 값은 가짜 기본값·현재 inventory 대체 없이 nullable과 구조화
  `unavailable` reason으로 반환한다. mutable in-place timeline에는 temporal history가 없으므로
  cursor·count를 immutable exact snapshot으로 과장하지 않고 partial completeness를 명시한다.
- RED 범위: stable issue/detail identity 분리, 같은 축 OR·축간 AND, exact cluster/namespace pair,
  HMAC cursor의 workspace/user/auth/filter binding, N/M·facet payload, raw payload 비노출,
  legacy projection의 unavailable 처리다.

### Issues 필터 계약 — 착륙 준비

- 상태: `ready_to_land`; canonical 착륙 전이므로 완료 앵커를 기록하지 않고 gateway 계약 lock을
  유지한다.
- route: `GET /api/issues`, `GET /api/issues/filter-facets`,
  `GET /api/issues/label-facets`. 기존 RCA timeline/list/detail 계약은 변경하지 않았다.
- 목록은 stable `issue_id`와 optional `detail_id`, correlation/cluster/namespace/resource identity,
  symptom/severity/state/pipeline status, environment/application/Label 완전성, root cause/confidence,
  `updated_at`을 반환한다. 같은 축은 OR, 서로 다른 축과 Kubernetes Label은 AND다.
- session workspace와 구체 `RCA_READ` cluster 집합을 SQL에 강제한다. event envelope의 tenant만
  권위값으로 사용하며 payload workspace 위조·누락은 fail-closed다.
- event-time evidence snapshot에서만 Label을 보존한다. environment/application은 권위 source가
  없으면 `unavailable`, mutable timeline count/cursor는 `partial`로 정직하게 표시한다.
- migration은 projection column과 concurrent index revision을 분리했다. 실 PostgreSQL에서
  `upgrade → downgrade → upgrade`, 신규 column 8개와 index 6개의 생성·제거·재생성을 확인했다.
- Bruno: `docs/api/18-issues-filter/01-list-issues.bru`,
  `02-filter-facets.bru`, `03-label-facets.bru`.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest
  `2099 passed, 3 skipped`; 착륙 직전 최신 `origin/dev` rebase 후 같은 게이트를 재증명한다.

### Issues 필터 계약 — canonical 착륙 증거

- 상태: `landed`; gateway 계약 lock을 해제했다. GREEN `d63498d5f`, 최종 feature HEAD
  `e00cb9b3e`, canonical no-ff merge `e2504278d`다.
- route: `GET /api/issues`, `GET /api/issues/filter-facets`,
  `GET /api/issues/label-facets`. query는 `clusters`, `namespaces`, `applications`,
  `severities`, `statuses`, `environments`, `labels`, `q`와 opaque cursor를 지원한다.
- 프론트는 `IssueFilterResultsResponse.items[]`의 stable `issue_id`, optional `detail_id`,
  correlation/cluster/namespace/resource identity, symptom/severity/state/pipeline status,
  environment/application/Label 완전성, root cause/confidence, `updated_at`을 사용한다.
  facet·Label 응답은 value/count와 `exact|partial|unavailable`, 선택값 resolution, N/M,
  capability·snapshot partial reason을 함께 제공한다.
- event envelope tenant만 권위값으로 사용하고 payload tenant 위조·누락은 fail-closed다.
  session workspace와 구체 `RCA_READ` cluster scope를 SQL에 강제하며 raw payload는 반환하지 않는다.
- Label은 incident event-time evidence snapshot에서만 투영한다. 권위 source가 없는
  environment/application은 `unavailable`, mutable timeline count/cursor는 `partial`이다.
- migration `20260713_2340`은 nullable projection column 8개를, `20260713_2350`은 concurrent
  index 6개를 분리 적용한다. 실 PostgreSQL `upgrade → downgrade → upgrade`를 통과했다.
- Bruno: `docs/api/18-issues-filter/01-list-issues.bru`,
  `02-filter-facets.bru`, `03-label-facets.bru`.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken, pytest
  `2100 passed, 3 skipped`. merge-tree `43dafb04baa8d9bbd6f04ec356e4ef48647f7399`,
  삭제·frozen source·프론트 소유 경로 변경 0건이다. GREEN·feature·merge는 모두
  `origin/dev` ancestor exit 0이다.

계약 완성: ISSUES_FILTER_RESULTS_PATH + ISSUES_FILTER_FACETS_PATH + ISSUES_LABEL_FACETS_PATH (d63498d5fd84a02d109b68e39f2112d177a5fa92) [green]

### 프론트 그래프 계약 번호 매핑 — claim

- 상태: `in_progress`; 신규 구현이 아니라 이미 canonical에 착륙한 GAP-010의
  `RESOURCES_GRAPH_PATH + ResourceGraphSnapshotResponse`를 BQ-022에 연결한다.
- 기존 code `914d34ff6`, canonical merge `95ff11cc6`, Bruno
  `docs/api/17-resources-filter/04-resource-graph.bru`와 전체 graph 회귀 테스트를 재사용한다.
- 추가 gateway 계약·source 변경은 0건이며, §9의 stale 상태와 workqueue 번호만 정합화한다.

### 프론트 그래프 계약 번호 매핑 — canonical 증거

- BQ-022는 기존 GAP-010과 같은 계약이다. 새 구현 없이 code `914d34ff6`, canonical merge
  `95ff11cc6`, 기존 완료 앵커 `RESOURCES_GRAPH_PATH + ResourceGraphSnapshotResponse`에 연결했다.
- `GET /api/resources/graph`는 Resources 표와 같은 filter/snapshot revision을 사용하고 정확히
  한 authorized cluster만 허용한다. stable drill-down identity와 근거가 검증된 edge만 반환한다.
- unauthorized cluster는 data query 전 404, cross-cluster node는 strict DTO에서 거부한다.
  budget/source/relation 불완전은 count·snapshot·relation completeness와 reason code로 노출한다.
- Bruno `docs/api/17-resources-filter/04-resource-graph.bru`와 기존 contract/router/builder 회귀를
  재사용한다. source·gateway 계약 변경은 0건이며 프론트는 GAP-010의 stale 문구를 기존 GREEN
  앵커 기준으로 갱신할 수 있다.

### 프론트 Issues 계약 번호 매핑 — claim

- 상태: `in_progress`; 신규 구현이 아니라 이미 canonical에 착륙한 GAP-005의
  `ISSUES_FILTER_RESULTS_PATH`, `ISSUES_FILTER_FACETS_PATH`, `ISSUES_LABEL_FACETS_PATH`를
  BQ-023에 연결한다.
- 기존 code `d63498d5f`, canonical merge `e2504278d`, Bruno
  `docs/api/18-issues-filter/`와 전체 Issues filter 회귀를 재사용한다.
- 추가 gateway 계약·source 변경은 0건이며 workqueue 번호만 정합화한다.

### 프론트 Issues 계약 번호 매핑 — canonical 증거

- BQ-023은 기존 GAP-005와 같은 계약이다. 새 구현 없이 code `d63498d5f`, canonical merge
  `e2504278d`, 기존 완료 앵커 세 개에 연결했다.
- `GET /api/issues`, `/api/issues/filter-facets`, `/api/issues/label-facets`는 common scope와
  severity/status/environment, application/cluster/namespace facet, stable detail ID, opaque cursor,
  N/M과 completeness를 제공한다.
- session workspace와 구체 `RCA_READ` cluster 범위를 SQL에 강제하고, 비인가 scope는 404,
  권위 source가 없는 축은 `unavailable`, mutable projection은 `partial`로 반환한다.
- Bruno `docs/api/18-issues-filter/`와 기존 contract/router/projection/migration 회귀를 재사용한다.
  source·gateway 계약 변경은 0건이다.

### Applications 필터 계약 — claim

- 상태: `in_progress`; BQ-024를 2시간 내 안전 착륙 단위로 분해해 Applications strict
  list/facet만 먼저 구현한다. GitOps/Checks 신규 route는 이번 lane에서 만들지 않는다.
- baseline: `origin/dev@887d31e78`, 전체 `2100 passed, 3 skipped`, Ruff lint/format PASS,
  import-linter 8 kept/0 broken이다.
- legacy `GET /api/applications`와 detail 응답은 변경하지 않는다. 신규 route는 session workspace,
  구체 `APPLICATION_READ` app set과 authorized cluster set을 강제한다.
- common cluster/namespace/application과 Applications environment/status/pending-promotion,
  server search, opaque cursor, N/M, facet/count/completeness를 strict DTO로 제공한다.
- live binding resource Label source를 증명하지 못한 항목은 다른 snapshot에서 추측하지 않고
  capability `unavailable`로 격리한다. GitOps/Checks 잔여는 다음 사이클 첫 작업이다.

### Applications 필터 계약 — canonical 증거

- Applications 하위 계약 code `e7196ea7f`, canonical merge `cbba9d28e`가 `origin/dev`
  ancestor exit 0이다. 기존 `GET /api/applications`와 detail 응답은 변경하지 않았다.
- 신규 `GET /api/applications/filter-results`, `/api/applications/filter-facets`,
  `/api/applications/label-facets`는 session workspace와 concrete `APPLICATION_READ` app 집합,
  `INVENTORY_READ` cluster 집합을 강제한다. 비인가 application/cluster/namespace는 404로 닫는다.
- 응답은 provider-neutral allowlist DTO만 사용한다. repository credential·access policy·metadata,
  binding policy, workflow payload는 SQL select와 응답에서 제외했다.
- application status와 허용된 cluster의 최신 workflow run으로 pending promotion을 계산하고,
  active binding의 cluster/namespace/environment만 partial projection으로 반환한다. mutable source라
  count는 `partial`, 같은 revision의 live label source가 없어 Label은 `unavailable`이다.
- revision-pinned read model이 없으므로 다음 page가 필요한 list/facet은 503으로 fail-closed한다.
  cursor 해제 조건은 immutable projection revision과 page 간 snapshot pin을 도입하는 것이다.
- 전체 게이트 Ruff lint/format PASS, import-linter 8/8, pytest `2121 passed, 3 skipped`.
  merge-tree `a52c7cea75404a1dcb4857e278650d83026c2b9c`, 삭제·RCA/AI/runtime worker·프론트
  소유 경로 변경 0건이다. Bruno는 `docs/api/19-applications-filter/`다.
계약 완성: `APPLICATION_FILTER_RESULTS_PATH + APPLICATION_FILTER_FACETS_PATH +
  APPLICATION_LABEL_FACETS_PATH` (`e7196ea7f`) [green].
- 격리 착륙 — 잔여 결함/해제 조건: GitOps·Checks route는 미노출이며 다음 안전 착륙 단위다.
  Applications Label은 동일 revision live-resource binding projection, pagination은 immutable revision,
  대규모 성능은 WorkflowRun/DeploymentBinding EXPLAIN과 검증된 복합 인덱스 migration 후 해제한다.

### AWS dev 배포 — versioned migration 기반

- RED `ab1360017`, GREEN `3696d044a`. service image에 Alembic runtime·ini·revision을 포함하고
  build 시 단일 head `20260713_2350`을 검증한다.
- `management-database-migration` Job은 PgBouncer 대신 direct PostgreSQL secret key를 사용하고,
  schema bootstrap과 같은 advisory key를 session lock으로 획득한다. service-account token은
  mount하지 않는다.
- runner는 unversioned/빈 version/unknown/multiple revision을 모두 거부한다. 실 PostgreSQL 17에서
  unversioned DB는 version table 생성 0건으로 거부됐고, canonical pre-0405 schema에서 0900까지
  정상 적용한 DB는 runner가 `0900→2350` upgrade 및 반복 no-op을 통과했다.
- 격리 착륙 — migration Job은 아직 `aws-up.sh`와 dev CI에 배선하지 않는다. legacy DB baseline과
  live catalog가 증명되지 않았기 때문이다. AWS session은 만료돼 live 읽기 검증도 보류 상태다.
- `create_all`을 0900과 동등하다고 추정하지 않는다. 무표식 전환 정책을 지키기 위해 다음 단위는
  새 versioned baseline DB 생성 → data-only 이관 → catalog/data invariant → 복구 rehearsal →
  DBA 확인 → connection cutover로 진행한다.

## 2026-07-14 — versioned baseline DB bootstrap 안전 착륙

- RED `06fb01334`, GREEN `b2786060d`. 첫 revision 직전 commit `017b2485b...`의 schema-only
  snapshot을 SHA-256으로 고정하고, 새 빈 `public` schema와 두 operator confirmation이 모두
  일치할 때만 정상 `alembic upgrade head`를 실행한다. `stamp` 경로는 없다.
- 실 PostgreSQL 17에서 빈 DB → 50-table snapshot → head `20260713_2350` → 63 tables/149
  indexes, INVALID index 0건을 확인했다. 일반 migration runner 재실행은 `current`였다.
- service image build가 snapshot digest와 단일 head를 검증한다. 전체 게이트 Ruff lint/format
  PASS, import-linter 8/8, pytest `2137 passed, 3 skipped`, manifest 69/20이다.
- 격리 착륙: AWS 경로·application secret에는 미배선이다. data-only 이관·catalog/data invariant·
  restore rehearsal·DBA 승인 전에는 P0-1b 완료나 cutover로 판정하지 않는다.

## 2026-07-14 — dev push gate 구조 강제

- target direct-apply 테스트는 connectivity probe만 격리하고 실제 apply 호출을 유지한다.
  실패 경로는 의도한 502 `apply failed`, apply 1회, DB·이벤트 무변경을 직접 단언한다.
  시정 commit `4ea76988d`는 `origin/dev` ancestor exit 0이고 관련 2개 테스트와 전체
  `2154 passed, 3 skipped`를 통과했다.
- canonical gate는 `make gate` 하나다. 백엔드 Ruff lint/format·import contract·pytest,
  manifest, 프론트 dependency install·typecheck·lint·test·build·dist 산출물을 순서대로 검증한다.
  CI·사람·pre-push가 같은 target을 호출한다.
- `.pre-commit-config.yaml`은 Ruff fix→Ruff format을 pre-commit에, `make gate` wrapper를
  pre-push에 설치한다. `make hooks`가 두 hook을 함께 설치하며 현재 공유 Git 저장소의
  pre-push hook으로 실제 전체 gate PASS를 확인했다.
- pre-commit이 주입한 `GIT_INDEX_FILE` 등 Git 로컬 환경이 pytest의 임시 저장소로 새는 문제는
  `scripts/pre-push-gate.sh`에서 `git rev-parse --local-env-vars` 전부를 제거해 차단했다.
  hostile index 환경의 계약 테스트, 임시 Git 저장소 회귀 6건, 부모 tree 불변을 통과했다.
- 코드 증거: RED `753558ef2`, CI·hook `acaadc485`, 격리 `5c5ea9481`. 모두
  `origin/dev` ancestor exit 0이다.
- 서버 측 `Dev Gate` run `29271435680`은 commit `5c5ea9481`에서 생성됐지만 runner가 배정되기
  전에 GitHub Actions 결제 실패 또는 spending limit로 종료됐다. workflow 배선은 확인됐으나
  서버 실행 증거가 없으므로 P0-0은 `in_progress`다. 결제 복구 또는 CodeBuild 대체 gate가
  dev push에서 실제 실행될 때까지 AWS 배포 스위치를 켜지 않는다.

### GitOps canonical filter 하위 계약

- 계약 경로: `GET /gitops/filter-results`, `GET /gitops/filter-facets`.
- item은 `change_id`, application/repository/binding/cluster/namespace identity,
  environment, revision, workflow status/current step, latest approval status, summary,
  observed time만 노출한다. credential, provider payload, workflow metadata와 approval details는
  응답에 포함하지 않는다.
- 서버가 workspace session과 `inventory.read` cluster grant, `application.read` application
  grant를 교집합으로 적용한다. 빈 grant는 exact empty, 요청한 비인가 scope는 404다.
- authoritative desired-manifest change type과 label projection이 없으므로 해당 capability는
  `unavailable`이며 필터 요청도 빈 결과로 fail-closed한다. mutable projection의 다음 페이지는
  snapshot revision이 생길 때까지 503으로 차단한다.
- 코드 증거: RED `dbd0bc6a1`, GREEN `2bfe44ec8`; 집중 검증 126 passed, import contract 8 kept,
  `gate-fast` 19 backend + 39 frontend tests PASS, 게이트 트리 `2bfe44ec8` T1=T2.
