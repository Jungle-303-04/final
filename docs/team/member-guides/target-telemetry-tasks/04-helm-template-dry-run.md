# 04. Helm Template / Dry-run

## 목표

실제 cluster에 apply하기 전에 Helm chart가 만드는 YAML을 검증할 수 있게 한다.

## 먼저 읽을 파일

- [03. Prometheus Helm Values](03-prometheus-helm-values.md)
- `deploy/target/observability/prometheus/README.md`
- `deploy/target/observability/prometheus/values.yaml`

## 수정 후보

- `deploy/target/observability/prometheus/README.md`
- `scripts/telemetry/README.md`
- `scripts/telemetry/prometheus-template.sh`

## 선형 절차

1. `scripts/telemetry/` 경로가 없으면 만든다.
2. destructive command가 아닌 template 또는 dry-run 스크립트를 만든다.
3. 스크립트는 `helm template`을 기본으로 한다.
4. README에 `helm repo add`, `helm template`, `helm install --dry-run` 명령을 적는다.
5. 생성 YAML에서 확인할 항목을 체크리스트로 둔다.
   - Namespace
   - ServiceAccount
   - Role 또는 ClusterRole
   - Service
   - Deployment 또는 StatefulSet
   - PVC 사용 여부
6. 실제 `kubectl apply`는 이 작업에 넣지 않는다.

## 스크립트 예시

```bash
#!/usr/bin/env bash
set -euo pipefail

helm template prometheus-platform <CHART_NAME> \
  --namespace observability-system \
  -f deploy/target/observability/prometheus/values.yaml
```

`<CHART_NAME>`은 작업자가 선택한 실제 chart 이름으로 바꾼다.

## 검증

```bash
bash scripts/telemetry/prometheus-template.sh >/tmp/prometheus.yaml
test -s /tmp/prometheus.yaml
rg "kind: (Deployment|StatefulSet|Service|ServiceAccount|ClusterRole|Role)" /tmp/prometheus.yaml
```

## 완료 기준

- template 또는 dry-run 명령이 성공한다.
- 생성 YAML을 파일로 저장해 확인할 수 있다.
- 실제 cluster에 apply하지 않는다.
- 생성 YAML이 user workload diff 경로에 들어가지 않는다.

## 다음 작업

[05. Node Collector Scrape Target](05-node-collector-scrape-target.md)
