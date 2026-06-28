# 운영 배포 기준

이 문서는 EKS 발표자료와 AWS 공식 EKS 기준을 현재 서비스 구조에 흡수한 운영 배포 기준이다.

핵심 판단은 단순하다.

- 제품 구조는 현재 event-driven management/target-agent 구조를 유지한다.
- 운영 배포는 EKS managed node group을 기본 후보로 둔다.
- Fargate는 stateless API/worker 일부에만 선택 적용한다.
- node-level 수집, DaemonSet, stateful store는 Fargate-only로 올리지 않는다.

## 배포 영역

```text
Management Cluster
  api-gateway
  workers
  NATS JetStream
  PostgreSQL / Redis / Object Store

Target Cluster
  target-cluster-agent
  optional node-collector
  Prometheus / Loki / OTel adapter
  Kubernetes API
```

Management Cluster는 우리 서비스의 제어면이다. Target Cluster는 관측과 제한 실행 대상이다.

Target Cluster는 기본적으로 Management Cluster로 outbound 연결한다. 외부에서 target cluster 내부로 inbound를 열지 않는다.

## Workload 배치 기준

| 구성 | 기본 배치 | Fargate 후보 | 이유 |
| --- | --- | --- | --- |
| api-gateway | EKS managed node group | 가능 | stateless HTTP 경계다. ALB/Ingress 뒤에 둘 수 있다. |
| gitops split workers | EKS managed node group | 가능 | git-pull, manifest-render, diff, diff-analyze, repo-gateway는 stateless worker다. event와 DB만 사용한다. |
| command-worker | EKS managed node group | 가능 | stateless worker다. command queue는 DB에 둔다. |
| rca-worker | EKS managed node group | 가능 | stateless worker다. AI provider 호출이 붙어도 node 권한이 필요 없다. |
| dashboard-projection-service | EKS managed node group | 가능 | event를 read model로 투영하는 stateless worker다. |
| audit-timeline-service | EKS managed node group | 가능 | event를 audit table에 기록하는 stateless worker다. |
| target-cluster-agent | target cluster managed node group | 제한 후보 | Kubernetes API 접근과 telemetry query는 가능하지만 node-level 수집은 분리해야 한다. |
| node-collector | target cluster managed node group | 불가 | DaemonSet으로 노드마다 떠야 한다. |
| NATS JetStream | EKS managed node group | 불가 | stateful workload다. 운영 단계에서는 managed event service 대체도 검토한다. |
| PostgreSQL | RDS 후보 | 불가 | 운영에서는 DB를 cluster 내부 workload로 오래 끌고 가지 않는다. |
| Redis | ElastiCache 후보 | 불가 | session/lock/rate limit store다. managed service가 더 적합하다. |
| Object Store | S3 후보 | 불가 | raw evidence와 artifact 저장소다. managed object store가 맞다. |
| Prometheus/Mimir | managed node group 또는 managed service | 불가에 가까움 | scrape, remote write, 장기 저장 요구가 있다. |
| Loki/Tempo | managed node group 또는 managed service | 불가에 가까움 | 로그/트레이스 저장은 stateful 성격이 강하다. |

## EKS 기준 반영

### Managed node group

운영의 기본 compute는 managed node group이다.

- node lifecycle, update, drain을 EKS가 도와준다.
- node-collector, Fluent Bit, CloudWatch agent처럼 DaemonSet이 필요한 workload를 실행할 수 있다.
- 장애 분석을 위해 node/runtime 지표를 가져올 수 있다.

### Fargate

Fargate는 다음 조건을 모두 만족할 때만 쓴다.

- stateless process다.
- DaemonSet, privileged container, host network, host port가 필요 없다.
- stateful volume이나 node-local log 접근이 필요 없다.
- pod 단위 격리와 운영 단순화가 비용보다 중요하다.

따라서 `api-gateway`와 일부 worker는 후보지만 `node-collector`, NATS JetStream, PostgreSQL, Loki, Prometheus 장기 저장 계층은 후보가 아니다.

### Observability

운영에서는 다음 세 층을 분리한다.

| 층 | 수집 대상 | 기본 후보 |
| --- | --- | --- |
| Control plane | apiserver, scheduler, controller manager 감사/진단 로그 | EKS control plane logging |
| Node/Application | node, kubelet, kube-proxy, pod stdout/stderr | CloudWatch Container Insights, Fluent Bit, Prometheus |
| Product Evidence | 장애 분석용으로 정리된 evidence pack | target-cluster-agent -> api-gateway -> JetStream |

우리 서비스는 Prometheus/Loki/OTel을 직접 대체하지 않는다. 이미 있는 관측 시스템을 adapter로 읽고, 없을 때 최소 fallback collector를 제공한다.

## 네트워크 기준

| 항목 | 기준 |
| --- | --- |
| 외부 진입 | ALB/Ingress -> api-gateway |
| 내부 통신 | service DNS와 NATS JetStream |
| target 연결 | target-cluster-agent가 management로 outbound 연결 |
| subnet | 운영 후보는 private subnet 중심 |
| egress | OAuth, GitHub, AI provider, object store, log destination만 명시 허용 |
| VPC endpoint | ECR, S3, CloudWatch, Secrets Manager 사용 시 우선 검토 |

Target Cluster에 command를 보내기 위해 target cluster API server를 외부에 공개하지 않는다. Agent가 command queue를 polling하거나 stream으로 받아 실행한다.

## 권한 기준

| 권한 | 위치 | 용도 |
| --- | --- | --- |
| OAuth provider token | Management token vault | GitHub/Google provider API 호출 |
| session | Redis | UI/API 사용자 인증 |
| AWS IAM / IRSA | EKS service account annotation | AWS API 접근 권한 |
| Kubernetes ServiceAccount/RBAC | Target Cluster | Agent가 Kubernetes API를 읽고 sandbox만 제한 write |
| sandbox guard | command-worker, target-cluster-agent | 명령 실행 범위 검증 |

ServiceAccount/RBAC는 우리가 만드는 애플리케이션 모듈이 아니라 Kubernetes 권한 리소스다. 우리 agent pod가 그 ServiceAccount로 실행되기 때문에 Kubernetes API 호출 권한이 제한된다.

## 저장소 기준

MVP는 cluster 내부 workload로 시작한다. 운영 후보는 managed service로 뺀다.

| 저장소 | MVP | 운영 후보 |
| --- | --- | --- |
| PostgreSQL | StatefulSet | RDS |
| Redis | Deployment | ElastiCache |
| Object Store | MinIO | S3 |
| Metrics Store | Prometheus/Mimir | AMP 또는 Mimir 별도 운영 |
| Log/Trace Store | Loki/Tempo | CloudWatch/OpenSearch/Loki/Tempo 별도 운영 |

운영에서 DB를 cluster 내부에 두지 않는다는 말은 “애플리케이션 pod와 같은 lifecycle로 DB를 취급하지 않는다”는 뜻이다. DB 접근 자체는 각 서비스가 repository/port를 통해 한다.

## 배포 단계

| 단계 | 목표 | 기준 |
| --- | --- | --- |
| local | 개발자 PC에서 end-to-end 확인 | kind management/target, in-cluster store |
| dev EKS | 실제 Kubernetes 운영 제약 확인 | managed node group, ALB, private subnet 후보 |
| staging | 장애/복구/권한 검증 | pod kill, retry, DLQ, replay, RBAC, sandbox |
| production | 사용자/운영 안정성 | managed DB/cache/object store, audit, backup, alert |

## PR 검토 기준

운영 배포와 관련된 PR은 아래를 확인한다.

- DaemonSet workload를 Fargate 전제로 설계하지 않는다.
- stateful workload를 stateless worker처럼 취급하지 않는다.
- target cluster inbound API 공개를 기본값으로 만들지 않는다.
- ServiceAccount/RBAC 권한을 `cluster-admin`으로 뭉개지 않는다.
- provider token, kubeconfig, AWS credential을 event payload나 log에 남기지 않는다.
- 새로운 외부 egress 목적지가 생기면 문서에 추가한다.

## 개선 계획

운영 수준으로 올리기 전 아래 항목은 별도 작업으로 추적한다.

| 항목 | 계획 | 이유 |
| --- | --- | --- |
| CI integration smoke | `.github/workflows/integration-smoke.yml`에서 nightly/manual `make up && make smoke`를 실행한다. PR 필수 check에는 Docker import smoke를 두고, 실제 kind E2E는 비용과 실행 시간을 분리해 운영한다. | uv 기반 unit CI와 Docker/runtime 환경 차이를 잡고, NATS/PostgreSQL/Redis/Kubernetes 조합 부팅 실패를 조기에 발견한다. |
| Secret provider 경계 | fake OAuth token 저장을 `TokenVaultPort`/provider adapter로 분리하고, 운영에서는 AWS Secrets Manager, SOPS, KMS envelope encryption 중 하나로 교체한다. | provider token이 DB/event/log에 평문 또는 fake 구조로 고착되는 것을 막고, 회전/감사/권한 분리를 가능하게 한다. |

## 참고 문서

- AWS EKS Fargate: https://docs.aws.amazon.com/eks/latest/userguide/fargate.html
- AWS EKS managed node groups: https://docs.aws.amazon.com/eks/latest/userguide/managed-node-groups.html
- AWS EKS logging guidance: https://docs.aws.amazon.com/prescriptive-guidance/latest/implementing-logging-monitoring-cloudwatch/kubernetes-eks-logging.html
