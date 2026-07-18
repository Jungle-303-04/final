# Demo 01: Digital Twin Agent Town

목표: Krafton Jungle 발표 현장을 닮은 2D 디지털 트윈 맵에서 수백~수천 명의
agent가 이동하고 대화하는 장면을 보여주고, 특정 이벤트로 발생한 부하를 우리
Kubernetes 운영 자동화 콘솔이 감지, 분석, 확장, 회복시키는 과정을 시연한다.

이 데모는 실제 MMORPG나 완전한 Generative Agents 구현이 아니다. 발표용으로
통제 가능한 synthetic workload다. 다만 화면은 AI town처럼 보이고, 부하는 실제
Kubernetes workload에서 발생한다.

## 한 문장 설명

"지금 발표가 열리는 행사장을 디지털 트윈으로 만들고, 사람들이 메인 발표장으로
몰리면서 생기는 트래픽과 AI 대화 부하를 Kubernetes에서 자동으로 관측하고
복구하는 모습을 보여준다."

## 왜 이 데모인가

기존 쇼핑몰 장애 데모는 Kubernetes 운영 자동화의 흐름을 설명하기 좋지만, 관객이
눈으로 체감하는 장면이 약하다. 이 데모는 다음 효과를 노린다.

- 관객이 있는 실제 행사장을 닮은 맵을 사용해 즉시 몰입시킨다.
- "사람이 몰린다 -> 서비스 부하가 오른다 -> 우리 시스템이 조치한다"는 인과를
  비전문가도 이해할 수 있다.
- 게임, AI, Kubernetes 운영 자동화가 한 화면에 연결된다.
- Agones 같은 게임 전용 operator 없이도 범용 Kubernetes 자동화 도구라는 메시지를
  유지한다.
- 이후 게임 서버 운영 모델로 확장하면 Agones Fleet/FleetAutoscaler에도 붙일 수
  있다는 후속 설명이 가능하다.

## 데모의 정직한 포지셔닝

발표에서 반드시 이렇게 설명한다.

"이 화면은 실제 게임 서버가 아니라 발표용 synthetic workload입니다. 하지만
부하, queue, Pod scale, recovery는 Kubernetes에서 실제로 일어납니다. 우리는
이런 게임형/AI형 워크로드뿐 아니라 일반 서비스에도 같은 방식으로 관측과 복구를
적용할 수 있습니다."

## 전체 시나리오

### 배경

Krafton Jungle 최종 발표일. 행사장에는 주차장, 입구, 등록 데스크, 로비, 부스존,
메인홀, 소강의실, 오버플로우 룸, 카페존, 네트워킹 존이 있다. 수백 명의 agent가
각 공간에 흩어져 있고 일부 hero agent는 이름, 역할, 목표, 대화 로그를 가진다.

### 핵심 사건

"메인 발표 3분 후 시작" 이벤트가 발생한다. 외부와 로비에 있던 agent들이 메인홀로
이동한다. 메인홀 앞 대기열이 길어지고, 메인홀 담당 simulation server의 tick lag와
queue depth가 증가한다. 동시에 hero agent들이 서로 대화하거나 질문을 생성하면서
LLM worker 부하가 증가한다.

우리 콘솔은 `main-hall-sim`과 `agent-queue-worker`의 부하를 감지하고 RCA를 만든다.
운영자는 제안된 조치를 승인한다. 시스템은 `main-hall-sim` replica를 1에서 3으로
늘리고, `agent-queue-worker` replica를 1에서 4로 늘린다. 맵에는 오버플로우 룸과
분산 포탈이 열리고, agent가 메인홀, 오버플로우 룸, 부스존으로 분산된다. heatmap이
빨간색에서 초록색으로 회복되고 p95 latency와 tick lag가 내려간다.

## 발표장에서 보이는 흐름

1. 화면에 Krafton Jungle 교육장 스타일의 2D 맵이 보인다.
2. 주차장, 입구, 로비, 부스존, 강의실 앞에 agent들이 흩어져 있다.
3. 오른쪽 패널에는 현재 인구, queue depth, tick lag, Pod replica 상태가 보인다.
4. 발표자가 "메인 발표 시작" 이벤트를 누른다.
5. agent들이 주차장, 입구, 로비에서 메인홀로 몰린다.
6. 일부 agent 위에 말풍선이 뜬다.
7. 메인홀 앞 heatmap이 노란색에서 빨간색으로 변한다.
8. 메인홀 담당 Pod CPU, queue depth, p95 latency, tick lag가 상승한다.
9. 우리 콘솔이 incident를 만들고 RCA와 recovery proposal을 보여준다.
10. 발표자가 "Approve"를 누른다.
11. Kubernetes에서 replica가 증가한다.
12. 맵에 오버플로우 룸 포탈이 열린다.
13. agent 일부가 오버플로우 룸과 부스존으로 분산된다.
14. heatmap이 초록색으로 회복된다.
15. 콘솔에서 incident가 resolved로 전환된다.

## 시각적 구성

### 메인 화면

```text
+----------------------------------------------------------+----------------------+
|                                                          | Demo Control         |
|       2D Digital Twin Map                                | - Start main talk    |
|                                                          | - Trigger booth rush |
|   parking -> entrance -> lobby -> main hall              | - Open overflow      |
|       |          |          |          |                 | - Reset scenario     |
|       v          v          v          v                 |                      |
|   agents      agents     agents     queue/heatmap         | Metrics              |
|                                                          | - main hall: 812     |
|   booths      cafe       networking  overflow             | - queue: 4,800       |
|                                                          | - tick lag: 730ms    |
|                                                          | - p95: 1.8s          |
|                                                          | - pods: 1 -> 3       |
+----------------------------------------------------------+----------------------+
| Selected Agent: Mina / Backend engineer / moving to main hall                    |
| Dialogue: "The line is too long. I will move to the overflow room."              |
+---------------------------------------------------------------------------------+
```

### 맵 영역

- 주차장: 늦게 도착한 agent가 모이는 시작 지점.
- 입구: 체크인 queue가 생기는 지점.
- 등록 데스크: queue worker 부하와 연결되는 지점.
- 로비: 가장 많은 agent가 머무르는 중립 공간.
- 부스존: 크래프톤/후원사 부스 이벤트를 만들 수 있는 공간.
- 메인홀: 핵심 과부하 지점.
- 소강의실 A/B/C: 평상시 분산 공간.
- 오버플로우 룸: scale 이후 열리는 분산 공간.
- 카페존: 점심/휴식 이벤트 지점.
- 네트워킹 존: LLM 대화 부하 이벤트 지점.

### agent 표현

- 일반 agent: 작은 2D 아바타 또는 단순 sprite.
- hero agent: 이름, 직업, 목표, 말풍선, 선택 가능한 상세 패널을 가진다.
- system guide agent: 운영자의 조치 결과를 설명하는 안내 캐릭터. 예: "Overflow
  room is now open."

### 말풍선 예시

- "메인 발표 곧 시작한대요."
- "입장 줄이 길어졌어요."
- "오버플로우 룸으로 이동할게요."
- "부스존은 아직 여유 있어요."
- "질문을 정리하고 있어요."
- "네트워킹 세션에서 만나요."
- "메인홀 포화, B룸으로 분산합니다."

## 이벤트 설계

### Event 01: 메인 발표 시작

가장 중요한 발표용 메인 이벤트다.

- 트리거: 운영자가 `Start Main Talk` 버튼 클릭.
- 시각 효과: agent가 주차장, 입구, 로비, 부스존에서 메인홀로 이동.
- 부하 효과:
  - `main-hall-sim` CPU 상승.
  - `main-hall-sim` tick lag 상승.
  - `agent-event-queue` queue depth 상승.
  - gateway websocket message rate 상승.
- 복구 조치:
  - `main-hall-sim` replicas 1 -> 3.
  - `agent-queue-worker` replicas 1 -> 4.
  - 오버플로우 룸 포탈 open.
- 성공 장면:
  - agent가 `main-hall-a`, `main-hall-b`, `overflow-room`으로 분산.
  - heatmap 회복.
  - p95 latency와 tick lag 감소.

### Event 02: 크래프톤 부스 이벤트

게임 회사 관객에게 잘 먹히는 보조 이벤트다.

- 트리거: `Krafton Booth Event` 버튼 클릭.
- 시각 효과: 부스존에 agent가 몰림.
- 부하 효과:
  - `booth-zone-sim` CPU 상승.
  - agent-to-agent 대화 수 증가.
  - hero agent의 질문/대화 생성 job 증가.
- 복구 조치:
  - `llm-worker` replicas 1 -> 3.
  - `booth-zone-sim` replicas 1 -> 2.
- 성공 장면:
  - 부스존 말풍선 증가.
  - LLM queue backlog 감소.

### Event 03: 네트워킹 세션

AI 데모 성격을 강화하는 이벤트다.

- 트리거: `Networking Session` 버튼 클릭.
- 시각 효과: agent가 작은 그룹으로 모여 대화.
- 부하 효과:
  - 대화 job 증가.
  - `llm-worker` 평균 응답시간 증가.
  - Redis queue 증가.
- 복구 조치:
  - `llm-worker` scale.
  - scripted dialogue fallback 활성화.
- 성공 장면:
  - hero agent 대화는 유지되고 backlog가 감소.

### Event 04: 점심시간

운영 부하를 직관적으로 보여주는 이벤트다.

- 트리거: `Lunch Break` 버튼 클릭.
- 시각 효과: 카페존과 외부 공간으로 agent 이동.
- 부하 효과:
  - `cafe-zone-sim` queue depth 상승.
  - DB write 증가.
- 복구 조치:
  - `cafe-zone-sim` scale.
  - 입장 throttling 표시.

### Event 05: 긴급 공지

WebSocket broadcast 부하를 보여주는 이벤트다.

- 트리거: `Broadcast Notice` 버튼 클릭.
- 시각 효과: 모든 agent 위에 잠깐 알림 표시.
- 부하 효과:
  - gateway messages/sec 상승.
  - websocket payload/sec 상승.
- 복구 조치:
  - `gateway` replicas 1 -> 2.
  - broadcast interval 완화.

## 구현 원칙

### 반드시 실제로 구현할 것

- 2D 맵과 agent 이동.
- agent가 특정 이벤트에 반응해 구역 이동.
- 일부 agent의 말풍선과 상세 패널.
- WebSocket 또는 SSE 기반 실시간 상태 전송.
- district별 backend Deployment.
- 실제 CPU/queue/tick lag 지표 발생.
- Kubernetes scale action으로 replica 증가.
- scale 후 frontend에서 회복처럼 보이는 상태 변화.

### 구현하지 않을 것

- 완전한 MMO 서버.
- agent 1000명의 실제 LLM reasoning.
- 영구 월드 상태 동기화.
- 복잡한 pathfinding.
- 실제 사용자 로그인/인증.
- 실제 행사장 좌표와 정밀 실내지도.
- Agones CRD/Fleet 정식 도입.

### 데모의 "가짜"와 "진짜"

진짜:

- Kubernetes Deployment/Service/ConfigMap.
- Pod CPU/Memory/replica 변화.
- queue depth metric.
- tick lag metric.
- gateway broadcast.
- 우리 콘솔의 incident/RCA/recovery flow.

통제된 연출:

- 1000명 전체의 지능.
- 일부 agent 대화.
- heatmap 색상.
- scale 후 agent 분산 정책.
- LLM 응답 일부.

## 시스템 아키텍처

```text
Browser Demo UI
  - PixiJS/Canvas map
  - agent sprites
  - heatmap
  - event buttons
  - selected agent panel
  - live metrics panel

Gateway
  - WebSocket/SSE endpoint
  - aggregates district states
  - broadcasts agent positions and metrics
  - exposes demo control API

District Sim
  - one Deployment per district
  - DISTRICT=main-hall, lobby, parking, booth-zone...
  - owns agent movement/state for that district
  - emits tick_lag, population, queue_depth
  - can enter overload mode

Queue / Redis
  - agent event queue
  - dialogue job queue
  - load buffer

LLM Worker
  - generates selected hero agent dialogue
  - mostly replay/scripted for stability
  - optional real LLM mode

Loadgen / Event Controller
  - triggers crowd rush
  - creates synthetic queue and CPU load
  - resets scenario state

Kubernetes
  - Deployment/Service/ConfigMap
  - HPA optional
  - manual scale through our console
  - evidence collection

Our Console
  - cluster observation
  - incident detection
  - RCA
  - recovery proposal
  - approval
  - command execution
```

## Kubernetes 리소스 모델

Namespace: `sandbox`

### Deployments

- `agent-town-frontend`
  - serves static frontend.
  - replicas: 1.
  - public service or ingress.

- `agent-town-gateway`
  - WebSocket/SSE and API gateway.
  - replicas: 1 initially, can scale to 2.
  - resource requests: low CPU, moderate memory.

- `district-sim-main-hall`
  - main overload target.
  - replicas: 1 initially, scale to 3.
  - env `DISTRICT=main-hall`.

- `district-sim-lobby`
  - stable background traffic.
  - replicas: 1.
  - env `DISTRICT=lobby`.

- `district-sim-parking`
  - agent source before event.
  - replicas: 1.
  - env `DISTRICT=parking`.

- `district-sim-booth-zone`
  - booth rush target.
  - replicas: 1 initially, scale to 2.
  - env `DISTRICT=booth-zone`.

- `district-sim-cafe-zone`
  - lunch event target.
  - replicas: 1.
  - env `DISTRICT=cafe-zone`.

- `agent-queue-worker`
  - consumes event jobs.
  - replicas: 1 initially, scale to 4.

- `llm-worker`
  - consumes dialogue jobs.
  - replicas: 1 initially, scale to 3.
  - default mode: scripted/replay.

- `agent-town-loadgen`
  - optional internal load generator.
  - can be a Deployment or CronJob.

### Services

- `agent-town-frontend`
- `agent-town-gateway`
- `district-sim-main-hall`
- `district-sim-lobby`
- `district-sim-parking`
- `district-sim-booth-zone`
- `district-sim-cafe-zone`
- `agent-queue-worker`
- `llm-worker`
- `redis`

### ConfigMaps

- `agent-town-map-config`
  - district bounds.
  - portal zones.
  - spawn points.
  - event routes.

- `agent-town-scenario-config`
  - event definitions.
  - target population distribution.
  - overload thresholds.
  - recovery thresholds.

- `agent-town-dialogue-pack`
  - scripted dialogue lines.
  - hero agent personas.

## 기존 제품과의 연결

### 현재 시스템에서 바로 가능한 것

- Deployment/Service/ConfigMap GitOps 배포.
- Kubernetes inventory/evidence 수집.
- Pod 상태, replica, restart 관측.
- Deployment scale command.
- Recovery proposal에 `deployment_scale` 액션 사용.

### 추가로 필요한 것

- `deploy/target/target.yaml` Role에 `deployments/scale` 권한 추가.
- sandbox evidence policy가 `agent-town-*` workloads를 보도록 설정.
- Prometheus scrape annotation 또는 ServiceMonitor equivalent 설정.
- incident rule 또는 builtin recovery rule 추가:
  - `agent_town_main_hall_overload`.
  - `agent_town_queue_backlog`.
  - `agent_town_llm_worker_saturation`.

### GitOps 지원 범위

현재 GitOps 계약은 Deployment, Service, ConfigMap 중심이다. 이 Demo 01은 일부러
그 범위 안에서 시작한다. Agones, CRD, custom controller는 Phase 2 이후로 미룬다.

## 관측 메트릭

### frontend/gateway

- `agent_town_ws_clients`
- `agent_town_ws_messages_total`
- `agent_town_ws_payload_bytes_total`
- `agent_town_broadcast_latency_ms`

### district-sim

- `agent_town_district_population{district}`
- `agent_town_district_tick_lag_ms{district}`
- `agent_town_district_events_total{district,type}`
- `agent_town_district_queue_depth{district}`
- `agent_town_district_capacity{district}`
- `agent_town_district_congestion_ratio{district}`

### queue worker

- `agent_town_event_queue_depth`
- `agent_town_event_jobs_processed_total`
- `agent_town_event_job_oldest_age_seconds`
- `agent_town_event_processing_rate`

### llm worker

- `agent_town_llm_jobs_total`
- `agent_town_llm_queue_depth`
- `agent_town_llm_response_time_ms`
- `agent_town_llm_fallback_total`
- `agent_town_llm_tokens_total`

### Kubernetes

- `container_cpu_usage_seconds_total`
- `container_memory_working_set_bytes`
- `kube_deployment_status_replicas`
- `kube_deployment_status_replicas_available`
- `kube_pod_container_status_restarts_total`
- `kube_pod_status_phase`

## 부하 기준과 threshold

### 정상 상태

- main hall population: 100-200.
- queue depth: 0-500.
- tick lag: < 120ms.
- p95 latency: < 300ms.
- main hall CPU: < 55%.
- llm queue depth: < 20.

### 주의 상태

- main hall population: 400-600.
- queue depth: 1,000-3,000.
- tick lag: 250-500ms.
- p95 latency: 800ms-1.2s.
- main hall CPU: 70-85%.
- llm queue depth: 50-100.

### 장애 상태

- main hall population: 700+.
- queue depth: 4,000+.
- tick lag: 700ms+.
- p95 latency: 1.5s+.
- main hall CPU: 90%+ for 60 seconds.
- oldest job age: 30s+.

### 회복 상태

- tick lag < 180ms.
- p95 latency < 500ms.
- queue depth decreasing for 30 seconds.
- available replicas == desired replicas.
- incident marked resolved.

## Recovery proposal 설계

### Main hall overload

조건:

- `agent_town_district_congestion_ratio{district="main-hall"} > 0.85`
- `agent_town_district_tick_lag_ms{district="main-hall"} > 600`
- `agent_town_event_queue_depth > 3000`
- `district-sim-main-hall` CPU > 85%

제안:

```json
{
  "title": "Scale main hall simulation and queue workers",
  "actions": [
    {
      "type": "deployment_scale",
      "namespace": "sandbox",
      "name": "district-sim-main-hall",
      "replicas": 3
    },
    {
      "type": "deployment_scale",
      "namespace": "sandbox",
      "name": "agent-queue-worker",
      "replicas": 4
    }
  ],
  "expected_result": "Main hall tick lag and event backlog should recover within 30-60 seconds."
}
```

### LLM worker saturation

조건:

- `agent_town_llm_queue_depth > 80`
- `agent_town_llm_response_time_ms > 3000`
- `llm-worker` CPU > 80%

제안:

```json
{
  "title": "Scale dialogue workers and enable scripted fallback",
  "actions": [
    {
      "type": "deployment_scale",
      "namespace": "sandbox",
      "name": "llm-worker",
      "replicas": 3
    },
    {
      "type": "configmap_patch",
      "namespace": "sandbox",
      "name": "agent-town-scenario-config",
      "patch": {
        "LLM_FALLBACK_MODE": "scripted"
      }
    }
  ],
  "expected_result": "Hero agent dialogue remains responsive while the backlog drains."
}
```

Phase 1에서는 `configmap_patch`가 현재 제품에 없다면 이 액션은 설명용으로만 두고,
실제 실행은 `deployment_scale` 하나만 한다.

## API 설계

### Gateway

`GET /healthz`

- readiness/liveness check.

`GET /api/state`

- 현재 simulation snapshot 반환.

`GET /api/metrics`

- frontend용 compact metric 반환.

`POST /api/events/main-talk`

- 메인 발표 시작 이벤트.

`POST /api/events/booth-rush`

- 부스 이벤트.

`POST /api/events/networking`

- 네트워킹 이벤트.

`POST /api/events/reset`

- 초기 상태로 리셋.

`GET /ws`

- agent positions, metrics, incident hints를 실시간 전송.

### District Sim

`GET /healthz`

`GET /metrics`

- Prometheus format.

`POST /internal/event`

- district event 수신.

`POST /internal/assign`

- agent assignment 수신.

## WebSocket 메시지 설계

### Snapshot

```json
{
  "type": "snapshot",
  "time": 1720000000000,
  "agents": [
    {
      "id": "agent-001",
      "x": 120,
      "y": 340,
      "district": "lobby",
      "kind": "general"
    }
  ],
  "districts": {
    "main-hall": {
      "population": 180,
      "capacity": 400,
      "tickLagMs": 80,
      "queueDepth": 220,
      "congestion": 0.45,
      "replicas": 1
    }
  }
}
```

### Agent dialogue

```json
{
  "type": "dialogue",
  "agentId": "hero-mina",
  "text": "The main hall is crowded. I will move to the overflow room.",
  "ttlMs": 5000
}
```

### Event

```json
{
  "type": "event",
  "name": "main-talk-started",
  "severity": "warning",
  "message": "Main talk starts in 3 minutes. Agents are moving to the main hall."
}
```

### Recovery

```json
{
  "type": "recovery",
  "name": "overflow-opened",
  "message": "Overflow room is now open. New agents are being routed away from the main hall."
}
```

## Agent 모델

### 일반 agent

```json
{
  "id": "agent-0421",
  "kind": "general",
  "homeDistrict": "parking",
  "currentDistrict": "lobby",
  "targetDistrict": "main-hall",
  "state": "moving",
  "speed": 1.2,
  "interest": "backend",
  "patience": 0.7
}
```

### Hero agent

```json
{
  "id": "hero-mina",
  "kind": "hero",
  "name": "Mina",
  "role": "Backend engineer",
  "goal": "Attend the main demo and ask about Kubernetes recovery",
  "currentDistrict": "lobby",
  "state": "moving_to_main_hall",
  "dialogueMode": "scripted_or_llm",
  "recentDialogue": [
    "I want to see how the platform recovers overloaded services."
  ]
}
```

## 이동/포탈 규칙

Phase 1은 정교한 pathfinding을 하지 않는다. district 간 route graph와 몇 개의 waypoint만
사용한다.

```text
parking -> entrance -> registration -> lobby -> main-hall
lobby -> booth-zone
lobby -> cafe-zone
lobby -> networking-zone
main-hall -> overflow-room
booth-zone -> networking-zone
```

포탈은 특정 사각형 trigger zone이다.

```json
{
  "id": "portal-lobby-main-hall",
  "from": "lobby",
  "to": "main-hall",
  "bounds": { "x": 540, "y": 220, "w": 64, "h": 96 },
  "enabled": true
}
```

scale 후 오버플로우 포탈을 활성화한다.

```json
{
  "id": "portal-main-hall-overflow",
  "from": "main-hall",
  "to": "overflow-room",
  "enabledWhen": "mainHallCongestion > 0.8 || recoveryInProgress"
}
```

## 맵 제작

### 추천 방식

Phase 1에서는 Tiled보다 코드 기반 tile/grid 맵을 추천한다. 이유는 빠르고, 수정이 쉽고,
발표용으로 충분히 예쁘게 만들 수 있기 때문이다.

Phase 2에서는 Tiled로 전환한다.

### Phase 1 맵

- SVG나 Canvas로 배경 레이어 생성.
- 구역은 고정 사각형/다각형.
- 각 구역에 이름 라벨, capacity, heatmap overlay.
- agent는 sprite atlas 또는 간단한 2D 캐릭터.

### Phase 2 맵

- Tiled `.tmx` 또는 JSON tilemap.
- layer:
  - `floor`
  - `walls`
  - `objects`
  - `portals`
  - `spawn_points`
  - `district_bounds`
  - `labels`

### Krafton Jungle 교육장 스타일링

실제 도면을 정밀하게 복제하지 않는다. 발표장을 연상시키는 구성만 쓴다.

- `Main Hall`
- `Jungle Classroom A`
- `Jungle Classroom B`
- `Krafton Booth`
- `AI Demo Booth`
- `Check-in`
- `Parking`
- `Cafe`
- `Networking`
- `Overflow Room`

## 구현 단계

### Phase 0: 제품 준비

목표: 현재 제품이 scale action을 실제로 수행할 수 있게 만든다.

작업:

1. target agent RBAC에 `deployments/scale` subresource 권한 추가.
2. sandbox namespace에 대한 evidence policy 확인.
3. Deployment scale command가 실제 target cluster에서 동작하는지 리허설.
4. recovery builtin에 `agent_town_main_hall_overload` rule 추가 여부 결정.
5. 콘솔에서 scale command 상태가 잘 보이는지 확인.

성공 기준:

- `kubectl auth can-i patch deployments/scale -n sandbox --as system:serviceaccount:target:cluster-agent` equivalent가 통과한다.
- 콘솔에서 `district-sim-main-hall` scale 1 -> 3이 보인다.

### Phase 1: 화면 MVP

목표: 발표장에서 "살아 있는 행사장 맵"처럼 보이게 한다.

작업:

1. `agent-town-frontend` 생성.
2. 2D map layout 구현.
3. 500-1000 agent 렌더링.
4. agent 이동 애니메이션 구현.
5. heatmap overlay 구현.
6. 이벤트 버튼 구현.
7. hero agent 10명과 말풍선 구현.
8. selected agent panel 구현.
9. mock metric panel 구현.

성공 기준:

- 브라우저에서 60fps에 가깝게 agent가 움직인다.
- `Start Main Talk` 클릭 후 agent가 메인홀로 몰린다.
- heatmap과 metric panel이 변화한다.

### Phase 2: backend simulation

목표: 화면 변화가 실제 backend 상태와 연결되게 한다.

작업:

1. `agent-town-gateway` 구현.
2. WebSocket/SSE 구현.
3. `district-sim` 구현.
4. district별 env로 다른 인구/부하를 담당하게 한다.
5. `agent-event-queue` 구현. Redis가 있으면 Redis, 없으면 in-memory로 시작.
6. `agent-queue-worker` 구현.
7. `/metrics` endpoint 구현.
8. frontend를 mock에서 live mode로 전환.

성공 기준:

- district-sim이 Prometheus metric을 노출한다.
- main talk 이벤트로 실제 queue depth와 tick lag가 증가한다.
- frontend가 gateway live state를 표시한다.

### Phase 3: Kubernetes 배포

목표: 모든 demo component를 target cluster에 배포한다.

작업:

1. `src/samples/scenarios/agent-town/` 또는 별도 demo repo에 manifest 작성.
2. Deployment/Service/ConfigMap 작성.
3. resource requests/limits 설정.
4. Prometheus scrape annotation 추가.
5. GitOps 배포 경로 연결.
6. LoadBalancer/Ingress/port-forward 중 발표 방식 결정.

성공 기준:

- `sandbox` namespace에서 모든 Pod Ready.
- frontend URL 접속 가능.
- 콘솔 inventory에서 `agent-town-*` 리소스가 보인다.

### Phase 4: 부하와 incident 연결

목표: 우리 콘솔이 이 데모의 문제를 감지하고 복구 제안을 보여준다.

작업:

1. overload metric threshold 정의.
2. incident-worker 또는 recovery builtin rule 추가.
3. RCA template 작성.
4. recovery proposal에 scale action 연결.
5. 승인 후 command가 target agent를 통해 실행되는지 확인.
6. frontend가 replica 증가를 감지해 회복 연출을 시작하도록 연결.

성공 기준:

- `Start Main Talk` 후 incident가 생성된다.
- recovery proposal이 `district-sim-main-hall` scale을 제안한다.
- 승인 후 replicas가 증가한다.
- frontend에서 오버플로우 룸이 열리고 지표가 회복된다.

### Phase 5: 발표 리허설

목표: 발표자가 한 번도 터지지 않고 5분 안에 끝낼 수 있게 만든다.

작업:

1. reset script 작성.
2. happy path 리허설 5회.
3. 네트워크가 느린 경우 fallback recording 준비.
4. incident 생성이 늦는 경우 수동 command fallback 준비.
5. frontend URL, console URL, kubectl 확인 명령 정리.

성공 기준:

- 5회 중 5회 성공.
- scale 후 10-30초 안에 회복 장면이 보인다.
- 실패 시 30초 안에 플랜B로 전환 가능.

## 추천 디렉터리 구조

```text
src/samples/agent-town/
  frontend/
    package.json
    src/
      App.tsx
      map/
      agents/
      panels/
      websocket.ts
  gateway/
    package.json
    src/
      server.ts
      state.ts
      events.ts
      metrics.ts
  district-sim/
    package.json
    src/
      server.ts
      simulation.ts
      load.ts
      metrics.ts
  worker/
    package.json
    src/
      queue-worker.ts
      llm-worker.ts
  k8s/
    namespace.yaml
    configmap.yaml
    redis.yaml
    frontend.yaml
    gateway.yaml
    district-main-hall.yaml
    district-lobby.yaml
    district-parking.yaml
    district-booth-zone.yaml
    workers.yaml
  scripts/
    run-local.sh
    build-images.sh
    deploy.sh
    reset.sh
    trigger-main-talk.sh
```

## 발표 스크립트

### 0:00 - 소개

"오늘은 쇼핑몰이 아니라, 지금 이 발표장이 그대로 들어간 디지털 트윈 데모를
보여드리겠습니다. 화면의 각 사람은 agent이고, 각 구역은 Kubernetes workload에
연결되어 있습니다."

### 0:30 - 정상 상태

"평상시에는 주차장, 로비, 부스존, 강의실 앞에 사람들이 분산되어 있습니다. 오른쪽을
보면 각 구역의 인구, queue, latency가 안정적입니다."

### 1:00 - 이벤트 발생

"이제 메인 발표가 곧 시작된다고 가정하겠습니다."

버튼: `Start Main Talk`.

"주차장과 로비, 부스존에 있던 agent들이 메인홀로 이동합니다. 실제 서비스에서는
이런 이동이 특정 API, WebSocket broadcast, queue, worker 부하로 나타납니다."

### 1:45 - 장애 관측

"메인홀 앞이 빨갛게 변하고 있습니다. 오른쪽 지표를 보면 tick lag, queue depth,
p95 latency가 올라갑니다."

콘솔 전환:

"우리 콘솔에서는 이 현상을 특정 Pod 문제로만 보지 않고, 메인홀 simulation workload에
트래픽이 집중된 상황으로 분석합니다."

### 2:30 - RCA와 제안

"RCA는 main-hall-sim의 CPU와 queue backlog, tick lag 증가를 근거로 main hall overload를
원인으로 제시합니다. 복구 제안은 main-hall-sim과 queue-worker scale out입니다."

### 3:00 - 승인

버튼: `Approve`.

"승인하면 target cluster의 Deployment scale action이 실행됩니다."

### 3:30 - 회복

"Pod가 늘어나면서 오버플로우 룸이 열리고, agent가 분산됩니다. heatmap이 회복되고
latency와 tick lag가 내려갑니다."

### 4:15 - 제품 메시지

"이 데모는 게임처럼 보이지만 핵심은 범용 Kubernetes 운영 자동화입니다. 어떤 workload든
관측 가능한 신호와 복구 action으로 연결하면, 우리 시스템이 같은 방식으로 문제를
감지하고 조치할 수 있습니다."

## 리허설 체크리스트

- frontend URL 접속 가능.
- console URL 접속 가능.
- target cluster connected.
- `sandbox` namespace clean.
- `agent-town-*` Pods Ready.
- Prometheus metric scrape 확인.
- `Start Main Talk` 이벤트 정상 동작.
- incident 생성 시간 측정.
- recovery proposal 생성 확인.
- approve 후 scale command 성공.
- frontend recovery animation 확인.
- reset script 성공.

## 플랜B

### incident 생성이 늦는 경우

- 콘솔에서 수동 scale command 화면으로 이동한다.
- "감지 주기가 있어 incident가 곧 생성되지만, 같은 action을 직접 승인해 보겠습니다"라고 설명한다.

### scale command가 실패하는 경우

터미널에서 직접 실행한다.

```bash
kubectl --context game-server -n sandbox scale deploy/district-sim-main-hall --replicas=3
kubectl --context game-server -n sandbox scale deploy/agent-queue-worker --replicas=4
```

설명:

"지금 수동으로 실행한 명령은 우리 콘솔의 recovery action과 동일한 Kubernetes scale
operation입니다."

### frontend live 연결이 끊긴 경우

- frontend를 demo replay mode로 전환한다.
- console과 kubectl로 실제 scale을 보여준다.

### LLM API가 실패하는 경우

- scripted dialogue fallback을 사용한다.
- "발표 안정성을 위해 hero agent 대화는 replay/fallback이 가능하게 설계했습니다"라고 설명한다.

## 구현 난이도 평가

### 낮음

- 2D 맵 정적 배경.
- agent 랜덤/목표 이동.
- 말풍선.
- 이벤트 버튼.
- heatmap.
- Deployment scale.

### 중간

- WebSocket 상태 동기화.
- district-sim Pod 분리.
- Prometheus metrics.
- 우리 콘솔 incident rule 연결.
- recovery proposal 자동 생성.

### 높음

- 실제 LLM 대화 품질.
- 1000명 이상 고성능 렌더링 최적화.
- 자연스러운 crowd movement.
- 실제 지도/도면과 유사한 맵 디자인.
- 발표 중 항상 같은 타이밍으로 incident 생성.

### 하지 말아야 할 고난이도 범위

- 완전한 Generative Agents memory/planning loop.
- 전체 agent LLM reasoning.
- 진짜 MMO 서버.
- custom Kubernetes controller.
- Agones CRD 도입.
- 정밀 실내 내비게이션.

## 예상 구현 일정

### 1일차

- frontend map prototype.
- agent 500명 렌더링.
- main talk event.
- heatmap/metric mock.

### 2일차

- gateway WebSocket.
- district-sim basic server.
- queue/tick lag metric.
- frontend live state 연결.

### 3일차

- Kubernetes manifest.
- sandbox 배포.
- Prometheus scrape.
- scale command 리허설.

### 4일차

- incident/recovery rule 연결.
- RCA 문구 정리.
- console flow 리허설.

### 5일차

- 맵 polish.
- hero agent dialogue.
- fallback/replay mode.
- 전체 발표 리허설.

## 성공 기준

데모가 성공했다고 판단하는 기준:

- 관객이 맵을 보자마자 행사장/디지털 트윈이라고 이해한다.
- 이벤트 발생 후 사람들이 몰리는 장면이 5초 안에 보인다.
- 부하 지표가 10초 안에 빨간 상태로 변한다.
- 우리 콘솔에서 incident/RCA/recovery proposal이 생성된다.
- 승인 후 Kubernetes replica가 실제로 증가한다.
- 화면에서 오버플로우/분산/회복 장면이 30초 안에 보인다.
- 발표자는 "게임 데모"가 아니라 "범용 Kubernetes 운영 자동화"로 마무리한다.

## 가장 작은 MVP 정의

시간이 부족하면 이것만 만든다.

- single frontend.
- single gateway.
- `district-sim-main-hall`, `district-sim-lobby`, `agent-queue-worker`.
- Redis 없이 in-memory queue.
- 500 agent.
- hero agent 5명.
- `Start Main Talk` 이벤트 하나.
- main hall heatmap.
- `district-sim-main-hall` scale 1 -> 3.
- `agent-queue-worker` scale 1 -> 3.
- scale 후 frontend에서 recovery state 표시.

이 MVP만으로도 발표 메시지는 전달된다.

## 다음 확장

- Tiled 기반 맵 편집.
- 실제 발표장 도면 기반 레이아웃.
- booth event, networking event 추가.
- scripted dialogue pack 확장.
- optional real LLM mode.
- Agones Fleet 기반 game server vertical demo.
- replay recorder로 발표 영상 자동 생성.

## 결론

Demo 01은 "게임을 하나 만든다"가 아니다. 관객이 바로 이해할 수 있는 디지털 트윈
화면을 만들고, 그 안에서 발생하는 agent 이동과 대화 이벤트를 Kubernetes 부하로
연결하는 데모다.

핵심 장면은 하나다.

```text
메인 발표 시작
  -> 사람들이 메인홀로 몰림
  -> main-hall-sim 부하 상승
  -> 우리 콘솔이 원인 분석
  -> scale out 승인
  -> 오버플로우 룸 open
  -> agent 분산
  -> latency/tick lag 회복
```

이 장면이 안정적으로 동작하면, Demo 01은 기존 쇼핑몰 장애 데모보다 훨씬 강한
시각적 설득력을 가진다.
