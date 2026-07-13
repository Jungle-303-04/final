---
title: 백엔드 F 진행 현황
status: active-progress
date: 2026-07-13
governing: docs/f-coordination-plan.md · docs/backend-f-workqueue.md
---

# 백엔드 F 진행 현황

현재 상태: **앵커 33건**

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

- 상태: landed
- 담당 lane: `codex/kubernetes-dry-run-tests`
- 테스트와 feature HEAD: `ccdcc1a08aef4d1aa30929dea717f455ea0a447e`
- canonical no-ff merge: `01dc635583f45d058d0d324d70b0c02a42d66889`
- `src/services/gitops/diff-worker/kubernetes_dry_run.py` 소스 변경 없이 직접 테스트 8개를 추가했다.
- 실제 임시 `desired.json` 내용과 정리, custom kubectl·field manager·timeout 전달,
  SSA apply 다음 live get의 정확한 argv와 kind/name/namespace 경계를 고정했다.
- apply 실패 시 get 차단, get 실패 시 predicted 보존, kubectl 부재·timeout·process error·
  invalid JSON 매핑, import-time timeout 기본값 binding을 검증했다.
- 고유 검증: `tests/test_kubernetes_dry_run.py` 8 passed.
- 전체 게이트: Ruff lint/format PASS, import-linter 8 kept/0 broken,
  pytest `1942 passed, 3 skipped`; manifest management 69 / target 20.
- 4조건: merge-tree exit 0/tree `68cb35ca8dc94ec15299e23824edd86d85e5ead4`;
  파일 삭제·소유권 밖 변경·frozen 경로 변경 0건; test·merge commit의 `origin/dev`
  ancestor exit 0.

계약 완성: kubectl server dry-run subprocess and error mapping tests (ccdcc1a08aef4d1aa30929dea717f455ea0a447e) [green]

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
