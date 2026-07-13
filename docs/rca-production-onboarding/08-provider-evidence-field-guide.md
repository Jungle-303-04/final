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

## RCA Evidence Provider Schema v1

이 문서의 기준 스키마는 v1로 확정한다.
provider raw payload는 source별 bucket으로 들어오고, RCA 내부 근거 묶음에서는
아래 `source:name` EvidenceItem key로 승격된다.

| provider bucket | RCA EvidenceItem key | v1 상태 | 비고 |
| --- | --- | --- | --- |
| `kubernetes` | `kubernetes:cluster_resource_state` | 확정 | Pod, Event, Node, Workload, Service, EndpointSlice 상태 요약이다. |
| `metrics` | `metrics:telemetry_metrics` | 확정 | Prometheus query 결과와 query별 analysis 요약이다. |
| `logs` | `logs:related_logs` | 확정 | incident namespace/resource와 관련 있는 Loki log stream 요약이다. |
| `traces` | `traces:related_traces` | 확정 | Tempo query 결과다. `trace_count=0`이어도 payload와 item은 정상일 수 있다. |
| `metadata` | `metadata:current_workload_snapshots` | 확정 | `current_workload_snapshots` 배열에 object가 있을 때만 생성된다. 빈 배열은 정상 가능하며 item은 만들지 않는다. |

rule catalog의 `expected_evidence`는 v1부터 source 단위와 `source:name` 단위를 모두 사용할 수 있다.
예를 들어 `kubernetes`는 Kubernetes evidence source가 있기만 하면 충족되고,
`kubernetes:cluster_resource_state`는 해당 이름의 EvidenceItem이 있을 때 충족된다.
새 rule은 가능하면 `source:name`을 써서 어떤 근거 묶음이 필요한지 구체적으로 남긴다.

### Rule catalog 자료를 v1 key로 옮기는 기준

rule 후보 정리표에서 쓰는 `events`, `services`, `endpoints`, `workloads` 같은 표현은
현재 RCA EvidenceItem key와 1:1로 분리되어 있지 않다.
이 값들은 Kubernetes provider payload의 하위 목록이며, RCA 내부에서는
`kubernetes:cluster_resource_state` item의 `value` 안에 함께 들어간다.

| rule 자료 표현 | v1 `expected_evidence` key | 비고 |
| --- | --- | --- |
| `kubernetes` | `kubernetes:cluster_resource_state` | Kubernetes 상태/이벤트/리소스 목록 전체를 포함한다. |
| `events` | `kubernetes:cluster_resource_state` | `value.events[]`에서 Event reason/message를 본다. |
| `services` | `kubernetes:cluster_resource_state` 또는 `metadata:service_selector_matches` | Service 원본 상태는 Kubernetes item, selector 비교 요약은 metadata item이다. |
| `endpoints` | `kubernetes:cluster_resource_state` 또는 `metadata:endpoint_slice_ready_endpoints` | EndpointSlice 원본 상태는 Kubernetes item, ready endpoint 요약은 metadata item이다. |
| `workloads` | `kubernetes:cluster_resource_state` 또는 `metadata:current_workload_snapshots` | Deployment/ReplicaSet 상태는 Kubernetes item, 상세 spec/status snapshot은 metadata item이다. |
| `metrics` | `metrics:telemetry_metrics` | Prometheus query 결과와 analysis를 본다. |
| `logs` | `logs:related_logs` | Loki log stream과 대표 log line을 본다. |
| `traces` | `traces:related_traces` | Tempo trace query 결과를 본다. `trace_count=0`은 정상 가능하다. |
| `metadata/change` | 상황별 metadata key | 현재 상태는 `metadata:current_workload_snapshots`, 단건 상세는 `metadata:current_workload_snapshot`, selector/endpoint 요약은 각각 별도 metadata item을 쓴다. 실제 Git/GitOps 변경 이력은 아직 항상 들어오는 근거가 아니므로 필수 expected evidence로 둘 때 주의한다. |
| `provider_status` | 아직 별도 RCA EvidenceItem key 없음 | 수집 품질 판단용이다. rule root cause 근거로 쓰려면 별도 item 또는 signal 보강이 필요하다. |
| `window_start` | 아직 별도 RCA EvidenceItem key 없음 | evidence window 메타데이터다. stale evidence 판단 rule에는 추가 모델링이 필요하다. |

중요한 기준은 다음과 같다.

- `cluster`, `pods`, `events` 같은 필드 이름 자체가 갯수를 의미하지 않는다.
- `cluster`는 객체이고, `pods`, `events`, `nodes` 등은 목록이다.
- 갯수는 대부분 `len(...)`으로 계산하거나, Kubernetes bucket의
  `provider_status.<query_name>.counts`에서 확인한다.
- `correlation_id`는 evidence body 필드가 아니라 event envelope metadata다.
- `symptom`, `resource`, `severity`는 현재 real provider가 직접 넣는 필드가 아니다.
  RCA가 쓰려면 `pods`, `events`, `workloads`, `metrics`, `logs`, `traces`를 보고
  별도 정규화 단계에서 파생해야 한다.
- provider bucket은 전체 API response raw를 기본으로 보존하지 않는다.
  Kubernetes와 metadata는 선택한 summary 필드만 남기고, metrics/logs/traces도 samples, redacted log stream,
  trace list처럼 provider가 정규화한 필드만 남긴다.
- `metadata` bucket은 현재 Kubernetes 상태를 `change_context.current_workload_snapshots` 같은
  하위 필드에 담을 수 있다. 배열이 비어 있으면 metadata source는 도착했지만 RCA 근거 item은 없다.

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
| `raw` | provider API 응답 원본을 뜻한다. 현재 evidence bucket에는 전체 raw payload를 기본으로 싣지 않는다. | 필요 시 별도 debug 자료 |

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
| `metadata` | object | `MetadataProvider`가 만든 변경 맥락 bucket이다. 전체 조회 시 `change_context.current_workload_snapshots`, 단건 조회 시 `change_context.current_workload_snapshot`을 담고, Service selector/EndpointSlice/ResourceQuota 요약도 `change_context`에 함께 담는다. |

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
| `query` | 실제 query 문자열이다. Prometheus는 PromQL, Loki는 LogQL, Tempo는 TraceQL/search query, Kubernetes는 namespace 문자열로 사용한다. Metadata는 `change_context`이면 target namespace 전체 Deployment 목록, `<namespace>`이면 해당 namespace 전체 Deployment 목록, `deployment/<name>` 또는 `deployment/<namespace>/<name>`이면 특정 Deployment 1개를 조회한다. |
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

실제 evidence window raw API에서는 다음 wrapper 안에 들어온다.

```json
{
  "evidence_key": "default:cluster-1:cluster-snapshot:2026-07-11T07:25:00+00:00",
  "workspace_id": "default",
  "cluster_id": "cluster-1",
  "source": "kubernetes",
  "payload": {
    "kubernetes": {}
  }
}
```

RCA 내부에서는 이 raw bucket 전체를 그대로 rule에 넘기지 않고, incident와 관련 있는 부분을 골라
`EvidenceItem` 하나로 승격한다.

| raw 위치 | RCA EvidenceItem | 왜 이렇게 바꾸는가 |
| --- | --- | --- |
| `payload.kubernetes` | `source="kubernetes"`, `name="cluster_resource_state"` | rule catalog가 `kubernetes:cluster_resource_state`를 기대 근거로 요구할 수 있게 한다. |

즉 source/name key로 쓰면 `kubernetes:cluster_resource_state`다.
이 item의 `value`에는 incident resource와 관련된 `pods`, `events`, `nodes`, `workloads`,
`services`, `endpoints`만 compact되어 들어간다. 원본 전체는 evidence window raw API와 DB payload에 남고,
RCA worker 사이 이벤트에는 판단에 필요한 요약만 흐른다.

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
  "provider_status": {},
  "collection_limits": {}
}
```

`collection_limits`는 항상 있는 필드가 아니다. provider가 전송 크기 제한 때문에 일부 목록을 잘랐을 때만
붙는다. 없으면 이 응답에서는 잘림 여부를 따로 보고하지 않은 것이다.

2026-07-11 실제 응답에서는 다음처럼 들어왔다.

| 항목 | 실제 개수 |
| --- | --- |
| `pods` | 20 |
| `events` | 9 |
| `nodes` | 2 |
| `workloads` | 21 |
| `services` | 14 |
| `endpoints` | 16 |

`provider_status`는 namespace별 query 결과를 나눠서 보여준다. 같은 raw 응답에는
`target_namespace_snapshot`, `sandbox_namespace_snapshot` 두 query가 있었고,
각 query의 `counts` 안에는 `pod_metrics`, `node_metrics`도 같이 들어왔다.

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
| `collection_limits` | object | 큰 목록이 전송 크기 보호를 위해 잘렸을 때만 있는 제한 요약이다. |

주의할 점은 `payload.kubernetes` 안에 `symptom` 문자열이 항상 들어오는 구조가 아니라는 점이다.
현재 raw 응답처럼 `symptom`이 없어도 정상이다. RCA는 `waiting_reasons`, `terminated_reasons`,
`events[].reason/message`, `workloads[].conditions`, `endpoints[].endpoint_count` 같은 상태 필드를 보고
코드 규칙으로 symptom을 파생한다. 여기서 말하는 파생은 AI 추론이 아니라 문자열/상태값 기반 분류다.

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
| `container_id` | string 또는 null | Kubernetes `containerID` 값이다. container runtime이 붙인 실행 container 식별자다. |
| `image` | string 또는 null | container image name/tag/digest다. image rollout 문제 판단의 기본 재료다. |
| `image_id` | string 또는 null | Kubernetes `imageID` 값이다. 현재 실행 중인 image digest 확인에 쓴다. |
| `ready` | boolean 또는 null | container ready 여부다. |
| `restart_count` | number | Kubernetes `restartCount` 값이다. |
| `state` | string 또는 null | 현재 state 이름이다. provider는 `state` object의 첫 key를 사용한다. 예: `running`, `waiting`, `terminated`. |
| `state_reason` | string 또는 null | 현재 state payload의 reason이다. 예: `CrashLoopBackOff`, `ErrImagePull`, `OOMKilled`. |
| `state_message` | string 또는 null | 현재 state payload의 message다. |
| `exit_code` | number 또는 null | terminated state일 때 exit code다. |
| `started_at` | string 또는 null | state payload의 startedAt이다. |
| `finished_at` | string 또는 null | terminated state의 finishedAt이다. |
| `last_state` | string 또는 null | Kubernetes `lastState` object의 첫 key다. 예: `terminated`. |
| `last_state_reason` | string 또는 null | 직전 state payload의 reason이다. 예: `OOMKilled`, `Error`. |
| `last_state_message` | string 또는 null | 직전 state payload의 message다. |
| `last_exit_code` | number 또는 null | 직전 terminated state의 exit code다. |
| `last_started_at` | string 또는 null | 직전 state payload의 startedAt이다. |
| `last_finished_at` | string 또는 null | 직전 terminated state의 finishedAt이다. |

주의: 현재 provider는 `lastState` 원본 전체가 아니라 RCA 판단에 필요한 작은 필드만 정규화한다.
OOMKilled 같은 과거 종료 이유가 현재 `state`에 없어도 `last_state_reason`, `last_exit_code`,
`last_state_message`, `last_started_at`, `last_finished_at`을 함께 볼 수 있다.

### `kubernetes.events[]`

각 항목은 Kubernetes Event 하나의 요약이다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `uid` | string 또는 null | Event UID다. |
| `namespace` | string 또는 null | Event namespace다. |
| `type` | string 또는 null | Event type이다. 예: `Warning`, `Normal`. |
| `reason` | string 또는 null | Event reason이다. 예: `BackOff`, `FailedScheduling`, `Unhealthy`, `FailedMount`. |
| `message` | string 또는 null | Event message다. root cause 후보를 찾는 핵심 텍스트다. |
| `reason_summary` | object | Event reason/message에서 만든 작은 RCA 힌트다. 원본 message를 대체하지 않고 `category`, `signal`, `symptom`, `scheduling_causes`를 보조로 제공한다. 알 수 없는 reason이면 생략될 수 있다. |
| `reason_summary.category` | string | Event 종류를 크게 묶은 값이다. 예: `scheduling`, `probe`, `container_restart`, `image_pull`, `config_or_volume_mount`, `backoff`, `oom_killed`. |
| `reason_summary.signal` | string | RCA가 바로 볼 수 있는 신호 이름이다. 예: `FailedScheduling`, `CrashLoopBackOff`, `ImagePullBackOff`, `ErrImagePull`, `ReadinessProbeFailed`, `FailedMount`, `OOMKilled`. |
| `reason_summary.symptom` | string | 추정 symptom 힌트다. 예: `FailedScheduling`, `CrashLoopBackOff`, `ImagePullBackOff`, `ProbeFailure`, `FailedMount`. |
| `reason_summary.scheduling_causes` | list<string> | `FailedScheduling` message에서 뽑은 작은 원인 label 목록이다. 예: `insufficient_cpu`, `insufficient_memory`, `node_selector_mismatch`, `taint_toleration_mismatch`, `pod_count_limit`, `volume_node_affinity_conflict`. |
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
| `cpu_mcores` | number 또는 null | node CPU 사용량을 millicore 단위로 정규화한 값이다. |
| `mem_mib` | number 또는 null | node memory 사용량을 MiB 단위로 정규화한 값이다. |
| `cpu_ratio` | number 또는 null | allocatable 대비 CPU 사용 비율이다. |
| `mem_ratio` | number 또는 null | allocatable 대비 memory 사용 비율이다. |

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
| `load_balancer` | object 또는 null | LoadBalancer ingress/status 요약이다. 없을 수 있다. |
| `external_hosts` | list<string> | 외부 접근 가능한 host/ip 후보 목록이다. 없으면 빈 목록일 수 있다. |
| `external_url` | string 또는 null | provider가 추정한 외부 접근 URL이다. 없을 수 있다. |

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
| `<query_name>.counts.pod_metrics` | number | pod resource metric이 붙은 항목 수다. |
| `<query_name>.counts.node_metrics` | number | node resource metric이 붙은 항목 수다. |

다른 provider bucket에는 현재 이 형태의 `provider_status`가 없다.
Prometheus, Loki, Tempo의 실패 처리는 `Evidence job 집계 규칙`에서 따로 설명한다.

여러 Kubernetes query를 실행하면 snapshot 목록은 merge된다.
`pods`, `events`, `nodes`, `workloads`, `services`, `endpoints`는 query별 결과가 append되고,
`provider_status`는 query name별로 추가된다. 따라서 중복 namespace query를 넣으면
목록에 같은 리소스가 중복될 수 있다.

Kubernetes bucket은 `EvidenceJobResultRequest`의 1MiB 전송 제한을 넘길 위험을 줄이기 위해
큰 list를 전송 직전에 제한한다. `pods`, `events`, `nodes`, `workloads`,
`services`, `endpoints`가 잘리면 `kubernetes.collection_limits`에 원래 개수와
최종 반환 개수를 남긴다. `provider_status.*.counts`는 normalize 단계에서 본 개수이고,
실제 payload에 들어간 개수는 `len(...)` 또는 `collection_limits`로 확인한다.
namespace가 있는 list는 한 namespace가 다른 namespace를 전부 가리지 않도록
namespace별 round-robin sampling을 쓴다.
개수 제한 뒤에도 JSON byte 크기가 크면 JSON byte 크기가 가장 큰 list부터 추가로 줄인다.
단일 항목이 너무 크면 해당 list는 0개까지 줄어들 수 있다.

## Metrics bucket

Metrics bucket은 Prometheus provider가 만든다.
초심자 관점에서는 "숫자로 된 관측값"이다.
Kubernetes bucket이 리소스 상태를 보여준다면, metrics bucket은 CPU, memory, filesystem,
replica 수, scrape 성공 여부처럼 시간에 따라 변하는 숫자를 보여준다.

실제 evidence window raw API에서는 다음 wrapper 안에 들어온다.

```json
{
  "evidence_key": "default:cluster-1:cluster-snapshot:2026-07-11T07:25:00+00:00",
  "workspace_id": "default",
  "cluster_id": "cluster-1",
  "source": "metrics",
  "payload": {
    "metrics": {}
  }
}
```

RCA 내부에서는 metrics bucket이 다음 EvidenceItem으로 승격된다.

| raw 위치 | RCA EvidenceItem | 왜 이렇게 바꾸는가 |
| --- | --- | --- |
| `payload.metrics` | `source="metrics"`, `name="telemetry_metrics"` | rule catalog가 `metrics:telemetry_metrics`를 기대 근거로 요구할 수 있게 한다. |

즉 source/name key로 쓰면 `metrics:telemetry_metrics`다.
이 item의 `value`에는 `source`, `results`와 query별 `analysis`가 들어간다.
raw 응답 전체는 evidence window payload에 남고, RCA worker 사이 이벤트에는 query 결과를 compact한 형태가 흐른다.

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

2026-07-11 실제 응답에서는 다음 9개 query가 들어왔다.

| query name | mode/type | 실제 개수 | 이 값으로 보는 것 |
| --- | --- | --- | --- |
| `target_pod_info` | `instant` / `vector` | samples 16 | target namespace Pod 목록과 node, owner, image 관련 label 연결 |
| `scrape_targets_up` | `instant` / `vector` | samples 17 | Prometheus scrape target이 살아 있는지 |
| `node_cpu_usage_ratio` | `instant` / `vector` | samples 2 | node CPU 사용률 |
| `node_memory_usage_ratio` | `instant` / `vector` | samples 2 | node memory 사용률 |
| `target_deployment_replicas` | `instant` / `vector` | samples 5 | target namespace Deployment replica 수 |
| `node_collector_scrape_error` | `instant` / `vector` | samples 2 | optional node collector 수집 에러 여부 |
| `node_filesystem_usage_ratio` | `instant` / `vector` | samples 0 | node filesystem 사용률. 이번 응답에는 sample 없음 |
| `node_collector_node_pod_count` | `range` / `matrix` | series 0, points 0 | node별 pod 수 추세. 이번 응답에는 point 없음 |
| `node_collector_node_not_ready_pod_count` | `range` / `matrix` | series 0, points 0 | node별 Not Ready pod 수 추세. 이번 응답에는 point 없음 |

sample이나 series가 0개여도 query 결과 object 자체는 남는다.
이 경우 "문제가 없다"가 아니라 "해당 query에서 반환된 metric point가 없다"로 읽어야 한다.
판단은 `analysis.sample_count`, `analysis.series_count`, `analysis.point_count`,
그리고 `collection_limits` 유무를 같이 보고 한다.

### `metrics.results.<metric_name>`

공통 필드다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `query` | string | 실행한 PromQL이다. |
| `query_mode` | string | `instant` 또는 `range`다. |
| `result_type` | string 또는 null | Prometheus `data.resultType`이다. 예: `vector`, `matrix`, `scalar`, `string`. |
| `analysis` | object | provider가 sample/series 숫자만 보고 만든 RCA용 해석 요약이다. |
| `collection_limits` | object | 큰 Prometheus 결과가 전송 크기 보호를 위해 잘렸을 때만 있는 제한 요약이다. |

현재 Prometheus provider는 전체 API response raw field를 담지 않는다.
RCA는 `result_type`, `samples`, `series`, `result` 중 provider가 정규화한 필드를 읽는다.
high cardinality metric처럼 결과가 큰 경우에는 `samples`, `series`, `series[].values`,
또는 `result`가 제한될 수 있다. 잘리면 같은 query result object 안의
`collection_limits.lists.<field>.original_count/returned_count`로 전체 개수와 최종 반환 개수를
확인한다. `analysis`는 제한 전 normalized payload를 기준으로 계산되므로
`sample_count`, `series_count`, `point_count`, `threshold` 판단은 샘플 제한 때문에 줄어들지 않는다.
개수 제한 뒤에도 JSON byte 크기가 크면 JSON byte 크기가 가장 큰 list부터 추가로 줄인다.
단일 항목이 너무 크면 해당 list는 0개까지 줄어들 수 있다. matrix의 `series.values`
제한 정보는 최종 `series` 목록이 정해진 뒤 다시 계산하므로, `returned_count`는
payload에 실제 남은 point 수와 맞는다.

Instant vector 결과일 때 추가 필드다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `samples` | list<object> | 시점별 vector sample 목록이다. |
| `samples[].metric` | object | Prometheus label set이다. 예: `pod`, `namespace`, `node`, `instance`. |
| `samples[].timestamp` | number 또는 null | Prometheus sample timestamp다. |
| `samples[].value` | number 또는 null | sample value를 float으로 바꾼 값이다. |

이번 실제 응답에서 자주 보이는 label은 다음과 같다.

| label | 의미 |
| --- | --- |
| `namespace` | metric이 속한 Kubernetes namespace다. |
| `pod` | Pod 단위 metric일 때 Pod 이름이다. |
| `node` | Pod가 올라간 node 또는 node metric 대상이다. |
| `instance` | Prometheus scrape target instance다. 보통 `host:port` 형태다. |
| `job` | Prometheus scrape job 이름이다. |
| `service` | scrape된 Kubernetes Service 이름이다. |
| `uid` | kube-state-metrics Pod UID다. Pod metric과 Kubernetes pod snapshot을 연결할 수 있다. |
| `created_by_kind` | Pod owner kind다. 예: `ReplicaSet`, `DaemonSet`, `StatefulSet`. |
| `created_by_name` | Pod owner name이다. workload 연결에 쓴다. |
| `deployment` | Deployment replica metric에서 Deployment 이름이다. |

Range matrix 결과일 때 추가 필드다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `range_seconds` | number | query range window 초 단위다. |
| `step_seconds` | number 또는 null | query step 초 단위다. 없으면 provider가 range 기준으로 계산한다. |
| `series` | list<object> | time series 목록이다. |
| `series[].metric` | object | Prometheus label set이다. |
| `series[].values` | list<object> | timestamp/value point 목록이다. |
| `series[].value_count` | number | `series[].values`가 잘렸을 때 제한 전 point 개수다. |
| `series[].values_truncated` | boolean | `series[].values`가 잘렸으면 true다. |
| `series[].values[].timestamp` | number 또는 null | point timestamp다. |
| `series[].values[].value` | number 또는 null | point value를 float으로 바꾼 값이다. |
| `point_count` | number | 모든 series의 point 개수 합계다. |

Vector/matrix가 아닌 결과일 때 추가 필드다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `result` | any | Prometheus `data.result` 원본이다. |

### `metrics.results.<metric_name>.analysis`

`analysis`는 provider가 이미 받은 숫자만 보고 만든 보조 해석이다.
새 Kubernetes API나 외부 baseline을 조회하지 않는다.
따라서 데이터 전송 계약은 기존 `metrics.results.<metric_name>` object에 필드를 추가하는 방식으로만 넓어진다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `metric_kind` | string | query name과 PromQL에서 추정한 metric 종류다. 예: `memory_usage_ratio`, `cpu_usage_ratio`, `cpu_throttling`, `scrape_health`, `pod_not_ready_count`, `restart_count_or_rate`. |
| `unit` | string | 값 단위의 보수적 추정이다. 예: `ratio`, `count`, `boolean_0_or_1`, `count_or_ratio`, `count_or_rate`, `rate_or_cores`, `bytes_or_unknown`, `unknown`. |
| `sample_count` | number | instant vector일 때 sample 개수다. |
| `series_count` | number | range matrix일 때 series 개수다. |
| `point_count` | number | range matrix일 때 point 개수다. |
| `value_summary` | object | 숫자 point가 있을 때 `count`, `min`, `max`, `avg`, `latest`, `latest_timestamp`를 담는 요약이다. |
| `threshold` | object | known metric이고 숫자 point가 있을 때 provider가 적용한 보수적 threshold 판단이다. |
| `signals` | list<string> | threshold를 넘었거나 range 안에서 증가했을 때 붙는 작은 RCA signal label 목록이다. |
| `baseline_comparison` | object | range query에서 비교 가능한 series가 있을 때 같은 window의 첫 point와 마지막 point를 비교한 요약이다. |

Threshold 기준:

| metric 종류 | 기준 |
| --- | --- |
| ratio 계열 | `0.8` 이상 warning, `0.9` 이상 critical |
| `scrape_health` | `up < 1`이면 critical |
| restart/not ready/scrape error/throttling 계열 | `0`보다 크면 warning |

`baseline_comparison`은 외부 baseline이 아니다.
같은 query window의 첫 point를 기준으로 `increased_series_count`, `decreased_series_count`,
`flat_series_count`, `max_delta`, `max_percent_change`를 계산한다.
배포 전후 비교나 장기 baseline 비교는 Management Server 또는 RCA worker가 별도 기준 데이터를 줄 때만 가능하다.
`threshold`와 `baseline_comparison`은 조건이 맞지 않으면 생략될 수 있다.

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

이번 실제 응답의 `analysis` 기준으로는 `node_collector_scrape_error`에
`signals: ["collector_scrape_error"]`와 warning threshold 초과가 있었다.
이건 애플리케이션 장애 원인 자체라기보다, node collector 관측값을 완전히 신뢰해도 되는지 확인하는
보조 신호로 먼저 읽는다.

RCA 파생 예시는 다음과 같다.

| 파생 정보 | 볼 필드 |
| --- | --- |
| resource pressure | `node_cpu_usage_ratio`, `node_memory_usage_ratio`, `node_filesystem_usage_ratio` |
| restart 증가 추세 | 별도 restart range query의 `series[].values` |
| Deployment replica 이상 | `target_deployment_replicas.samples`, Kubernetes `workloads` |
| 관측성 자체 문제 | `scrape_targets_up.samples`, `node_collector_scrape_error.samples` |
| threshold 초과 여부 | `metrics.results.<metric_name>.analysis.threshold` |
| window 안 증가 여부 | `metrics.results.<metric_name>.analysis.baseline_comparison` |

## Logs bucket

Logs bucket은 Loki provider가 만든다.
주의할 점은 `logs`가 로그 라인 목록이 아니라 query별 결과 목록이라는 점이다.
실제 로그 라인은 `logs[].streams[].values[]` 안에 있다.
초심자 관점에서는 "애플리케이션이나 agent가 직접 남긴 문장 증거"다.
Kubernetes Event가 "컨테이너가 재시작된다"고 말해준다면, log line은 "왜 프로세스가 죽었는지"를
더 구체적으로 보여줄 수 있다.
다만 `logs[].streams[].values[].line`은 Loki 원문 그대로가 아니라 provider가 민감정보를 마스킹하고 최대 4096자로 제한한 문장이다.
원문을 더 넓게 노출하지 않기 위해, RCA가 바로 쓰기 쉬운 pattern count, severity count, trace id 목록을 함께 보낸다.

실제 evidence window raw API에서는 다음 wrapper 안에 들어온다.

```json
{
  "evidence_key": "default:cluster-1:cluster-snapshot:2026-07-11T07:25:00+00:00",
  "workspace_id": "default",
  "cluster_id": "cluster-1",
  "source": "logs",
  "payload": {
    "logs": []
  }
}
```

RCA 내부에서는 logs bucket이 다음 EvidenceItem으로 승격된다.

| raw 위치 | RCA EvidenceItem | 왜 이렇게 바꾸는가 |
| --- | --- | --- |
| `payload.logs` | `source="logs"`, `name="related_logs"` | rule catalog가 `logs:related_logs`를 기대 근거로 요구할 수 있게 한다. |

`logs:related_logs`는 RCA EvidenceBundle에서 다시 scope를 맞춘다. bundle은 incident namespace와
맞는 stream만 남기고, RCA test run에서는 현재 test Pod 이름까지 맞는 stream만 남긴다.
`matched_entries`도 같은 기준으로 함께 필터링하고, `pattern_counts`, `severity_counts`, `trace_ids`는
선택된 stream summary를 기준으로 다시 합산한다. provider result에는 query 전체 matched entry와 count가
들어갈 수 있지만, RCA bundle에는 선택된 namespace/Pod의 로그 요약만 남겨야 한다. 그래야 이전 RCA test
Pod나 다른 Pod의 로그 요약이 현재 run의 원인으로 섞이지 않는다.

즉 source/name key로 쓰면 `logs:related_logs`다.
다만 raw `payload.logs` 전체가 무조건 근거로 쓰이는 것은 아니다.
RCA는 incident namespace와 관련된 stream을 먼저 고르고, RCA test run이면 관련 pod 이름까지 맞춰서
noise를 줄인 뒤 `related_logs` item을 만든다. stream label에서는 주로 `k8s_namespace_name`,
`namespace`, `k8s_pod_name`, `pod`, `pod_name`, `kubernetes_pod_name`을 본다.

logs를 읽을 때는 `logs[].query_name`으로 어떤 로그 query 결과인지 확인하고,
`line_count`로 잡힌 로그가 있는지 본 다음, 마스킹된 로그 문장은
`logs[].streams[].values[].line`에서 읽는다. 빠른 판단에는 `pattern_counts`, `severity_counts`,
`trace_ids`를 먼저 보면 된다.

```json
[
  {
    "source": "loki",
    "query_name": "target_namespace_errors",
    "query": "{...}",
    "result_type": "streams",
    "streams": [],
    "line_count": 0,
    "pattern_counts": {
      "app_port_bind_failed": 0,
      "permission_denied_startup": 0,
      "missing_env": 0,
      "probe_failed": 0,
      "health_endpoint_error": 0,
      "dependency_timeout": 0,
      "dependency_error": 0,
      "image_pull_error": 0,
      "oom_or_memory": 0,
      "config_error": 0
    },
    "severity_counts": {
      "critical": 0,
      "error": 0,
      "warn": 0,
      "info": 0,
      "debug": 0,
      "trace": 0,
      "unknown": 0
    },
    "trace_ids": [],
    "matched_entries": [],
    "collection_limit": {
      "matched_entries": {
        "max_items": 20,
        "original_count": 0,
        "returned_count": 0,
        "truncated": false
      }
    },
    "redaction_summary": {
      "applied": true,
      "redacted_line_count": 0,
      "truncated_line_count": 0
    }
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
| `logs[].streams[].pattern_counts` | object | 해당 stream 안에서 계산한 장애 신호별 matching line 개수다. RCA bundle scope 필터 후 count 재합산에 쓴다. |
| `logs[].streams[].severity_counts` | object | 해당 stream 안에서 계산한 severity별 line 개수다. |
| `logs[].streams[].trace_ids` | list<string> | 해당 stream 안에서 찾은 안전한 trace id 목록이다. |
| `logs[].line_count` | number | 모든 stream의 log entry 개수 합계다. |
| `logs[].pattern_counts` | object | provider가 마스킹된 log line을 읽고 계산한 장애 신호별 matching line 개수다. |
| `logs[].severity_counts` | object | `ERROR`, `WARN`, `level=error` 같은 표현을 정규화한 severity별 line 개수다. |
| `logs[].trace_ids` | list<string> | 로그에서 찾은 안전한 trace id 목록이다. 32자리 hex trace id만 최대 20개까지 담는다. |
| `logs[].matched_entries` | list<object> | RCA가 바로 읽을 수 있는 매칭 로그 요약이다. 매칭된 line만 최대 20개까지 담는다. |
| `logs[].matched_entries[].message` | string | 민감정보 마스킹과 4096자 제한이 적용된 판단용 log line이다. Loki 원문 전체가 아니다. |
| `logs[].matched_entries[].matched_patterns` | list<string> | 해당 line이 매칭한 RCA diagnostic pattern 이름이다. 예: `app_port_bind_failed`, `permission_denied_startup`, `missing_env`, `dependency_timeout`, `dependency_error`, `config_error`, `probe_failed`, `oom_or_memory`. |
| `logs[].collection_limit.matched_entries` | object | `matched_entries`의 최대 반환 수, 실제 매칭 수, 반환 수, 잘림 여부를 나타낸다. |
| `logs[].redaction_summary` | object | provider가 로그 마스킹을 적용했는지, 실제로 값이 바뀐 line 개수, 길이 제한으로 잘린 line 개수를 나타낸다. |

RCA EvidenceBundle에서 `logs:related_logs`로 승격될 때는 `streams`와 `matched_entries`가 같은
namespace/pod scope로 필터링된다. `pattern_counts`, `severity_counts`, `trace_ids`도 선택된 stream summary를
기준으로 다시 합산된다. `redaction_summary`와 `collection_limit.matched_entries`는 provider result 기준의
수집 제한 정보이며, RCA bundle에서 scope 필터링 후의 실제 항목 수와 항상 같다는 뜻은 아니다.

2026-07-11 실제 응답에서는 다음 4개 query 결과가 들어왔다.

| query name | line count | stream count | 의미 |
| --- | --- | --- | --- |
| `target_namespace_errors` | 20 | 20 | target namespace에서 `ERROR` 문자열을 포함한 로그 |
| `sandbox_namespace_errors` | 0 | 0 | sandbox namespace의 `ERROR/FATAL/panic` 로그. 이번 응답에는 없음 |
| `node_collector_runtime_samples` | 20 | 20 | optional node collector의 runtime sample 로그 |
| `target_agent_warnings` | 20 | 20 | cluster-agent container의 `WARN/ERROR/failed` 로그 |

이번 응답에서 `pattern_counts`는 모든 query에서 0이었다.
즉 로그 라인은 있었지만, provider가 아는 `probe_failed`, `oom_or_memory`,
`dependency_timeout`, `config_error` 같은 RCA pattern에는 걸리지 않았다.
`target_namespace_errors`는 `severity_counts.info=16`, `unknown=4`였고,
나머지 line이 있는 query는 대부분 `unknown=20`이었다.
이런 경우 RCA는 로그가 있다는 사실만으로 root cause를 확정하지 않고,
Kubernetes event/reason, metrics threshold, metadata snapshot과 같이 본다.

### `logs[].streams[]`

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `stream` | object | Loki stream label set이다. 예: namespace, pod, container, app label. |
| `values` | list<object> | 이 stream의 log entry 목록이다. |

이번 실제 응답에서 자주 보이는 stream label은 다음과 같다.

| label | 의미 |
| --- | --- |
| `k8s_namespace_name` | 로그가 나온 Kubernetes namespace다. incident namespace 필터에 쓴다. |
| `k8s_pod_name` | 로그를 남긴 Pod 이름이다. incident pod 또는 관련 pod 필터에 쓴다. |
| `k8s_pod_uid` | Pod UID다. Kubernetes snapshot의 pod UID와 연결할 수 있다. |
| `k8s_container_name` | 로그를 남긴 container 이름이다. |
| `service_name` | OpenTelemetry/Loki pipeline이 붙인 service 이름이다. |
| `log_iostream` | stdout 또는 stderr다. |
| `detected_level` | collector가 감지한 level이다. 실제 RCA severity는 `severity_counts`와 함께 본다. |
| `k8s_container_restart_count` | 로그 시점의 container restart count label이다. 문자열로 들어올 수 있다. |
| `observed_timestamp` | collector가 관측한 timestamp다. nanosecond 문자열일 수 있다. |
| `log_file_path` | node 안의 container log path다. 위치 확인용이며 root cause 자체는 아니다. |

### `logs[].streams[].values[]`

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `timestamp` | string 또는 null | Loki log timestamp다. nanosecond string 형태일 수 있다. |
| `line` | string 또는 null | provider가 민감정보를 가리고 최대 4096자로 제한한 log line이다. root cause keyword 판단에 쓴다. |
| `line_truncated` | boolean | line이 길이 제한으로 잘렸을 때만 true다. |
| `original_line_length` | number | line이 잘렸을 때만 있는 제한 전 마스킹된 line 길이다. |

마스킹 기준은 보수적으로 잡는다. `password`, `token`, `secret`, `api_key`, `client_secret`,
`credential`, `private_key`, `Authorization`, `Bearer`, `Cookie`, JWT, AWS access key, URL 안의
계정정보, email은 `[REDACTED]` 계열 값으로 바꾼다. 반대로 `trace_id`, `span_id`, `request_id`,
namespace, pod name, `ERROR`, `timeout`, `probe failed`, `ImagePullBackOff`, `OOMKilled` 같은 RCA 판단
키워드는 유지한다.
pattern count, severity count, trace id 추출은 마스킹된 전체 line을 기준으로 먼저 계산하고,
전송되는 `line` 문자열만 길이 제한으로 줄인다.

`pattern_counts`는 각 pattern에 매칭된 log line 개수다. 현재 pattern key는 다음과 같다.

| pattern key | 의미 |
| --- | --- |
| `probe_failed` | readiness/liveness/startup probe 실패 또는 `Unhealthy` 로그다. |
| `health_endpoint_error` | `/health`, `/ready`, health check 실패 로그다. |
| `dependency_timeout` | timeout, deadline exceeded, connection timed out 계열 로그다. |
| `dependency_error` | connection refused/reset, DNS lookup failed, upstream/downstream 실패 로그다. |
| `image_pull_error` | `ImagePullBackOff`, `ErrImagePull`, image pull 실패 로그다. |
| `oom_or_memory` | OOMKilled, out of memory, memory limit/pressure 계열 로그다. |
| `config_error` | ConfigMap/Secret/env/volume/mount 누락 또는 실패 로그다. |

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

실제 evidence window raw API에서는 다음 wrapper 안에 들어온다.

```json
{
  "evidence_key": "default:cluster-1:cluster-snapshot:2026-07-11T07:25:00+00:00",
  "workspace_id": "default",
  "cluster_id": "cluster-1",
  "source": "traces",
  "payload": {
    "traces": {}
  }
}
```

RCA 내부에서는 traces bucket이 다음 EvidenceItem으로 승격된다.

| raw 위치 | RCA EvidenceItem | 왜 이렇게 바꾸는가 |
| --- | --- | --- |
| `payload.traces` | `source="traces"`, `name="related_traces"` | rule catalog가 `traces:related_traces`를 기대 근거로 요구할 수 있게 한다. |

즉 source/name key로 쓰면 `traces:related_traces`다.
단, `payload.traces`가 존재하면 item은 만들어지지만, 각 query의 `trace_count`가 0이면 실제 trace 근거는 없는 상태다.
이 경우는 "trace provider가 실패했다"가 아니라 "Tempo는 응답했지만 해당 query에 매칭된 trace가 없다"로 먼저 읽는다.

traces를 읽을 때는 `results.<query_name>.trace_count`로 잡힌 trace가 있는지 보고,
각 trace의 `rootServiceName`, `rootTraceName`, `durationMs`, `traceID` 같은 값을 확인한다.
RCA가 표준 필드를 먼저 보고 싶을 때는 `results.<query_name>.analysis`를 읽는다.

```json
{
  "source": "tempo",
  "results": {
    "<query_name>": {
      "query": "{ status = error }",
      "traces": [],
      "trace_count": 0,
      "analysis": {
        "trace_summaries": [],
        "trace_ids": [],
        "services": [],
        "operations": [],
        "status_counts": {
          "error": 0,
          "ok": 0,
          "unset": 0,
          "unknown": 0
        },
        "error_count": 0,
        "dependency_count": 0
      }
    }
  }
}
```

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `source` | string | provider source 이름이다. 항상 `tempo`다. |
| `results` | object | query name을 key로 하는 trace search 결과 묶음이다. |
| `results.<query_name>` | object | query 하나의 정규화 결과다. |

2026-07-11 실제 응답에서는 다음 4개 query가 모두 실행됐지만 trace는 0개였다.

| query name | query | trace count | 읽는 법 |
| --- | --- | --- | --- |
| `application_error_spans` | `{ status = error }` | 0 | error status application span이 잡히지 않았다. |
| `management_gateway_spans` | `{ resource.service.name = "api-gateway" }` | 0 | API Gateway 관련 Tempo trace가 잡히지 않았다. |
| `target_agent_error_spans` | `{ resource.service.name = "target-cluster-agent" && status = error }` | 0 | target agent error span이 잡히지 않았다. |
| `target_agent_recent_spans` | `{ resource.service.name = "target-cluster-agent" }` | 0 | target agent 최근 span도 잡히지 않았다. |

이 상태에서 확인할 수 있는 것은 "trace 기반 근거가 없다"는 점이다.
원인은 실제 요청 trace가 없었거나, application/agent가 OTEL trace를 내보내지 않았거나,
Tempo query label이 실제 span resource label과 맞지 않는 경우일 수 있다.
하지만 provider 실패라면 보통 query 결과 object 자체가 없거나 evidence job 실패로 드러난다.

### `traces.results.<query_name>`

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `query` | string | 실행한 TraceQL 또는 Tempo search query다. |
| `traces` | list<object> | Tempo `/api/search`가 반환한 trace 목록을 전송 크기 안에서 제한한 값이다. |
| `trace_count` | number | Tempo가 반환한 trace 수다. `collection_limits`가 있으면 실제 `traces` 길이와 다를 수 있다. |
| `analysis` | object | RCA가 바로 읽기 쉬운 trace/span 요약이다. |
| `collection_limits` | object | `traces` list가 전송 크기 보호를 위해 잘렸을 때만 있는 제한 요약이다. |

현재 Tempo provider는 전체 API response raw field를 담지 않는다.
RCA는 `analysis`를 먼저 보고, 필요하면 `traces[]`와 `trace_count`를 함께 본다.
`analysis`는 `traces[]` list를 최종 제한하기 전 compact trace 기준으로 만든다.
그래서 `collection_limits` 때문에 `traces[]`가 일부만 남아도 trace id, service, status,
duration 같은 RCA용 요약은 `analysis`에 남을 수 있다.

`traces[]` 내부 object는 Tempo 응답에 따라 달라질 수 있다.
긴 문자열은 최대 1024자로 제한되고, 중첩 list는 최대 20개만 남긴다.
한 trace가 계속 너무 크면 `traceID` 원본 모양 대신 RCA용 summary field와
`trace_truncated`, `original_trace_bytes`만 남을 수 있다.
테스트와 일반 search response 기준으로 다음 값이 들어올 수 있다.

| 필드 예시 | 의미 |
| --- | --- |
| `traceID` | trace 식별자다. |
| `rootServiceName` | root service 이름이다. |
| `rootTraceName` | root span 또는 operation 이름이다. |
| `durationMs` | trace duration millisecond다. |
| `query` | 테스트 레거시 데이터에서는 어떤 query로 잡힌 trace인지 보조 정보로 들어간다. |
| `trace_truncated` | trace object가 summary로 대체되었을 때 true다. |
| `original_trace_bytes` | trace object가 summary로 대체되었을 때의 원래 JSON byte 크기다. |

### `traces.results.<query_name>.analysis`

`analysis`는 기존 trace 목록을 없애지 않고 옆에 추가되는 구조화 요약이다.
목적은 Tempo 응답 모양이 조금 달라도 RCA가 같은 필드명으로 trace를 읽게 하는 것이다.
민감정보 노출을 늘리지 않기 위해 span attribute 전체는 복사하지 않는다.
각 trace 안의 span summary도 최대 8개까지만 남긴다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `trace_summaries` | list<object> | trace별 표준 요약이다. 최대 20개를 만든다. |
| `trace_ids` | list<string> | trace summary에서 뽑은 trace id 목록이다. |
| `services` | list<string> | root service 이름 목록이다. |
| `operations` | list<string> | root operation 이름 목록이다. |
| `status_counts` | object | `error`, `ok`, `unset`, `unknown` trace 개수다. |
| `error_count` | number | error trace 개수다. |
| `dependency_count` | number | dependency 관련 trace 개수다. |
| `span_count` | number | span summary가 있을 때만 들어가는 span summary 개수다. |
| `error_span_count` | number | error span summary 개수다. |
| `dependency_span_count` | number | dependency span summary 개수다. |
| `duration_ms` | object | trace duration millisecond의 `count`, `min`, `max`, `avg` 요약이다. |

dependency span 실패 여부를 바로 나타내는 단일 필드는 없다.
필요하면 `error_span_count`, `dependency_span_count`, `span_summaries[].error`,
`span_summaries[].is_dependency`를 함께 봐야 한다.

`trace_summaries[]`의 주요 필드는 다음과 같다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `trace_id` | string | trace 식별자다. |
| `service` | string | root service 이름이다. |
| `operation` | string | root span 또는 operation 이름이다. |
| `status` | string | `error`, `ok`, `unset`, `unknown` 중 하나다. |
| `duration_ms` | number | trace duration millisecond다. |
| `error` | boolean | trace 또는 하위 span이 error로 보이는지 여부다. |
| `is_dependency` | boolean | client/producer/consumer span 또는 dependency attribute가 있는지 여부다. |
| `span_summaries` | list<object> | span별 표준 요약이다. trace마다 최대 8개만 담는다. |

`span_summaries[]`는 `trace_id`, `span_id`, `service`, `operation`, `status`,
`duration_ms`, `error`, `is_dependency`만 담는다.
span attribute 원문 전체, parent/child 관계 전체, request/response payload는 담지 않는다.

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
| dependency timeout | `analysis.dependency_count`, `analysis.duration_ms.max`, `analysis.trace_summaries[].span_summaries[]` |
| management plane 문제 | `target_agent_error_spans`, `management_gateway_spans` |
| application error path | `application_error_spans.trace_count`, `analysis.error_count`, `analysis.services`, `analysis.operations` |

## Metadata bucket

구현 메모: `MetadataProvider`가 Kubernetes API 호출과 metadata evidence 조립을 담당한다. helper 모듈은 snapshot 생성, ConfigMap/Secret reference 요약, EndpointSlice ready endpoint 요약, Service selector 매칭, ResourceQuota 요약, Deployment/ReplicaSet/Pod 소유 관계 계산만 나누어 맡는다. 이 helper 모듈들은 event를 발행하지 않고 payload 계약도 바꾸지 않는다.

Metadata bucket은 `MetadataProvider`가 만든다.
현재 구현은 외부 배포 시스템을 직접 조회하지 않는다.
대신 target namespace의 Deployment, ReplicaSet, Pod, Service, ResourceQuota, EndpointSlice 목록을 Kubernetes API에서 읽어
현재 workload snapshot과 namespace metadata summary를 만든다.

실제 evidence window raw API에서는 다음 wrapper 안에 들어온다.

```json
{
  "evidence_key": "default:cluster-1:cluster-snapshot:2026-07-11T07:25:00+00:00",
  "workspace_id": "default",
  "cluster_id": "cluster-1",
  "source": "metadata",
  "payload": {
    "metadata": {}
  }
}
```

RCA 내부에서는 metadata bucket 안의 하위 list/object가 있을 때만 EvidenceItem으로 승격된다.

| raw 위치 | RCA EvidenceItem | 만들어지는 조건 |
| --- | --- | --- |
| `metadata.change_context.current_workload_snapshots[]` | `metadata:current_workload_snapshots` | snapshot list에 항목이 있을 때 |
| `metadata.change_context.current_workload_snapshot` | `metadata:current_workload_snapshot` | 단건 detail object가 있을 때 |
| `metadata.change_context.service_selector_matches[]` | `metadata:service_selector_matches` | Service selector 매칭 목록이 있을 때 |
| `metadata.change_context.endpoint_slice_ready_endpoints[]` | `metadata:endpoint_slice_ready_endpoints` | EndpointSlice ready endpoint 목록이 있을 때 |
| `metadata.change_context`의 `recent_changes/gitops/image/rollout/config/risk` | `metadata:change_context` | 변경 맥락 섹션에 실제 내용이 있을 때 |

2026-07-11 실제 응답은 다음처럼 비어 있었다.

```json
{
  "metadata": {
    "change_context": {
      "current_workload_snapshots": []
    }
  }
}
```

이 경우 metadata provider bucket은 도착했지만, RCA evidence bundle에는 metadata item이 만들어지지 않는다.
`current_workload_snapshots`가 빈 list이기 때문이다.
따라서 이 응답은 "metadata source 호출은 됐지만 RCA가 쓸 workload snapshot 근거는 없다"로 읽는다.
원인은 target namespace에 조회 가능한 Deployment가 없거나, metadata query가 기대 namespace/resource와 맞지 않거나,
수집 권한/필터 때문에 snapshot 대상이 비어 있는 경우일 수 있다.

`MetadataSnapshotQuery.query` 값이 `change_context`, `current_workload_snapshots`, `deployments`이면
target namespace의 모든 Deployment를 summary snapshot 목록으로 보낸다.
`deployment/<name>`, `deployment/<namespace>/<name>`, `<namespace>/<name>`이면 특정 Deployment 1개를
detail snapshot인 `current_workload_snapshot` 단수 값으로 보낸다.

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
        "pod_template_labels": {},
        "pod_template_auth": {
          "service_account_name": "checkout-api-sa",
          "automount_service_account_token": false,
          "image_pull_secret_refs": [
            {
              "name": "registry-credentials"
            }
          ]
        },
        "deployment_status": {
          "observed_generation": 12,
          "desired_replicas": 3,
          "replicas": 3,
          "updated_replicas": 2,
          "ready_replicas": 1,
          "available_replicas": 1,
          "unavailable_replicas": 2,
          "conditions": [
            {
              "type": "Progressing",
              "status": "False",
              "reason": "ProgressDeadlineExceeded",
              "message": "ReplicaSet timed out.",
              "last_transition_time": "2026-07-10T10:00:00Z"
            }
          ]
        },
        "pod_statuses": [
          {
            "name": "checkout-api-pod-1",
            "phase": "Running",
            "ready": false,
            "start_time": "2026-07-10T09:01:00Z",
            "conditions": [
              {
                "type": "Ready",
                "status": "False",
                "reason": "ContainersNotReady",
                "message": "containers with unready status",
                "last_transition_time": "2026-07-10T10:01:00Z"
              }
            ]
          }
        ],
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
            "resources": {
              "requests": {
                "cpu": "100m",
                "memory": "256Mi"
              },
              "limits": {
                "cpu": "500m",
                "memory": "512Mi"
              }
            }
          }
        ],
        "replicaset_revisions": [
          {
            "name": "checkout-api-abc123",
            "revision": "3",
            "desired_replicas": 2,
            "replicas": 2,
            "ready_replicas": 1,
            "available_replicas": 1,
            "fully_labeled_replicas": 2
          }
        ]
      }
    ],
    "service_selector_matches": [
      {
        "service": {
          "namespace": "target",
          "name": "checkout-api"
        },
        "selector": {
          "app": "checkout-api"
        },
        "match_status": "matched",
        "matched_pod_count": 1,
        "matched_pods": [
          {
            "namespace": "target",
            "name": "checkout-api-pod-1"
          }
        ]
      }
    ],
    "endpoint_slice_ready_endpoints": [
      {
        "service": {
          "namespace": "target",
          "name": "checkout-api"
        },
        "endpoint_slice": {
          "namespace": "target",
          "name": "checkout-api-abcde"
        },
        "address_type": "IPv4",
        "ports": [
          {
            "name": "http",
            "port": 8080,
            "protocol": "TCP"
          }
        ],
        "endpoint_count": 2,
        "ready_endpoint_count": 1,
        "not_ready_endpoint_count": 1,
        "unknown_ready_endpoint_count": 0,
        "serving_endpoint_count": 1,
        "terminating_endpoint_count": 0,
        "ready_targets": [
          {
            "kind": "Pod",
            "namespace": "target",
            "name": "checkout-api-pod-1"
          }
        ]
      }
    ]
  }
}
```

단건 detail snapshot은 summary 필드에 더해 `deployment_annotations`,
`pod_template_annotations`, `managed_fields_managers`,
`scheduling_constraints`, `containers[].env_refs`,
`containers[].env_from_refs`, `containers[].volume_mount_refs`,
`replicaset_revisions[].created_at`, `replicaset_revisions[].conditions`를
추가로 담는다.

| 필드 | 타입 | 의미 |
| --- | --- | --- |
| `change_context` | object | 변경 맥락을 담는 묶음이다. |
| `change_context.current_workload_snapshots` | list<object> | target namespace의 Deployment별 현재 상태 요약이다. |
| `change_context.current_workload_snapshot` | object | 특정 Deployment 1개의 상세 상태 요약이다. |
| `change_context.service_selector_matches` | list<object> | namespace Service selector와 Pod labels 비교 결과다. |
| `change_context.service_selector_matches[].service` | object | Service namespace와 name이다. |
| `change_context.service_selector_matches[].selector` | object | Service spec.selector 요약이다. selector가 없으면 생략된다. |
| `change_context.service_selector_matches[].match_status` | string | `matched`, `no_matching_pods`, `selector_missing` 중 하나다. |
| `change_context.service_selector_matches[].target_relation` | string | 단건 detail에서만 있는 값이다. 이 Service가 target Deployment와 관련 있다고 본 이유이며, `exact_selector_match`, `live_pod_match`, `selector_key_overlap` 중 하나다. |
| `change_context.service_selector_matches[].matched_pod_count` | number | selector와 labels가 맞는 Pod 수다. |
| `change_context.service_selector_matches[].matched_pods` | list<object> | selector와 labels가 맞는 Pod namespace/name 샘플 목록이다. matched Pod가 없으면 생략될 수 있다. 목록이 잘려도 `matched_pod_count`는 전체 수를 유지한다. |
| `change_context.service_selector_matches[].matched_pods_truncated` | boolean | `matched_pods` 샘플이 잘렸을 때만 true다. |
| `change_context.endpoint_slice_ready_endpoints` | list<object> | EndpointSlice별 ready endpoint 요약이다. summary query는 namespace 전체를 담고, detail query는 관련 Service의 EndpointSlice만 담는다. |
| `change_context.endpoint_slice_ready_endpoints[].service` | object | EndpointSlice가 연결된 Service namespace/name이다. `kubernetes.io/service-name` label에서 읽는다. |
| `change_context.endpoint_slice_ready_endpoints[].endpoint_slice` | object | EndpointSlice namespace/name이다. |
| `change_context.endpoint_slice_ready_endpoints[].address_type` | string | EndpointSlice address type이다. 예: `IPv4`, `IPv6`, `FQDN`. |
| `change_context.endpoint_slice_ready_endpoints[].ports` | list<object> | EndpointSlice port name/port/protocol/app_protocol 샘플 요약이다. |
| `change_context.endpoint_slice_ready_endpoints[].ports_truncated` | boolean | EndpointSlice port 샘플이 잘렸을 때만 true다. |
| `change_context.endpoint_slice_ready_endpoints[].endpoint_count` | number | EndpointSlice 안의 전체 endpoint 수다. |
| `change_context.endpoint_slice_ready_endpoints[].ready_endpoint_count` | number | condition `ready=true`인 endpoint 수다. Kubernetes EndpointSlice API 기준으로 `ready`가 생략되거나 null이면 ready로 해석한다. |
| `change_context.endpoint_slice_ready_endpoints[].not_ready_endpoint_count` | number | condition `ready=false`인 endpoint 수다. |
| `change_context.endpoint_slice_ready_endpoints[].unknown_ready_endpoint_count` | number | ready condition이 boolean 값이 아닌 endpoint 수다. `ready` 생략 또는 null은 unknown이 아니라 ready로 본다. |
| `change_context.endpoint_slice_ready_endpoints[].serving_endpoint_count` | number | condition `serving=true`인 endpoint 수다. Kubernetes EndpointSlice API 기준으로 `serving`이 생략되거나 null이면 serving으로 해석한다. |
| `change_context.endpoint_slice_ready_endpoints[].terminating_endpoint_count` | number | condition `terminating=true`인 endpoint 수다. |
| `change_context.endpoint_slice_ready_endpoints[].ready_targets` | list<object> | ready endpoint가 가리키는 target object kind/namespace/name 샘플이다. 보통 Pod다. endpoint IP address는 담지 않는다. |
| `change_context.endpoint_slice_ready_endpoints[].ready_targets_truncated` | boolean | `ready_targets` 샘플이 잘렸을 때만 true다. |
| `change_context.resource_quotas` | list<object> | namespace ResourceQuota hard/used 요약이다. summary query와 detail query 모두 같은 namespace 맥락으로 담는다. |
| `change_context.resource_quotas[].name` | string | ResourceQuota 이름이다. |
| `change_context.resource_quotas[].namespace` | string | ResourceQuota namespace다. |
| `change_context.resource_quotas[].hard` | object | ResourceQuota status.hard 값이다. CPU, memory, pod 수 같은 제한값을 Kubernetes quantity 문자열 그대로 담는다. |
| `change_context.resource_quotas[].used` | object | ResourceQuota status.used 값이다. 현재 사용량을 Kubernetes quantity 문자열 그대로 담는다. |
| `change_context.referenced_config_objects` | list<object> | 단건 detail에만 있는 참조된 ConfigMap/Secret 객체 metadata 요약이다. 객체 값은 담지 않는다. |
| `change_context.referenced_config_objects[].kind` | string | `ConfigMap` 또는 `Secret`이다. |
| `change_context.referenced_config_objects[].namespace` | string | 참조된 객체 namespace다. |
| `change_context.referenced_config_objects[].name` | string | 참조된 객체 이름이다. |
| `change_context.referenced_config_objects[].exists` | boolean 또는 null | 객체 존재 여부다. 권한이 없어 확인할 수 없으면 null이다. |
| `change_context.referenced_config_objects[].access` | string | `ok`, `not_found`, `forbidden` 중 하나다. |
| `change_context.referenced_config_objects[].created_at` | string | 객체 metadata.creationTimestamp다. 조회 성공 시에만 있다. |
| `change_context.referenced_config_objects[].labels` | object | 안전하다고 본 labels 요약이다. 민감 token이 있는 label은 제외한다. |
| `change_context.referenced_config_objects[].referenced_by` | list<object> | 어떤 container/env/envFrom/volume이 이 객체를 참조했는지 나타낸다. |
| `change_context.referenced_config_objects[].referenced_key_checks` | list<object> | 명시적으로 참조한 key가 객체 안에 있는지 확인한 결과다. 조회 성공 시에만 있다. |
| `change_context.referenced_config_objects[].referenced_key_checks[].key` | string | Deployment가 env keyRef 또는 volume items에서 직접 참조한 key 이름이다. |
| `change_context.referenced_config_objects[].referenced_key_checks[].exists` | boolean | 해당 key가 ConfigMap/Secret data 또는 binaryData key로 존재하는지 여부다. 값은 담지 않는다. |
| `change_context.referenced_config_objects[].referenced_key_checks[].sources` | list<string> | 이 key를 참조한 위치 종류다. 현재 `env`, `volume`만 쓴다. `envFrom`은 key를 명시하지 않으므로 제외한다. |
| `change_context.collection_limits` | object | metadata 목록이 전송 크기 보호를 위해 잘렸을 때만 있는 제한 요약이다. |
| `change_context.collection_limits.truncated` | boolean | 하나 이상의 목록이 잘렸으면 true다. |
| `change_context.collection_limits.lists.<field>.original_count` | number | 제한 전 전체 항목 수다. |
| `change_context.collection_limits.lists.<field>.returned_count` | number | 최종 payload에 담긴 항목 수다. |
| `change_context.current_workload_snapshots[].workload` | object | workload kind, namespace, name이다. 현재 kind는 `Deployment`다. |
| `change_context.current_workload_snapshots[].deployment_labels` | object | Deployment metadata labels다. |
| `change_context.current_workload_snapshots[].pod_template_labels` | object | Pod template metadata labels다. |
| `change_context.current_workload_snapshots[].pod_template_auth` | object | Pod template의 service account와 image pull secret name 요약이다. private image pull 실패와 권한 문제 후보를 보기 위한 값이다. 값이 없으면 생략될 수 있고, Secret 값은 담지 않는다. |
| `change_context.current_workload_snapshots[].pod_template_auth.service_account_name` | string | Pod template `serviceAccountName` 값이다. |
| `change_context.current_workload_snapshots[].pod_template_auth.automount_service_account_token` | boolean | Pod template `automountServiceAccountToken` 값이다. `false`도 의미가 있으므로 보존한다. |
| `change_context.current_workload_snapshots[].pod_template_auth.image_pull_secret_refs[].name` | string | Pod template `imagePullSecrets[].name` 값이다. Secret 객체의 data는 읽거나 보내지 않는다. |
| `change_context.current_workload_snapshots[].persistent_volume_claim_refs` | list<object> | Pod template volume이 참조하는 PVC volume name과 claim name 목록이다. PVC object 자체는 담지 않는다. |
| `change_context.current_workload_snapshots[].deployment_status` | object | Deployment status의 replica count와 condition 요약이다. |
| `change_context.current_workload_snapshots[].deployment_status.conditions` | list<object> | Deployment condition의 type/status/reason/message/time 요약이다. |
| `change_context.current_workload_snapshots[].pod_statuses` | list<object> | 이 Deployment가 소유한 Pod의 phase, ready 여부, condition 샘플 요약이다. |
| `change_context.current_workload_snapshots[].pod_status_count` | number | `pod_statuses`가 잘렸을 때만 있는 전체 owned Pod 수다. |
| `change_context.current_workload_snapshots[].pod_statuses_truncated` | boolean | `pod_statuses` 샘플이 잘렸을 때만 true다. |
| `change_context.current_workload_snapshots[].pod_statuses[].conditions` | list<object> | Pod condition의 type/status/reason/message/time 요약이다. |
| `change_context.current_workload_snapshots[].containers[]` | list<object> | container name, image, ports, readiness/liveness/startup probe 요약이다. |
| `change_context.current_workload_snapshots[].containers[].ports` | list<object> | container `ports[]`의 `name`, `container_port`, `protocol` 요약이다. Service targetPort와 probe port 비교에 쓴다. hostPort/hostIP는 보내지 않는다. |
| `change_context.current_workload_snapshots[].containers[].*_probe` | object | probe의 path, port, timeout_seconds, period_seconds, failure_threshold 중 존재하는 값만 담는다. |
| `change_context.current_workload_snapshots[].containers[].resources` | object | container resources requests/limits 요약이다. CPU/memory quantity 값은 문자열 그대로 담는다. |
| `change_context.current_workload_snapshots[].replicaset_revisions[]` | list<object> | 이 Deployment가 소유한 ReplicaSet name, revision, replica count 요약이다. |
| `change_context.current_workload_snapshots[].replicaset_revision_count` | number | `replicaset_revisions`가 잘렸을 때만 있는 전체 owned ReplicaSet 수다. |
| `change_context.current_workload_snapshots[].replicaset_revisions_truncated` | boolean | `replicaset_revisions` 샘플이 잘렸을 때만 true다. |
| `change_context.current_workload_snapshot.deployment_annotations` | object | 단건 detail에만 있는 안전한 Deployment metadata annotations다. |
| `change_context.current_workload_snapshot.pod_template_annotations` | object | 단건 detail에만 있는 안전한 Pod template metadata annotations다. |
| `change_context.current_workload_snapshot.managed_fields_managers` | list<string> | 단건 detail에만 있는 Deployment managedFields의 manager 이름 목록이다. |
| `change_context.current_workload_snapshot.scheduling_constraints` | object | 단건 detail에만 있는 Pod 배치 조건 요약이다. 전체 summary에는 담지 않는다. |
| `change_context.current_workload_snapshot.scheduling_constraints.node_selector` | object | Pod template `nodeSelector`다. 단순 key-value 조건이라 그대로 담는다. |
| `change_context.current_workload_snapshot.scheduling_constraints.tolerations` | list<object> | Pod template tolerations의 `key`, `operator`, `value`, `effect`, `toleration_seconds` 요약이다. |
| `change_context.current_workload_snapshot.scheduling_constraints.affinity_summary` | object | affinity 원본 대신 `has_node_affinity`, `has_required_node_affinity`, `has_preferred_node_affinity`, `has_pod_affinity`, `has_pod_anti_affinity` boolean만 담는다. |
| `change_context.current_workload_snapshot.containers[].env_refs` | list<object> | 단건 detail에만 있는 env ConfigMap/Secret key reference 요약이다. 값 자체는 담지 않는다. |
| `change_context.current_workload_snapshot.containers[].env_from_refs` | list<object> | 단건 detail에만 있는 envFrom ConfigMap/Secret reference 요약이다. |
| `change_context.current_workload_snapshot.containers[].volume_mount_refs` | list<object> | 단건 detail에만 있는 ConfigMap/Secret volume reference 요약이다. |
| `change_context.current_workload_snapshot.replicaset_revisions[].created_at` | string | 단건 detail에만 있는 ReplicaSet 생성 시각이다. |
| `change_context.current_workload_snapshot.replicaset_revisions[].conditions` | list<object> | 단건 detail에만 있는 ReplicaSet condition의 type/status/reason/message/time 요약이다. |

주의: `MetadataProvider.query()`의 내부 raw payload에는 `cluster_id`, `collected_at`도 있지만,
`normalize_payload()` 결과 bucket에는 `change_context`만 남긴다.
전체 조회 summary는 annotations, managedFields, config reference, ReplicaSet condition을 담지 않는다.
단건 detail은 안전한 Deployment/Pod template annotations만 남긴다.
Scheduling constraints는 단건 detail에만 담는다. Scheduling 문제는 보통 특정 Deployment가
Pending이거나 배치 실패 후보일 때 깊게 보는 값이고, 전체 namespace summary에 모든
Deployment의 affinity 조건을 넣으면 payload가 커지고 원인 후보와 무관한 noise가 늘어난다.
`node_selector`는 단순 key-value라 그대로 담지만, `tolerations`는 작은 필드만 남기고
`affinity`는 구조가 깊고 label selector가 길어질 수 있어서 boolean summary만 남긴다.
전체 summary query의 Service selector 비교 결과는 namespace의 모든 Service를 담는다.
단건 detail query의 Service selector 비교 결과는 target Deployment와 관련 있는 Service만 담는다.
관련 기준은 selector가 target pod template labels와 맞는 경우, selector가 실제 target Pod labels와 맞는 경우,
또는 selector key가 target labels key와 겹치는 경우다.
EndpointSlice ready endpoint 요약도 같은 범위 규칙을 쓴다.
전체 summary query는 namespace의 모든 EndpointSlice를 담고, 단건 detail query는 관련 Service의 EndpointSlice만 담는다.
EndpointSlice endpoint의 IP address는 남기지 않는다.
EndpointSlice condition은 Kubernetes API의 기본 해석을 따른다. `ready`와 `serving`이 생략되거나 null이면 true로 보고, `terminating`이 생략되거나 null이면 false로 본다.
Deployment, ReplicaSet, Pod 소유 관계는 기준 리소스의 UID를 알고 있으면 UID match만 인정한다. 기준 Deployment/ReplicaSet UID를 알고 있는데 ownerReference UID가 없거나 다르면 이름이 같아도 현재 Deployment 소유로 보지 않는다. 기준 UID 자체를 알 수 없는 오래된 형태의 데이터에서만 이름을 fallback으로 쓴다.
ResourceQuota 요약은 workload 하나의 속성이 아니라 namespace 수준 제한 정보다.
그래서 summary query와 detail query 모두 `change_context.resource_quotas[]`에 담고,
`current_workload_snapshot` 안에는 넣지 않는다.
ResourceQuota 조회 권한이 없거나 API가 없으면 provider는 실패하지 않고 빈 목록을 남긴다.
참조된 ConfigMap/Secret 객체 metadata 요약은 단건 detail query에만 담는다.
전체 summary query에서는 참조 객체를 따라가지 않는다.
이 요약은 객체 존재 여부와 참조 위치를 보기 위한 값이며 Secret/ConfigMap 값은 담지 않는다.
Secret `data`, `binaryData`, `stringData`, ConfigMap `data`, `binaryData`,
raw object, annotations는 제외한다.
조회에 성공한 객체는 `referenced_key_checks[]`로 명시 참조 key 존재 여부를 제공한다.
이때 전체 key 목록은 보내지 않고, Deployment가 직접 참조한 key만 확인한다.
`envFrom`은 key를 지정하지 않으므로 key check 대상에서 제외한다.
구현은 기존 config reference 흐름을 재사용한다. `metadata_config_refs.py`는 참조 객체와 참조 위치를 찾고, `metadata_config_objects.py`는 명시 key 존재 여부와 RCA에 넘길 안전한 객체 요약을 만든다.
`kubectl.kubernetes.io/last-applied-configuration` 같은 원문 manifest annotation과
secret/token/password/credential/private/authorization 이름이 들어간 annotation은 제외한다.
단건 detail의 env/envFrom/volume ConfigMap/Secret reference는 name/key/path만 남기고 값 자체는 남기지 않는다.
raw spec과 literal env value는 남기지 않는다.
Deployment, ReplicaSet, Pod status는 작은 요약만 남기고 raw object와 containerStatuses는 남기지 않는다.
Service selector 비교 결과는 selector와 matched Pod namespace/name만 남기고 raw Service/Pod object는 남기지 않는다.
metadata provider는 evidence job result의 1MiB JSON 제한을 넘길 위험을 줄이기 위해 큰 list를 제한한다.
먼저 top-level list 개수를 제한하고, 그래도 JSON byte 크기가 크면 JSON byte 크기가 가장 큰 list부터 추가로 줄인다.
단일 항목이 너무 크면 해당 top-level list는 0개까지 줄어들 수 있다.
top-level list가 잘리면 `change_context.collection_limits`에 원래 개수와 최종 반환 개수를 남긴다.
RCA evidence bundle에서는 `metadata:current_workload_snapshots`,
`metadata:service_selector_matches`, `metadata:endpoint_slice_ready_endpoints` item의
`value.collection_limit`에도 같은 제한 정보가 붙는다.
항목 내부의 `matched_pods`, `ready_targets`, `pod_statuses`, `replicaset_revisions`도 샘플로 제한하고,
각 항목에 count와 `*_truncated` flag를 남긴다.

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
| `metadata` bucket은 inner key 단위로 merge된다 | provider result가 `{"metadata": {"change_context": ...}}`를 보내도 기존 `metadata.rca_test`는 보존된다. `metadata.rca_test`는 RCA test run log 격리에 쓰는 값이므로 `release_context`에서 만든 값만 신뢰한다. |
| strict RCA test의 `metadata`는 namespace와 resource가 맞아야 한다 | `metadata.change_context` 안에서 찾은 namespace가 `release_context.namespace` 하나로만 구성되어야 한다. `release_context.resource_name`이 있으면 workload identity도 그 resource 하나와 같아야 한다. target namespace metadata나 같은 sandbox 안의 다른 Deployment metadata는 sandbox RCA test 증거로 승인되지 않는다. |

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
| Kubernetes warning/reason/message/reason_summary | `kubernetes.events[]` |
| node 상태와 capacity | `kubernetes.nodes[]` |
| workload replica 상태 | `kubernetes.workloads[]` |
| Service/endpoint 연결 | `kubernetes.services[]`, `kubernetes.endpoints[]` |
| metric sample/range | `metrics.results.*.samples`, `metrics.results.*.series` |
| log line | `logs[].streams[].values[].line` |
| trace search 결과 | `traces.results.*.traces` |
| 현재 workload snapshot 목록 | `metadata.change_context.current_workload_snapshots[]` |
| 현재 image/container ports/probe/resources/labels/status/PVC refs/auth/revision summary | `metadata.change_context.current_workload_snapshots[].containers[]`, `deployment_labels`, `pod_template_labels`, `pod_template_auth`, `persistent_volume_claim_refs`, `deployment_status`, `pod_statuses`, `replicaset_revisions` |
| Service selector와 Pod labels 매칭 결과 | `metadata.change_context.service_selector_matches[]` |
| EndpointSlice ready endpoint 요약 | `metadata.change_context.endpoint_slice_ready_endpoints[]` |
| ResourceQuota hard/used 요약 | `metadata.change_context.resource_quotas[]` |
| 참조된 ConfigMap/Secret 객체 metadata 요약 | `metadata.change_context.referenced_config_objects[]` |
| 특정 Deployment detail의 annotations/manager/scheduling/config refs/ReplicaSet conditions | `metadata.change_context.current_workload_snapshot.deployment_annotations`, `pod_template_annotations`, `managed_fields_managers`, `scheduling_constraints`, `containers[].env_refs`, `containers[].env_from_refs`, `containers[].volume_mount_refs`, `replicaset_revisions[].conditions` |

RCA evidence bundle builder는 `metadata.change_context.service_selector_matches[]`를
`metadata:service_selector_matches` item으로, `metadata.change_context.endpoint_slice_ready_endpoints[]`를
`metadata:endpoint_slice_ready_endpoints` item으로 승격한다. 그래서 Service selector/EndpointSlice 정보는
수집만 되고 버려지는 값이 아니라 RCA rule이 `metadata` source evidence로 직접 참고할 수 있는 값이다.

RCA가 판단하려면 다음 값은 파생해야 한다.

| 파생 값 | 파생에 쓸 필드 |
| --- | --- |
| `symptom` | `pods[].waiting_reasons`, `pods[].terminated_reasons`, `pods[].phase`, `events[].reason/message/reason_summary`, `workloads[].conditions` |
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
| `symptom` | `pods[].waiting_reasons`, `pods[].terminated_reasons`, `events[].reason/message/reason_summary`, `workloads[].conditions` |
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
| target namespace Deployment별 현재 image/container ports/probe/resources/labels/status/Pod status/PVC refs/ReplicaSet revision summary | 가능 | `change_context.current_workload_snapshots[]`를 쓴다. 전체 조회에는 annotations, config refs, manager, ReplicaSet conditions를 넣지 않는다. |
| 특정 Deployment 1개 detail snapshot | 가능 | `deployment/<name>` 또는 `deployment/<namespace>/<name>` query를 쓴다. 안전한 annotations, manager, ConfigMap/Secret references, ReplicaSet conditions를 추가로 제공한다. |
| recent git commit / deploy revision | 없음 | GitOps event, manifest render, SCM metadata 연결 |
| rollback 가능 여부 / risk_level | 없음 | 배포 이력, policy, GitOps/CI/CD 상태 연결 |
| previous/current image digest | 일부 가능 | Kubernetes `pods[].containers[].image_id`로 현재 image digest를 볼 수 있다. rollout history와 previous image는 아직 없다. |
| Deployment/Pod template annotations | 일부 가능 | 단건 detail에서 `ops.service/*`, `prometheus.io/*`, `deployment.kubernetes.io/*`, `kubectl.kubernetes.io/*` 중 안전한 key만 남긴다. |
| ConfigMap/Secret key reference | 가능 | 단건 detail에서 env/envFrom/volume reference name/key/path를 제공한다. 객체 metadata는 `referenced_config_objects[]`에서 별도로 제공한다. |
| ConfigMap/Secret object metadata summary | 가능 | 단건 detail의 `referenced_config_objects[]`에서 존재 여부, 접근 상태, 생성 시각, 안전한 labels, 참조 위치, 명시 참조 key 존재 여부를 제공한다. 값과 annotations는 제공하지 않는다. |
| resource requests/limits | 가능 | `containers[].resources.requests/limits`를 제공한다. |
| Deployment/ReplicaSet/Pod status conditions | 가능 | `deployment_status.conditions`와 `pod_statuses[].conditions`는 summary에도 있고, `replicaset_revisions[].conditions`는 단건 detail에만 있다. |
| Service selector와 Pod labels 매칭 결과 | 가능 | `service_selector_matches[]`에서 Service별 `match_status`, `matched_pod_count`, `matched_pods`를 제공한다. |
| EndpointSlice ready endpoint 요약 | 가능 | `endpoint_slice_ready_endpoints[]`에서 Service별 EndpointSlice ready/not ready count와 ready target Pod를 제공한다. endpoint IP address는 제공하지 않는다. |
| ResourceQuota hard/used 요약 | 가능 | `resource_quotas[]`에서 namespace quota 제한값과 현재 사용량을 제공한다. 권한이 없으면 빈 목록이다. |
| imagePullSecrets / serviceAccountName | 가능 | `metadata.change_context.current_workload_snapshots[].pod_template_auth`에서 Secret name, service account name, automount flag를 제공한다. Secret 값은 제공하지 않는다. |
| NetworkPolicy/Ingress | 없음 | Kubernetes provider 조회 resource 확장 |
| PVC refs | 가능 | `metadata.change_context.current_workload_snapshots[].persistent_volume_claim_refs[]`를 제공한다. PVC object 자체는 조회하지 않는다. |

### 현재 Kubernetes summary에 없는 값

Kubernetes provider는 raw object를 그대로 넘기지 않고 summary만 보낸다.
다음 값은 RCA에는 유용하지만 현재 summary에 없다.

| 없는 값 | 왜 필요한가 |
| --- | --- |
| Pod spec `containers[].resources.requests/limits` | scheduling failure, OOM, resource pressure confidence를 높인다. |
| Pod spec `env`, `envFrom`, `volumes`, `volumeMounts` | config/env/secret missing 후보를 확인한다. |
| container `lastState` raw payload | 현재 summary는 직전 state의 reason/message/exit code/time을 작은 필드로 제공한다. raw payload 전체는 아직 제공하지 않는다. |
| Deployment template image/env/resources | rollout과 현재 Pod spec의 관계를 확인한다. |
| ReplicaSet revision annotation/status | 특정 rollout revision에서만 문제가 났는지, 해당 ReplicaSet이 준비 상태인지 확인한다. |
| Endpoint readiness conditions | endpoint 개수만으로 ready endpoint 여부를 확정하기 어렵다. |
| Ingress, NetworkPolicy, PVC object | network, storage 계열 RCA에 필요하다. PVC refs는 metadata bucket에 있지만 PVC object summary는 아직 없다. |
| ConfigMap/Secret data 또는 diff | config 값 오류 확인에는 필요할 수 있지만 민감정보 위험과 과거 상태 의존성이 있어 현재 provider는 보내지 않는다. |
| Kubernetes raw object | summary 밖 필드를 임시로 확인하기 어렵다. |

## 자주 헷갈리는 필드

| 헷갈리는 표현 | 정확한 의미 |
| --- | --- |
| `cluster` | cluster metadata object다. cluster 갯수가 아니다. |
| `pods` | Pod summary object의 list다. Pod 갯수는 `len(pods)` 또는 `provider_status.*.counts.pods`다. |
| `events` | Event summary object의 list다. Event 갯수는 `len(events)` 또는 `provider_status.*.counts.events`다. |
| `logs` | query별 Loki result list다. 로그 라인은 `logs[].streams[].values[]` 안에 있고, line 값은 provider가 마스킹한 문자열이다. |
| `traces` | Tempo result bucket object다. trace 갯수는 `traces.results.*.trace_count`다. |
| `metrics.results` | query name을 key로 하는 object다. metric 값은 `samples[].value` 또는 `series[].values[].value`에 있다. |
| `raw` | provider API response 원본을 뜻한다. 현재 provider bucket에는 전체 raw payload를 기본으로 싣지 않는다. |
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
