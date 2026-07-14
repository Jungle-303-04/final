# 실서비스 데이터 시나리오 (sandbox)

target cluster의 `sandbox` namespace에 실제 운영 서비스처럼 보이는
상시 워크로드와 장애 시나리오를 만드는 기준 문서다.
콘솔 timeline, 클러스터 usage 차트, RCA 흐름이 데모 수준의 드문 신호가 아니라
운영 수준의 연속 데이터를 갖게 하는 것이 목적이다.

manifest는 `src/samples/scenarios/`에 있고, 실행은 `scripts/scenario-inject.sh` 하나로 한다.
모든 리소스에 `scenario=<이름>` label이 붙어 있어 주입/정리가 시나리오 단위로 격리된다.
이 스크립트는 `sandbox` namespace만 만진다. `deploy/target/target.yaml`의
`cluster-agent-sandbox-write` Role이 허용하는 쓰기 경계와 같다.

## 실행 방법

```bash
# baseline 워크로드 적용(상시 유지)
TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh baseline

# 장애 주입 / 상태 확인 / 정리 — 시나리오 단위
TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh inject crashloop
TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh status crashloop
TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh cleanup crashloop

# 모든 fault 정리(baseline은 유지)
TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh cleanup faults

# 리허설/폴백 부하 스위치(기본 8 workers)
TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh load start 8
TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh load status
TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh load stop
```

`kubectl apply` 기반이라 몇 번을 다시 실행해도 결과가 같다(idempotent).
`TARGET_CONTEXT`는 kubeconfig context 이름이다(`target1`, `target2`).

## baseline 워크로드 (scenario=baseline)

작은 상점 마이크로서비스 구성이다. 전부 requests/limits와 probe를 갖는다.

- `shop-frontend` — nginx 2 replica. access log가 stdout → opentelemetry-collector → Loki로 흘러 상시 로그 스트림을 만든다.
- `shop-api` — prometheus-example-app 2 replica + HPA(min 2, max 5, CPU 70%). pod annotation `prometheus.io/scrape: "true"` 덕분에 target Prometheus의 기본 `kubernetes-pods` scrape job이 `http_requests_total` 같은 앱 metric을 직접 수집한다.
- `shop-redis` — 주문 큐/캐시. `redis-cli ping` probe.
- `shop-worker` — redis `orders` 리스트에 job을 넣고 꺼내며 구조화 로그를 남기고, 20건마다 CPU burst를 만든다.
- `shop-loadgen` — 분(minute)에 따라 burst 크기(1~10 req/s)를 바꿔 요청률이 물결치게 하고, 주기적으로 404·오류 경로를 호출해 현실적인 error rate를 만든다.

리허설에서는 `load start N`으로 `shop-loadgen` 한 파드 안의 요청 worker를 `N`개로
늘리고, `load stop`으로 Deployment를 0개까지 내린다. 단일 노드 EKS의 Pod 상한을
넘기지 않으면서 부하를 켜고 끌 수 있다. 두 명령은 `sandbox`의 이 Deployment 하나만
변경한다. 평상시 기준 상태로 돌아갈 때는 `load start 1`을 실행한다.

DevOps 엔지니어가 보게 되는 것: 클러스터 usage(`/clusters/{id}/usage`)의 CPU 시계열이
분 단위로 오르내리고, Loki에는 nginx access log + worker 처리 로그가 계속 쌓이고,
Prometheus에는 container metric(cAdvisor)과 `shop-api` 앱 metric이 함께 존재한다.

## fault 시나리오

각 시나리오는 독립 manifest 한 개다. 주입하면 실제 pod가 실패하고,
cluster-agent가 10초 주기 snapshot으로 실패 상태를 evidence에 실어 보낸다.

### crashloop — CrashLoopBackOff

`payment-gateway`가 필수 환경변수 누락 로그를 남기고 exit 1로 죽는다.

- pod: `CrashLoopBackOff`, restartCount 계속 증가, exitCode 1
- 이벤트: `BackOff` (Back-off restarting failed container)
- 로그: `FATAL: required environment variable DATABASE_URL is not set`
- RCA 후보 정합: config_env_error / app_startup_failure 계열

### oom — OOMKilled

`report-generator`가 memory limit(64Mi)보다 큰 데이터를 메모리에 올리다 죽는다.

- pod: `lastState.terminated.reason=OOMKilled`, exitCode 137, 이후 CrashLoopBackOff
- metric: `container_memory_working_set_bytes`가 limit에 붙었다가 리셋되는 톱니 모양
- 로그: "loading monthly sales dataset into memory" 직후 끊김
- RCA 후보 정합: oom_killed

### imagepull — ImagePullBackOff

`search-indexer`가 존재하지 않는 이미지 태그(`ghcr.io/shop-demo/search-indexer:v2.4.1`)를 참조한다.

- pod: `ErrImagePull` → `ImagePullBackOff`, Ready 0/1 지속
- 이벤트: `Failed`(pull), `BackOff`
- RCA 후보 정합: image tag 오타/미배포 태그 클래스

### probe-fail — readiness probe 실패

`inventory-api`는 8080에서 정상 기동하지만 readinessProbe가 9090을 본다.

- pod: Running인데 Ready=False 지속(재시작은 없음 — liveness가 아니라 readiness라서)
- 이벤트: `Unhealthy` (Readiness probe failed: connection refused)
- Service `inventory-api`의 ready endpoint 0 — upstream 제외 상태
- RCA 후보 정합: backend_readiness_failure

### sched-fail — 스케줄 불가

`analytics-batch`가 어떤 node에도 없는 `node-tier: gpu-a100` nodeSelector를 요구한다.

- pod: `Pending` 지속, 어떤 node에도 배치되지 않음
- 이벤트: `FailedScheduling` (node affinity/selector mismatch)
- RCA 후보 정합: 스케줄링 실패 클래스

### svc-selector — Service selector 불일치(네트워크 계열)

`checkout-gateway` Service가 존재하지 않는 `app=checkout-gateway-v2`를 selector로 갖는다.
`checkout-client`가 이 Service를 계속 호출하며 실패 로그를 남긴다.

- EndpointSlice: endpoints 비어 있음(모두 정상 pod인데 연결만 안 되는 상황)
- 로그: `checkout-gateway unreachable: connection refused or timeout` 반복
- RCA 후보 정합: service_dns_resolution_failure / upstream_unavailable 계열

## evidence policy와 sandbox 관측 범위

agent가 무엇을 수집하는지는 management DB의 `agent_policies`(cluster별, generation 기반)가 정한다.
기본 policy(`src/domains/target/evidence_policy.py`)는 kubernetes snapshot을 `target` namespace만 보게 되어 있어
sandbox 장애가 evidence에 실리지 않는다. 그래서 운영 policy를 generation 3으로 올려 다음을 적용했다.

- kubernetes snapshot query: `sandbox` namespace (usage 롤업과 inventory가 shop 워크로드·장애 pod를 반영)
- logs query 추가: `{k8s_namespace_name="sandbox"} |~ "ERROR|FATAL|error"`
- metrics query 추가: `kube_pod_info{namespace="sandbox"}`, `kube_pod_container_status_restarts_total{namespace="sandbox"}`, `container_memory_working_set_bytes{namespace="sandbox", container!=""}`

target namespace 관측은 기존 metrics/logs provider query가 계속 담당한다.

주의: kubernetes provider에 namespace snapshot query를 2개 이상 넣으면 node 리소스가
query마다 중복 수집되고, gateway의 inventory 배치 upsert
(`src/domains/inventory/repository.py`의 `save_inventory_snapshot`)가
`CardinalityViolation`(같은 문에서 같은 행 중복 갱신)으로 500을 반환해 evidence 적재가 멈춘다.
namespace query를 늘리려면 먼저 `normalized`를 `inventory_key` 기준으로 dedupe해야 한다.

## 파이프라인에서 확인하는 위치

1. target cluster: `kubectl --context target1 -n sandbox get pods -l scenario` 로 실제 실패 확인
2. cluster-agent: `kubectl --context target1 -n target logs deploy/cluster-agent` 에서 `evidence/jobs/.../result` POST 200 확인
3. management: `kubectl --context <mgmt> -n management logs deploy/evidence-worker` 에서 `cluster.evidence.received` → `evidence.built`
4. management: `logs deploy/incident-worker` 에서 `evidence.bundle.built` → `incident.detected`
5. 콘솔 timeline과 `/clusters/{id}/usage` 차트에서 증상/시계열 확인

## 운영 원칙

- baseline은 항상 켜 둔다. 끄면 usage/log 시계열이 평탄해져 데모 품질이 떨어진다.
- fault는 시연·테스트 시에만 주입하고 끝나면 `cleanup faults`로 정리한다.
- 기존 smoke용 `checkout-api`(`src/samples/smoke/deploy.yaml`)는 이 시나리오 pack과 별개다. 건드리지 않는다.
