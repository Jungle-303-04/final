# SW_AI_W17-21-final 인수인계

최종 갱신: 2026-07-11 (Asia/Seoul)

이 문서는 이전 대화 없이 `dev` 작업을 이어가기 위한 단일 진입점이다. 과거 반복 로그와
폐기된 계획은 제거했고, 현재 코드·라이브 실측·남은 구조적 과제만 남겼다. 자격증명 원문은
기록하지 않는다.

## 1. 절대 불변 조건

1. 목업, 페이크, 임의 하드코딩 데이터 금지. 백엔드가 값을 제공하지 않으면 UI는 `null` 또는
   명시적 unavailable 상태를 표시한다.
2. management 클러스터는 관측 전용이다. gateway, worker, agent, RBAC 네 경계에서 쓰기·명령·
   등록 해제를 거부한다.
3. 개발 인증 우회는 `APP_ENV=test` 또는 명시적 개발 플래그에서만 허용한다. production/staging
   에서는 fail-closed여야 한다.
4. agent token 원문은 1회 응답과 설치 Secret에서만 사용한다. DB에는 SHA-256 hash만 저장하고
   로그·문서·커밋에 원문을 남기지 않는다.
5. `/console/`은 보존용 데모다. 실제 제품은 `/`이며 Plural 콘솔 계열의 조용하고 밀도 높은
   SaaS UI를 기준으로 한다.
6. 이 백엔드 작업열에서는 `frontend/`를 수정하지 않는다. UI 작업열과 충돌하지 않도록 API
   계약과 문서만 제공한다.
7. 변경은 의미 단위 한국어 conventional commit으로 만들고 author는
   `choi woo-nyong <woonyong.kr@gmail.com>`을 사용한다.

## 2. 저장소와 Git

- 원본 저장소: `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final`
- 현재 백엔드 worktree: `/tmp/sw-ai-runtime-hardening-20260710`
- 작업 브랜치: `codex/runtime-hardening-20260710`
- push 대상: `origin/dev`
- remote: `https://github.com/Jungle-303-04/final.git`
- 현재 소스 HEAD: `a182597d3`

이번 작업열의 미푸시 커밋:

- `7d6fb8bbe` agent 전용 API, management 읽기 RBAC, proxy 고가용성
- `74aff3462` Bruno fixture 정리, agent 상태 수명, 테스트 삭제 경계
- `02d0de854` 인시던트 집계, 구버전 logical key, projection 보존
- `e25631536` management 관측 namespace와 읽기 RBAC 정합성
- `e4a6a594e` realtime WSS, ELB TCP 전달, agent 주소 단일화
- `fdce1f87a` test 목록 권한과 상세 인가 정합성
- `9bc7bbef1` command janitor DB 경합 재시도와 프로세스 생존
- `2c55f42a0` ephemeral 인시던트 inventory 회복 판정과 자동 종결
- `243e7fc02` 회복된 probe 이벤트 오탐 차단과 logical key 보존
- `a182597d3` runtime DB 읽기 검증과 schema-bootstrap 격리

push 전에는 반드시 `git fetch origin dev` 후 원격 선행 커밋 유무를 다시 확인한다. 다른 팀원의
변경을 reset/revert하지 않는다.

## 3. 라이브 토폴로지

### 진입점

- 콘솔/API: `https://k8s.woonyong.org`
- agent 전용 API: `https://agent-api.woonyong.org/api`
- agent WebSocket: `wss://agent-api.woonyong.org/live/agent`
- agent 전용 endpoint는 `/api/healthz`, `/api/agent/*`, `/api/install/*`, `/live/agent`만 허용한다.
  `/live/browser`와 일반 관리 API는 404다.

### Kubernetes

- management context: `mgmt`, namespace: `management`
- target context: `cluster-1`, agent namespace: `target`, demo namespace: `sandbox`
- 등록 ID:
  - `kubernetes-ops`: role=`management`, environment=`management`
  - `cluster-1`: role=`target`, environment=`test`
- management 서비스 Deployment 44개가 Ready이며 이 중 서비스 이미지 Deployment는 38개다.
- api-gateway는 2 replicas, agent-api-proxy는 2 replicas와 PDB를 사용한다.
- agent-api-proxy는 서로 다른 노드에 hard topology spread한다.

### 이미지

- 최종 소스 태그: `2c55f42a0-runtime-final-20260710`
- 최종 digest: `sha256:39ccede868cd15cae9f1109bd6124ccf7a46878426e9c3f2043f0595e6f50270`
- 라이브 서비스 38개는 rollout 완료 후 위 digest로 고정해야 한다.
- target의 기존 cluster-agent는 안정성을 위해 별도 rollout 전까지 기존 release-flow 이미지를
  유지할 수 있다. 새 등록 manifest는 서버의 현재 `TARGET_AGENT_IMAGE` 설정을 사용한다.

## 4. 현재 라이브 상태

2026-07-10 초기화 후 확인한 상태:

- 열린 인시던트 0
- 승인 대기 0
- DLQ 0
- outbox 미발행 0
- running workflow 0
- cluster-1 health=`healthy`, online
- 5회 연속 30초 evidence 주기에서 인시던트/DLQ 증가 0
- fleet 집계 `EXPLAIN ANALYZE` 실행 시간 0.133ms(목표 10ms 이하)
- management 정책 generation 3 적용:
  - `kubernetes`만 enabled
  - query는 `management_namespace_snapshot` 한 개
  - metrics/logs/traces/metadata disabled
  - bootstrap/desired-state/scheduling 쓰기 자원은 모두 빈 배열
- management RBAC 실측:
  - pods/statefulsets/daemonsets/endpointslices list = yes
  - pods create, deployments update/patch/delete = no
- management와 cluster-1 agent의 realtime stream 연결 확인
- 95초 관찰에서 management 비활성 provider job 증가 `120 -> 120`, 양쪽 agent 신규 warning 0,
  cluster-1 realtime disconnect 0

DB 초기화는 로그인/워크스페이스/권한 이력과 두 cluster registration, token hash, 정책,
현재 inventory를 보존했다. 과거 incident/RCA/command/approval/DLQ/evidence job과 Bruno fixture는
정리했다. 남아 있던 `bruno-*` resource assignment 2건도 제거해 현재 0이다.

## 5. 완료된 백엔드 변경

### Evidence와 이벤트

- `cluster.evidence.received`는 claim-check 계약을 사용한다. 전문은 `evidence_window.payload`에
  한 번 저장하고 이벤트에는 evidence key, workspace/cluster/correlation, kind, payload size,
  bounded summary만 넣는다.
- consumer는 구형 inline payload와 신형 reference payload를 모두 읽어 롤링 배포 혼재를
  견딘다.
- NATS `MaxPayloadError`로 쌓였던 dead letter는 replay/정리했고 신규 증가가 멈췄다.
- outbox relay는 api-gateway 프로세스에서 독립 Deployment로 분리했다.
- outbox/events/audit 보존 janitor와 evidence/rca timeline 인덱스를 추가했다.
- pre-incident 상태(`evidence_received`, `evidence_built`)를 열린 인시던트로 세지 않는다.
- legacy correlation 기반 logical key는 cluster/namespace/kind/name/symptom으로 재구성한다.
- 오래된 pre-incident projection은 기본 24시간 후 janitor가 제한 배치로 삭제한다. raw evidence,
  events, audit은 해당 janitor가 삭제하지 않는다.
- 5분 이상 지난 Pod/ReplicaSet 인시던트는 최신 inventory에서 리소스가 사라졌거나 healthy면
  이력을 삭제하지 않고 `incident_resolved`로 종결한다. 안정 리소스와 현재 비정상 리소스는
  자동 종결하지 않는다.
- Pod 경고 Event는 현재 snapshot의 같은 namespace/name Pod와 교차 검증한다. 삭제된 Pod 또는
  Ready로 회복된 Pod의 최근 readiness Event는 새 인시던트로 승격하지 않는다.
- 후속 approval/dispatch 이벤트가 incident 차원을 싣지 않으면 logical key를 NULL로 두어 앞서
  투영한 cluster/namespace/kind/name/symptom key를 correlation ID로 덮어쓰지 않는다.

### 성능과 안정성

- fleet 열린 인시던트 집계는 앱 풀스캔/dedup 대신 SQL 집계와 partial index를 사용한다.
- evidence 및 RCA 조회는 keyset cursor를 반환하며 기존 offset 파라미터도 하위 호환한다.
- `rca_reports`와 timeline 조회는 필요한 컬럼만 SELECT한다.
- agent status는 `AGENT_STATUS_RETENTION_SECONDS` 기본 3600초 후 superseded 행을 물리 정리한다.
- GitHub polling은 30초다. 정상 사이클은 200 이후 304 Not Modified로 확인했다.
- command janitor는 rollout schema lock 같은 일시 DB 경합에서 종료하지 않고 다음 15초 주기로
  만료 명령 sweep을 재시도한다. 이벤트 발행 실패는 이 catch 범위에 포함하지 않는다.
- management 배포는 단일 `management-schema-bootstrap` Job만 schema DDL을 수행한다. API/워커는
  `DATABASE_STARTUP_MODE=verify`에서 table/column을 읽기 검증해 롤아웃 중 DDL/DML deadlock을 막는다.
- 내부 Git commit/PR merge 성공 SHA는 webhook fast-path로 즉시 release flow에 넣고 polling 결과는
  SHA dedup한다. PR 생성만으로는 dispatch하지 않는다.
- GitOps/Kubernetes command는 high priority, background evidence/reconcile은 normal/low다.
- Kubernetes API patch 수락(`applied`)과 rollout 완료(progress/completed)는 별도 상태 이벤트다.

### Target 등록과 보호

- provider catalog와 EKS/GKE/AKS/existing-k8s/kind/minikube bootstrap command를 제공한다.
- shell command의 사용자 입력은 quote 처리한다.
- cluster_id 생략 시 서버가 slug+4자리 suffix를 생성한다.
- 등록 직후 `pending_install`, TTL 경과 시 `install_expired`를 반환한다.
- token 원문 재노출 없이 retry/re-register 정책을 사용한다.
- repo/deployment binding 생성 시 모든 target agent가 connected인지 서버가 검사한다. 혼합 대상이면
  실패 cluster 목록과 `cluster_not_connected`를 반환한다.
- management 설치 manifest는 target write Role과 분리된 읽기 전용 ClusterRole을 사용한다.
- management policy update, scale/restart/recovery dispatch, command worker, agent executor,
  unregister에서 각각 쓰기를 거부한다.
- management 기본 evidence는 `management` namespace만 읽는다. target/sandbox 기본 query를
  재사용하지 않는다.

### Catalog 실제 설치 runner

- `POST /catalog/items/{item_id}/installs`는 필수 `Idempotency-Key`와 `DEPLOY_RUN` 권한을 검사하고, online `command_receiver` target Agent가 있을 때 실제 high-priority `agent_commands` 행을 만든 뒤 HTTP 202와 `command_id`를 반환한다.
- 지원 범위는 코드에 동봉된 PostgreSQL `18.7.13`/Redis `23.1.1` OCI digest recipe와 sandbox namespace뿐이다. DB recipe, 사용자 chart URL/shell/manifest, template 항목은 실행하지 않는다.
- Agent 이미지는 checksum 검증된 Helm `v3.21.2`를 포함한다. runner는 private values 파일, 명시 argv, `shell=False`, timeout, credential env allowlist를 사용하며 subprocess 출력/values를 로그나 command result에 남기지 않는다.
- management role은 gateway registration/policy guard와 Agent executor/handler에서 차단되고 management manifest에는 catalog write Role이 없다. target에는 현재 두 chart가 렌더하는 namespaced 종류만 별도 Role로 추가했다.
- 202는 설치 성공이 아니다. `GET /commands/{command_id}`의 `queued/leased/running/completed/failed`와 실제 result를 조회한다. generic queued TTL/janitor는 이 작업에서 변경하지 않았다.

### 위저드/검증 API

- repo URL 정규화/접근 검증, branch 목록, Kubernetes manifest 후보 목록 API
- target provider catalog/preflight/register/bootstrap/connection status API
- email availability, 로그인 상태 분기, 인증 메일 cooldown, 마지막 admin 보호
- alert channel 실제 test 발송 API
- RCA rule YAML validate API
- PromQL dry-run validate API
- cluster node summary와 node별 pod summary API
- recovery plan 조회/상태/선택 action API
- 레포 token은 성공 시 workspace 단위 암호화 저장하며 응답에 원문을 반환하지 않는다.

### Realtime

- cluster-agent는 bounded live summary와 pod resource delta를 outbound WebSocket으로 보낸다.
- target HTTPS 주소는 같은 host의 WSS 443을 사용한다. 로컬 HTTP fallback만 NodePort 30090이다.
- management는 내부 `ws://realtime-gateway.management.svc.cluster.local:8000`을 사용한다.
- 공개 Classic ELB는 TLS 종료 후 backend TCP 전달로 WebSocket Upgrade를 보존한다.
- 브라우저는 이벤트를 즉시 수집하되 React Query cache patch를 100~250ms 또는
  `requestAnimationFrame` cadence로 묶어 전체 페이지 재렌더를 피해야 한다.

### Bruno

- 환경은 `docs/api/environments/aws-test.bru` 하나만 유지한다.
- `APP_ENV=test`에서는 세션/리소스 권한/agent token 우회를 일관되게 적용한다.
- 목록 필터도 상세 인가와 동일하게 test bypass에서 전체 리소스를 반환한다.
- test registration의 명시적 `purge=true`만 물리 삭제한다. 조건은 admin session,
  `APP_ENV=test`, registration environment=`test`, non-management다.
- 마지막 라이브 결과: 67/67 requests, 120/120 tests PASS.

## 6. 프론트 제품 목표

프론트 작업자는 다음 계약을 유지한다.

1. `/console/` 빌드는 아카이브 데모로 격리한다. `/`에 데모 코드를 redirect/복사하지 않는다.
2. `/`은 `/console/`의 Plural 계열 정보 구조와 밀도를 가져오되 실제 API만 사용한다.
3. 드릴 계층은 `cluster -> node/service/workload -> pod`다.
4. 각 scope의 상세에는 그 리소스에 한정된 이벤트, 메트릭, AI 분석, RCA/recovery 상태가 있다.
5. node/pod는 namespace별 안정된 색, 검색/namespace/health/service 필터를 제공한다.
6. Kubernetes Service는 pod 안에 설치되는 객체가 아니라 selector로 pod 집합을 가리키고 네트워크
   접근을 제공하는 별도 리소스다. Service 선택 대상 pod/node를 강조하되 namespace와 혼동하지
   않는다.
7. heatmap tile, drill drawer, 위젯 배치/프리셋, 실제 query 등록/검증/실행이 핵심 기능이다.
8. repo wizard는 URL 검증 -> branch list -> manifest candidate -> render/validate -> binding 순서다.
9. cluster wizard는 provider form -> discovery/preflight -> register -> bootstrap -> connected 확인 순서다.
10. AI chat은 실제 backend conversation만 사용하고 대화 삭제, loading/error/empty/retry를 제공한다.
11. 설명용 마케팅 문구, LIVE badge, 임의 샘플 수치, 가짜 차트 데이터는 제거한다.
12. 줄바꿈으로 카드 높이가 튀거나 hover/로딩으로 레이아웃이 이동하지 않도록 고정 track,
    min/max, aspect-ratio를 사용한다.

모션 참고 우선순위:

- React Flow animated edge: 실행 중 workflow/RCA/recovery packet 표현
- React Flow node position animation: topology/drill 재배치
- Motion for React: list enter/exit, drawer/modal, 상태 전이, layout animation
- Nivo: 실제 metrics line/tooltip/crosshair
- Motion Primitives/React Bits는 제품 표면에 맞는 작은 상호작용만 선별
- GSAP/R3F/Lottie의 장식적 hero/3D/커서 효과는 운영 콘솔 기본 화면에 사용하지 않는다.
- `prefers-reduced-motion`과 키보드 focus를 반드시 지원한다.

## 7. 검증 명령과 마지막 결과

```bash
cd /tmp/sw-ai-runtime-hardening-20260710
uv run python -m pytest -q
uv run ruff check src scripts tests
uv run ruff format --check src scripts tests
PYTHONPATH=src uv run lint-imports
bash scripts/manifest-check.sh
bash scripts/run-bruno-aws.sh
```

마지막 결과:

- pytest: `1247 passed, 3 skipped`
- Ruff: 428 backend files clean
- import-linter: 2 contracts kept, 0 broken
- manifest: management 62 objects, target 18 objects
- Bruno: 67/67 requests, 120/120 tests

`ruff check .`은 backend CI 명령이 아니다. `frontend/tests/smoke.py`의 기존 축약 문법을 잡지만
해당 파일은 UI 작업열 소유다. 백엔드 작업자가 충돌을 만들지 말고 UI 작업열에서 정리한다.

라이브 확인:

```bash
curl -fsS https://k8s.woonyong.org/api/healthz
curl -fsS https://agent-api.woonyong.org/api/healthz
kubectl --context mgmt -n management get deploy,pod
kubectl --context cluster-1 -n target get deploy,pod
```

로그 검사 시 query 문자열 안의 `ERROR`를 장애로 오인하지 말고 JSON `level=warning|error`와
HTTP 4xx/5xx를 구조적으로 필터한다.

## 8. 운영 절차

### agent endpoint 재구성

아래 값은 환경에서 주입하고 원문을 출력하지 않는다.

- `AGENT_API_DOMAIN`
- `AGENT_API_ACM_CERT_ARN`
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_API_TOKEN`
- 선택: `KUBE_CONTEXT`, `NAMESPACE`, `AGENT_API_SERVICE_NAME`

```bash
bash scripts/configure-agent-api-endpoint.sh
```

스크립트는 DNS-only CNAME, TLS ELB, backend TCP, proxy 경로, health를 검증한다. Service를
수동으로 ClusterIP manifest로 덮어써 public `agent-api` Service를 지우지 않는다.

### 이미지 비상 배포

GitHub Actions budget이 막혀 있을 때만 CodeBuild `kubernetes-ops-image-build`를 사용한다.
소스는 `git archive`로 S3 `kubernetes-ops-buildsrc-183548421506/source.zip`에 올리고
`IMAGE_TAG` override로 빌드한다. 성공 digest 확인 후 서비스 이미지 Deployment만
`kubectl set image`하고 각각 `rollout status`를 확인한다.

### DB 접근

DB 자격증명은 `postgresql-secret`에서 프로세스 변수로만 읽고 출력하지 않는다. 삭제는 항상
명시적 predicate와 사전/사후 count, transaction을 사용한다. identity/registration/token hash를
무심코 초기화하지 않는다.

## 9. GitHub Actions 상태

조직 Actions 예산이 0이고 `prevent_further_usage=true`라 기존 자동 workflow는 job 생성 전
실패했다. 소스에서 이미 폐기됐지만 default branch에 남아 실행되던 다음 workflow는
`disabled_manually` 상태다.

- AWS CD
- CI
- Integration Smoke
- Promote Dev To Main

`release-flow-production-gate.yml`, `release-flow-smoke.yml`은 manual/reusable 계약이라 active로
유지했다. 예산 복구 전 자동 workflow를 다시 켜면 같은 빈 job 실패가 재발한다.

## 10. 남은 구조적 과제

우선순위 순서:

1. 현재 단일 schema-bootstrap Job의 `create_all`/호환 DDL을 Alembic revision 기반 migration Job으로
   교체. 앱의 읽기 전용 table/column 검증은 이미 분리됐으며, 후속으로 revision까지 확인한다.
2. 외부 I/O handler의 긴 DB transaction을 effect-intent 구조로 분리. 짧은 claim TX -> 외부 I/O
   -> 짧은 result/business/outbox/ledger TX. `(consumer,event_id,target)` unique key 필요.
3. subject별 independent fetch task + bounded queue/semaphore로 worker 다중 subject 지연 제거.
   subject 내부 순서는 유지.
4. event `payload_version`, tolerant reader, upcaster, golden compatibility fixture 완성.
5. production HA: Multi-AZ PostgreSQL, Redis failover, NATS 3-node/R3, object storage, NetworkPolicy,
   stateless 2+ replicas, PDB/topology spread, lag 기반 HPA/KEDA.
6. realtime-gateway 2+ replicas 전에는 shared Redis/NATS backplane과 sequence 소유권을 먼저 구현.
7. production 인증 전환: `APP_ENV=production`, 모든 bypass off, 실제 회원가입/이메일 인증/승인 E2E.
8. agent-api ACM/ELB/DNS lifecycle을 Terraform 또는 다른 IaC로 이전.
9. frontend 작업열에서 `/` 제품 UI, `/console/` 아카이브, 실제 로그인 Playwright E2E와
   `frontend/tests/smoke.py` lint를 완료.

`Jungle-303-04/k8s-incident-demo-target`의 `target-01.woonyong.org` 배포는 다른 작업열이 담당하므로
이 작업열에서 중복 배포하지 않는다.

## 11. 다음 작업자가 시작할 순서

1. `git fetch origin dev`와 worktree status 확인.
2. 이 문서의 최종 digest와 라이브 38개 service image 일치 확인.
3. 전체 backend gate와 Bruno 재실행.
4. `/clusters`가 test bypass에서 `kubernetes-ops`, `cluster-1` 두 개를 반환하는지 확인.
5. management write `kubectl auth can-i`가 계속 no인지 확인.
6. 5분간 agent warning, DLQ, outbox unsent, open incident 증가를 관찰.
7. 최소 단위 commit을 `origin/dev`에 push.
8. Actions budget 때문에 자동 CD가 없음을 팀에 명시하고, 필요하면 검증된 CodeBuild 경로 사용.

완료를 “버그 0” 선언으로 대신하지 않는다. 위 자동 테스트, API 계약, 라이브 상태, 로그,
실브라우저 E2E 증거가 모두 같은 commit/digest를 가리킬 때만 반복을 닫는다.
