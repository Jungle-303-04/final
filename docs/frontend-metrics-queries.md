# 콘솔 메트릭·쿼리 카탈로그

콘솔(`/metrics`, `/clusters/:id`, `/incidents/:id`)이 보여주는 모든 수치의 데이터 원천과
실제 실행되는 쿼리를 한곳에 모은 문서다. 표시되는 값은 전부 실측이며, 합성/추정 값은 없다.
프론트가 쓰는 쿼리를 바꾸면 이 문서도 같이 갱신한다.

## 1. 데이터 경로 3종

| 경로 | 지연 | 원천 | 콘솔 사용처 |
|---|---|---|---|
| 실시간 WS (`/api/live/browser`) | 초 단위 | cluster-agent snapshot → live-worker 요약 | 셸 LIVE 인디케이터, `/metrics` 실시간 차트 |
| 스냅샷 시계열 (`GET /clusters/{id}/usage`) | 30초 주기 | `cluster_usage_samples` 테이블 | `/metrics` 스냅샷 추이, `/clusters/:id`·홈 요약(`usage`) |
| 온디맨드 PromQL (`POST /agent/debug/query` → `GET /commands/{id}` 폴링) | 수 초(agent 왕복) | 클러스터 내부 Prometheus | `/metrics` 쿼리 카드 |

## 2. 스냅샷 usage 롤업 필드

원천: `src/domains/inventory/kubernetes_snapshot.py :: _usage_rollup` —
agent 가 실제 관측한 pod phase·재시작 수·node ready 만 집계한다(관측 0건이면 행 자체가 없음).

| 필드 | 의미 | 콘솔 표기 |
|---|---|---|
| `pod_total` / `pod_running` / `pod_pending` / `pod_failed` | phase 별 팟 수 | 실행 팟 시계열, StatBox |
| `restart_total` | 컨테이너 재시작 누적 합 | 재시작 누적 시계열, 홈 `restarts_recent`(최근 샘플 2개 델타) |
| `node_total` / `node_ready` | 노드 수/Ready 수 | 준비 노드 시계열, 클러스터 헬스 롤업 |
| `cpu_pct` / `mem_pct` | 실측 값이 있을 때만(없으면 None — 합성 금지) | 클러스터 상세 CPU/MEM % |

집계 규칙(헬스 롤업 포함)은 `src/domains/dashboard/fleet_router.py` 모듈 docstring 이 소스오브트루스다.

## 3. `/metrics` PromQL 프리셋

프리셋은 클러스터에 실제 배포된 수집 스택(node-exporter, kube-state-metrics, optional-node-collector)의
계열만 사용한다. 실행 시 `{source:"prometheus", query, range_seconds}` 로 발행되고 agent 가
range query(step = range/30 기본)로 실행해 결과를 커맨드 결과로 올린다.

| 프리셋 | PromQL | 단위 |
|---|---|---|
| 노드 CPU 사용률 | `1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))` | ratio → % 표기 |
| 노드 메모리 사용률 | `1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)` | ratio → % |
| 노드 파일시스템 사용률 | `1 - (node_filesystem_avail_bytes{fstype!~"tmpfs\|overlay",mountpoint="/var"} / node_filesystem_size_bytes{fstype!~"tmpfs\|overlay",mountpoint="/var"})` | ratio → % |
| 팟 재시작율 (5m, 네임스페이스별) | `sum by (namespace) (rate(kube_pod_container_status_restarts_total[5m]))` | count/s |
| 네임스페이스별 팟 수 | `count by (namespace) (kube_pod_info)` | count |
| sandbox 디플로이 레플리카 | `kube_deployment_status_replicas{namespace="sandbox"}` | count |

범위 선택: 5분/15분/1시간/6시간(`range_seconds` 300/900/3600/21600).
결과 카드는 series/points 수와 평균·최대를 단위에 맞게(%, 소수) 표기한다 — agent 가 올린 실측만 표시하고,
제출 실패/agent 실패는 각각 실패 배지 + 재시도 버튼으로 노출한다.

프리셋 정의: `frontend/src/features/metrics/MetricsView.tsx :: PRESETS` ·
요약 계산: `frontend/src/features/metrics/api.ts :: summarizeTelemetryResult`.

## 4. RCA 증거 수집 쿼리 (evidence provider 기본 정책)

원천: `src/domains/target/evidence_policy.py :: DEFAULT_EVIDENCE_PROVIDER_QUERIES` —
agent 정책(`agent_policies`)으로 배포되며, 운영 중 정책을 바꾸면 DB 가 우선한다(코드는 기본값).
인시던트 상세의 "판단에 사용된 근거" 트레일에 항목별로 아래 쿼리가 그대로 표시된다
(`/rca-reports` 응답 `supporting_evidence_refs[].query`).

### kubernetes (snapshot)

| name | query(네임스페이스) |
|---|---|
| `target_namespace_snapshot` | `target` — 관측 스택 자체 상태 |
| `sandbox_namespace_snapshot` | `sandbox` — 장애주입 워크로드. 이 snapshot 이 incident 탐지의 1차 입력 |

### metrics (Prometheus)

| name | query |
|---|---|
| `scrape_targets_up` | `up` |
| `target_pod_info` | `kube_pod_info{namespace="target"}` |
| `target_deployment_replicas` | `kube_deployment_status_replicas{namespace="target"}` |
| `node_cpu_usage_ratio` | `1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))` |
| `node_memory_usage_ratio` | `1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)` |
| `node_filesystem_usage_ratio` | `/var` 마운트 기준 사용률(위 3절과 동일식) |
| `node_collector_node_pod_count` | `node_collector_node_pod_count` (range 900s/step 30s) |
| `node_collector_node_not_ready_pod_count` | `node_collector_node_not_ready_pod_count` (range 900s/step 30s) |
| `node_collector_scrape_error` | `node_collector_scrape_error` |

### logs (Loki LogQL)

| name | query |
|---|---|
| `sandbox_namespace_errors` | `{k8s_namespace_name="sandbox"} \|~ "ERROR\|FATAL\|panic"` — RCA 근거 1차 소스 |
| `target_namespace_errors` | `{k8s_namespace_name="target"} \|= "ERROR"` |
| `node_collector_runtime_samples` | `{k8s_namespace_name="target", k8s_container_name="node-collector"} \|= "node_runtime_sample"` |
| `target_agent_warnings` | `{k8s_namespace_name="target", k8s_container_name="cluster-agent"} \|~ "WARN\|ERROR\|failed"` |

### traces (Tempo TraceQL)

| name | query |
|---|---|
| `application_error_spans` | `{ status = error }` |
| `target_agent_error_spans` | `{ resource.service.name = "target-cluster-agent" && status = error }` |
| `target_agent_recent_spans` | `{ resource.service.name = "target-cluster-agent" }` |
| `management_gateway_spans` | `{ resource.service.name = "api-gateway" }` |

## 5. 인시던트 상세가 노출하는 분석 필드

`GET /rca-reports` 화이트리스트 요약(`src/domains/rca/query_router.py :: rca_report_summary`)이 원천이다.

- 대상 리소스: `namespace/resource_kind/resource_name`
- 대표 증상 + `secondary_symptoms`(snapshot 에서 함께 관측된 신호 — 유도 과정에서 손실 방지)
- 후보 평가: 후보(YAML 룰 카탈로그 `src/services/ai/agent/causes/catalog/*.yaml` 또는 AI fallback)별
  점수(0~1)·판단 사유·충족(✓)/미충족(✗) 증거 — `selected_candidate_id` 가 최종 선정
- 근거 트레일: `supporting_evidence_refs[]` — source(kubernetes/prometheus/loki/tempo)·name·요약·**실행 쿼리**
- 미수집 체크: `missing_evidence_checks[]` — 확정에 필요하지만 아직 없는 근거와 사유

후보 `signals` DSL 원문과 evidence payload 원문은 API 로 내리지 않는다(secret 유출 방지 화이트리스트).
원문 증거는 같은 화면의 증거 패널(`GET /evidence?correlation_id=`)에서 kind 필터로 확인한다.

## 6. 재현/디버깅 방법

- 콘솔과 동일한 PromQL 을 직접 실행: 클러스터 안에서 `kubectl -n monitoring port-forward svc/prometheus ...` 후 위 표의 식 사용.
- agent 쿼리 왕복 확인: `POST /agent/debug/query` 응답의 `command_id` 로 `GET /commands/{id}` 를 폴링(Bruno: `docs/api/04-telemetry-debug/`).
- 장애 주입으로 RCA 근거 트레일 생성: `TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh inject <fault>` → `/incidents` 에서 확인.
