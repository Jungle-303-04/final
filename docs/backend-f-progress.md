---
title: 백엔드 F 진행 현황
status: active-progress
date: 2026-07-13
governing: docs/f-coordination-plan.md · docs/backend-f-workqueue.md
---

# 백엔드 F 진행 현황

현재 상태: **앵커 6건**

## Delta-green baseline

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

- 상태: done, gateway 계약 lock 해제
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

### BQ-014 — Argo observer 어댑터

- 상태: landed
- 담당 lane: `codex/f-argocd-observer`
- 착수 기준: `origin/dev@621a60a1c83bf12b2cb93fc50439f5a7fc4df00d`
- 전체 게이트 baseline: Ruff lint/format PASS, import-linter 2 kept/0 broken,
  pytest `1735 passed, 3 skipped`
- 범위: `reconciler_mode=argocd`에서 Argo CD Application과 Rollout stable revision을
  읽기만 하며 Kubernetes/Argo 쓰기 호출은 0건으로 고정한다.
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
  `~/.radar/kubeheal-timeline.db` 레거시 저장 경로와 Apache License 원문도 유지했다.
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
- 문서: `docs/auto/deploy-plan.md`
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
