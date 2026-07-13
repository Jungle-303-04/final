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
3. 사용자 세션과 agent token의 환경별 우회는 없다. 로그인 없는 개발 콘솔은 Cloudflare mTLS와
   내부 전용 프록시 비밀값을 모두 통과하며, 일반 콘솔은 내부 헤더를 제거한다.
4. agent token 원문은 1회 응답과 설치 Secret에서만 사용한다. DB에는 SHA-256 hash만 저장하고
   로그·문서·커밋에 원문을 남기지 않는다.
5. `/console/`은 보존용 데모다. 실제 제품은 `/`이며 Plural 콘솔 계열의 조용하고 밀도 높은
   SaaS UI를 기준으로 한다.
6. 이 백엔드 작업열에서는 `frontend/`를 수정하지 않는다. UI 작업열과 충돌하지 않도록 API
   계약과 문서만 제공한다.
7. 변경은 의미 단위 한국어 conventional commit으로 만들고 author는
   `choi woo-nyong <woonyong.kr@gmail.com>`을 사용한다.

## 2. 저장소와 Git

- 원본/UI 작업공간: `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final`
- 권위 백엔드 worktree: `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final-dev`
- 작업 브랜치: `dev`
- push 대상: `origin/dev`
- remote: `https://github.com/Jungle-303-04/final.git`
- 현재 정확한 HEAD와 미푸시 목록: `git rev-parse HEAD`, `git log --oneline origin/dev..HEAD`

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

- management context: `kubernetes-ops`(`mgmt` alias도 존재), namespace: `management`
- target context: `cluster-1`, agent namespace: `target`, demo namespace: `sandbox`
- 등록 ID:
  - `kubernetes-ops`: role=`management`, environment=`management`
  - `cluster-1`: role=`target`, environment=`test`
- 최종 실측: management Deployment 43개, 46/46 replicas Ready, StatefulSet 3/3 Ready.
- api-gateway는 2 replicas, agent-api-proxy는 2 replicas와 PDB를 사용한다.
- agent-api-proxy는 서로 다른 노드에 hard topology spread한다.

### 이미지

- 최종 live digest:
  `sha256:4618d644df3f82e2eaf9d79548ac0ccc05bb6e189ac92a186248148cf667cbc2`
- 배포 소스 commit: `4d7da88ecfaff75cf75549f14d0f412567c019af`

## 4. 현재 라이브 상태

최종 확인 상태는 `docs/current-service-state.md`가 권위값이다. 2026-07-11 재측정:

- DLQ 0
- outbox 미발행 0
- evidence job 비종결 0
- 등록은 `kubernetes-ops`, `cluster-1` 두 개
- active command와 open incident/RCA projection 0
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

DB 초기화는 로그인/워크스페이스/권한 이력, 두 cluster registration, token hash, 정책,
repo/application/binding을 보존했다. 과거 incident/RCA/command/approval/evidence/event/audit와
Bruno fixture 종속 행은 transaction으로 정리했다. 초기화 45초 뒤 두 Agent가 status 2,
inventory resource 1,364, snapshot/usage 각 3개의 새 실데이터를 다시 적재했다.

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

- `POST /catalog/items/{item_id}/installs`는 필수 `Idempotency-Key`와 `DEPLOY_RUN` 권한을 검사하고, online target Agent가 `command_receiver`와 `catalog_helm_install` capability를 모두 광고할 때만 실제 high-priority `agent_commands` 행을 만든 뒤 HTTP 202와 `command_id`를 반환한다.
- 지원 범위는 코드에 동봉된 PostgreSQL `18.7.13`/Redis `23.1.1` OCI digest recipe와 sandbox namespace뿐이다. chart와 container image를 모두 digest로 고정하고 Redis는 standalone을 강제한다. StorageClass는 특정 cloud 값을 코드에 박지 않고 schema 필수 입력으로 받는다. DB recipe, 사용자 chart URL/shell/manifest, template 항목은 실행하지 않는다.
- Agent 이미지는 checksum 검증된 Helm `v3.21.2`를 포함한다. runner는 private values 파일, 명시 argv, `shell=False`, timeout, credential env allowlist를 사용하며 subprocess 출력/values를 로그나 command result에 남기지 않는다.
- management role은 gateway registration/policy guard와 Agent executor/handler에서 차단되고 management manifest에는 catalog write Role이 없다. target에는 현재 두 chart가 렌더하는 namespaced 종류만 별도 Role로 추가했다.
- 202는 설치 성공이 아니다. `GET /commands/{command_id}`의
  `queued/leased/running/completed/failed`와 실제 result를 조회한다. 수신되지 않은 queued 명령은
  `COMMAND_QUEUE_TTL_SECONDS` 기본 1800초 뒤 janitor가 원자 종결하고 `command.completed`를 발행한다.
- cluster-1은 EBS CSI addon `v1.62.0-eksbuild.1`과 전용 IRSA 역할을 사용한다. Redis live 설치는
  digest image, `gp2` PVC Bound, StatefulSet 1/1, command completed를 확인했고 release/PVC/PV를
  삭제해 잔여 0으로 닫았다.

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
- `aws-test`는 `https://dev-k8s.woonyong.org/api/`, `auto_login=false`로 고정한다.
- 사용자 API는 mTLS 개발 프록시의 고정 `service_admin` 주체, Agent API는 실제 cluster token을
  각각 검증한다. RCA 전용 token과 webhook 서명도 별도 경계를 유지한다.
- Chrome 개발 콘솔은 `.p12`, Bruno는 같은 인증서의 `.pem`+`.key`를 사용한다.
- test registration의 명시적 `purge=true`만 물리 삭제한다. 조건은 admin session,
  `TEST_FIXTURE_PURGE_ENABLED=1`, registration environment=`test`, non-management다.
- Bruno CLI 3.5.1의 `00-health-auth/07-session` mTLS 실측: HTTP 200,
  workspace=`default`, role=`service_admin`.

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
cd /Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final-dev
uv run python -m pytest -q
uv run ruff check src scripts tests
uv run ruff format --check src scripts tests
PYTHONPATH=src uv run lint-imports
bash scripts/manifest-check.sh
bash scripts/run-bruno-aws.sh
```

마지막 결과:

- pytest: `1504 passed, 3 skipped`
- Ruff: 459 backend files clean
- import-linter: 2 contracts kept, 0 broken
- manifest: management 68 objects, target 20 objects
- Bruno mTLS session: 1/1 request, 2/2 tests PASS

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
3. event `payload_version`, tolerant reader, upcaster, golden compatibility fixture 완성. 현재 envelope
   `schema_version`과 additive-field tolerant dispatch까지만 구현됐다.
4. production HA: Multi-AZ PostgreSQL, Redis failover, NATS 3-node/R3, object storage, NetworkPolicy,
   stateless 2+ replicas, PDB/topology spread, lag 기반 HPA/KEDA.
5. realtime-gateway 2+ replicas 전에는 shared Redis/NATS backplane과 sequence 소유권을 먼저 구현.
6. production 인증 전환: `APP_ENV=production`, 모든 bypass off, 실제 회원가입/이메일 인증/승인 E2E.
7. agent-api ACM/ELB/DNS lifecycle을 Terraform 또는 다른 IaC로 이전.
8. frontend 작업열에서 `/` 제품 UI, `/console/` 아카이브, 실제 로그인 Playwright E2E와
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

## 12. 2026-07-11 mTLS 개발 콘솔 라이브 상태

- canonical URL: `https://dev-k8s.woonyong.org`
- Cloudflare Tunnel origin: `http://console-dev.management.svc.cluster.local:80`
- 인증서 없음: 403, 유효한 client certificate: index/session/refresh/fleet 200
- 공개 `k8s.woonyong.org`의 session/fleet 및 Agent 무토큰 요청: 401
- 배포 이미지: backend `d168cc39c9`/`sha256:4618...cbc2`, console
  `bf68cbeb8-mtls-20260711`
- backend 태그의 `d168cc39c9`는 메시지 정규화 전 commit 이름이며, 동일 tree의 현재 commit은
  `4d7da88ecfaff75cf75549f14d0f412567c019af`다. 배포 digest는 변경되지 않았다.
- Ready: api-gateway 2/2, realtime-gateway 1/1, console 1/1, console-dev 2/2,
  cloudflared 2/2
- 로컬 보안 산출물: `~/.kubeheal/dev-console-certs/2026-07-11/dev-console-01..05.p12`
- `dev-console-01.p12`는 이 Mac의 login Keychain에 Chrome 허용으로 설치했다. 나머지 네 개는
  팀원별 전달용이며 각 `.password`는 별도 채널로 전달한다.
- bootstrap Cloudflare API token은 설정 완료 후 대시보드에서 삭제했고 로컬 임시 파일도
  제거했다. private key/password/token은 저장소나 GitHub artifact에 올리지 않았다.

## 13. 2026-07-11 management canonical ID / binding 보호

- management 논리 ID는 라이브 등록과 target runtime 모두 `kubernetes-ops`다. DB에는
  `kubernetes-ops` management와 `cluster-1` target 두 등록만 있으며 중복/orphan 등록은 없다.
- 정적 management agent manifest의 `TARGET_CLUSTER_ID`는 literal을 제거하고
  `management-runtime-config.MANAGEMENT_CLUSTER_ID` 단일 설정을 읽는다. `aws-up.sh`와 `up.sh`가
  실제 management cluster ID로 이 값을 생성하므로 재배포 시 별도 레코드를 만들지 않는다.
- application connect와 명시 deployment binding은 management role을 400
  `management_readonly`로 거부한다. global `*` 확장과 webhook/신규 cluster fan-out에서도
  management를 제외한다.
- inventory 조회와 기존 command-worker/agent의 management write fail-closed 경계는 유지한다.
- 라이브 deployment binding 3개는 모두 `cluster-1`이며 정리할 management binding 잔재는 0건이다.
- DB schema/migration 변경은 없다. 기존 registration의 `cluster_id`나 agent token hash도 변경하지
  않는다.
- 라이브 검증: inventory read 200, 명시 binding 400 `management_readonly`, sandbox 제어 명령
  400 `management_readonly`. management agent ServiceAccount는 pod/service/deployment/configmap
  create/patch/delete/update가 모두 `no`, pod/node get/list는 `yes`다.
- 검증: 집중 회귀 167 passed, 원격 Evidence 통합 후 전체 1504 passed/3 skipped, Ruff 전체 통과,
  import-linter 2 kept/0 broken, manifest 68/20.

## 14. 2026-07-11 Bruno mTLS 회귀 복구

- 전체 403의 원인은 API가 아니라 `dev-k8s.woonyong.org` 앞단 Cloudflare mTLS에서 Bruno가
  client certificate를 제시하지 않은 것이었다. 컬렉션은 gitignored `docs/api/.certs/`의
  `dev-console.pem`/`dev-console.key`를 사용하며 실제 인증서와 개인 키는 저장소에 없다.
- Bruno 3.4.2 안전 샌드박스에서 지원하지 않는 Node `crypto` 대신 내장 `crypto-js`로 GitHub
  webhook HMAC을 계산한다. Secret 미설정 시 기존 401 계약을 유지한다.
- 기본 전체 실행은 실제 가입/로그인/승인/로그아웃과 RCA 장애 주입·복구 선택을 요청 단위로
  건너뛴다. 열린 DLQ가 없으면 replay도 건너뛰고, metrics token 미설정 503은 명시적 운영 상태다.
- 이메일 검증은 가입 placeholder와 분리한 유효 형식 입력을 사용한다. Bruno 앱은 test cluster를
  soft unregister하고, CLI 격리 Runner만 고유 ID에 `cluster_purge=true`를 주입한다.
- 라이브 검증: `healthz`/`readyz`/OpenAPI/session 200, 공식 Runner 67/67 requests와 120/120 tests,
  집중 pytest 33 passed, docs index 9 passed, Ruff clean. 종료 후 `bruno-*` cluster 잔재 0건.
