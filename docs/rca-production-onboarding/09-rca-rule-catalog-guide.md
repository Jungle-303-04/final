# RCA Rule Catalog Guide

이 문서는 plan-worker가 사용하는 RCA rule catalog의 구조와 각 YAML 파일의 의미를 정리한다.
WIKI/스프레드시트는 사람이 rule을 설계하기 위한 자료이고, 실제 plan-worker가 읽는 실행 계약은
`src/services/ai/agent/causes/catalog/*.yaml` 파일이다.

## Runtime 흐름

```text
incident-worker
  -> EvidenceBundleBuiltBody
  -> plan-worker
  -> incident.symptom 기준으로 catalog rule 매칭
  -> CauseCandidate 목록 생성
  -> RcaCandidatesPlannedBody 발행
```

즉 rule을 추가한다는 것은 plan-worker가 특정 symptom을 만났을 때 만들
root cause 후보 목록을 YAML로 등록한다는 뜻이다.

## YAML 구조

```yaml
rules:
  - id: "probe_failure"
    symptoms: ["Probe failure", "ReadinessProbeFailed"]
    required_sources: ["kubernetes", "metrics", "logs", "metadata"]
    candidates:
      - candidate_id: "probe_path_wrong"
        title: "Probe path 설정 오류"
        description: "..."
        expected_evidence:
          - "kubernetes:cluster_resource_state"
          - "logs:related_logs"
          - "metadata:current_workload_snapshots"
        checks:
          - "probe path와 실제 health route를 비교"
        signals:
          - id: "probe_path_failure_signal"
            any_of:
              - event_pattern: "readiness probe"
              - log_pattern: "404"
```

| 필드 | 의미 |
| --- | --- |
| `rules[].id` | rule 식별자다. catalog 전체에서 고유해야 한다. |
| `symptoms` | incident-worker가 만든 `incident.symptom`과 매칭되는 문자열 목록이다. |
| `required_sources` | EvidenceBundle이 최소로 가져야 하는 source 단위 근거다. 현재는 `kubernetes`, `metrics`, `logs`, `traces`, `metadata`처럼 source 단위를 쓴다. |
| `candidates` | plan-worker가 생성할 root cause 후보 목록이다. |
| `candidate_id` | 후보 식별자다. RCA 결과의 `root_cause`로도 쓰인다. |
| `expected_evidence` | 후보 평가에 필요한 근거다. v1부터 `source:name` key를 쓴다. |
| `checks` | 사람이 읽는 판단 기준이다. 아직 자동 비교하지 못하는 세부 필드 비교도 여기에 남긴다. |
| `signals` | 현재 코드가 자동으로 매칭할 수 있는 판별 신호다. 지원 matcher는 `fact`, `event_pattern`, `log_pattern`이다. |

## Evidence key 작성 기준

스프레드시트의 `events`, `services`, `endpoints`, `workloads` 같은 표현은 그대로
`expected_evidence`에 넣지 않는다. 현재 RCA 내부에서는 아래 v1 key로 변환한다.

| 자료 표현 | YAML `expected_evidence` |
| --- | --- |
| Kubernetes 상태, Pod, Event, Workload, Service, EndpointSlice | `kubernetes:cluster_resource_state` |
| Prometheus metrics | `metrics:telemetry_metrics` |
| Loki logs | `logs:related_logs` |
| Tempo traces | `traces:related_traces` |
| Deployment/Pod template 현재 snapshot | `metadata:current_workload_snapshots` 또는 `metadata:current_workload_snapshot` |
| Service selector와 Pod label 비교 | `metadata:service_selector_matches` |
| EndpointSlice ready endpoint 요약 | `metadata:endpoint_slice_ready_endpoints` |

`required_sources`는 bundle completeness 판단용이므로 source 단위를 유지하고,
`expected_evidence`에서만 구체적인 `source:name`을 쓴다.

## Catalog 파일별 의미

| 파일 | 담당 상태/증상 | 의미 |
| --- | --- | --- |
| `crashloop.yaml` | `CrashLoopBackOff`, `pod_restart_loop` | 컨테이너가 반복 재시작되는 상태다. OOM, 설정 오류, 앱 시작 실패, 의존성 연결 실패를 구분한다. |
| `image_pull.yaml` | `ImagePullBackOff`, `ErrImagePull` | 이미지 pull 단계에서 컨테이너가 시작되지 못하는 상태다. 잘못된 태그, pull Secret 누락, registry 장애를 구분한다. |
| `scheduling.yaml` | `FailedScheduling`, `Pending` | Pod가 노드에 배치되지 못하는 상태다. CPU/메모리 부족, affinity/taint 불일치, PVC 대기를 구분한다. |
| `network.yaml` | `DNS lookup failed`, `Connection timeout`, `Ingress 502/503` | 서비스 간 네트워크와 외부 트래픽 실패다. DNS, timeout, ingress upstream, backend readiness, 앱 5xx를 구분한다. |
| `deployment_gitops.yaml` | `ProgressDeadlineExceeded`, `Rollout failed`, `GitOps Sync Failed` | Deployment rollout 또는 GitOps sync가 실패한 상태다. rollout deadline, replica unavailable, manifest validation 문제를 다룬다. |
| `dependencies.yaml` | `DB connection failed` | 애플리케이션이 DB 같은 외부 의존성에 연결하지 못하는 상태다. 연결 경로 문제와 credential/config 문제를 구분한다. |
| `external_dependencies.yaml` | `Redis unavailable`, `Kafka consumer lag`, `External API timeout`, `DB/cache/queue dependency failure` | Redis, Kafka, 외부 API, queue/cache 계열 dependency 장애다. exporter metric, log, trace를 함께 본다. |
| `autoscaling.yaml` | `HPA scaling failed`, `FailedGetResourceMetric`, `FailedComputeMetricsReplicas` | HPA가 metrics를 가져오지 못하거나 resource request/max replica 조건 때문에 scale 계산 또는 확장에 실패하는 상태다. |
| `node_health.yaml` | `NodeNotReady`, `KubeletNotReady`, `Pod evicted`, `Evicted` | 노드 heartbeat/runtime/network 문제와 kubelet eviction 계열이다. Node condition, Pod eviction event, node metric/log를 함께 본다. |
| `storage_volume.yaml` | `FailedMount`, `VolumeMountFailed`, `FailedAttachVolume`, `VolumeAttachFailed` | PVC 바인딩, CSI driver, volume attach, StorageClass/topology 문제처럼 Pod volume 준비가 실패하는 상태다. |
| `runtime_config.yaml` | `ConfigMap not found`, `CreateContainerConfigError`, `Invalid environment config` | ConfigMap 참조, key, env 값, config volume mount 문제처럼 런타임 설정 때문에 컨테이너 생성/시작이 실패하는 상태다. |
| `security_policy.yaml` | `Secret not found` | Secret 참조 또는 Secret key 누락으로 컨테이너 생성/실행이 실패하는 상태다. 민감값은 보지 않고 reference/key 존재 여부만 근거로 삼는다. |
| `policy_rejection.yaml` | `Admission / policy rejection`, `Admission webhook denied`, `RBAC denied`, `Certificate expired`, `TLS handshake failed` | Admission/RBAC/TLS 정책 거절 계열이다. 보안 영향이 크므로 값 자체보다 event/log와 안전한 reference 중심으로 판단한다. |
| `readiness.yaml` | `Probe failure`, `ReadinessProbeFailed`, `LivenessProbeFailed`, `PodNotReady`, `Service has no ready endpoints`, `ServiceEndpointsEmpty` | Probe와 Service endpoint readiness 계열이다. probe path/port/timing 문제, 실제 app health 실패, selector/endpoint/port 문제를 구분한다. |
| `resource_pressure.yaml` | `OOMKilled`, `Memory Pressure`, `CPU Saturation`, `Disk Pressure`, `Ephemeral Storage 부족`, `PID Pressure` | CPU, memory, disk, PID 같은 resource pressure 계열이다. Kubernetes 상태와 Prometheus metric을 함께 본다. |

## 새 rule을 추가할 때 보는 순서

1. 스프레드시트에서 symptom과 후보를 고른다.
2. 해당 symptom이 incident-worker에서 실제로 나올 수 있는 이름인지 확인한다.
3. 필요한 근거를 v1 `source:name` key로 바꾼다.
4. 자동 판별 가능한 문자열/fact는 `signals`로 넣는다.
5. 자동 판별이 아직 어려운 비교는 `checks`에 남긴다.
6. `tests/test_rca_rule_catalog.py`에 plan-worker 매칭 테스트를 추가한다.

## 현재 signal DSL 한계

현재 자동 판별 신호는 다음 세 가지다.

| matcher | 보는 위치 |
| --- | --- |
| `fact` | Kubernetes item에서 추출한 `waiting_reason`, `terminated_reason`, `event_reason`, `exit_code` 토큰 |
| `event_pattern` | Kubernetes Event의 reason/message 문자열 |
| `log_pattern` | Loki log line 문자열 |

따라서 metrics threshold 비교, trace analysis 비교, metadata 내부 필드 비교는 아직 직접 signal로
자동 판별하지 못한다. 이 값들은 `expected_evidence`와 `checks`에 먼저 반영하고,
필요하면 signal DSL 확장 작업으로 분리한다.
