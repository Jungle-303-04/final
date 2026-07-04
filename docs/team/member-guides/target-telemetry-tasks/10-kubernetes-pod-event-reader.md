# 10. Kubernetes Pod/Event Reader

## 목표

실제 cluster의 pod 상태와 Kubernetes Event를 읽어 evidence 재료로 만든다.

## 먼저 읽을 파일

- `src/services/target/cluster-agent/kubernetes_api.py`
- `src/services/target/node-collector/kubernetes_api.py`
- `deploy/target/target.yaml`
- [09. MetricEvidence Summary](09-metric-evidence-summary.md)

## 수정 후보

- `src/services/target/cluster-agent/kubernetes_api.py`
- `src/services/target/cluster-agent/evidence/collector.py`
- `src/services/target/node-collector/kubernetes_api.py`
- `tests/test_target_pod_evidence.py`
- `tests/test_target_agent_commands.py`

## 선형 절차

1. Kubernetes read client adapter 위치를 정한다.
2. sandbox namespace를 우선 대상으로 둔다.
3. pod phase, container status, restart count를 읽는다.
4. Kubernetes Event reason/message를 읽는다.
5. CrashLoopBackOff, OOMKilled, Pending fixture를 만든다.
6. RBAC는 list/get/watch 중 실제 필요한 권한만 둔다.
7. write 권한은 이 작업에 추가하지 않는다.
8. API 실패 시 evidence 수집 실패를 구조화해서 반환한다.

## 수집 필드 예시

```text
namespace
pod
phase
container_name
container_reason
restart_count
event_reason
event_message
observed_at
```

## 검증

```bash
uv run pytest tests/test_target_pod_evidence.py
uv run ruff check src tests
```

## 완료 기준

- pod 상태와 event를 fake Kubernetes client로 테스트할 수 있다.
- CrashLoopBackOff/OOMKilled/Pending fixture가 있다.
- RBAC 최소 권한 설명이 PR 또는 문서에 있다.
- command write 권한을 이 작업에서 넓히지 않았다.

## 다음 작업

[11. Kubernetes + Metric Evidence 결합](11-combined-kubernetes-metric-evidence.md)
