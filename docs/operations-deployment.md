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
  cluster-agent
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
| gitops split workers | EKS managed node group | 가능 | git-pull, workflow-controller, manifest-render, diff, diff-analyze, scm-worker는 stateless worker다. event와 DB만 사용한다. |
| command-worker | EKS managed node group | 가능 | stateless worker다. command queue는 DB에 둔다. |
| rca-worker | EKS managed node group | 가능 | stateless worker다. AI provider 호출이 붙어도 node 권한이 필요 없다. |
| dashboard-worker | EKS managed node group | 가능 | event를 `RcaTimeline` read model로 투영하는 stateless worker다. |
| audit-worker | EKS managed node group | 가능 | event를 audit table에 기록하는 stateless worker다. |
| cluster-agent | target cluster managed node group | 제한 후보 | Kubernetes API 접근과 telemetry query는 가능하지만 node-level 수집은 분리해야 한다. |
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
| Product Evidence | 장애 분석용으로 정리된 evidence pack | cluster-agent -> api-gateway -> JetStream |

우리 서비스는 Prometheus/Loki/OTel을 직접 대체하지 않는다. 이미 있는 관측 시스템을 adapter로 읽고, 없을 때 최소 fallback collector를 제공한다.

## 네트워크 기준

| 항목 | 기준 |
| --- | --- |
| 외부 진입 | ALB/Ingress -> api-gateway |
| 내부 통신 | service DNS와 NATS JetStream |
| target 연결 | cluster-agent가 management로 outbound 연결 |
| subnet | 운영 후보는 private subnet 중심 |
| egress | GitHub, AI provider, object store, log destination, 승인된 integration provider만 명시 허용 |
| VPC endpoint | ECR, S3, CloudWatch, Secrets Manager 사용 시 우선 검토 |

Target Cluster에 command를 보내기 위해 target cluster API server를 외부에 공개하지 않는다. Agent가 command queue를 polling하거나 stream으로 받아 실행한다.
AWS 배포에서는 `management-runtime-secret.COMMAND_NOTIFY_DATABASE_URL`을 Postgres 직결 URL로 넣어 api-gateway가 `LISTEN agent_command_queued`를 열 수 있게 한다.
이 값은 command long-poll 지연을 줄이는 보조 경로이며, PgBouncer transaction pooling URL을 넣으면 `LISTEN`이 안정적으로 동작하지 않는다.
값이 없어도 command는 `agent_commands` lease polling으로 계속 동작한다.

## 권한 기준

| 권한 | 위치 | 용도 |
| --- | --- | --- |
| external credential | Management token vault | GitHub/Google 등 integration provider API 호출 |
| session | Redis | UI/API 사용자 인증 |
| AWS IAM / IRSA | EKS service account annotation | AWS API 접근 권한 |
| Kubernetes ServiceAccount/RBAC | Target Cluster | Agent가 Kubernetes API를 읽고 sandbox만 제한 write |
| sandbox guard | command-worker, cluster-agent | 명령 실행 범위 검증 |

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

현재 `scripts/install-telemetry.sh`는 target cluster 안에 Loki용 MinIO를 함께 올린다. AWS처럼 management와 target이 별도 cluster이면 target Loki가 management namespace Service DNS를 직접 바라보면 안 된다.

운영에서 DB를 cluster 내부에 두지 않는다는 말은 “애플리케이션 pod와 같은 lifecycle로 DB를 취급하지 않는다”는 뜻이다. DB 접근 자체는 각 서비스가 repository/port를 통해 한다.

## 배포 단계

| 단계 | 목표 | 기준 |
| --- | --- | --- |
| developer check | 개발자 PC에서 코드 정합성 확인 | `make check`, `make manifest-check`, Bruno local profile |
| dev EKS | 실제 Kubernetes 운영 제약 확인 | managed node group, ALB, private subnet 후보 |
| staging | 장애/복구/권한 검증 | pod kill, retry, DLQ, replay, RBAC, sandbox |
| production | 사용자/운영 안정성 | managed DB/cache/object store, audit, backup, alert |

## 운영 상태와 변경 증거

운영 상태의 정본은 시점별 Markdown 로그가 아니다. 아래 증거를 조합해 현재 상태를 판정한다.

- 소스 기준: 배포 브랜치의 commit SHA와 이미지 digest
- 실행 기준: GitHub Actions 실행 결과와 배포 workload의 observed revision
- 데이터 기준: Alembic head, 백업·복원 증거, 실제 agent heartbeat
- 기능 기준: 인증된 route smoke, Bruno, command receipt, audit event

문서에는 특정 run ID, 임시 cluster ID, live digest를 고정하지 않는다. 값은 배포 시점에
workflow와 API에서 조회하고, 검증 결과는 해당 실행의 artifact 또는 감사 저장소에 남긴다.
오래된 실행 로그를 새 배포의 근거로 재사용하지 않는다.

개발·검증 환경도 synthetic workspace나 화면용 fixture를 운영 DB에 넣지 않는다. Kubernetes
리소스, API discovery, RBAC, metric은 target agent의 outbound 수집 결과만 제품 데이터로
인정한다. 테스트 fixture가 필요하면 격리된 테스트 DB나 명시적 scenario namespace에서만
생성하고 제품 workspace와 수명주기를 분리한다.

배포 순서는 다음 불변식을 지킨다.

1. 변경 전 backup과 rollback 기준 digest를 고정한다.
2. migration을 별도 job으로 실행하고 단일 Alembic head를 확인한다.
3. event consumer와 worker를 먼저 수렴시킨 뒤 gateway를 전환한다.
4. target agent는 inbound 연결 없이 outbound heartbeat와 command polling을 재개한다.
5. route smoke와 실제 agent evidence가 통과한 뒤에만 배포 완료로 판정한다.

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
| AWS integration smoke | 운영자가 `scripts/aws-up.sh`로 배포한 뒤 `scripts/smoke.sh`를 실행해 실제 EKS management/target event flow를 확인한다. | 자동 workflow 없이도 배포 주체와 검증 결과를 명확히 남기고 AWS EKS 운영 제약을 확인한다. |
| Secret provider 경계 | credential reference를 `TokenVaultPort`/provider adapter로 분리하고, 운영에서는 AWS Secrets Manager, SOPS, KMS envelope encryption 중 하나로 교체한다. | provider token이 DB/event/log에 평문으로 고착되는 것을 막고, 회전/감사/권한 분리를 가능하게 한다. |
| GitOps source hardening | repo checkout/cache, rendered artifact digest, last-approved snapshot, policy decision ref를 GitOps pipeline에 연결한다. | Git을 source of truth로 말하려면 commit provenance와 승인된 비교 기준이 있어야 한다. |
| Safe PR hardening | 부분 구현: GitHub PR provider는 요청된 manifest patch 파일을 실제 PR branch에 커밋하고, generated release Safe PR은 현재 application image나 명시 rollback image가 있으면 `.gitops/rollback/` 아래 rollback manifest patch도 함께 커밋 digest에 포함한다. 남은 범위는 live GitHub PR에서 patch/rollback 파일 존재와 branch protection 통과 검증이다. | 검토 문서만 있는 PR은 배포 변경을 검증하거나 rollback할 수 없다. |
| Control-plane metrics | 부분 구현: `/metrics`가 DLQ open, outbox pending/oldest age, NATS consumer pending/ack-pending/redelivered, command/evidence queue age, command/evidence/event 상태, worker 처리시간 avg/max, LLM latency/token/estimated-cost, GitOps workflow running/open approvals/status/current-step을 노출한다. LLM invocation sample은 `event_id`, `correlation_id`, `causation_id`도 저장한다. `api-gateway` pod에는 Prometheus scrape annotation을 둔다. 남은 범위는 live 환경 Prometheus target discovery/scrape 검증이다. | evidence provider 수집과 제품 runtime 신뢰성은 별도 문제다. 운영 장애를 잡으려면 control-plane 자체 계측이 필요하다. |
| Trace correlation | 부분 구현: Gateway HTTP request 완료/실패 로그와 event acceptance 로그가 요청 경계와 생성된 `event_id`/`correlation_id`를 남긴다. Event/outbox/event-processing DB write 로그, GitHub poller webhook payload, `x-correlation-id` header, change-detected log, worker handler 로그, outbox relay DLQ 로그, AI/LLM invocation sample, GitHub safe PR provider REST 단계 로그, target-agent command result enqueue/flush/abandon 로그가 이벤트와 명령 추적 필드를 보존한다. 남은 범위는 live trace backend 검증이다. | Dapper/Pivot Tracing식 원인 추적을 하려면 서비스별 로그가 아니라 하나의 흐름으로 이어져야 한다. |
| Approval evidence | 구현됨: command-worker가 승인 DB record의 `approval_ref`, `policy_decision_ref`, `decided_by`, `expires_at`을 검증해 agent plan에 싣고, target agent가 `approval_decided_by`와 `approval_expires_at`까지 확인한 뒤 write 명령을 실행한다. | Gateway/command-worker가 통과시킨 요청도 target agent에서 다시 fail-closed한다. |
| Partial failure reporting | agent command result에 resource별 status, sanitized stdout/stderr, retryable flag, applied flag를 추가한다. | 자동 변경은 성공/실패 이분법만으로는 복구와 감사가 어렵다. |

세부 실행 순서와 release gate는 [production-readiness](production-readiness.md)와
[AWS 테스트 실행 기준](aws-testing-runbook.md)을 따른다.

## 참고 문서

- AWS EKS Fargate: https://docs.aws.amazon.com/eks/latest/userguide/fargate.html
- AWS EKS managed node groups: https://docs.aws.amazon.com/eks/latest/userguide/managed-node-groups.html
- AWS EKS logging guidance: https://docs.aws.amazon.com/prescriptive-guidance/latest/implementing-logging-monitoring-cloudwatch/kubernetes-eks-logging.html
