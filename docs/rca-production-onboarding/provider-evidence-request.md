# RCA Provider Evidence 요청 정리

구현 메모: metadata evidence는 workload snapshot, config reference, referenced config object summary, Service selector matching, ResourceQuota summary, ownership lookup helper 모듈로 나누어 구현할 수 있다. 이 helper 모듈들은 event를 발행하지 않는다. 등록된 metadata provider만 metadata bucket을 반환한다.

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

큰 namespace에서 evidence job result가 1MiB 제한을 넘길 위험을 줄이기 위해 Kubernetes provider는
`pods`, `events`, `nodes`, `workloads`, `services`, `endpoints` 목록을 전송 직전에 제한한다.
잘린 목록이 있으면 `kubernetes.collection_limits`에 전체 개수와 최종 반환 개수를 남긴다.
기존 필드 이름은 유지되므로 RCA는 같은 경로를 읽되, `collection_limits`가 있으면 일부 샘플임을 고려한다.
개수 제한 뒤에도 JSON byte 크기가 크면 JSON byte 크기가 가장 큰 목록부터 추가로 줄인다.
단일 항목이 너무 크면 해당 목록은 0개까지 줄어들 수 있다.

현재 payload에서 기대 가능한 정보:

- resource
- pods
- pod conditions
- containerStatuses 요약
  - containerID
  - image/imageID
  - ready/restartCount
  - current state reason/message/exit code/time
  - lastState reason/message/exit code/time
- events reason/message/count
- events reason_summary
  - category/signal/symptom
  - FailedScheduling scheduling_causes
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
- Pod template serviceAccountName, automountServiceAccountToken, imagePullSecrets name summary
- PVC refs
- resources requests/limits
- Deployment status and conditions
- Pod status phase, ready flag, and conditions
- Service selector and Pod labels match result
- ResourceQuota hard/used summary
- owned ReplicaSet revision annotation and replica counts
- single Deployment detail query의 safe Deployment/Pod template annotations
- single Deployment detail query의 managedFields manager 목록
- single Deployment detail query의 scheduling constraints summary
- single Deployment detail query의 env/envFrom ConfigMap and Secret reference summary
- single Deployment detail query의 mounted ConfigMap and Secret volume reference summary
- single Deployment detail query의 referenced ConfigMap and Secret object metadata summary
- single Deployment detail query의 ReplicaSet created_at and conditions

### 추가로 요청해야 할 것

- 상세 containerStatuses 원본
- node pressure / scheduler decision 관련 detail

참고:

- 현재 image digest는 Kubernetes provider의 `pods[].containers[].image_id`에서 확인할 수 있다.
- 현재 container ID와 직전 lastState의 message/time은 Kubernetes provider의 `pods[].containers[]` 요약에서 확인할 수 있다.
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
- analysis
  - metric_kind
  - value_summary
  - threshold
  - signals
  - baseline_comparison
- up
- kube_pod_info
- kube_deployment_status_replicas
- node_cpu_usage_ratio
- node_memory_usage_ratio
- node_filesystem_usage_ratio
- node_collector_node_pod_count
- node_collector_node_not_ready_pod_count
- node_collector_scrape_error

### 추가 요청 항목과 현재 구현 상태

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

현재 구현 상태:

- Prometheus provider는 각 query 결과에 `analysis` object를 추가한다.
- `metric_kind`는 query name과 PromQL을 보고 `memory_usage_ratio`, `cpu_usage_ratio`, `cpu_throttling`, `scrape_health`, `scrape_error`, `pod_not_ready_count`, `restart_count_or_rate` 같은 작은 분류값으로 정리한다.
- `value_summary`는 이미 받은 sample/series 숫자에서 `count`, `min`, `max`, `avg`, `latest`, `latest_timestamp`만 계산한다. 숫자 point가 없으면 생략될 수 있다.
- `threshold`는 보수적인 기본 기준만 쓴다. ratio 계열은 `0.8` 이상 warning, `0.9` 이상 critical이다. `up`은 `1` 미만이면 critical이다. restart/not ready/scrape error/throttling 계열은 `0`보다 크면 warning 신호로 본다. known metric이 아니거나 숫자 point가 없으면 생략될 수 있다.
- `signals`는 threshold를 넘은 경우에만 `memory_pressure`, `cpu_pressure`, `cpu_throttling`, `scrape_target_down`, `collector_scrape_error`, `not_ready_pods`, `restart_increase` 같은 작은 label을 담는다.
- `baseline_comparison`은 range query에서 비교 가능한 series가 있을 때만 만든다. 외부 기준선이나 이전 배포 기준선이 아니라, 같은 query window 안의 첫 point를 기준으로 증가/감소/유지 series 개수를 계산한다.
- high cardinality metric 때문에 `samples`, `series`, `series[].values`, `result`가 너무 커질 수 있으므로 전송 전 제한한다. 제한되면 해당 query result의 `collection_limits`에 전체 개수와 최종 반환 개수를 남긴다. `analysis`는 제한 전 숫자 기준으로 계산한다. 개수 제한 뒤에도 JSON byte 크기가 크면 JSON byte 크기가 가장 큰 목록부터 추가로 줄인다. 단일 항목이 너무 크면 해당 목록은 0개까지 줄어들 수 있다. matrix의 `series.values` 제한 정보는 최종 `series` 목록이 정해진 뒤 다시 계산한다.

주의:

- 이번 변경은 provider가 새 PromQL query를 자동으로 추가하는 변경이 아니다. 이미 policy가 요청한 Prometheus 결과를 구조화한다.
- CPU throttling, memory usage/limit ratio, restart trend 같은 값은 해당 query가 policy에 들어온 경우에만 `analysis`로 해석된다.
- 외부 baseline, 배포 전 baseline, ingress 5xx, request latency는 별도 query나 외부 시스템 연결이 필요하므로 여기서 확정하지 않는다.
- 제한은 기존 `samples`/`series` 필드를 없애는 변경이 아니다. 기존 필드는 유지하고, 일부만 담긴 경우 `collection_limits`로 표시한다.

## Logs Provider

### 현재 있는 것

현재 Loki provider는 query 결과를 아래 형태로 받을 수 있다.

- query
- stream labels
- redacted log line samples
- line_count
- result_type
- pattern_counts
- severity_counts
- trace_ids
- matched_entries
- collection_limit
- redaction_summary

현재 기본 policy query 예시:

- target_namespace_errors
- node_collector_runtime_samples
- target_agent_warnings

### 추가 요청 항목과 현재 구현 상태

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

현재 구현 상태:

- `logs[].streams[].values[].line`은 기존 `line` 필드 이름은 유지하되, 값은 provider에서 민감정보를 마스킹한 문자열로 보낸다.
- `logs[].streams[].values[].line`은 전송 크기 보호를 위해 최대 4096자로 제한한다.
- line이 잘리면 같은 value object에 `line_truncated=true`, `original_line_length`를 남긴다.
- `pattern_counts`는 probe, health endpoint, dependency timeout/error, image pull, OOM/memory, config/env/volume 계열 로그를 line 단위로 센다.
- `severity_counts`는 `critical`, `error`, `warn`, `info`, `debug`, `trace`, `unknown`으로 정규화한다.
- `trace_ids`는 32자리 hex trace id만 최대 20개까지 보낸다.
- `matched_entries`는 RCA rule이 바로 읽을 수 있는 매칭 로그 요약이다. 각 항목은 `timestamp`, `namespace`, `pod`, `container`, `severity`, `message`, `matched_patterns`, `trace_id`, `line_truncated`를 담는다.
- `matched_entries[].message`는 원문 로그 전체가 아니라 redaction과 truncation이 적용된 RCA 판단용 log line이다.
- `collection_limit.matched_entries`는 최대 반환 수, 실제 매칭 수, 반환 수, 잘림 여부를 담는다.
- `redaction_summary`는 redaction 적용 여부, 실제로 값이 바뀐 line 개수, 길이 제한으로 잘린 line 개수를 담는다.

RCA EvidenceBundle에서는 `logs:related_logs`를 만들 때 `streams`와 `matched_entries`를 같은
incident scope로 필터링한다. 일반 incident는 namespace를 맞추고, RCA test run은 현재 test Pod 이름까지
맞춘다. 따라서 provider result에 query 전체의 matched entry가 있어도 RCA 분석에는 선택된 namespace/Pod의
matched entry만 올라간다. `collection_limit.matched_entries`는 provider result 기준의 제한 정보라서,
bundle scope 필터링 후의 최종 항목 수와 항상 같지는 않다.

주의:

- 로그 샘플에는 개인정보, token, credential이 섞일 수 있으므로 provider가 sample line을 보내기 전에 redaction을 적용한다.
- `password`, `token`, `secret`, `api_key`, `client_secret`, `credential`, `private_key`, `Authorization`, `Bearer`, `Cookie`, JWT, AWS access key, URL 계정정보, email은 가린다.
- `trace_id`, `span_id`, `request_id`, namespace, pod name, root cause keyword는 RCA 판단에 필요하므로 유지한다.
- 대표 sample 개수는 Loki query limit과 payload byte limit 안에서 제한한다.
- pattern count, severity count, trace id 추출은 마스킹된 전체 line을 기준으로 계산하고, 전송되는 `line` 문자열만 길이 제한으로 줄인다.

아직 별도 필드로 만들지 않은 값:

- `window`: evidence job의 `window_start`와 query policy의 시간 범위를 함께 봐야 하므로 Loki result 내부에는 아직 별도 field로 넣지 않는다.

## Trace Provider

### 현재 있는 것

policy상 traces query는 존재한다.

- application_error_spans
- target_agent_error_spans
- target_agent_recent_spans
- management_gateway_spans

단, 실제 수집 가능 여부는 Tempo/OTel 설정과 application instrumentation 상태에 따라 달라진다.

현재 `TempoTracesProvider`는 Tempo `/api/search` 결과를 query별로 정규화하고,
기존 `traces[]`와 `trace_count`를 유지한 채 `analysis`를 추가한다.
`analysis`는 Tempo가 이미 응답한 값에서 RCA가 바로 쓰기 쉬운 작은 필드만 뽑는다.
span attribute 전체나 payload 전체를 새로 복사하지 않는다.
단, 전송 크기 보호를 위해 trace 내부의 긴 문자열은 최대 1024자로 제한하고,
중첩 list는 최대 20개만 남긴다.
한 trace가 계속 너무 크면 trace_id, service, operation, status, duration_ms, error, dependency 같은
summary field와 `trace_truncated`, `original_trace_bytes`만 남길 수 있다.
전체 query result가 여전히 크면 `collection_limits.lists.traces`에 전체 trace 수와 최종 반환 trace 수를 남긴다.
`analysis`는 `traces[]` list를 최종 제한하기 전 compact trace 기준으로 만들기 때문에,
`traces[]`가 일부만 남아도 RCA용 trace id, service, status 요약은 유지될 수 있다.

현재 제공하는 값은 다음과 같다.

- trace_id
- span_id
- service
- operation
- status
- duration_ms
- dependency
- error
- dependency span 개수와 error span 개수 요약

아직 제공하지 않는 값은 다음과 같다.

- parent/child span 관계 전체
- span attribute 원문 전체
- dependency span 실패 여부 단일 판단 필드

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
- change_context.current_workload_snapshots[].pod_template_auth.service_account_name
- change_context.current_workload_snapshots[].pod_template_auth.automount_service_account_token
- change_context.current_workload_snapshots[].pod_template_auth.image_pull_secret_refs[].name
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
- change_context.current_workload_snapshots[].pod_status_count(잘렸을 때만 존재)
- change_context.current_workload_snapshots[].pod_statuses_truncated(잘렸을 때만 존재)
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
- change_context.current_workload_snapshots[].replicaset_revision_count(잘렸을 때만 존재)
- change_context.current_workload_snapshots[].replicaset_revisions_truncated(잘렸을 때만 존재)

`service_selector_matches[]`는 namespace Service selector와 Pod labels 비교 결과다.
summary query와 detail query 모두 같은 기본 shape로 보내지만, 범위와 `target_relation` 포함 여부가 다르다.
summary query는 `target_relation`을 넣지 않고, detail query는 target Deployment와 관련 있다고 판단된 Service만 남기며 그 이유를 `target_relation`으로 넣는다.

- change_context.service_selector_matches[].service.namespace/name
- change_context.service_selector_matches[].selector(selector가 없는 Service면 생략 가능)
- change_context.service_selector_matches[].match_status
- change_context.service_selector_matches[].target_relation(detail query에서만 존재)
- change_context.service_selector_matches[].matched_pod_count
- change_context.service_selector_matches[].matched_pods[].namespace/name(matched Pod가 없으면 생략 가능)
- change_context.service_selector_matches[].matched_pods_truncated(잘렸을 때만 존재)

전체 summary query는 namespace의 모든 Service 비교 결과를 보낸다.
특정 Deployment detail query는 target Deployment와 관련 있는 Service만 보낸다.
관련 기준은 `exact_selector_match`, `live_pod_match`, `selector_key_overlap`이다.

`endpoint_slice_ready_endpoints[]`는 Service 뒤에 실제 ready endpoint가 붙었는지 보는 요약이다.
EndpointSlice(엔드포인트슬라이스)는 Kubernetes가 Service 뒤 endpoint 목록을 나누어 저장하는 객체다.
summary query는 namespace의 모든 EndpointSlice 요약을 보낸다.
detail query는 target Deployment와 관련 있는 Service의 EndpointSlice만 보낸다.
endpoint IP address는 보내지 않고, ready target Pod의 kind/namespace/name만 보낸다.
EndpointSlice condition은 Kubernetes API의 기본 해석을 따른다.
`ready`와 `serving`이 생략되거나 null이면 true로 보고, `terminating`이 생략되거나 null이면 false로 본다.

- change_context.endpoint_slice_ready_endpoints[].service.namespace/name
- change_context.endpoint_slice_ready_endpoints[].endpoint_slice.namespace/name
- change_context.endpoint_slice_ready_endpoints[].address_type
- change_context.endpoint_slice_ready_endpoints[].ports[].name/port/protocol/app_protocol
- change_context.endpoint_slice_ready_endpoints[].ports_truncated(잘렸을 때만 존재)
- change_context.endpoint_slice_ready_endpoints[].endpoint_count
- change_context.endpoint_slice_ready_endpoints[].ready_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].not_ready_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].unknown_ready_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].serving_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].terminating_endpoint_count
- change_context.endpoint_slice_ready_endpoints[].ready_targets[].kind/namespace/name
- change_context.endpoint_slice_ready_endpoints[].ready_targets_truncated(잘렸을 때만 존재)

큰 namespace에서 evidence job result가 1MiB 제한을 넘길 위험을 줄이기 위해 metadata provider는 큰 목록을 제한한다.
잘린 목록이 있으면 `change_context.collection_limits`에 전체 개수와 최종 반환 개수를 남긴다.
전체 summary query는 `current_workload_snapshots`, `service_selector_matches`,
`endpoint_slice_ready_endpoints`, `resource_quotas` 같은 top-level 목록에 상한을 둔다.
개수 제한 뒤에도 JSON byte 크기가 크면 JSON byte 크기가 가장 큰 top-level 목록부터 추가로 줄인다.
단일 항목이 너무 크면 해당 top-level 목록은 0개까지 줄어들 수 있다.
항목 내부에서도 `matched_pods`, `ready_targets`, `pod_statuses`, `replicaset_revisions`는
샘플 목록만 보내고 full count와 `*_truncated` flag로 잘림 여부를 표시한다.

`resource_quotas[]`는 namespace 수준 ResourceQuota(네임스페이스 자원 할당량) 요약이다.
특정 Deployment 하나의 spec이 아니라 같은 namespace의 생성/스케줄링 제한 맥락을 보기 위해
`change_context` 바로 아래에 둔다.
권한이 없거나 ResourceQuota API가 없으면 빈 목록을 보낸다.
raw spec/status, annotation, managedFields는 보내지 않는다.

- change_context.resource_quotas[].name
- change_context.resource_quotas[].namespace
- change_context.resource_quotas[].hard
- change_context.resource_quotas[].used

`pod_template_auth`는 private image pull 실패와 service account 권한 문제 후보를 보기 위한 보수적 요약이다.
관련 값이 하나도 없으면 `pod_template_auth`는 생략될 수 있다.
`image_pull_secret_refs[].name`은 Deployment Pod template에 적힌 Secret 이름만 담는다.
Secret 객체의 `data`, `binaryData`, `stringData` 값은 읽거나 보내지 않는다.

`current_workload_snapshot`은 특정 Deployment 1개를 위한 detail snapshot이다.
detail snapshot은 summary 필드에 아래 필드를 추가로 담는다.

- change_context.current_workload_snapshot.deployment_annotations
- change_context.current_workload_snapshot.pod_template_annotations
- change_context.current_workload_snapshot.managed_fields_managers[]
- change_context.current_workload_snapshot.scheduling_constraints.node_selector
- change_context.current_workload_snapshot.scheduling_constraints.tolerations[]
- change_context.current_workload_snapshot.scheduling_constraints.affinity_summary
- change_context.current_workload_snapshot.containers[].env_refs
- change_context.current_workload_snapshot.containers[].env_from_refs
- change_context.current_workload_snapshot.containers[].volume_mount_refs
- change_context.current_workload_snapshot.replicaset_revisions[].created_at
- change_context.current_workload_snapshot.replicaset_revisions[].conditions[]
- change_context.referenced_config_objects[].kind
- change_context.referenced_config_objects[].namespace
- change_context.referenced_config_objects[].name
- change_context.referenced_config_objects[].exists
- change_context.referenced_config_objects[].access
- change_context.referenced_config_objects[].created_at
- change_context.referenced_config_objects[].labels
- change_context.referenced_config_objects[].referenced_by[]
- change_context.referenced_config_objects[].referenced_key_checks[]

Scheduling constraints는 단건 detail query에만 담는다.
전체 summary query는 target namespace의 모든 Deployment를 보내므로 affinity 원본이나 배치 조건을 모두 넣으면
payload가 커지고 RCA가 읽어야 할 noise가 늘어난다.
대신 특정 Deployment가 Pending 또는 scheduling 실패 후보일 때 `deployment/<name>` query로 detail을 요청하면,
`node_selector`는 그대로, `tolerations`는 작은 필드만, `affinity`는 boolean summary만 제공한다.
이렇게 하면 raw affinity 전체를 노출하지 않으면서도 Node label, taint/toleration, affinity 조건이 있는지 판단할 수 있다.

`referenced_config_objects[]`는 단건 detail query에만 담는다.
Deployment가 env/envFrom/volume으로 참조하는 ConfigMap/Secret 객체만 조회하고,
객체 값은 보내지 않는다.
Secret `data`, `binaryData`, `stringData`, ConfigMap `data`, `binaryData`,
raw object, annotations는 제외한다.
권한이 없으면 `exists: null`, `access: "forbidden"`으로 보내고,
객체가 없으면 `exists: false`, `access: "not_found"`으로 보낸다.
조회에 성공한 객체는 Deployment가 명시적으로 참조한 key의 존재 여부도
`referenced_key_checks[]`에 담는다.
`env[].valueFrom.configMapKeyRef/secretKeyRef.key`와 volume `items[].key`만 확인한다.
`envFrom`은 특정 key를 명시하지 않으므로 key check 대상에서 제외한다.
전체 key 목록과 값은 보내지 않는다.

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
