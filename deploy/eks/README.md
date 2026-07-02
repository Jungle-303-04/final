# EKS 운영 배포 기준

이 폴더는 운영 배포 overlay를 만들 때 따를 기준을 기록한다.

현재 실제 실행 manifest는 `deploy/management`, `deploy/target`, `deploy/kind`에 있다. EKS manifest를 바로 추가하지 않는 이유는 AWS 계정, VPC, subnet, IAM, domain, secret manager 선택이 확정되지 않았기 때문이다.

## 기본 방향

```text
local/dev
  kind management cluster
  kind target cluster
  in-cluster PostgreSQL/Redis/MinIO/NATS

production candidate
  EKS management cluster
  EKS target cluster 또는 외부 Kubernetes target
  managed node group 중심
  RDS / ElastiCache / S3 후보
```

## Management Cluster

| 구성 | Kubernetes 형태 | 운영 배치 기준 |
| --- | --- | --- |
| api-gateway | Deployment + Service + Ingress/ALB | managed node group 또는 Fargate 후보 |
| worker services | Deployment | managed node group 또는 Fargate 후보 |
| NATS JetStream | StatefulSet | 초기에는 managed node group, 운영 고도화 시 managed event service 대체 검토 |
| PostgreSQL | 외부 DB endpoint | RDS 우선 후보 |
| Redis | 외부 cache endpoint | ElastiCache 우선 후보 |
| Object Store | 외부 object endpoint | S3 우선 후보 |

## Target Cluster

| 구성 | Kubernetes 형태 | 운영 배치 기준 |
| --- | --- | --- |
| cluster-agent | Deployment | target cluster 안에서 outbound로 management 연결 |
| node-collector | DaemonSet | managed node group 또는 EC2 node 필요 |
| ServiceAccount/RBAC | Kubernetes RBAC | read cluster objects, write only sandbox namespace |
| Prometheus/Loki/OTel | optional adapter 대상 | 이미 있으면 query/remote-write 연동, 없으면 fallback source |

## Fargate 사용 가능성

Fargate는 stateless workload에만 선택 적용한다.

사용 가능 후보:

- api-gateway
- gitops-sync-worker
- command-worker
- rca-worker
- audit-worker

사용하지 않는 대상:

- node-collector
- DaemonSet 기반 log/metric collector
- NATS JetStream
- PostgreSQL
- Redis
- MinIO/Object store
- Prometheus/Loki/Tempo 장기 저장 계층

## EKS overlay를 만들 때 필요한 값

```text
AWS_ACCOUNT_ID
AWS_REGION
CLUSTER_NAME
PRIVATE_SUBNET_IDS
PUBLIC_SUBNET_IDS
VPC_ID
ALB_CERTIFICATE_ARN
DOMAIN_NAME
RDS_ENDPOINT
REDIS_ENDPOINT
S3_BUCKET
SECRETS_MANAGER_PREFIX
IRSA_ROLE_ARN_LIST
```

위 값이 정해지기 전에는 EKS manifest를 fake로 만들지 않는다. 대신 이 문서를 기준으로 local manifest와 차이를 추적한다.

## 운영 전 체크리스트

- management API는 ALB/Ingress 뒤에 둔다.
- cluster-agent는 outbound 연결만 사용한다.
- node-collector는 Fargate profile 대상에 넣지 않는다.
- stateful store는 managed service 전환 계획을 둔다.
- ServiceAccount/RBAC는 sandbox write만 허용한다.
- OAuth token은 Token Vault/Secret Manager 계층에 저장한다.
- NATS/DB/Redis/object store endpoint는 Secret/ConfigMap으로 주입한다.
- CloudWatch/Prometheus/Loki 중 실제 운영 관측 경로를 하나 이상 확정한다.
