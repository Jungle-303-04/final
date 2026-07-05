# 10. Kubernetes Pod/Event Reader

## 목표

실제 cluster의 pod 상태와 Kubernetes Event를 읽어 `kubernetes` evidence bucket을 만든다.

## 먼저 읽을 파일

- `src/services/target/cluster-agent/kubernetes_api.py`
- `src/services/target/cluster-agent/providers/kubernetes_providers.py`
- `src/services/target/node-collector/kubernetes_api.py`
- `deploy/target/target.yaml`
- [09. MetricEvidence Summary](09-metric-evidence-summary.md)

## 수정 후보

- `src/services/target/cluster-agent/providers/kubernetes_providers.py`
- `src/services/target/cluster-agent/evidence/collector.py`
- `src/domains/target/evidence_policy.py`
- `tests/test_target_kubernetes_evidence.py`
- `tests/test_target_evidence_jobs.py`

## 선형 절차

1. `KubernetesSnapshotProvider`를 `@telemetry.source(source="kubernetes", evidence_key="kubernetes")`로 등록한다.
2. `KubernetesSnapshotQuery.query` 값은 namespace로 사용한다.
3. pods, events, nodes, deployments, statefulsets, daemonsets, replicasets, services, endpoint slices를 읽는다.
4. pod phase, container status, restart count를 normalize한다.
5. Kubernetes Event reason/message를 normalize한다.
6. API 설정이 없으면 provider status에 unavailable reason을 남긴다.
7. write 권한은 이 provider에 추가하지 않는다.
8. default evidence policy에 `target_namespace_snapshot` query를 둔다.

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
PYTHONPATH=src .venv/bin/python -m pytest \
  tests/test_target_kubernetes_evidence.py \
  tests/test_target_evidence_jobs.py \
  -q
```

## 완료 기준

- pod 상태와 event를 주입 가능한 Kubernetes API transport로 테스트할 수 있다.
- `kubernetes` bucket에 cluster, pods, events, nodes, workloads, services, endpoints, provider_status가 들어간다.
- RBAC 최소 권한 설명이 PR 또는 문서에 있다.
- command write 권한을 이 작업에서 넓히지 않았다.

## 다음 작업

[11. Kubernetes + Metric Evidence 결합](11-combined-kubernetes-metric-evidence.md)
