# 가인: Evidence + RCA + Safe PR 프로덕션 흐름

가인 파트의 목표는 민정이 넘긴 evidence를 근거 있는 RCA 결과와 복구 후보로 바꾸고, 필요하면 command 또는 Safe PR 요청으로 넘기는 것이다.

중요한 기준은 하나다.
RCA는 GitHub에 직접 쓰지 않는다.
PR이 필요하면 `safe_pr.requested`만 만들고, `safe-pr-worker`와 `ai-diff-worker`가 준비 게이트를 통과시킨 뒤 실제 branch, commit, PR 생성은 `scm-worker`와 `GithubScmProvider`가 담당한다.

## 1단계. RCA event 계약을 연다

이 파일을 연다.

```text
src/domains/rca/events.py
```

찾을 값 객체는 아래다.

```text
Evidence
IncidentRecord
EvidenceBundle
CauseCandidate
RcaCompletedBody
RecoveryPlan
```

이 파일이 RCA 전체 계약이다.
필드 이름을 바꾸면 worker, dashboard, Bruno 기대값이 같이 깨진다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_event_golden_path.py -q
```

## 2단계. Evidence worker를 연다

이 파일을 연다.

```text
src/services/ai/evidence-worker/app.py
```

찾을 함수는 `on_cluster_evidence`다.

이 worker는 `cluster.evidence.received`가 RCA로 들어오는 첫 지점이다.
민정이 넘긴 provider bucket을 가인이 읽을 수 있는 Evidence 값으로 바꾼다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 3단계. Evidence builder를 연다

이 파일을 연다.

```text
src/services/ai/agent/pipeline/evidence.py
```

찾을 함수는 `EvidenceBuilder.build_evidence`다.

provider bucket을 공통 RCA 입력으로 고정한다.
Kubernetes, metrics, logs, traces 중 일부가 비어 있어도 부족한 근거가 무엇인지 남겨야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 4단계. Incident worker를 연다

이 파일을 연다.

```text
src/services/ai/incident-worker/app.py
```

찾을 함수는 `on_evidence_built`다.

이 단계는 root cause를 확정하는 단계가 아니다.
symptom, affected resource, severity를 만들고 evidence bundle을 준비한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 5단계. Incident classifier와 bundler를 확인한다

이 파일을 연다.

```text
src/services/ai/agent/pipeline/incident.py
```

찾을 것은 `IncidentDetector`와 `EvidenceBundler`다.

IncidentDetector는 symptom과 affected resource를 만든다.
EvidenceBundler는 incident별 증거 목록과 missing evidence를 만든다.

RCA는 항상 결론을 내면 안 된다.
incident context가 없거나 symptom rule이 없거나 근거가 부족하면 action required로 가야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 6단계. RCA cause catalog를 확인한다

이 파일들을 연다.

```text
src/services/ai/agent/causes/catalog/crashloop.yaml
src/services/ai/agent/causes/loader.py
src/services/ai/agent/playbooks/cause.py
```

찾을 것은 YAML `rules` 항목과 `CauseCandidateSpec`으로 변환되는 필드다.

새 RCA rule은 symptom과 후보를 같은 YAML rule에 등록한다.

```yaml
rules:
  - id: "crashloop_backoff"
    symptoms: ["CrashLoopBackOff", "pod_restart_loop"]
    required_sources: ["kubernetes", "metrics", "logs"]
    candidates:
      - candidate_id: "oom_killed"
        title: "컨테이너 OOMKilled"
        description: "컨테이너가 메모리 제한을 초과해 재시작됐을 가능성이 있습니다."
        expected_evidence: ["kubernetes", "metrics", "logs"]
        checks:
          - "containerStatuses.lastState.terminated.reason == OOMKilled 확인"
          - "restartCount 증가와 memory usage가 limit 근처인지 확인"
```

`symptoms`는 IncidentRecord symptom과 매칭할 이름이다.

`required_sources`는 RCA 전에 필요한 evidence bucket이다.

`candidate_id`는 root cause와 recovery rule 연결 키다.

`expected_evidence`는 후보 평가에 필요한 source 목록이다.

`checks`는 사람이 확인할 판단 기준이다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 7단계. 현재 symptom profile을 확인한다

이 폴더를 연다.

```text
src/services/ai/agent/causes/
```

새 symptom rule을 어디에 추가할지 본다.

첨부된 RCA symptom 자료는 symptom, 후보, Kubernetes API, metrics, logs, traces, metadata, 판단 기준으로 나뉜다.
코드에서는 이 값을 catalog YAML의 `symptoms`, `required_sources`, `candidate_id`, `expected_evidence`, `checks`로 옮긴다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 8단계. Cause engine을 확인한다

이 파일을 연다.

```text
src/services/ai/agent/causes/engine.py
```

찾을 함수는 `plan_causes`, `evaluate_causes`, `analyze_root_cause`다.

`plan_causes`는 symptom에 맞는 원인 후보를 만든다.

`evaluate_causes`는 필요한 evidence와 실제 evidence를 비교한다.

`analyze_root_cause`는 근거가 있을 때만 root cause를 확정한다.

근거가 부족하면 `root_cause="insufficient_evidence"` 또는 action required로 가야 한다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 9단계. Recovery decorator를 확인한다

이 폴더를 연다.

```text
src/services/ai/agent/recovery/
```

찾을 것은 `@rca.recovery`와 `RecoveryDispatcher`다.

root cause와 조치 후보를 연결한다.

route가 `auto`면 `CommandRequestedBody`로 간다.

route가 `safe_pr`이면 `SafePrRequestedBody`로 간다.

approval이 필요하면 `RcaActionRequiredBody`로 멈춘다.

forbidden이면 자동 조치하지 않는다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_rca_evidence.py -q
```

## 10단계. Safe PR 경계를 확인한다

이 파일을 연다.

```text
src/services/gitops/safe-pr-worker/app.py
src/services/ai/diff-worker/app.py
src/services/gitops/scm-worker/app.py
```

찾을 함수는 `on_safe_pr_requested`, `on_safe_pr_patch_prepared`, `on_safe_pr_ready_for_creation`이다.

흐름은 아래다.

```text
RecoveryDispatcher
  -> SafePrRequestedBody
  -> safe-pr-worker
  -> SafePrPatchPreparedBody
  -> ai-diff-worker
  -> SafePrReadyForCreationBody
  -> scm-worker
  -> GithubScmProvider
  -> SafePrCreatedBody 또는 SafePrFailedBody
```

`SafePrRequestedBody`에는 title, body, provider, patches, workspace_id, repository_id, next_alert가 들어간다.

`safe_pr.requested`에는 PR URL이 없다.
URL은 `safe_pr.created` 이후에만 생긴다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_repo_gateway_worker.py -q
```

## 11단계. RCA가 멈춰야 하는 조건을 확인한다

RCA는 항상 결론을 내면 안 된다.

incident context가 없으면 `RcaActionRequiredBody`로 멈춘다.

incident가 감지되지 않으면 조치하지 않는다.

symptom rule이 없으면 backlog, AI fallback, action required로 갈 수 있어야 한다.

후보는 있지만 근거가 없으면 root cause를 확정하지 않는다.

recovery 후보가 없으면 사람이 판단하도록 남긴다.

이 조건은 운영 신뢰도에 중요하다.
추측을 root cause처럼 보여주면 안 된다.

바로 확인할 테스트:

```bash
PYTHONPATH=src .venv/bin/python -m pytest tests/test_event_golden_path.py tests/test_rca_evidence.py -q
```

## 12단계. 변경할 때 같이 고칠 곳을 확인한다

새 symptom rule을 추가하면 `src/services/ai/agent/causes/catalog/*.yaml`, 후보, required evidence, loader/schema test를 같이 고친다.

새 recovery route를 추가하면 `src/services/ai/agent/recovery/*.py`, `@rca.recovery`, dispatch test를 같이 고친다.

evidence bundle을 바꾸면 `pipeline/evidence_bundle.py`와 missing evidence test를 같이 본다.

RCA body를 바꾸면 `src/domains/rca/events.py`, EventSubject, worker, docs, test를 같이 바꾼다.

Safe PR payload를 바꾸면 recovery dispatch, `src/domains/scm/events.py`, scm-worker, GithubScmProvider test를 같이 본다.

## 13단계. 가인 전체 검증을 돌린다

```bash
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_rca_evidence.py \
  tests/test_event_golden_path.py \
  tests/test_repo_gateway_worker.py \
  tests/test_projection.py \
  -q
```

## 14단계. Bruno로 확인한다

Bruno는 `docs/api`를 collection root로 연다.

가인은 `03-agent-runtime/08-direct-agent-evidence.bru`, `05-rca-dashboard`, `06-gitops-approval`, `07-ai`를 확인한다.
