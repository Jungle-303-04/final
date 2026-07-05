# 02. Observability 설치 경계

## 목표

Prometheus, Loki, OTel 설치 YAML을 사용자 workload GitOps diff 대상과 분리한다.

## 먼저 읽을 파일

- `deploy/target/target.yaml`
- `docs/team/member-guides/target-telemetry-data-flows.md`
- `docs/team/contract-vs-demo-boundary.md`
- [01. Telemetry Provider 경계](01-telemetry-provider-boundary.md)

## 수정 후보

- `deploy/target/observability/README.md`
- `docs/team/member-guides/target-telemetry-data-flows.md`
- 필요하면 `docs/team/contract-vs-demo-boundary.md`

## 선형 절차

1. `deploy/target/observability/` 경로를 플랫폼 관측 설치물 경로로 정한다.
2. 이 경로의 리소스는 사용자 workload GitOps diff 후보가 아니라는 기준을 문서화한다.
3. 플랫폼용 Prometheus와 사용자가 직접 설치한 Prometheus를 구분하는 기준을 적는다.
4. manifest scope 초안을 정한다.
   - `owner`
   - `purpose`
   - `gitops_managed`
   - `risk_level`
5. cluster-wide RBAC가 필요하면 이유와 최소 범위를 문서에 먼저 적는다.
6. 아직 실제 apply나 install은 하지 않는다.

## 예시 scope

```yaml
metadata:
  labels:
    kubeheal.io/owner: platform
    kubeheal.io/purpose: observability
    kubeheal.io/gitops-managed: "false"
    kubeheal.io/risk-level: platform-internal
```

## 검증

```bash
git diff --check -- deploy/target/observability docs/team/member-guides/target-telemetry-data-flows.md
```

## 완료 기준

- observability 설치 경로가 정해져 있다.
- 해당 경로가 사용자 workload diff 대상이 아니라는 설명이 있다.
- RBAC 추가 전 조율 기준이 문서화되어 있다.

## 다음 작업

[03. Prometheus Helm Values](03-prometheus-helm-values.md)
