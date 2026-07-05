# 03. Prometheus Helm Values

## 목표

real Prometheus 설치 준비를 위해 secret 없는 Helm values 초안을 만든다.

## 먼저 읽을 파일

- [02. Observability 설치 경계](02-observability-stack-boundary.md)
- `deploy/target/prometheus.yaml`
- `scripts/install-telemetry.sh`

## 수정 후보

- `deploy/target/observability/prometheus/README.md`
- `deploy/target/observability/prometheus/values.yaml`

## 선형 절차

1. 사용할 Prometheus chart 후보를 확인한다.
2. chart repository와 chart version을 README에 적는다.
3. namespace는 예시로 `observability-system`을 사용한다.
4. `values.yaml`에는 secret, token, password를 넣지 않는다.
5. persistent volume은 validation 단계에서 끌지 켤지 명시한다.
6. node-collector scrape 설정 후보를 README에 적는다.
7. chart README와 `helm show values`를 확인한 뒤 values key를 확정한다.

## values 예시 방향

```yaml
fullnameOverride: prometheus-platform

server:
  persistentVolume:
    enabled: false
```

실제 key는 선택한 chart에 맞춰 조정한다.

## 검증

```bash
helm version
helm repo list
helm search repo prometheus
git diff --check -- deploy/target/observability/prometheus
rg -n "token|password|secret" deploy/target/observability/prometheus
```

`rg` 결과가 chart 설명 단어가 아니라 실제 secret 값이면 제거한다.

## 완료 기준

- Prometheus chart 이름과 version 후보가 README에 있다.
- `values.yaml`이 생겼고 secret 값이 없다.
- platform observability 용도와 namespace가 문서화되어 있다.

## 다음 작업

[04. Helm Template / Dry-run](04-helm-template-dry-run.md)
