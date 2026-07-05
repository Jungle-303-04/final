# 가인: Evidence + RCA + Safe PR

가인 파트의 목표는 민정이 넘긴 evidence를 근거 있는 RCA 결과와 복구 후보로 바꾸고, 필요하면 command 또는 Safe PR 요청으로 넘기는 것이다.

중요한 기준은 하나다. RCA는 GitHub에 직접 쓰지 않는다. PR이 필요하면 `safe_pr.requested`만 만들고, 실제 branch/commit/PR 생성은 `scm-worker`와 `GithubScmProvider`가 담당한다.

## 먼저 열 파일 순서

| 순서 | 파일 | 무엇을 봐야 하는가 | 왜 먼저 보는가 |
| --- | --- | --- | --- |
| 1 | `src/domains/rca/events.py` | `Evidence`, `IncidentRecord`, `EvidenceBundle`, `CauseCandidate`, `RcaCompletedBody`, `RecoveryPlan` | RCA 전체 계약이 여기 있다. |
| 2 | `src/services/ai/evidence-worker/app.py` | `on_cluster_evidence` | `cluster.evidence.received`가 RCA로 들어오는 첫 worker다. |
| 3 | `src/services/ai/agent/pipeline/evidence.py` | `EvidenceBuilder.build_evidence` | provider bucket을 `Evidence` 값 객체로 고정한다. |
| 4 | `src/services/ai/incident-worker/app.py` | `on_evidence_built` | evidence에서 incident와 evidence bundle을 만든다. |
| 5 | `src/services/ai/agent/pipeline/incident.py` | `IncidentDetector`, `EvidenceBundler` | symptom과 affected resource가 어떻게 생기는지 본다. |
| 6 | `src/services/ai/agent/playbooks/cause.py` | `@rca.cause`, `CauseCandidateSpec` | RCA rule catalog 작성법이다. |
| 7 | `src/services/ai/agent/causes/*.py` | 현재 등록된 symptom profile | 새 symptom rule을 어디에 추가할지 본다. |
| 8 | `src/services/ai/agent/causes/engine.py` | `plan_causes`, `evaluate_causes`, `analyze_root_cause` | 후보 생성, 평가, 최종 원인 선택 기준이다. |
| 9 | `src/services/ai/agent/recovery/*.py` | `@rca.recovery`, `RecoveryDispatcher` | root cause를 command 또는 PR 요청으로 바꾸는 기준이다. |
| 10 | `src/services/gitops/scm-worker/app.py` | `on_safe_pr_requested` | PR 생성 경계가 어디인지 확인한다. |

## RCA 전체 흐름

```text
cluster.evidence.received
  -> Evidence
  -> IncidentRecord
  -> EvidenceBundle
  -> CauseCandidate[]
  -> CauseEvaluation[]
  -> RcaReportDetail
  -> RcaCompletedBody
  -> RecoveryPlan
  -> RecoveryActionSelectedBody
  -> CommandRequestedBody 또는 SafePrRequestedBody
```

| 단계 | 현재 코드 | 왜 필요한가 | 다음에 쓰이는 곳 |
| --- | --- | --- | --- |
| evidence 정규화 | `EvidenceBuilder.build_evidence` | provider bucket을 공통 RCA 입력으로 만든다. | DB `evidence`, incident classifier |
| incident 분류 | `IncidentDetector.classify` | symptom, resource, severity를 만든다. | rule matching |
| evidence bundle | `build_incident_evidence_bundle` | incident별 증거 목록과 missing evidence를 만든다. | candidate planning |
| 후보 생성 | `CausePlanner.plan_bodies` | symptom에 맞는 원인 후보를 만든다. | analyzer |
| 후보 평가 | `CauseEvaluator.evaluate_body` | 필요한 evidence와 실제 evidence를 비교한다. | final RCA |
| 최종 RCA | `RootCauseAnalyzer.complete_body` | 근거가 있을 때만 root cause를 확정한다. | recovery planner, audit, UI |
| 복구 계획 | `RecoveryPlanner.plan_body` | root cause를 조치 후보로 바꾼다. | select worker |
| route 선택 | `RecoverySelector.select_body` | 자동 실행, 승인 필요, PR 요청을 분리한다. | dispatch worker |
| dispatch | `RecoveryDispatcher.dispatch_body` | command 또는 PR 요청 event를 만든다. | command-worker, scm-worker |

## `@rca.cause` 사용법

새 RCA rule은 symptom과 후보를 같이 등록한다.

```python
@rca.cause(
    symptoms=("CrashLoopBackOff", "pod_restart_loop"),
    required_sources=("kubernetes", "metrics", "logs"),
    candidates=(
        CauseCandidateSpec(
            candidate_id="oom_killed",
            title="컨테이너 OOMKilled",
            description="컨테이너가 메모리 제한을 초과해 재시작됐을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "metrics", "logs"),
            checks=(
                "containerStatuses.lastState.terminated.reason == OOMKilled 확인",
                "restartCount 증가와 memory usage가 limit 근처인지 확인",
            ),
        ),
    ),
)
class CrashLoopBackOffProfile:
    pass
```

| 값 | 왜 필요한가 | 어디에서 쓰이는가 |
| --- | --- | --- |
| `symptoms` | `IncidentRecord.symptom`과 매칭할 이름이다. | `SymptomCauseRule.matches` |
| `required_sources` | RCA 전에 필요한 evidence bucket을 정한다. | `required_evidence_sources` |
| `candidate_id` | root cause와 recovery rule 연결 키다. | `RcaReportDetail.root_cause`, `@rca.recovery` |
| `expected_evidence` | 후보를 평가할 때 필요한 source 목록이다. | `evaluate_causes` |
| `checks` | 사람이 확인할 판단 기준이다. | RCA 설명, PR 본문, UI |

왜 class body가 비어 있는가:

- class 자체는 marker다.
- 실제 등록은 decorator가 `CAUSE_PROFILES`에 `CauseProfile`을 추가하면서 끝난다.
- rule 로딩은 `services.ai.agent.causes.catalog`가 담당한다.

## 원본 RCA symptom 표 반영 기준

첨부된 `rca_symptom_list.numbers`는 실제로 읽어서 확인했다.

| 항목 | 값 |
| --- | --- |
| 시트 | `증상별 RCA 후보` |
| 행/열 | 103행, 9열 |
| 데이터 행 | 100개 후보 |
| 증상 수 | 39개 |
| 카테고리 | Application, Deployment / GitOps, External Dependency, Network, Pod 상태, Resource, Scheduling, Security / Policy |

표의 컬럼은 아래 코드 구조로 옮긴다.

| 표 컬럼 | 코드 위치 | 왜 필요한가 |
| --- | --- | --- |
| 카테고리 | rule module 파일 분리 기준 | 사람이 rule을 찾기 쉽게 한다. |
| 증상 | `symptoms=(...)` | incident classifier와 rule matching의 연결 키다. |
| 후보 | `CauseCandidateSpec.candidate_id/title` | root cause 후보와 recovery 연결 키다. |
| Kubernetes API | `expected_evidence`, `checks`, provider query | Kubernetes snapshot에서 확인할 필드다. |
| Prometheus / Metrics | `expected_evidence`, debug query, provider policy | 수치 근거를 수집한다. |
| Logs / Traces / Env | `expected_evidence`, log/trace provider policy | 문장/trace 근거를 수집한다. |
| Metadata / Change | `checks`, Safe PR body, GitOps diff basis | 배포 변경과 원인 시점을 연결한다. |
| 판단 기준 | `checks`, evaluator rule | score와 confidence 근거다. |
| 근거 메모 | docs, PR body, UI tooltip | 환경 의존 여부와 주의점을 남긴다. |

## RCA가 멈춰야 하는 경우

RCA는 항상 결론을 내면 안 된다.

| 조건 | 현재 코드 | 출력 | 이유 |
| --- | --- | --- | --- |
| incident context 누락 | `EvidenceBundler.build_body` | `RcaActionRequiredBody` | 어떤 resource/symptom인지 모르면 RCA를 시작할 수 없다. |
| incident 미감지 | `EvidenceBundler.build_body` | `RcaActionRequiredBody` | 장애 신호가 없으면 조치하지 않는다. |
| symptom rule 없음 | `CausePlanner.plan_bodies` | `RcaRuleMissingBody`, `RcaBacklogItemCreatedBody`, `RcaAiFallbackRequestedBody` | rule catalog 보강이 필요하다. |
| 후보는 있지만 근거 없음 | `analyze_root_cause` | `root_cause="insufficient_evidence"` | 추측을 root cause처럼 보여주지 않는다. |
| recovery 후보 없음 | `RecoveryPlanner.plan_body` | `RcaActionRequiredBody` | 실행 가능한 조치가 없으면 사람 판단으로 넘긴다. |

## `@rca.recovery` 사용법

root cause와 조치 후보를 연결한다.

```python
@rca.recovery(
    root_causes=("oom_killed",),
    actions=(
        RecoveryActionSpec(
            action_type="rollout_restart",
            title="대상 워크로드 재시작",
            description="낮은 위험도의 임시 완화 조치로 대상 워크로드를 재시작합니다.",
            route=routes.auto,
            risk_level="low",
            score=0.58,
            blast_radius="target_workload",
            approval_required=False,
            validation_checks=("재시작 후 ready replica 회복",),
            rollback_plan="재시작은 되돌릴 변경이 없으며, 실패 시 수동 조사로 전환합니다.",
            params={"command": "rollout_restart"},
        ),
    ),
)
class OomKilledRecoveryActions:
    pass
```

| route | 출력 event | 왜 필요한가 |
| --- | --- | --- |
| `auto` | `CommandRequestedBody` | 정책상 자동 실행 가능한 조치를 command-worker로 넘긴다. |
| `safe_pr` | `SafePrRequestedBody` | manifest/config/image 변경처럼 GitHub PR이 필요한 조치를 넘긴다. |
| `approval_required` | `RcaActionRequiredBody` | 사람이 먼저 승인하거나 확인해야 한다. |
| `forbidden` | `RcaActionRequiredBody` | 자동 조치하면 안 되는 경우를 명확히 막는다. |

## Safe PR 경계

가인이 만드는 것은 PR 요청이다.

```text
RecoveryDispatcher
  -> SafePrRequestedBody
  -> scm-worker
  -> GithubScmProvider
  -> SafePrCreatedBody 또는 SafePrFailedBody
```

`SafePrRequestedBody`에 넣는 값:

| 필드 | 왜 필요한가 | 어디에서 쓰이는가 |
| --- | --- | --- |
| `title` | PR 제목이다. | GitHub PR |
| `body` | RCA 이유, 검증, rollback 설명이다. | GitHub PR, audit, UI |
| `provider` | SCM provider 선택이다. | `scm-worker` provider mismatch 방지 |
| `patches` | 실제 파일 변경 목록이다. | `GithubScmProvider` branch commit |
| `workspace_id` | tenant 경계다. | repository/credential 선택 |
| `repository_id` | 어느 repo에 PR을 만들지 정한다. | `normalize_safe_pr_request` |
| `next_alert` | PR 생성 뒤 알림을 이어 붙일 때 쓴다. | `scm-worker` |

## 바로 돌릴 테스트

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_rca_evidence.py \
  tests/test_event_golden_path.py \
  tests/test_repo_gateway_worker.py \
  tests/test_projection.py \
  -q
```

## 구현 체크리스트

| 작업 | 파일 | 완료 기준 |
| --- | --- | --- |
| 새 symptom rule 추가 | `src/services/ai/agent/causes/*.py` | `@rca.cause` 등록, 후보/required evidence/test 추가 |
| 새 recovery route 추가 | `src/services/ai/agent/recovery/*.py` | `@rca.recovery` 등록, dispatch test 추가 |
| evidence bundle 변경 | `pipeline/evidence_bundle.py` | missing evidence와 item source가 깨지지 않는다 |
| RCA body 변경 | `src/domains/rca/events.py` | EventSubject, worker, docs, test가 같이 바뀐다 |
| Safe PR payload 변경 | `recovery/dispatch.py`, `domains/scm/events.py` | `scm-worker`와 `GithubScmProvider` 테스트가 통과한다 |
