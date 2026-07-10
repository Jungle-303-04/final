# Provider Evidence Field Guide

이 문서는 현재 provider 코드가 RCA에 넘기는 evidence payload의 필드 사전이다.
RCA가 받는 값은 `cluster.evidence.received` event body이며, provider는
`kubernetes`, `metrics`, `logs`, `traces`, `metadata` bucket을 채운다.

처음 읽을 때는 이 문서를 "JSON payload를 읽는 지도"라고 생각하면 된다.
provider는 장애 원인을 문장으로 설명해서 보내지 않는다. 대신 "지금 클러스터에서 관측한 사실"을
정리해서 보낸다. RCA는 이 사실들을 조합해서 symptom, root cause candidate, confidence,
Safe PR 가능성을 판단한다.

가장 큰 흐름은 다음과 같다.

```text
provider가 수집한 사실
  -> cluster.evidence.received
  -> evidence-worker
  -> incident-worker가 symptom/resource를 파생
  -> plan/analyze/rca worker가 root cause candidate와 confidence를 계산
  -> recovery/dispatch worker가 command 또는 Safe PR 가능성을 판단
```

중요한 기준은 다음과 같다.

- `cluster`, `pods`, `events` 같은 필드 이름 자체가 갯수를 의미하지 않는다.
- `cluster`는 객체이고, `pods`, `events`, `nodes` 등은 목록이다.
- 갯수는 대부분 `len(...)`으로 계산하거나, Kubernetes bucket의
  `provider_status.<query_name>.counts`에서 확인한다.
- `correlation_id`는 evidence body 필드가 아니라 event envelope metadata다.
- `symptom`, `resource`, `severity`는 현재 real provider가 직접 넣는 필드가 아니다.
  RCA가 쓰려면 `pods`, `events`, `workloads`, `metrics`, `logs`, `traces`를 보고
  별도 정규화 단계에서 파생해야 한다.
- Kubernetes bucket에는 `raw` 원본 object가 없다. provider가 선택한 summary 필드만 남긴다.
  반대로 `metrics`, `logs`, `traces`는 query 결과별 `raw`를 보존한다.
- `metadata` bucket은 현재 `change_context.current_workload_snapshots` 또는
  `change_context.current_workload_snapshot`에 Deployment snapshot을 담는다.

## 이 문서 읽는 순서

이 문서는 처음부터 끝까지 외우는 문서가 아니라, 상황에 맞게 찾아보는 문서다.
처음 읽는 사람은 아래 순서로 보면 가장 덜 헷갈린다.

| 읽는 순서 | 섹션 | 무엇을 얻는가 |
| --- | --- | --- |
| 1 | `처음 RCA할 때 보는 순서` | 실제 RCA 상황에서 어느 필드부터 볼지 잡는다. |
| 2 | `먼저 알아야 할 표현` | object, list, bucket, query name 같은 표기법을 익힌다. |
| 3 | `작은 예시로 보는 evidence` | payload가 실제로 어떤 모양인지 감을 잡는다. |
| 4 | `RCA 입력 top-level 필드` | event body의 가장 바깥 필드를 이해한다. |
| 5 | `Kubernetes bucket` | Pod, Event, Workload, Service 상태를 읽는 법을 본다. |
| 6 | `Metrics`, `Logs`, `Traces bucket` | 숫자, 로그 문장, trace 결과를 읽는 법을 본다. |
| 7 | `Evidence job 집계 규칙` | provider 실패나 partial evidence가 최종 payload에 어떻게 보이는지 이해한다. |
| 8 | `RCA에서 바로 쓸 수 있는 값과 파생해야 하는 값` | 현재 provider payload와 RCA 로직 사이의 빈틈을 확인한다. |

## 처음 RCA할 때 보는 순서

처음에는 모든 필드를 한 번에 보려고 하지 말고, 아래 순서대로 보면 된다.

| 순서 | 질문 | 먼저 볼 필드 |
| --- | --- | --- |
| 1 | evidence가 어느 cluster/window에서 왔나? | `workspace_id`, `cluster_id`, `evidence_key`, `window_start` |
| 2 | provider 수집 자체가 성공했나? | `kubernetes.provider_status`, 빈 `metrics.results`, 빈 `logs`, 빈 `traces.results` |
| 3 | 겉으로 보이는 symptom은 무엇인가? | `pods[].waiting_reasons`, `pods[].terminated_reasons`, `events[].reason/message`, `workloads[].conditions` |
| 4 | 어떤 resource가 영향을 받았나? | `events[].involved_kind/name`, `pods[].owner_kind/name`, `workloads[].kind/name` |
| 5 | 얼마나 심각한가? | `restart_total`, `events[].count`, `workloads[].unavailable_replicas`, `logs[].line_count`, `trace_count` |
| 6 | root cause 후보는 무엇인가? | Kubernetes reason/message + metrics value/series + log line + trace result |
| 7 | 근거가 충분한가? | 후보가 기대하는 source와 실제 있는 `kubernetes`, `metrics`, `logs`, `traces`, `metadata` 비교 |
| 8 | Safe PR로 고칠 수 있나? | provider field가 아니라 RCA 결과의 root cause와 recovery rule route를 본다. |

예를 들어 `CrashLoopBackOff`가 보이면 바로 root cause를 확정하지 말고,
`OOMKilled`인지, 잘못된 image rollout인지, config/env 문제인지, dependency 연결 실패인지 나눠서 본다.
이 구분에는 Kubernetes 상태만으로 부족한 경우가 많고, metrics/logs/traces 또는 metadata가 함께 필요하다.

## 먼저 알아야 할 표현

이 문서의 표에는 `object`, `list<object>`, `results.<name>`, `pods[]` 같은 표현이 자주 나온다.
처음 보면 낯설 수 있으니 아래 기준으로 읽으면 된다.

| 표현 | 쉬운 뜻 | 예시 |
| --- | --- | --- |
| `bucket` | evidence 안의 큰 서랍이다. provider 종류별로 나뉜다. | `kubernetes`, `metrics`, `logs`, `traces` |
| `object` | `{}` 모양의 묶음이다. 여러 이름 있는 값을 가진다. | `cluster: {"cluster_id": "...", "namespace": "target"}` |
| `list` | `[]` 모양의 목록이다. 같은 모양의 항목이 여러 개 들어간다. | `pods: [{...}, {...}]` |
| `list<object>` | object 여러 개가 들어 있는 목록이다. | `pods`, `events`, `nodes` |
| `pods[]` | `pods` 목록 안의 항목 하나하나를 뜻한다. | `pods[0]`, `pods[1]` |
| `containers[]` | container 목록 안의 항목 하나하나를 뜻한다. | `pods[0].containers[0]` |
| `<query_name>` 또는 `<name>` | 실제 payload에서는 query 이름으로 바뀌는 자리다. | `metrics.results.scrape_targets_up` |
| `*` | 여러 key 중 아무거나 올 수 있다는 뜻이다. | `metrics.results.*.samples` |
| `raw` | provider API 응답 원본이다. 정규화 필드로 부족할 때 참고한다. | Prometheus/Loki/Tempo response |

## 작은 예시로 보는 evidence

아래는 실제 payload 전체가 아니라 구조를 이해하기 위한 아주 작은 예시다.

```json
{
  "workspace_id": "workspace-1",
  "cluster_id": "target-cluster-01",
  "evidence_key": "workspace-1:target-cluster-01:cluster-snapshot:2026-07-04T09:00:00Z",
  "kubernetes": {
    "cluster": {
      "cluster_id": "target-cluster-01",
      "namespace": "target",
      "collected_at": "2026-07-04T09:00:04Z"
    },
    "pods": [
      {
        "name": "checkout-api-7f5c",
        "phase": "Running",
        "restart_total": 3,
        "waiting_reasons": ["CrashLoopBackOff"],
        "containers": [
          {
            "name": "checkout-api",
            "image": "checkout:v2",
            "state": "waiting",
            "state_reason": "CrashLoopBackOff"
          }
        ]
      }
    ],
    "events": [
      {
        "type": "Warning",
        "reason": "BackOff",
        "message": "Back-off restarting failed container",
        "count": 5,
        "involved_kind": "Pod",
        "involved_name": "checkout-api-7f5c"
      }
    ],
    "provider_status": {
      "target_namespace_snapshot": {
        "status": "success",
        "counts": {
          "pods": 1,
          "events": 1,
          "nodes": 1,
          "workloads": 1,
          "services": 1,
          "endpoints": 1
        }
      }
    }
  },
  "metrics": {
    "source": "prometheus",
    "results": {
      "node_memory_usage_ratio": {
        "query_mode": "instant",
        "result_type": "vector",
        "samples": [
          {
            "metric": {"instance": "node-a"},
            "value": 0.91
          }
        ]
      }
    }
  },
  "logs": [
    {
      "source": "loki",
      "query_name": "target_namespace_errors",
      "line_count": 1,
      "streams": [
        {
          "stream": {"pod": "checkout-api-7f5c"},
          "values": [
            {
              "timestamp": "1782822589742000000",
              "line": "ERROR out of memory"
            }
          ]
        }
      ]
    }
  ],
  "traces": {
    "source": "tempo",
    "results": {
      "application_error_spans": {
        "trace_count": 0,
        "traces": []
      }
    }
  }
}
```

이 예시를 사람이 읽으면 다음처럼 해석할 수 있다.

1. `pods[0].waiting_reasons`에 `CrashLoopBackOff`가 있으므로 symptom 후보는 CrashLoopBackOff다.
2. `restart_total`이 3이고 event `BackOff`가 5번 반복되었으므로 restart loop 신호가 있다.
3. log line에 `out of memory`가 있으므로 root cause candidate 중 `oom_killed` 가능성이 올라간다.
4. memory metric이 0.91이면 memory pressure 근거로 쓸 수 있다.
5. 이 판단은 provider가 직접 말한 것이 아니라 RCA가 여러 필드를 조합해서 파생한 것이다.

## RCA 입력 top-level 필드

`ClusterEvidenceReceivedBody` 기준 필드다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `workspace_id` | string | tenant/workspace 식별자다. |
| `cluster_id` | string | evidence를 보낸 target cluster 식별자다. 실제 Kubernetes cluster 개수 값이 아니다. |
| `agent_id` | string 또는 null | evidence job을 수행한 target cluster agent 식별자다. |
| `source_id` | string 또는 null | evidence window의 출처 이름이다. 기본값은 `cluster-snapshot`이다. |
| `window_start` | string 또는 null | 이 evidence 묶음이 대표하는 수집 window 시작 시각이다. job scheduler는 interval boundary 기준 ISO timestamp를 만든다. |
| `evidence_key` | string 또는 null | 같은 window의 provider 결과를 묶는 키다. job path에서는 보통 `workspace_id:cluster_id:source_id:window_start` 형태다. |
| `kubernetes` | object | Kubernetes API snapshot을 정규화한 bucket이다. |
| `metrics` | object | Prometheus query 결과를 정규화한 bucket이다. |
| `logs` | list<object> | Loki query 결과 목록이다. 로그 라인 목록 자체가 아니라 query별 결과 목록이다. |
| `traces` | object | Tempo trace search 결과를 정규화한 bucket이다. |
| `metadata` | object | `MetadataProvider`가 만든 변경 맥락 bucket이다. 현재 provider는 전체 조회 시 `change_context.current_workload_snapshots`, 단건 조회 시 `change_context.current_workload_snapshot`을 담는다. |

HTTP `AgentEvidenceRequest`에는 `correlation_id`가 있지만, event body로는 들어가지 않는다.
Gateway가 event envelope correlation으로 연결한다.

### Direct evidence request 제한

`/agent/evidence` direct path는 provider job queue를 거치지 않고 위 body를 직접 stage한다.
이때 Pydantic DTO가 강제하는 제한은 다음과 같다.

| 제한 | 값 | 의미 |
| --- | --- | --- |
| `logs` max length | 2000 | top-level `logs` list 항목 수 제한이다. Loki 내부 log line 총수 제한이 아니라 `logs[]` query result object 개수 제한이다. |
| payload byte limit | 1 MiB | `kubernetes`, `metrics`, `logs`, `traces`를 JSON으로 직렬화한 크기 상한이다. 초과하면 request validation이 실패한다. |
| bucket schema | loose dict/list | `kubernetes`, `metrics`, `traces`는 dict, `logs`는 list라는 큰 모양만 강제한다. 세부 provider-normalized shape는 코드 convention이다. |
| direct `metadata` 입력 | 없음 | `AgentEvidenceRequest`에는 아직 `metadata` 필드가 없다. `metadata` bucket은 provider job path의 `MetadataProvider`에서 만들어진다. |

Direct path에서도 `workspace_id`, `cluster_id`, `evidence_key` namespace는 agent token identity가 우선한다.
body에 다른 workspace나 cluster를 넣어도 trusted identity로 덮어쓴다.

## Provider source와 evidence bucket

Provider registry는 source 이름과 evidence bucket 이름을 분리한다.

| source | evidence bucket | provider class | query object |
| --- | --- | --- | --- |
| `kubernetes` | `kubernetes` | `KubernetesSnapshotProvider` | `KubernetesSnapshotQuery` |
| `prometheus` | `metrics` | `PrometheusMetricsProvider` | `PrometheusInstantQuery`, `PrometheusRangeQuery` |
| `loki` | `logs` | `LokiLogsProvider` | `LokiLogQuery` |
| `tempo` | `traces` | `TempoTracesProvider` | `OpenTelemetrySpanQuery` |
| `metadata` | `metadata` | `MetadataProvider` | `MetadataSnapshotQuery` |

## Provider query policy

Provider는 자체적으로 모든 값을 무조건 수집하지 않는다.
Management policy의 `evidence.providers.<provider_key>.queries`가 query 목록을 정하고,
agent는 이 query definition을 provider별 query object로 바꿔 실행한다.

| query definition 필드 | 의미 |
| --- | --- |
| `source` | telemetry source다. policy에 없으면 provider key로 역조회해 채운다. 예: `metrics` provider는 `prometheus`. |
| `name` | query 결과 key다. metrics/traces에서는 `results.<name>`, logs에서는 `logs[].query_name`, Kubernetes에서는 `provider_status.<name>`으로 쓰인다. metadata는 query별 key를 만들지 않고 현재 고정 `change_context` bucket으로 합쳐진다. |
| `description` | 사람이 읽는 query 설명이다. provider payload에는 대부분 직접 들어가지 않는다. |
| `query` | 실제 query 문자열이다. Prometheus는 PromQL, Loki는 LogQL, Tempo는 TraceQL/search query, Kubernetes는 namespace 문자열로 사용한다. Metadata는 `change_context`이면 target namespace 전체 Deployment 목록, `deployment/<name>` 또는 `deployment/<namespace>/<name>`이면 특정 Deployment 1개를 조회한다. |
| `range_seconds` | Prometheus range query일 때만 쓴다. 있으면 `PrometheusRangeQuery`가 된다. |
| `step_seconds` | Prometheus range query step이다. 없으면 provider가 range 기준으로 계산한다. |

query가 비어 있으면 provider는 빈 bucket을 반환한다.
예를 들어 Prometheus query가 없으면 `{"source": "prometheus", "results": {}}`가 된다.
metadata query가 없거나 수집 중 fallback이 발생하면 `{"change_context": {"current_workload_snapshots": []}}`가 된다.

## Kubernetes bucket

Kubernetes bucket은 target namespace와 cluster 주변 상태를 요약한 snapshot이다.
초심자 관점에서는 "Kubernetes API에서 본 현재 리소스 상태표"라고 보면 된다.
장애의 겉모습, 즉 어떤 Pod가 죽고 있는지, 어떤 Event가 반복되는지, workload replica가 부족한지,
Service 뒤에 endpoint가 있는지 확인하는 가장 중요한 bucket이다.

RCA를 처음 볼 때는 Kubernetes bucket 안에서 보통 아래 순서로 확인한다.

1. `provider_status`로 수집이 성공했는지 본다.
2. `pods[].waiting_reasons`, `pods[].terminated_reasons`, `pods[].restart_total`로 Pod 증상을 본다.
3. `events[].reason`, `events[].message`, `events[].count`로 Kubernetes가 남긴 장애 힌트를 본다.
4. `workloads[].ready_replicas`, `workloads[].unavailable_replicas`, `workloads[].conditions`로 배포 상태를 본다.
5. `services[]`와 `endpoints[]`로 traffic을 받을 endpoint가 있는지 본다.

```json
{
  "cluster": {},
  "workloads": [],
  "pods": [],
  "events": [],
  "nodes": [],
  "services": [],
  "endpoints": [],
  "provider_status": {}
}
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `cluster` | object | 수집 대상 cluster metadata다. cluster 개수 값이 아니다. |
| `pods` | list<object> | 수집 namespace 안의 Pod 요약 목록이다. Pod 갯수는 `len(pods)` 또는 `provider_status.*.counts.pods`다. |
| `events` | list<object> | Kubernetes Event 요약 목록이다. `BackOff`, `FailedScheduling`, `Unhealthy` 같은 symptom 힌트가 들어온다. |
| `nodes` | list<object> | cluster node 요약 목록이다. node ready 여부, taint, capacity, allocatable을 볼 수 있다. |
| `workloads` | list<object> | Deployment, StatefulSet, DaemonSet, ReplicaSet 요약 목록이다. replica 상태와 rollout condition을 본다. |
| `services` | list<object> | Service 요약 목록이다. Service type, cluster IP, port, selector를 본다. |
| `endpoints` | list<object> | EndpointSlice 요약 목록이다. Service 뒤에 실제 endpoint가 붙었는지 본다. |
| `provider_status` | object | Kubernetes provider query별 수집 상태와 bucket별 count다. |

### Kubernetes provider가 조회하는 API resource

기본 Kubernetes snapshot query는 다음 Kubernetes API resource를 읽고 summary로 줄인다.

| API resource | bucket 필드 | 의미 |
| --- | --- | --- |
| namespace Pods | `pods` | Pod phase, status, owner, container status를 본다. |
| namespace Events | `events` | kubelet/scheduler/controller가 남긴 reason/message를 본다. |
| cluster Nodes | `nodes` | node readiness, taints, capacity, allocatable을 본다. |
| namespace Deployments | `workloads` | Deployment replica와 conditions를 본다. |
| namespace StatefulSets | `workloads` | StatefulSet replica와 conditions를 본다. |
| namespace DaemonSets | `workloads` | DaemonSet replica와 conditions를 본다. |
| namespace ReplicaSets | `workloads` | ReplicaSet replica와 conditions를 본다. |
| namespace Services | `services` | Service selector, ports, cluster IP를 본다. |
| namespace EndpointSlices | `endpoints` | Service 뒤 endpoint 존재 여부를 본다. |

### `kubernetes.cluster`

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `cluster_id` | string | agent가 알고 있는 target cluster ID다. Kubernetes cluster 개수가 아니다. |
| `namespace` | string | snapshot을 수집한 namespace다. query에 namespace가 없으면 target namespace를 쓴다. |
| `collected_at` | string | Kubernetes API snapshot을 정규화한 시각이다. ISO timestamp 형태다. |

Kubernetes API가 설정되지 않았을 때도 provider는 빈 snapshot을 만들 수 있다.
이 경우 `provider_status.<query_name>.status`가 `unavailable`이고 `reason`에 원인이 들어간다.

### `kubernetes.pods[]`

각 항목은 Pod 하나의 요약이다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `uid` | string 또는 null | Kubernetes Pod UID다. event와 연결할 때 쓸 수 있다. |
| `name` | string 또는 null | Pod 이름이다. |
| `namespace` | string 또는 null | Pod namespace다. |
| `node_name` | string 또는 null | Pod가 스케줄된 node 이름이다. Pending이면 없을 수 있다. |
| `phase` | string 또는 null | Pod phase다. 예: `Pending`, `Running`, `Succeeded`, `Failed`, `Unknown`. |
| `reason` | string 또는 null | Pod status reason이다. |
| `message` | string 또는 null | Pod status message다. |
| `start_time` | string 또는 null | Pod start time이다. |
| `labels` | object | Pod label 일부다. 현재 provider는 앞에서 최대 12개만 문자열로 보존한다. |
| `owner_kind` | string 또는 null | 첫 번째 ownerReference의 kind다. 예: `ReplicaSet`, `Job`. |
| `owner_name` | string 또는 null | 첫 번째 ownerReference의 name이다. |
| `workload_key` | string 또는 null | `namespace/owner_kind/owner_name` 형태의 owner key다. owner가 없으면 null이다. |
| `pod_ip` | string 또는 null | Pod IP다. |
| `host_ip` | string 또는 null | Pod가 올라간 node host IP다. |
| `conditions` | list<object> | Kubernetes Pod condition 원본 목록이다. Ready, ContainersReady, PodScheduled 등을 볼 수 있다. |
| `containers` | list<object> | container status 요약 목록이다. 아래 `pods[].containers[]` 참조. |
| `restart_total` | number | 이 Pod 안의 container `restart_count` 합계다. restart loop 판단에 쓴다. |
| `waiting_reasons` | list<string> | waiting 상태 container의 reason 목록이다. 예: `CrashLoopBackOff`, `ImagePullBackOff`, `CreateContainerConfigError`. |
| `terminated_reasons` | list<string> | terminated 상태 container의 reason 목록이다. 예: `OOMKilled`, `Error`, `Completed`. |

RCA 파생 예시는 다음과 같다.

| 파생 정보 | 볼 필드 |
| --- | --- |
| CrashLoopBackOff symptom | `waiting_reasons`, `restart_total`, `events[].reason/message` |
| ImagePullBackOff symptom | `waiting_reasons`, `containers[].image`, `events[].message` |
| OOMKilled candidate | `terminated_reasons`, `containers[].exit_code`, memory metric, logs |
| affected workload | `owner_kind`, `owner_name`, `workload_key`, `labels` |

### `kubernetes.pods[].containers[]`

각 항목은 Pod 안의 container 하나의 status 요약이다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `name` | string 또는 null | container 이름이다. |
| `image` | string 또는 null | container image name/tag/digest다. image rollout 문제 판단의 기본 재료다. |
| `ready` | boolean 또는 null | container ready 여부다. |
| `restart_count` | number | Kubernetes `restartCount` 값이다. |
| `state` | string 또는 null | 현재 state 이름이다. provider는 `state` object의 첫 key를 사용한다. 예: `running`, `waiting`, `terminated`. |
| `state_reason` | string 또는 null | 현재 state payload의 reason이다. 예: `CrashLoopBackOff`, `ErrImagePull`, `OOMKilled`. |
| `state_message` | string 또는 null | 현재 state payload의 message다. |
| `exit_code` | number 또는 null | terminated state일 때 exit code다. |
| `started_at` | string 또는 null | state payload의 startedAt이다. |
| `finished_at` | string 또는 null | terminated state의 finishedAt이다. |

주의: 현재 provider는 `lastState`를 별도 필드로 정규화하지 않는다.
OOMKilled 같은 과거 종료 이유가 현재 `state`에 없으면 event/log/metrics와 함께 보거나 provider 확장이 필요하다.

### `kubernetes.events[]`

각 항목은 Kubernetes Event 하나의 요약이다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `uid` | string 또는 null | Event UID다. |
| `namespace` | string 또는 null | Event namespace다. |
| `type` | string 또는 null | Event type이다. 예: `Warning`, `Normal`. |
| `reason` | string 또는 null | Event reason이다. 예: `BackOff`, `FailedScheduling`, `Unhealthy`, `FailedMount`. |
| `message` | string 또는 null | Event message다. root cause 후보를 찾는 핵심 텍스트다. |
| `count` | number 또는 null | 같은 event가 반복된 횟수다. 심각도와 confidence 보조 신호다. |
| `first_timestamp` | string 또는 null | 최초 발생 시각이다. `firstTimestamp`가 없으면 `eventTime`을 쓴다. |
| `last_timestamp` | string 또는 null | 마지막 발생 시각이다. `lastTimestamp`가 없으면 `eventTime`을 쓴다. |
| `reporting_component` | string 또는 null | event를 보고한 component다. 예: kubelet, scheduler. |
| `involved_kind` | string 또는 null | event 대상 object kind다. 예: Pod, Deployment. |
| `involved_name` | string 또는 null | event 대상 object name이다. |
| `involved_uid` | string 또는 null | event 대상 object UID다. Pod UID와 연결할 수 있다. |

RCA 파생 예시는 다음과 같다.

| event reason/message | 가능한 symptom 또는 candidate |
| --- | --- |
| `BackOff`, `Back-off restarting failed container` | `CrashLoopBackOff`, app startup failure, OOMKilled |
| `FailedScheduling`, `Insufficient cpu`, `Insufficient memory` | scheduling failure, resource shortage |
| `Failed`, `ErrImagePull`, `manifest unknown`, `unauthorized` | image pull failure |
| `FailedMount`, `secret not found`, `configmap not found` | missing secret/config |
| `Unhealthy`, readiness/liveness probe failed | readiness failure, dependency failure |

### `kubernetes.nodes[]`

각 항목은 Node 하나의 요약이다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `name` | string 또는 null | node 이름이다. |
| `ready` | boolean | Node condition 중 `Ready=True`인지 provider가 계산한 값이다. |
| `conditions` | list<object> | Kubernetes Node condition 원본 목록이다. DiskPressure, MemoryPressure, Ready 등을 볼 수 있다. |
| `taints` | list<object> | Node taints 원본 목록이다. scheduling failure 판단에 쓴다. |
| `capacity` | object | Node status capacity 원본 object다. CPU, memory, pods 등 총량이다. |
| `allocatable` | object | Node status allocatable 원본 object다. 실제 scheduling 가능한 CPU, memory, pods 등이다. |
| `node_info` | object | Kubernetes nodeInfo 원본 object다. kubeletVersion, OS, architecture 등을 볼 수 있다. |

### `kubernetes.workloads[]`

각 항목은 Deployment, StatefulSet, DaemonSet, ReplicaSet 중 하나의 요약이다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `kind` | string | workload kind다. `Deployment`, `StatefulSet`, `DaemonSet`, `ReplicaSet` 중 하나다. |
| `namespace` | string 또는 null | workload namespace다. |
| `name` | string 또는 null | workload 이름이다. |
| `generation` | number 또는 null | metadata.generation이다. desired spec generation이다. |
| `observed_generation` | number 또는 null | status.observedGeneration이다. controller가 본 generation이다. |
| `desired_replicas` | number 또는 null | spec.replicas다. DaemonSet처럼 replicas가 없을 수 있다. |
| `ready_replicas` | number | ready 상태 replica 수다. |
| `available_replicas` | number | available 상태 replica 수다. |
| `updated_replicas` | number | updated replica 수다. rollout 진행 상태를 볼 수 있다. |
| `unavailable_replicas` | number | unavailable replica 수다. 0보다 크면 rollout/readiness 문제 후보가 된다. |
| `conditions` | list<object> | workload status conditions 원본 목록이다. Progressing, Available, ReplicaFailure 등을 볼 수 있다. |
| `selector` | object | spec.selector 원본 object다. Service selector, Pod labels와 비교할 수 있다. |

RCA 파생 예시는 다음과 같다.

| 파생 정보 | 볼 필드 |
| --- | --- |
| rollout 실패 | `conditions[].reason`, `updated_replicas`, `available_replicas`, `unavailable_replicas` |
| replica 부족 | `desired_replicas`와 `ready_replicas` 비교 |
| controller sync 지연 | `generation`과 `observed_generation` 비교 |
| Service endpoint 문제 | `selector`, `services[].selector`, `endpoints[].endpoint_count` |

### `kubernetes.services[]`

각 항목은 Service 하나의 요약이다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `namespace` | string 또는 null | Service namespace다. |
| `name` | string 또는 null | Service 이름이다. |
| `type` | string 또는 null | Service type이다. 예: `ClusterIP`, `NodePort`, `LoadBalancer`. |
| `cluster_ip` | string 또는 null | Service clusterIP다. headless service면 `None` 또는 관련 값일 수 있다. |
| `ports` | list<object> | Service ports 원본 목록이다. port, targetPort, protocol 등을 볼 수 있다. |
| `selector` | object | Service selector 원본 object다. Pod labels와 비교해 endpoint 누락을 판단한다. |

### `kubernetes.endpoints[]`

각 항목은 EndpointSlice 하나의 요약이다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `namespace` | string 또는 null | EndpointSlice namespace다. |
| `name` | string 또는 null | EndpointSlice 이름이다. 보통 Service 이름을 prefix로 가진다. |
| `address_type` | string 또는 null | endpoint address type이다. 예: `IPv4`, `IPv6`, `FQDN`. |
| `endpoint_count` | number | EndpointSlice 안의 endpoint 개수다. 0이면 Service 뒤에 ready endpoint가 없을 가능성이 있다. |
| `ports` | list<object> | EndpointSlice ports 원본 목록이다. |

주의: 현재 provider는 EndpointSlice의 endpoint readiness condition까지 펼치지 않고
`endpoint_count`만 요약한다.

### `kubernetes.provider_status`

`provider_status`는 Kubernetes provider query별 수집 결과 metadata다.

```json
{
  "target_namespace_snapshot": {
    "status": "success",
    "namespace": "target",
    "reason": "",
    "counts": {
      "pods": 1,
      "events": 1,
      "nodes": 1,
      "workloads": 1,
      "services": 1,
      "endpoints": 1
    }
  }
}
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `<query_name>` | object | Kubernetes query 이름이다. 기본 query는 `target_namespace_snapshot`이다. |
| `<query_name>.status` | string | provider query 수집 상태다. 보통 `success`, Kubernetes API 미설정이면 `unavailable`이다. |
| `<query_name>.namespace` | string | 이 query가 수집한 namespace다. |
| `<query_name>.reason` | string 또는 null | 수집 실패나 unavailable 이유다. |
| `<query_name>.counts.pods` | number | `pods` 목록 길이다. |
| `<query_name>.counts.events` | number | `events` 목록 길이다. |
| `<query_name>.counts.nodes` | number | `nodes` 목록 길이다. |
| `<query_name>.counts.workloads` | number | `workloads` 목록 길이다. |
| `<query_name>.counts.services` | number | `services` 목록 길이다. |
| `<query_name>.counts.endpoints` | number | `endpoints` 목록 길이다. |

다른 provider bucket에는 현재 이 형태의 `provider_status`가 없다.
Prometheus, Loki, Tempo의 실패 처리는 `Evidence job 집계 규칙`에서 따로 설명한다.

여러 Kubernetes query를 실행하면 snapshot 목록은 merge된다.
`pods`, `events`, `nodes`, `workloads`, `services`, `endpoints`는 query별 결과가 append되고,
`provider_status`는 query name별로 추가된다. 따라서 중복 namespace query를 넣으면
목록에 같은 리소스가 중복될 수 있다.

## Metrics bucket

Metrics bucket은 Prometheus provider가 만든다.
초심자 관점에서는 "숫자로 된 관측값"이다.
Kubernetes bucket이 리소스 상태를 보여준다면, metrics bucket은 CPU, memory, filesystem,
replica 수, scrape 성공 여부처럼 시간에 따라 변하는 숫자를 보여준다.

metrics를 읽을 때 가장 먼저 볼 것은 `results` 아래의 query 이름이다.
예를 들어 `metrics.results.node_memory_usage_ratio.samples[0].value`는
node memory 사용률 query의 첫 번째 sample 값이다.

```json
{
  "source": "prometheus",
  "results": {
    "<metric_name>": {}
  }
}
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `source` | string | provider source 이름이다. 항상 `prometheus`다. |
| `results` | object | query name을 key로 하는 Prometheus query 결과 묶음이다. |
| `results.<metric_name>` | object | query 하나의 정규화 결과다. `<metric_name>`은 policy query의 `name`이다. |

### `metrics.results.<metric_name>`

공통 필드다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `query` | string | 실행한 PromQL이다. |
| `query_mode` | string | `instant` 또는 `range`다. |
| `result_type` | string 또는 null | Prometheus `data.resultType`이다. 예: `vector`, `matrix`, `scalar`, `string`. |
| `raw` | object | Prometheus API response 원본이다. RCA가 provider 정규화 밖의 값을 봐야 할 때 쓴다. |

Instant vector 결과일 때 추가 필드다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `samples` | list<object> | 시점별 vector sample 목록이다. |
| `samples[].metric` | object | Prometheus label set이다. 예: `pod`, `namespace`, `node`, `instance`. |
| `samples[].timestamp` | number 또는 null | Prometheus sample timestamp다. |
| `samples[].value` | number 또는 null | sample value를 float으로 바꾼 값이다. |

Range matrix 결과일 때 추가 필드다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `range_seconds` | number | query range window 초 단위다. |
| `step_seconds` | number 또는 null | query step 초 단위다. 없으면 provider가 range 기준으로 계산한다. |
| `series` | list<object> | time series 목록이다. |
| `series[].metric` | object | Prometheus label set이다. |
| `series[].values` | list<object> | timestamp/value point 목록이다. |
| `series[].values[].timestamp` | number 또는 null | point timestamp다. |
| `series[].values[].value` | number 또는 null | point value를 float으로 바꾼 값이다. |
| `point_count` | number | 모든 series의 point 개수 합계다. |

Vector/matrix가 아닌 결과일 때 추가 필드다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `result` | any | Prometheus `data.result` 원본이다. |

기본 policy query는 다음과 같다.

| query name | 의미 |
| --- | --- |
| `scrape_targets_up` | Prometheus scrape target health다. target이 scrape되고 있는지 본다. |
| `target_pod_info` | kube-state-metrics가 발견한 target namespace Pod 정보다. |
| `target_deployment_replicas` | target namespace Deployment replica count다. |
| `node_cpu_usage_ratio` | node CPU 사용률 비율이다. |
| `node_memory_usage_ratio` | node memory 사용률 비율이다. |
| `node_filesystem_usage_ratio` | node filesystem 사용률 비율이다. |
| `node_collector_node_pod_count` | optional node collector가 보고한 node별 pod 수 range query다. |
| `node_collector_node_not_ready_pod_count` | node별 Not Ready pod 수 range query다. |
| `node_collector_scrape_error` | optional node collector의 Kubernetes API read 실패 여부다. |

RCA 파생 예시는 다음과 같다.

| 파생 정보 | 볼 필드 |
| --- | --- |
| resource pressure | `node_cpu_usage_ratio`, `node_memory_usage_ratio`, `node_filesystem_usage_ratio` |
| restart 증가 추세 | 별도 restart range query의 `series[].values` |
| Deployment replica 이상 | `target_deployment_replicas.samples`, Kubernetes `workloads` |
| 관측성 자체 문제 | `scrape_targets_up.samples`, `node_collector_scrape_error.samples` |

## Logs bucket

Logs bucket은 Loki provider가 만든다.
주의할 점은 `logs`가 로그 라인 목록이 아니라 query별 결과 목록이라는 점이다.
실제 로그 라인은 `logs[].streams[].values[]` 안에 있다.
초심자 관점에서는 "애플리케이션이나 agent가 직접 남긴 문장 증거"다.
Kubernetes Event가 "컨테이너가 재시작된다"고 말해준다면, log line은 "왜 프로세스가 죽었는지"를
더 구체적으로 보여줄 수 있다.

logs를 읽을 때는 `logs[].query_name`으로 어떤 로그 query 결과인지 확인하고,
`line_count`로 잡힌 로그가 있는지 본 다음, 실제 문장은
`logs[].streams[].values[].line`에서 읽는다.

```json
[
  {
    "source": "loki",
    "query_name": "target_namespace_errors",
    "query": "{...}",
    "result_type": "streams",
    "streams": [],
    "line_count": 0,
    "raw": {}
  }
]
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `logs[]` | list<object> | Loki query 하나당 하나의 결과 object다. |
| `logs[].source` | string | provider source 이름이다. 항상 `loki`다. |
| `logs[].query_name` | string | policy query의 `name`이다. |
| `logs[].query` | string | 실행한 LogQL이다. |
| `logs[].result_type` | string 또는 null | Loki `data.resultType`이다. 보통 `streams`다. |
| `logs[].streams` | list<object> | Loki stream 목록이다. |
| `logs[].line_count` | number | 모든 stream의 log entry 개수 합계다. |
| `logs[].raw` | object | Loki API response 원본이다. |

### `logs[].streams[]`

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `stream` | object | Loki stream label set이다. 예: namespace, pod, container, app label. |
| `values` | list<object> | 이 stream의 log entry 목록이다. |

### `logs[].streams[].values[]`

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `timestamp` | string 또는 null | Loki log timestamp다. nanosecond string 형태일 수 있다. |
| `line` | string 또는 null | 실제 log line이다. root cause keyword 판단에 쓴다. |

기본 policy query는 다음과 같다.

| query name | 의미 |
| --- | --- |
| `target_namespace_errors` | target namespace workload의 `ERROR` 로그를 찾는다. |
| `node_collector_runtime_samples` | optional node collector의 structured runtime sample 로그를 찾는다. |
| `target_agent_warnings` | target-cluster-agent container의 warning/error/failure 로그를 찾는다. |

RCA 파생 예시는 다음과 같다.

| 로그 내용 | 가능한 candidate |
| --- | --- |
| `OOM`, `out of memory`, heap allocation failure | `oom_killed` |
| missing env, config load failed, file not found | `config_env_error` |
| module import error, startup error, binary mismatch | `app_startup_failure` 또는 `bad_image_rollout` |
| connection refused, timeout, auth failed | dependency/network candidate |
| no such host, DNS lookup failed | DNS/network candidate |

## Traces bucket

Traces bucket은 Tempo provider가 만든다.
초심자 관점에서는 "요청이 여러 서비스나 dependency를 지나가며 어디서 느려지거나 실패했는지"를 보는 자료다.
CrashLoop, ImagePull처럼 Kubernetes 자체에서 바로 보이는 문제보다, DB/API timeout,
upstream latency, management gateway 호출 실패 같은 흐름형 문제를 판단할 때 도움이 된다.

traces를 읽을 때는 `results.<query_name>.trace_count`로 잡힌 trace가 있는지 보고,
각 trace의 `rootServiceName`, `rootTraceName`, `durationMs`, `traceID` 같은 값을 확인한다.

```json
{
  "source": "tempo",
  "results": {
    "<query_name>": {
      "query": "{ status = error }",
      "traces": [],
      "trace_count": 0,
      "raw": {}
    }
  }
}
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `source` | string | provider source 이름이다. 항상 `tempo`다. |
| `results` | object | query name을 key로 하는 trace search 결과 묶음이다. |
| `results.<query_name>` | object | query 하나의 정규화 결과다. |

### `traces.results.<query_name>`

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `query` | string | 실행한 TraceQL 또는 Tempo search query다. |
| `traces` | list<object> | Tempo `/api/search`가 반환한 trace 목록이다. provider는 내부 trace object를 세부 정규화하지 않고 보존한다. |
| `trace_count` | number | `traces` 목록 길이다. |
| `raw` | object | Tempo API response 원본이다. |

`traces[]` 내부 object는 Tempo 응답에 따라 달라질 수 있다.
테스트와 일반 search response 기준으로 다음 값이 들어올 수 있다.

| 필드 예시 | 의미 |
| --- | --- |
| `traceID` | trace 식별자다. |
| `rootServiceName` | root service 이름이다. |
| `rootTraceName` | root span 또는 operation 이름이다. |
| `durationMs` | trace duration millisecond다. |
| `query` | 테스트 레거시 데이터에서는 어떤 query로 잡힌 trace인지 보조 정보로 들어간다. |

기본 policy query는 다음과 같다.

| query name | 의미 |
| --- | --- |
| `application_error_spans` | error status로 끝난 최근 application span을 찾는다. |
| `target_agent_error_spans` | target-cluster-agent error span을 찾는다. |
| `target_agent_recent_spans` | target-cluster-agent evidence loop 주변 최근 span을 찾는다. |
| `management_gateway_spans` | agent traffic과 관련된 API Gateway span을 찾는다. |

RCA 파생 예시는 다음과 같다.

| 파생 정보 | 볼 필드 |
| --- | --- |
| dependency timeout | `traces[].rootServiceName`, `rootTraceName`, `durationMs`, raw span/status 정보 |
| management plane 문제 | `target_agent_error_spans`, `management_gateway_spans` |
| application error path | `application_error_spans.trace_count`, trace root service/operation |

## Metadata bucket

Metadata bucket은 `MetadataProvider`가 만든다.
현재 구현은 외부 배포 시스템을 직접 조회하지 않는다.
대신 target namespace의 Deployment 목록과 ReplicaSet 목록을 Kubernetes API에서 읽어
현재 workload snapshot 목록을 만든다.

`MetadataSnapshotQuery.query` 값이 `change_context`, `current_workload_snapshots`, `deployments`이면
target namespace의 모든 Deployment를 목록으로 보낸다.
`deployment/<name>`, `deployment/<namespace>/<name>`, `<namespace>/<name>`이면 특정 Deployment 1개를
`current_workload_snapshot` 단수 값으로 보낸다.

```json
{
  "change_context": {
    "current_workload_snapshots": [
      {
        "workload": {
          "kind": "Deployment",
          "namespace": "target",
          "name": "checkout-api"
        },
        "deployment_labels": {},
        "deployment_annotations": {
          "ops.service/restarted-at": "2026-07-10T11:12:13Z"
        },
        "pod_template_annotations": {
          "prometheus.io/path": "/metrics",
          "prometheus.io/scrape": "true"
        },
        "pod_template_labels": {},
        "managed_fields_managers": ["kubectl-client-side-apply"],
        "containers": [
          {
            "name": "app",
            "image": "repo/checkout:v2",
            "readiness_probe": {
              "path": "/ready",
              "port": 8080,
              "timeout_seconds": 1,
              "period_seconds": 10,
              "failure_threshold": 3
            },
            "liveness_probe": {},
            "startup_probe": {},
            "env_refs": [
              {
                "env_name": "DATABASE_URL",
                "source": "secret_key_ref",
                "secret_name": "checkout-secret",
                "key": "database-url",
                "optional": true
              }
            ],
            "env_from_refs": [
              {
                "source": "config_map_ref",
                "config_map_name": "checkout-env",
                "prefix": "APP_",
                "optional": false
              }
            ],
            "volume_mount_refs": [
              {
                "volume_name": "app-config",
                "source": "config_map",
                "config_map_name": "checkout-config",
                "items": [
                  {
                    "key": "application.yaml",
                    "path": "application.yaml"
                  }
                ],
                "mount_path": "/etc/app",
                "read_only": true
              }
            ]
          }
        ],
        "replicaset_revisions": [
          {
            "name": "checkout-api-abc123",
            "revision": "3"
          }
        ]
      }
    ]
  }
}
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `change_context` | object | 변경 맥락을 담는 묶음이다. |
| `change_context.current_workload_snapshots` | list<object> | target namespace의 Deployment별 현재 상태 요약이다. |
| `change_context.current_workload_snapshot` | object | 특정 Deployment 1개의 현재 상태 요약이다. |
| `change_context.current_workload_snapshots[].workload` | object | workload kind, namespace, name이다. 현재 kind는 `Deployment`다. |
| `change_context.current_workload_snapshots[].deployment_labels` | object | Deployment metadata labels다. |
| `change_context.current_workload_snapshots[].deployment_annotations` | object | 안전한 Deployment metadata annotations다. `last-applied-configuration`처럼 원문 manifest나 민감 key는 제외한다. |
| `change_context.current_workload_snapshots[].pod_template_annotations` | object | 안전한 Pod template metadata annotations다. allowlist에 맞는 작은 값만 남긴다. |
| `change_context.current_workload_snapshots[].pod_template_labels` | object | Pod template metadata labels다. |
| `change_context.current_workload_snapshots[].managed_fields_managers` | list<string> | Deployment managedFields의 manager 이름 목록이다. |
| `change_context.current_workload_snapshots[].containers[]` | list<object> | container name, image, readiness/liveness/startup probe 요약이다. |
| `change_context.current_workload_snapshots[].containers[].*_probe` | object | probe의 path, port, timeout_seconds, period_seconds, failure_threshold 중 존재하는 값만 담는다. |
| `change_context.current_workload_snapshots[].containers[].env_refs` | list<object> | env의 ConfigMap/Secret key reference 요약이다. 값 자체는 담지 않는다. |
| `change_context.current_workload_snapshots[].containers[].env_from_refs` | list<object> | envFrom의 ConfigMap/Secret reference 요약이다. |
| `change_context.current_workload_snapshots[].containers[].volume_mount_refs` | list<object> | container가 mount한 ConfigMap/Secret volume reference 요약이다. volume 값 자체는 담지 않는다. |
| `change_context.current_workload_snapshots[].replicaset_revisions[]` | list<object> | 이 Deployment가 소유한 ReplicaSet name과 `deployment.kubernetes.io/revision` 값이다. |

주의: `MetadataProvider.query()`의 내부 raw payload에는 `cluster_id`, `collected_at`도 있지만,
`normalize_payload()` 결과 bucket에는 `change_context`만 남긴다.
현재 provider는 안전한 Deployment/Pod template annotations만 남긴다.
`kubectl.kubernetes.io/last-applied-configuration` 같은 원문 manifest annotation과
secret/token/password/credential/private/authorization 이름이 들어간 annotation은 제외한다.
env/envFrom/volume의 ConfigMap/Secret reference는 name/key/path만 남기고 값 자체는 남기지 않는다.
raw spec과 literal env value는 남기지 않는다.

## Evidence job 집계 규칙

Provider job path에서는 provider별 결과가 따로 완료되고, Gateway가 같은 `evidence_key`의
job들을 하나로 합친 뒤 `cluster.evidence.received`를 발행한다.
초심자 관점에서는 "각 조사 담당자가 자기 보고서를 제출하면 Gateway가 한 사건 파일로 묶는다"라고
생각하면 된다. Kubernetes, metrics, logs, traces, metadata provider job이 각각 끝나고,
같은 `evidence_key`로 묶인 결과가 하나의 RCA 입력이 된다.

| 규칙 | 의미 |
| --- | --- |
| 모든 row가 terminal status여야 한다 | `completed` 또는 `failed`가 아니면 아직 window를 발행하지 않는다. |
| `failure_policy == strict`이고 failed job이 있으면 발행하지 않는다 | strict mode는 일부 provider 실패를 허용하지 않는다. |
| `allow_partial`이면 failed provider는 빈 payload로 대체될 수 있다 | `logs`는 `[]`, 나머지는 `{}`가 빈 payload다. |
| completed provider result는 payload에 merge된다 | provider result는 `{"metrics": ...}`처럼 bucket key를 포함해야 한다. |

provider job 실패의 `error` 문자열은 `evidence_jobs.error`에 저장되지만,
allow-partial로 최종 `cluster.evidence.received`가 발행될 때 body에 별도 error field로 들어가지 않는다.
RCA는 빈 bucket, missing source, 또는 Kubernetes `provider_status`를 보고 부족한 근거를 판단해야 한다.

agent collector 내부에서 provider query 중 exception이 발생하면 provider 전체가 빈 결과로 대체된다.
현재 exception detail은 payload에 넣지 않고 log/span에 남긴다.

| provider | collect exception 시 bucket 모양 |
| --- | --- |
| `kubernetes` | `{"cluster": {"cluster_id": ...}, "workloads": [], "pods": [], "events": [], "nodes": [], "services": [], "endpoints": [], "provider_status": {}}` |
| `metrics` | `{"source": "prometheus", "results": {}}` |
| `logs` | `[]` |
| `traces` | `{"source": "tempo", "results": {}}` |
| `metadata` | `{"change_context": {"current_workload_snapshots": []}}` |

## RCA에서 바로 쓸 수 있는 값과 파생해야 하는 값

Provider가 이미 보내는 값은 다음과 같다.

| 정보 | 이미 있는 필드 |
| --- | --- |
| cluster 식별 | `cluster_id`, `kubernetes.cluster.cluster_id` |
| 수집 namespace | `kubernetes.cluster.namespace`, `provider_status.*.namespace` |
| 수집 시각/window | `window_start`, `kubernetes.cluster.collected_at` |
| Pod 상태 | `kubernetes.pods[]` |
| container 상태 | `kubernetes.pods[].containers[]` |
| Kubernetes warning/reason/message | `kubernetes.events[]` |
| node 상태와 capacity | `kubernetes.nodes[]` |
| workload replica 상태 | `kubernetes.workloads[]` |
| Service/endpoint 연결 | `kubernetes.services[]`, `kubernetes.endpoints[]` |
| metric sample/range | `metrics.results.*.samples`, `metrics.results.*.series` |
| log line | `logs[].streams[].values[].line` |
| trace search 결과 | `traces.results.*.traces` |
| 현재 workload snapshot 목록 | `metadata.change_context.current_workload_snapshots[]` |
| 현재 image/probe/config/secret refs/labels/annotations/manager/revision 요약 | `metadata.change_context.current_workload_snapshots[].containers[]`, `deployment_labels`, `deployment_annotations`, `pod_template_labels`, `pod_template_annotations`, `managed_fields_managers`, `replicaset_revisions` |

RCA가 판단하려면 다음 값은 파생해야 한다.

| 파생 값 | 파생에 쓸 필드 |
| --- | --- |
| `symptom` | `pods[].waiting_reasons`, `pods[].terminated_reasons`, `pods[].phase`, `events[].reason/message`, `workloads[].conditions` |
| `affected_resource` | `pods[].owner_kind/name`, `pods[].workload_key`, `events[].involved_kind/name`, `workloads[].kind/name` |
| `severity` | `restart_total`, `events[].type/count`, `workloads[].unavailable_replicas`, node pressure, metric threshold, `logs[].line_count`, `trace_count` |
| `root_cause_candidate` | symptom plus Kubernetes reason/message plus metrics/logs/traces evidence |
| `confidence` | 현재 RCA 코드는 후보가 요구한 evidence source 중 실제 존재하는 source 비율로 계산한다. 값 내부의 강도까지는 아직 점수화하지 않는다. |
| `safe_pr_possible` | provider evidence 직접 필드가 아니다. selected root cause가 recovery rule에서 `route == draft_pr` 후보를 만들 때 가능하다. |

### 현재 RCA 파이프라인과 provider payload 사이의 갭

현재 `IncidentDetector`는 `kubernetes.resource`, `kubernetes.symptom`,
`kubernetes.severity`, `kubernetes.first_seen_at`을 읽는다.
그러나 real Kubernetes provider는 이 필드를 직접 만들지 않는다.

| RCA가 기대하는 값 | 현재 real provider 상태 | 영향 |
| --- | --- | --- |
| `kubernetes.resource.kind/name/namespace` | 없음 | normalizer가 없으면 incident resource가 `Unknown/unknown`이 된다. |
| `kubernetes.symptom` | 없음 | normalizer가 없으면 symptom이 `unknown`이 되어 cause rule 매칭이 실패한다. |
| `kubernetes.severity` | 없음 | 기본값 `medium`으로 떨어진다. |
| `kubernetes.first_seen_at` | 없음 | incident first_seen_at이 null이 된다. |

따라서 provider evidence만 보고 RCA를 하려면, `evidence-worker` 또는 `incident-worker`
앞단에 다음 파생 필드를 만드는 정규화 단계가 필요하다.

| 파생 필드 | 추천 source |
| --- | --- |
| `resource` | `events[].involved_*`, `pods[].owner_*`, `workloads[]` 우선순위로 선택 |
| `symptom` | `pods[].waiting_reasons`, `pods[].terminated_reasons`, `events[].reason/message`, `workloads[].conditions` |
| `severity` | Warning event 반복 수, unavailable replica, restart_total, node pressure, error log count |
| `first_seen_at` | `events[].first_timestamp`, `pods[].start_time`, earliest log timestamp |

### `metadata` evidence source 상태

RCA cause rules의 여러 candidate는 `metadata` source를 expected evidence로 요구한다.
예를 들어 image rollout, config/env error, scheduling taint mismatch, manifest validation 같은 후보는
최근 배포 변경, git SHA, manifest diff, image digest, Secret/ConfigMap 참조 같은 metadata가 필요하다.

현재 provider job path에는 `metadata` bucket이 있고 기본 policy에도 `metadata.change_context` query가 있다.
`ClusterEvidenceReceivedBody.metadata`는 `Evidence.metadata`로 복사된다.

RCA evidence bundle builder가 어떤 metadata 위치를 evidence item으로 바꾸는지는
RCA/evidence-worker 쪽 담당 영역이다. 이 문서는 provider가 보내는 bucket 구조만 기록한다.

| 필요한 metadata | 현재 provider로 가능한지 | 보강 방향 |
| --- | --- | --- |
| target namespace Deployment별 현재 image/probe/config refs/secret refs/labels/annotations/manager/ReplicaSet revision | 가능 | `change_context.current_workload_snapshots[]`를 쓴다. Secret 값은 제외하고 reference만 남긴다. annotations는 안전한 key만 남긴다. |
| 특정 Deployment 1개 snapshot | 가능 | `deployment/<name>` 또는 `deployment/<namespace>/<name>` query를 쓴다. |
| recent git commit / deploy revision | 없음 | GitOps event, manifest render, SCM metadata 연결 |
| rollback 가능 여부 / risk_level | 없음 | 배포 이력, policy, GitOps/CI/CD 상태 연결 |
| previous/current image digest | 일부만 가능 | `containers[].image`는 현재 image tag만 제공한다. digest, rollout history, previous image가 필요하다. |
| Deployment/Pod template annotations | 일부 가능 | `ops.service/*`, `prometheus.io/*`, `deployment.kubernetes.io/*`, `kubectl.kubernetes.io/*` 중 안전한 key만 남긴다. |
| ConfigMap/Secret key reference | 일부 가능 | env/envFrom/volume reference name/key/path를 제공한다. Secret/ConfigMap 객체 metadata는 아직 조회하지 않는다. |
| resource requests/limits | 불충분 | Pod spec containers.resources summary 추가 |
| imagePullSecrets | 불충분 | Pod spec imagePullSecrets summary 추가 |
| NetworkPolicy/Ingress/PVC | 없음 | Kubernetes provider 조회 resource 확장 |

### 현재 Kubernetes summary에 없는 값

Kubernetes provider는 raw object를 그대로 넘기지 않고 summary만 보낸다.
다음 값은 RCA에는 유용하지만 현재 summary에 없다.

| 없는 값 | 왜 필요한가 |
| --- | --- |
| Pod spec `containers[].resources.requests/limits` | scheduling failure, OOM, resource pressure confidence를 높인다. |
| Pod spec `env`, `envFrom`, `volumes`, `volumeMounts` | config/env/secret missing 후보를 확인한다. |
| Pod spec `imagePullSecrets`, serviceAccount | private registry/auth 문제를 확인한다. |
| container `lastState` | 이전 종료 이유가 현재 state에 없을 때 OOMKilled, Error를 확인한다. |
| Deployment template image/env/resources | rollout과 현재 Pod spec의 관계를 확인한다. |
| ReplicaSet revision annotation | 특정 rollout revision에서만 문제가 났는지 확인한다. |
| Endpoint readiness conditions | endpoint 개수만으로 ready endpoint 여부를 확정하기 어렵다. |
| Ingress, NetworkPolicy, PVC, ConfigMap, Secret summary | network, storage, config/security 계열 RCA에 필요하다. |
| Kubernetes raw object | summary 밖 필드를 임시로 확인하기 어렵다. |

## 자주 헷갈리는 필드

| 헷갈리는 표현 | 정확한 의미 |
| --- | --- |
| `cluster` | cluster metadata object다. cluster 갯수가 아니다. |
| `pods` | Pod summary object의 list다. Pod 갯수는 `len(pods)` 또는 `provider_status.*.counts.pods`다. |
| `events` | Event summary object의 list다. Event 갯수는 `len(events)` 또는 `provider_status.*.counts.events`다. |
| `logs` | query별 Loki result list다. 로그 라인은 `logs[].streams[].values[]` 안에 있다. |
| `traces` | Tempo result bucket object다. trace 갯수는 `traces.results.*.trace_count`다. |
| `metrics.results` | query name을 key로 하는 object다. metric 값은 `samples[].value` 또는 `series[].values[].value`에 있다. |
| `raw` | provider API response 원본이다. 정규화 필드 밖의 값을 확인할 때만 사용한다. |
| `provider_status.*.counts` | Kubernetes provider가 정규화한 목록들의 길이다. cluster 전체 리소스 총량을 보장하는 inventory가 아니다. |

## 구현 위치

| 내용 | 파일 |
| --- | --- |
| RCA input event body | `src/domains/rca/events.py` |
| HTTP direct evidence request DTO | `src/packages/contracts/gateway/requests.py` |
| evidence job aggregate | `src/domains/target/evidence_jobs.py` |
| default provider query policy | `src/domains/target/evidence_policy.py` |
| provider registry | `src/services/target/cluster-agent/telemetry_registry.py` |
| evidence collector | `src/services/target/cluster-agent/evidence/collector.py` |
| Kubernetes provider normalize | `src/services/target/cluster-agent/providers/kubernetes_providers.py` |
| Prometheus provider normalize | `src/services/target/cluster-agent/providers/prometheus_providers.py` |
| Loki provider normalize | `src/services/target/cluster-agent/providers/loki_providers.py` |
| Tempo provider normalize | `src/services/target/cluster-agent/providers/tempo_providers.py` |
| incident detector | `src/services/ai/agent/pipeline/incident.py` |
| evidence bundle builder | `src/services/ai/agent/pipeline/evidence_bundle.py` |
| cause evaluation/confidence | `src/services/ai/agent/causes/engine.py` |
| recovery and Safe PR route | `src/services/ai/agent/recovery/builtin.py`, `src/services/ai/agent/recovery/dispatch.py` |
