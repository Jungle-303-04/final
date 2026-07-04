# 00. 현재 코드 지도와 테스트 기준

이 페이지는 RCA / Safe PR 작업을 시작하기 전에 현재 코드가 어디까지 구현되어 있는지 확인하는 지도다.

1번 작업부터 바로 코드를 바꾸기 전에 이 페이지의 파일과 테스트를 먼저 확인한다.

## 현재 event chain

현재 RCA 쪽 기본 흐름은 이미 코드에 있다.

```text
cluster.evidence.received
  -> evidence.built
  -> incident.detected
  -> evidence.bundle.built
  -> rca.candidates.planned
  -> rca.candidates.evaluated
  -> rca.completed
```

Safe PR 쪽 연결은 별도 흐름이다.

```text
safe_pr.requested
  -> safe_pr.created
  -> safe_pr.failed
```

## 현재 코드 파일

| 목적 | 파일 |
| --- | --- |
| evidence 수신 body | `src/domains/rca/events.py` |
| evidence 정규화 worker | `src/services/ai/evidence-worker/app.py` |
| incident 판단 worker | `src/services/ai/incident-worker/app.py` |
| evidence bundle worker | `src/services/ai/plan-worker/app.py` |
| 후보 평가 worker | `src/services/ai/analyze-worker/app.py` |
| 최종 RCA worker | `src/services/ai/rca-worker/app.py` |
| Safe PR request/created/failed body | `src/domains/scm/events.py` |
| Safe PR provider worker | `src/services/gitops/scm-worker/app.py` |
| audit 저장 | `src/services/projection/audit-worker/app.py`, `src/domains/audit` |

## 현재 body shape

`ClusterEvidenceReceivedBody`는 provider별 summary bucket을 받는다.

```python
ClusterEvidenceReceivedBody(
    cluster_id="target-cluster-01",
    workspace_id="workspace-1",
    kubernetes={
        "resource": {
            "kind": "deployment",
            "name": "checkout-api",
            "namespace": "sandbox",
        },
        "pods": [{"name": "checkout-api", "status": "CrashLoopBackOff"}],
        "symptom": "CrashLoopBackOff",
        "severity": "high",
    },
    metrics={"memory": "near-limit"},
    logs=[{"line": "OOMKilled"}],
    traces={"slow_span": "GET /checkout"},
)
```

`RcaCompletedBody`는 현재 아래 필드를 기준으로 한다.

```python
RcaCompletedBody(
    root_cause="oom_killed",
    action="plan_recovery",
    evidence_ref="object://evidence/corr-123.json",
    workspace_id="workspace-1",
    evidence=evidence,
    incident=incident,
    evidence_bundle=bundle,
    rca_detail=RcaReportDetail(
        root_cause="oom_killed",
        confidence=0.91,
        selected_candidate_id="oom_killed",
        supporting_evidence=["kubernetes", "logs"],
        missing_evidence=[],
        reason="OOMKilled log and restart loop observed",
    ),
)
```

`correlation_id`는 위 body 안의 필드가 아니다. runtime `EventEnvelope`가 들고 있는 메타데이터다.

## 먼저 돌릴 테스트

```bash
uv run pytest tests/test_rca_evidence.py
```

이 테스트에서 확인할 것:

- CrashLoopBackOff evidence가 `rca.completed`까지 흐르는지
- 빈 evidence가 성공 RCA처럼 보이지 않는지
- `db.save_evidence`, `db.save_rca_report` 호출이 있는지
- event subject 순서가 바뀌지 않았는지

Safe PR worker를 건드리면 추가로 실행한다.

```bash
uv run pytest tests/test_repo_gateway_worker.py
```

Audit projection을 건드리면 추가로 실행한다.

```bash
uv run pytest tests/test_projection.py
```

## 코드 읽는 순서

1. `tests/test_rca_evidence.py`에서 happy path를 먼저 본다.
2. `src/domains/rca/events.py`에서 body shape를 확인한다.
3. `src/services/ai/evidence-worker/app.py`부터 `rca-worker/app.py`까지 worker handler를 순서대로 본다.
4. Safe PR을 건드릴 때만 `src/domains/scm/events.py`, `src/services/gitops/scm-worker/app.py`를 본다.
5. audit을 건드릴 때만 `src/services/projection/audit-worker/app.py`를 본다.

## 모순 방지 규칙

- `RcaCompletedBody`에 없는 `status` 필드를 문서나 테스트에서 있다고 쓰지 않는다.
- insufficient evidence는 `rca.completed` 성공처럼 만들지 않는다.
- Safe PR request에 patch/file change를 직접 넣는다고 쓰지 않는다. 현재 patch 초안은 `safe_pr.patch_prepared` 흐름이다.
- 실제 GitHub token은 event body, response, log, audit 어디에도 넣지 않는다.
- 작업 후에는 [팀 간 구현 연결과 테스트 가이드](../../cross-role-implementation-test-guide.md)의 RCA/Safe PR 섹션과 맞는지 확인한다.

## 다음 작업

[01. Evidence 입력 계약](01-evidence-input-contract.md)
