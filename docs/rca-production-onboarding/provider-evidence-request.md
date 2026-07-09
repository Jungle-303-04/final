# RCA Provider Evidence 요청 정리

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
- image 일부
- node 정보

### 추가로 요청해야 할 것

- probe spec은 `metadata` provider의 `current_workload_snapshots`에서 현재값을 일부 받을 수 있다.
  다만 변경 여부를 판단하려면 이전 snapshot 또는 GitOps diff가 필요하다.
  현재 수집하는 probe 필드는 다음과 같다.
  - readinessProbe
  - livenessProbe
  - startupProbe
  - path / port / timeoutSeconds / periodSeconds / failureThreshold
- env/config refs
  - env
  - envFrom
  - ConfigMap reference
- secret refs
  - Secret 값이 아니라 name/key reference만
- pvc refs
- resource quota
- service selector와 pod labels 비교 결과
- 상세 containerStatuses 원본 또는 더 풍부한 요약
- node pressure / scheduling 관련 detail

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

Metadata provider는 target namespace의 모든 Deployment를 조회해 현재 workload snapshot을 보낸다.
이 값은 변경 판단 결과가 아니라 Kubernetes API에서 본 현재 상태다.

```json
{
  "metadata": {
    "change_context": {
      "current_workload_snapshots": [
        {
          "workload": {
            "kind": "Deployment",
            "namespace": "target",
            "name": "my-app"
          },
          "deployment_labels": {},
          "pod_template_labels": {},
          "managed_fields_managers": [],
          "containers": [
            {
              "name": "app",
              "image": "example/app:v1",
              "readiness_probe": {},
              "liveness_probe": {},
              "startup_probe": {}
            }
          ],
          "replicaset_revisions": [
            {
              "name": "my-app-abc123",
              "revision": "3"
            }
          ]
        }
      ]
    }
  }
}
```

현재 payload에서 기대 가능한 정보:

- workload kind / namespace / name
- Deployment labels
- Pod template labels
- managedFields manager 일부
- container name
- 현재 image name/tag
- readiness/liveness/startup probe 현재값
- Deployment가 소유한 ReplicaSet name
- ReplicaSet revision annotation

### 추가로 요청해야 할 것

- git_sha
- image_digest
- helm revision
- rollout revision과 Git commit/PR 연결 정보
- recent manifest change
- recent config/probe/resource change
- actor/manager
- rollback_available
- risk_level
- 이전 workload snapshot
- GitOps diff
- PR 번호
- 배포한 사람
- Deployment annotations 상세값
- Pod template annotations 상세값
- env/config refs
- Secret 값이 아닌 Secret name/key reference
- resource requests/limits
- imagePullSecrets

주의:

- GitOps/CI/CD/SCM/배포 시스템과 연결이 필요할 수 있음
- metadata provider가 보내는 값만으로는 "변경됨"을 확정하지 않는다. 현재값과 이전값을 비교해야 한다.
- annotation, managedFields, env, Secret reference는 저장 범위와 마스킹 기준 필요
- raw spec은 민감한 설정이 섞일 수 있으므로 기본 evidence로 보내지 않는다.

## 요약

Kubernetes provider는 pods, events, workloads, services, endpointslices를 이미 수집한다.
다만 RCA가 세부 원인을 판단하려면 일부 데이터가 더 필요하다.
