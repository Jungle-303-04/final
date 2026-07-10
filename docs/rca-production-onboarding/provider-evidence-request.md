# RCA Provider Evidence 요청 정리

구현 메모: metadata evidence는 workload snapshot, config reference, Service selector matching, ownership lookup helper 모듈로 나누어 구현할 수 있다. 이 helper 모듈들은 event를 발행하지 않는다. 등록된 metadata provider만 metadata bucket을 반환한다.

## 왜 필요한가

1. RCA는 provider가 보낸 evidence만 보고 판단한다.
2. symptom만으로는 root cause를 고를 수 없다.
3. source 단위 evidence는 너무 넓어서 세부 원인 판단이 어렵다.
4. candidate별 confidence를 계산하려면 세부 evidence가 필요하다.
5. Safe PR로 이어지려면 어떤 필드를 고칠 수 있는지 근거가 필요하다.
6. 나중에 missing evidence 기반 추가 수집 요청을 만들려면 evidence key가 필요하다.

## 목적

RCA는 provider가 보내준 evidence만 보고 symptom, root cause candidate, confidence, Safe PR 가능성을 판단한다.
따라서 symptom만 전달되면 후보는 만들 수 있지만, 어떤 후보가 실제 원인인지 고르기 어렵다.

이 문서는 현재 provider 코드 기준으로 이미 수집 가능한 정보와, RCA 판단을 위해 추가로 target agent/provider 쪽에 요청해야 할 정보를 구분한다.

## Kubernetes Provider

### 현재 있는 것

현재 Kubernetes provider는 target namespace 기준으로 아래 리소스를 조회한다.

- pods
- events
- nodes
- deployments
- statefulsets
- daemonsets
- replicasets
- services
- endpointslices

현재 payload에서 기대 가능한 정보:

- resource
- pods
- pod conditions
- containerStatuses 요약
- events reason/message/count
- ownerReferences 일부
- service
- endpointSlice
- deployment/replicaSet status
- image와 현재 imageID 일부
- node 정보

### MetadataProvider가 현재 추가로 보내는 것

- target namespace의 Deployment별 current workload snapshot
- current image
- probe spec
  - readinessProbe
  - livenessProbe
  - startupProbe
  - path / port / timeoutSeconds / periodSeconds / failureThreshold
- Deployment labels
- Pod template labels
- PVC refs
- resources requests/limits
- Deployment status and conditions
- Pod status phase, ready flag, and conditions
- Service selector and Pod labels match result
- owned ReplicaSet revision annotation and replica counts
- single Deployment detail query의 safe Deployment/Pod template annotations
- single Deployment detail query의 managedFields manager 목록
- single Deployment detail query의 env/envFrom ConfigMap and Secret reference summary
- single Deployment detail query의 mounted ConfigMap and Secret volume reference summary
- single Deployment detail query의 ReplicaSet created_at and conditions

### 추가로 요청해야 할 것

- ConfigMap/Secret object metadata summary
- resource quota
- 상세 containerStatuses 원본 또는 더 풍부한 요약
- node pressure / scheduling 관련 detail

참고:

- 현재 image digest는 Kubernetes provider의 `pods[].containers[].image_id`에서 확인할 수 있다.
- 다만 이전 image나 rollout history는 아직 제공하지 않는다.

주의:

- Secret 값 자체는 절대 보내면 안 됨
- annotation/env/managedFields에는 민감정보가 있을 수 있으므로 마스킹 필요

## Metrics Provider

### 현재 있는 것

현재 기본 policy와 provider 기준으로 아래 정보를 수집할 수 있다.

- query
- value
- metric labels
- result type
- samples 또는 series
- range/window 일부
- up
- kube_pod_info
- kube_deployment_status_replicas
- node_cpu_usage_ratio
- node_memory_usage_ratio
- node_filesystem_usage_ratio
- node_collector_node_pod_count
- node_collector_node_not_ready_pod_count
- node_collector_scrape_error

### 추가로 요청해야 할 것

- restart count
- memory usage / limit
- CPU usage / throttling
- ready endpoint count
- deployment available replicas
- ingress 5xx
- request latency
- threshold
- baseline
- query window
- comparator
  - above_threshold
  - below_threshold
  - increased_from_baseline 등

## Logs Provider

### 현재 있는 것

현재 Loki provider는 query 결과를 아래 형태로 받을 수 있다.

- query
- stream labels
- log line samples
- line_count
- result_type

현재 기본 policy query 예시:

- target_namespace_errors
- node_collector_runtime_samples
- target_agent_warnings

### 추가로 요청해야 할 것

- pattern
  - probe_failed
  - dependency_timeout
  - image_pull_error 등
- count by pattern
- severity
- window
- trace_id 추출
- health endpoint error
- dependency timeout/error log
- 대표 sample 제한
- 민감정보 마스킹

주의:

- 로그 샘플에는 개인정보, token, credential이 섞일 수 있으므로 sample 개수 제한과 redaction 기준 필요

## Trace Provider

### 현재 있는 것

policy상 traces query는 존재한다.

- application_error_spans
- target_agent_error_spans
- target_agent_recent_spans
- management_gateway_spans

단, 실제 수집 가능 여부는 Tempo/OTel 설정과 application instrumentation 상태에 따라 달라진다.

### 추가로 요청해야 할 것

- trace_id
- span_id
- service
- operation
- status
- duration_ms
- dependency
- error
- parent/child span 관계
- dependency span 실패 여부

## Metadata / Change Provider

### 현재 있는 것

현재 target agent에는 `MetadataProvider`가 있고 `@telemetry.source(source="metadata", evidence_key="metadata", query_type=MetadataSnapshotQuery)`로 등록된다.
기본 policy는 `metadata` provider에 `change_context` query를 넣는다.
현재 provider가 최종 bucket에 남기는 필드는 아래 구조다.
전체 summary query와 단건 detail query는 보통 한 번에 하나의 모양을 쓴다.

- change_context.current_workload_snapshots[]
- change_context.current_workload_snapshot

`current_workload_snapshots[]`는 target namespace의 모든 Deployment를 위한 summary snapshot이다.
summary snapshot에는 아래 필드만 남긴다.

- change_context.current_workload_snapshots[].workload.kind/namespace/name
- change_context.current_workload_snapshots[].deployment_labels
- change_context.current_workload_snapshots[].pod_template_labels
- change_context.current_workload_snapshots[].persistent_volume_claim_refs[].volume_name/claim_name
- change_context.current_workload_snapshots[].deployment_status
- change_context.current_workload_snapshots[].deployment_status.conditions[]
- change_context.current_workload_snapshots[].pod_statuses[].name
- change_context.current_workload_snapshots[].pod_statuses[].phase
- change_context.current_workload_snapshots[].pod_statuses[].ready
- change_context.current_workload_snapshots[].pod_statuses[].reason
- change_context.current_workload_snapshots[].pod_statuses[].message
- change_context.current_workload_snapshots[].pod_statuses[].start_time
- change_context.current_workload_snapshots[].pod_statuses[].conditions[]
- change_context.current_workload_snapshots[].containers[].name/image
- change_context.current_workload_snapshots[].containers[].readiness_probe
- change_context.current_workload_snapshots[].containers[].liveness_probe
- change_context.current_workload_snapshots[].containers[].startup_probe
- change_context.current_workload_snapshots[].containers[].resources
- change_context.current_workload_snapshots[].replicaset_revisions[].name
- change_context.current_workload_snapshots[].replicaset_revisions[].revision
- change_context.current_workload_snapshots[].replicaset_revisions[].desired_replicas
- change_context.current_workload_snapshots[].replicaset_revisions[].replicas
- change_context.current_workload_snapshots[].replicaset_revisions[].ready_replicas
- change_context.current_workload_snapshots[].replicaset_revisions[].available_replicas
- change_context.current_workload_snapshots[].replicaset_revisions[].fully_labeled_replicas

`service_selector_matches[]`는 namespace Service selector와 Pod labels 비교 결과다.
summary query와 detail query 모두 같은 기본 shape로 보내지만, 범위와 `target_relation` 포함 여부가 다르다.
summary query는 `target_relation`을 넣지 않고, detail query는 target Deployment와 관련 있다고 판단된 Service만 남기며 그 이유를 `target_relation`으로 넣는다.

- change_context.service_selector_matches[].service.namespace/name
- change_context.service_selector_matches[].selector(selector가 없는 Service면 생략 가능)
- change_context.service_selector_matches[].match_status
- change_context.service_selector_matches[].target_relation(detail query에서만 존재)
- change_context.service_selector_matches[].matched_pod_count
- change_context.service_selector_matches[].matched_pods[].namespace/name(matched Pod가 없으면 생략 가능)

전체 summary query는 namespace의 모든 Service 비교 결과를 보낸다.
특정 Deployment detail query는 target Deployment와 관련 있는 Service만 보낸다.
관련 기준은 `exact_selector_match`, `live_pod_match`, `selector_key_overlap`이다.

`endpoint_slice_ready_endpoints[]`는 Service 뒤에 실제 ready endpoint가 붙었는지 보는 요약이다.
EndpointSlice(엔드포인트슬라이스)는 Kubernetes가 Service 뒤 endpoint 목록을 나누어 저장하는 객체다.
summary query는 namespace의 모든 EndpointSlice 요약을 보낸다.
detail query는 target Deployment와 관련 있는 Service의 EndpointSlice만 보낸다.
endpoint IP address는 보내지 않고, ready target Pod의 kind/namespace/name만 보낸다.

- change_context.endpoint_slice_ready_endpoints[].service.namespace/name
- change_context.endpoint_slice_ready_endpoints[].endpoint_slice.namespace/name
- change_context.endpoint_slice_ready_endpoints[].address_type
- change_context.endpoint_slice_ready_endpoints[].ports[].name/port/protocol/app_protocol
- change_context.endpoint_slice_ready_endpoints[].endpoint_count
- change_context.endpoint_slice_ready_endpoints[].ready_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].not_ready_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].unknown_ready_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].serving_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].terminating_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].ready_targets[].kind/namespace/name

`current_workload_snapshot`은 특정 Deployment 1개를 위한 detail snapshot이다.
detail snapshot은 summary 필드에 아래 필드를 추가로 담는다.

- change_context.current_workload_snapshot.deployment_annotations
- change_context.current_workload_snapshot.pod_template_annotations
- change_context.current_workload_snapshot.managed_fields_managers[]
- change_context.current_workload_snapshot.containers[].env_refs
- change_context.current_workload_snapshot.containers[].env_from_refs
- change_context.current_workload_snapshot.containers[].volume_mount_refs
- change_context.current_workload_snapshot.replicaset_revisions[].created_at
- change_context.current_workload_snapshot.replicaset_revisions[].conditions[]

기본 fallback 값은 `{"change_context": {"current_workload_snapshots": []}}`이다.
기본 `change_context` query는 target namespace의 모든 Deployment를 목록으로 수집한다.
특정 Deployment 1개만 보려면 `deployment/<name>` 또는 `deployment/<namespace>/<name>` query를 쓴다.

Kubernetes object에서도 일부 metadata를 참고할 수 있다.
일부 값은 `kubernetes` bucket summary 안에도 있고, 일부 값은 `metadata` bucket의
`current_workload_snapshots` 안에도 있다.

- metadata.name
- metadata.namespace
- metadata.uid
- labels
- annotations 일부(`metadata` bucket은 단건 detail에서 안전한 Deployment/Pod template annotation만 남김)
- ownerReferences
- image
- deployment revision annotation 일부
- managedFields manager 일부(detail query에서만 제공)

### 추가로 요청해야 할 것

- git_sha
- image_digest
- helm revision
- rollout revision
- recent manifest change
- recent config/probe/resource change
- deploy actor / CI job actor
- rollback_available
- risk_level

주의:

- GitOps/CI/CD/SCM/배포 시스템과 연결이 필요할 수 있음
- annotation은 allowlist와 민감 key 제외 기준이 필요함
- managedFields, env, Secret reference는 저장 범위와 마스킹 기준 필요

## 요약

Kubernetes provider는 pods, events, workloads, services, endpointslices를 이미 수집한다.
Metadata provider는 target namespace의 Deployment 현재 snapshot 목록 또는 특정 Deployment 1개 snapshot을
`change_context` bucket 안에 만든다.
다만 RCA가 GitOps diff, rollback 가능 여부, risk_level 같은 세부 변경 원인을 판단하려면
Management Server, GitOps, CI/CD, SCM 쪽 데이터가 더 필요하다.
