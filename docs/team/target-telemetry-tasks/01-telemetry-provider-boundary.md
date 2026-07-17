# 01. 현재 Telemetry Provider 경계

## 목표

현재 source repo 기준 telemetry provider 경계를 문서화한다.

이 작업이 끝나면 작업자는 현재 provider, target manifest, evidence job 흐름을 기준으로 작업한다.

## 먼저 읽을 파일

- `src/services/target/cluster-agent/telemetry_registry.py`
- `src/services/target/cluster-agent/providers/kubernetes_providers.py`
- `src/services/target/cluster-agent/providers/prometheus_providers.py`
- `src/services/target/cluster-agent/providers/loki_providers.py`
- `src/services/target/cluster-agent/providers/tempo_providers.py`
- `src/services/target/node-collector/app.py`
- `deploy/target/prometheus.yaml`
- `deploy/target/loki.yaml`
- `deploy/target/opentelemetry.yaml`
- `deploy/target/tempo.yaml`
- `deploy/target/target.yaml`
- `docs/team/member-guides/target-agent-command-evidence-flow.md`
- `docs/rca-production-onboarding/01-minjeong-command-target-evidence.md`

## 수정 후보

- `docs/team/member-guides/target-agent-command-evidence-flow.md`
- `docs/team/target-telemetry-tasks/01-telemetry-provider-boundary.md`

## 선형 절차

1. `@telemetry.source(...)`로 source, evidence key, query type이 등록되는지 확인한다.
2. Kubernetes, Prometheus, Loki, Tempo, `MetadataProvider`가 각각 어떤 API나 metadata snapshot을 호출/구성하는지 확인한다.
3. node-collector의 `/metrics`가 Prometheus scrape target이라는 설명을 문서에 넣는다.
4. `deploy/target/*.yaml`의 관측성 backend manifest를 확인한다.
5. evidence job schedule/poll/result 경로로 provider 결과가 aggregate되는지 문서에 고정한다.

## 문서에 넣을 예시

```text
Kubernetes provider:
  Kubernetes API 호출
  evidence key = kubernetes

Prometheus provider:
  /api/v1/query 호출
  /api/v1/query_range 호출
  evidence key = metrics

Loki provider:
  /loki/api/v1/query_range 호출
  evidence key = logs

Tempo provider:
  /api/search 호출
  evidence key = traces

node-collector:
  /metrics 제공
  Prometheus의 scrape target

target observability manifests:
  deploy/target/prometheus.yaml
  deploy/target/loki.yaml
  deploy/target/opentelemetry.yaml
  deploy/target/tempo.yaml
```

## 검증

```bash
rg "KubernetesSnapshotProvider|PrometheusRangeQuery|LokiLogsProvider|TempoTracesProvider|MetadataProvider|@telemetry.source" src/services/target/cluster-agent
PYTHONPATH=src .venv/bin/python -m pytest tests/test_telemetry_registry.py tests/test_target_kubernetes_evidence.py tests/test_target_metric_evidence.py -q
git diff --check -- docs/team/member-guides/target-agent-command-evidence-flow.md docs/team/target-telemetry-tasks/01-telemetry-provider-boundary.md
```

## 완료 기준

- 현재 provider 파일과 target manifest가 문서에 명시되어 있다.
- 첫 Prometheus scrape target이 node-collector `/metrics`라고 적혀 있다.
- provider 결과가 evidence job result로 들어간다는 점이 보인다.

## 다음 작업

[02. Observability 설치 경계](02-observability-stack-boundary.md)
