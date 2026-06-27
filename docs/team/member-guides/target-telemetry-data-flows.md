# Target / Telemetry: 데이터 흐름

## 목적

이 문서는 Kubernetes 정보, Prometheus metric, Loki log, OpenTelemetry trace가 우리 Management Gateway까지 어떻게 흘러오는지 설명한다.

## 두 방향을 분리한다

Target/Telemetry 작업은 두 가지 방향이 있다.

```text
Direction A. 외부 관측 플랫폼에서 꺼내오기
  Prometheus / Loki / OTel backend
    -> Target Agent 또는 Management Gateway adapter가 query
    -> 필요한 부분만 evidence로 축약
    -> POST /agent/evidence

Direction B. 우리가 수집한 데이터를 관측 플랫폼에 넣기
  Kubernetes API / kubelet / Node Collector
    -> /metrics exporter, log shipper, OTLP exporter
    -> Prometheus / Loki / OTel Collector
    -> 나중에 다시 query해서 evidence로 사용
```

이 둘은 같은 말이 아니다.

- Prometheus에서 데이터를 조회한다: Prometheus HTTP API를 호출한다.
- Prometheus가 읽을 데이터를 제공한다: `/metrics` endpoint를 만들고 Prometheus가 scrape하게 한다.
- Loki에 로그를 넣는다: log shipper가 Loki ingest API로 보낸다.
- OTel로 trace를 보낸다: app 또는 collector가 OTLP endpoint로 push한다.

## Kubernetes 정보를 Prometheus로 넣을 수 있는가?

가능하다. 다만 “Prometheus API에 Kubernetes 정보를 POST한다”가 기본 설계는 아니다.

권장 경로:

```text
Kubernetes API
  -> kube-state-metrics 또는 우리 Node Collector
  -> /metrics endpoint
  -> Prometheus scrape
  -> Prometheus query API
  -> Agent/Gateway adapter
  -> evidence
```

구현 방식:

1. `kube-state-metrics` 사용
   - Kubernetes object 상태를 Prometheus metric으로 노출한다.
   - pod phase, deployment replica, node condition 같은 표준 metric을 얻기 쉽다.
   - 우리가 직접 object 상태 exporter를 만들 필요가 줄어든다.

2. `services/node-collector`가 `/metrics` 제공
   - 우리 demo에 필요한 node/runtime metric만 직접 노출한다.
   - Prometheus가 이 endpoint를 scrape한다.
   - 예: `node_collector_runtime_ready`, `node_collector_pod_restart_total`.

3. OTel Collector로 보내기
   - Node Collector 또는 app이 OTLP metrics/logs/traces를 Collector로 push한다.
   - Collector가 Prometheus exporter, Loki exporter, Tempo/trace backend exporter로 전달한다.
   - 여러 백엔드로 확장할 때 유리하다.

처음 선택:

- demo 1차: Node Collector가 `/metrics`를 만들고 fake evidence도 Gateway로 보낸다.
- demo 2차: Prometheus가 Node Collector `/metrics`를 scrape하게 한다.
- demo 3차: Agent가 Prometheus query API로 metric을 읽어 evidence로 축약한다.

## 우리가 수집한 노드/파드 정보를 Prometheus/Loki/OTel에 넣을 수 있는가?

가능하다. 데이터 종류에 따라 넣는 경로가 다르다.

Metrics:

```text
Node Collector
  -> /metrics
  -> Prometheus scrape
```

또는:

```text
Node Collector
  -> OTLP metrics
  -> OpenTelemetry Collector
  -> Prometheus exporter 또는 remote_write
```

Logs:

```text
Pod stdout/stderr
  -> promtail/fluent-bit/OTel Collector
  -> Loki
```

또는 demo 단계:

```text
Target Agent
  -> Kubernetes API로 최근 pod log 일부 조회
  -> secret redaction
  -> POST /agent/evidence
```

Traces:

```text
Application SDK
  -> OTLP traces
  -> OpenTelemetry Collector
  -> Tempo/Jaeger 같은 trace backend
```

## Management Gateway로 보내는 방식

관측 플랫폼에서 꺼낸 데이터는 그대로 Gateway로 보내지 않는다. Agent가 evidence로 축약해서 보낸다.

```text
Prometheus query_range 결과
  -> max/recent/rate 같은 summary 계산
  -> MetricEvidence
  -> POST /agent/evidence

Loki query_range 결과
  -> 최근 error log N개만 선택
  -> secret redaction
  -> LogEvidence
  -> POST /agent/evidence

Kubernetes API pod/event 조회
  -> phase, reason, message, restart_count 정리
  -> PodEvidence
  -> POST /agent/evidence
```

왜 축약해야 하는가:

- event payload와 DB 저장 크기를 줄인다.
- log/token/환경변수 같은 민감정보 노출을 줄인다.
- RCA Worker가 provider별 raw response를 몰라도 된다.
- Dashboard가 사람이 읽을 수 있는 상태를 바로 보여줄 수 있다.

## 우리 프로젝트의 우선순위

1. Kubernetes API로 pod 상태와 event를 직접 읽어 evidence 생성.
2. Node Collector `/metrics`로 기본 node/runtime metric 제공.
3. Prometheus query adapter로 metric 조회.
4. Loki query adapter로 log snippet 조회.
5. OTel trace adapter는 마지막에 추가.

## GitOps diff 대상과 observability 설치물은 분리한다

Prometheus, Loki, OpenTelemetry Collector 같은 관측 스택도 Kubernetes에 설치되므로 YAML 또는 Helm chart가 필요하다. 하지만 이것은 사용자의 애플리케이션 배포 manifest와 같은 범주로 보면 안 된다.

우리 프로젝트에서는 Kubernetes manifest를 두 카테고리로 나눈다.

```text
User workload manifests
  사용자가 배포하려는 애플리케이션 리소스
  GitOps Sync Worker가 render/diff/command 대상으로 본다.

Platform observability manifests
  우리 시스템이 관측을 위해 설치하는 내부 인프라 리소스
  Prometheus, Loki, OTel Collector, kube-state-metrics, ServiceMonitor 등
  GitOps command diff 대상에서 기본 제외한다.
```

왜 제외하는가:

- Prometheus는 사용자의 앱 변경이 아니라 우리 플랫폼이 target cluster를 관측하기 위한 내부 도구다.
- GitOps diff는 “사용자 workload desired state”를 command로 바꾸기 위한 흐름이다.
- 관측 스택 설치 YAML까지 diff 대상으로 넣으면, 앱 배포 command와 플랫폼 bootstrap command가 섞인다.
- Prometheus/Loki 설치 변경은 권한 범위가 크고 cluster-wide 리소스를 포함할 수 있어 별도 승인/운영 절차가 필요하다.

권장 디렉터리 경계:

```text
deploy/target/observability/
  우리 플랫폼이 target cluster에 설치할 관측 스택
  Helm values, ServiceMonitor, RBAC, namespace
  GitOps workload diff 기본 제외

examples/workloads/
  demo 사용자 앱 manifest
  GitOps workload diff 대상 가능

services/*/deploy 또는 manifests/
  management plane 서비스 배포 manifest
  target workload diff 대상 아님
```

GitOps Sync Worker 규칙:

- `deploy/target/observability/**`는 기본 workload diff 후보에서 제외한다.
- `monitoring`, `observability`, `prometheus`, `loki`, `otel` 같은 platform 경로는 allowlist 없이는 command.requested로 변환하지 않는다.
- 관측 스택 변경은 별도 이슈/PR에서 platform install로 다룬다.
- 사용자가 직접 운영하는 Prometheus를 GitOps로 관리하려는 경우에는 `project_id`, `target_type`, `owner=customer` 같은 명시적 구분이 필요하다. 기본값은 제외다.

## 사용자 커스텀 Prometheus가 필요하면 어떻게 하는가?

사용자가 “우리 팀 Prometheus도 GitOps로 관리하고 싶다”고 말하는 경우가 생길 수 있다. 이때는 우리 플랫폼용 Prometheus를 사용자에게 같이 쓰게 하는 것이 아니라, 사용자용 Prometheus stack을 별도로 설치하는 개념으로 본다.

두 Prometheus의 역할은 다르다.

```text
우리 플랫폼용 Prometheus
  목적: 우리 시스템이 target cluster 상태를 관측하기 위해 사용
  owner: platform
  purpose: internal_observability
  gitops_managed: false
  기본 GitOps workload diff 대상: 제외

사용자 커스텀 Prometheus
  목적: 사용자가 자기 서비스/조직 운영을 위해 사용
  owner: customer
  purpose: customer_monitoring
  gitops_managed: true 가능
  기본 GitOps workload diff 대상: 명시적으로 허용한 경우만 포함
```

왜 분리해야 하는가:

- 우리 플랫폼용 Prometheus는 RCA/evidence 수집에 필요한 “우리 시스템의 눈”이다.
- 사용자가 scrape config, retention, RBAC, alert rule을 바꾸면 우리 관측 경로가 깨질 수 있다.
- 사용자 Prometheus는 사용자의 운영 정책과 비용, 저장 기간, alert rule이 들어가므로 우리 내부 관측 도구와 lifecycle이 다르다.
- 두 stack을 섞으면 장애가 났을 때 “우리 시스템 문제인지 사용자 설정 문제인지” 구분하기 어렵다.

따라서 사용자 커스텀 Prometheus를 허용하려면 아래처럼 분리한다.

```text
namespace: observability-system
  prometheus-platform
  loki-platform
  otel-collector-platform
  owner = platform
  gitops_managed = false

namespace: user-monitoring 또는 team-a-monitoring
  prometheus-user
  grafana-user
  alertmanager-user
  owner = customer
  gitops_managed = true 가능
```

분리 조건:

- namespace 분리
- Helm release name 분리
- ServiceAccount/RBAC 분리
- storage/PVC 분리
- ingress/service 분리
- secret 분리
- resource quota/limit 적용
- cluster-wide 권한은 별도 승인

GitOps에서 구분할 최소 메타데이터:

```text
ManifestScope
  owner: platform | customer
  purpose: internal_observability | customer_monitoring | workload
  gitops_managed: true | false
  risk_level: namespace | cluster
```

예시:

```text
우리 Prometheus
  owner = platform
  purpose = internal_observability
  gitops_managed = false
  risk_level = cluster

사용자 앱 Deployment
  owner = customer
  purpose = workload
  gitops_managed = true
  risk_level = namespace

사용자 Prometheus
  owner = customer
  purpose = customer_monitoring
  gitops_managed = true
  risk_level = cluster
```

현재 프로젝트에서는 사용자 커스텀 Prometheus까지 구현하지 않는다. 하지만 문서와 경로 설계는 나중에 이 구분을 추가할 수 있게 잡아둔다.

## Prometheus는 Helm 기반으로 설치해도 되는가?

가능하다. 오히려 처음에는 Helm 기반 설치가 낫다.

이유:

- Prometheus ecosystem은 chart와 values 설정이 잘 정리되어 있다.
- ServiceAccount, RBAC, ConfigMap, StatefulSet, ServiceMonitor 같은 리소스를 직접 손으로 관리하면 실수가 많다.
- demo에서는 values만 최소화해서 설치하고, chart version을 고정하면 재현성이 좋다.

권장 방식:

```text
deploy/target/observability/prometheus/
  values.yaml
  README.md
  install script 또는 HelmRelease 초안
```

운영 원칙:

- chart version을 고정한다.
- values 파일은 repo에 두되 secret 값은 넣지 않는다.
- namespace는 `observability` 또는 `monitoring`처럼 분리한다.
- RBAC는 필요한 범위만 둔다.
- uninstall/upgrade 절차를 README에 남긴다.
- GitOps Worker의 사용자 workload diff 대상에서는 제외한다.

나중에 선택할 수 있는 방식:

- 단순 demo: `helm install` 스크립트.
- GitOps platform bootstrap: Argo CD/Flux/HelmRelease.
- 운영형: Terraform/Helmfile/Argo CD ApplicationSet.

이번 프로젝트 1차 기준:

- Helm values와 설치 스크립트를 문서화한다.
- Prometheus 설치 자체는 user workload command flow와 분리한다.
- Agent/Node Collector가 Prometheus와 연결되는 query/scrape 경로만 검증한다.

## 외부 도구 credential 처리

Prometheus, Loki, OTel backend가 인증을 요구할 수 있다.

원칙:

- provider token은 Agent log, event, evidence payload에 넣지 않는다.
- 최종 구조에서는 Gateway/Auth의 IntegrationTarget, CredentialRef, TokenBroker를 통해 받는다.
- demo 단계에서는 fake token 또는 local-only env를 쓰되 문서에 명확히 표시한다.
- query 실패 시 token 값을 error message에 포함하지 않는다.
