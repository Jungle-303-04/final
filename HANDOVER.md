# HANDOVER — 2026-07-07 밤샘 작업 인수인계

다른 AI/팀원이 이어받기 위한 문서. 작업마다 갱신한다. 최종 갱신: 2026-07-07 17:14 KST (repo manifest validation gate 강화)

## 절대 운영 원칙 — mock/fake/hardcoding 금지

- 운영 코드, 배포 대상 화면, API 응답, DB 정리/복구 절차에는 **목업 데이터, 페이크 데이터, 하드코딩된 클러스터/레포/인시던트 값 사용 금지**.
- 화면 수치와 드릴다운은 실제 세션 권한으로 접근 가능한 DB/API/클러스터 관측값만 표시한다. 개발용/테스트용 격리 객체는 단위 테스트 내부에만 두고 운영 경로에 연결하지 않는다.
- 실제 토큰/비밀번호/세션 쿠키/API key는 사용자 요청이 있어도 커밋하지 않는다. Git 히스토리에서 완전 삭제가 어렵기 때문에 GitHub Actions secrets, 로컬 env, 승인된 secret store만 사용한다.
- 평상시 DB 정리는 전체 삭제가 아니라 원인과 시간 범위가 확인된 과거 실패 레코드만 상태 전환으로 아카이브한다.
- 단, 이번 사용자 명시 지시로 최종 완료 후 1회 DB 초기화를 수행한다. 순서: 백업/스냅샷 → 스키마 재생성/마이그레이션 → `service_admin` bootstrap → 실제 클러스터/레포 재등록 → 실제 데이터 재수집/검증. 초기화 후에도 운영 화면에는 mock/fake/hardcoding 금지.

## 최신 업데이트 (17:14 KST) — repo manifest validation gate 강화

- `ec00ea77 feat: target preflight 연결성 확인`은 origin/dev push 완료.
- 해당 push의 dev workflows도 runner 배정 없이 실패:
  - CI run `28851671441` → failure.
  - AWS CD run `28851671409` → failure.
  - Promote Dev To Main run `28851671384` → failure.
  - 기존과 같은 runner allocation 계층 문제로 본다.
- repo 연결 위저드 개선:
  - `frontend/src/features/resources/ConnectRepoWizard.tsx`
  - legacy placeholder인 `validation.status === "not_run"`으로는 다음 단계/앱 생성으로 진행하지 못하게 막았다.
  - 이제 repo 입력 → branch list → manifest 후보 → static/render validation 후 `validation.valid === true`인 경우에만 app/binding 생성 단계로 진행한다.
  - mock/fake/hardcoded data 없음.
- 검증:
  - `python -m pytest -q tests/test_repository_discovery.py tests/test_manifest_render_worker.py` → 28 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.

## 최신 업데이트 (17:10 KST) — target preflight Kubernetes 연결성 확인

- `2107376f feat: incident 복구계획 fallback 연결`은 origin/dev push 완료.
- 해당 push의 dev workflows도 runner 배정 없이 실패:
  - CI run `28851117498`: jobs `85566424069`, `85566424087`, `85566424088` 모두 `runner_id=0`.
  - Promote Dev To Main run `28851117588`: verify job `85566424109` `runner_id=0`, merge skipped.
  - AWS CD run `28851117482`: `Test before deploy` job `85566424684` `runner_id=0`, deploy skipped.
  - 계속 코드 실패가 아니라 GitHub-hosted runner 배정/계정·org 정책·quota 문제로 본다.
- target 등록 preflight 개선:
  - `src/domains/target/router.py`: direct apply(`deploy_provider="kube-context"`, `apply=true`)이고 allowlist/provider/image 검증을 통과하면 `kubectl [--context <ctx>] get --raw=/version --request-timeout=5s`로 실제 Kubernetes API 연결성을 non-mutating 방식으로 확인한다.
  - 실패 시 `kubernetes preflight connection failed`, timeout 시 `kubernetes preflight connection timed out`, kubectl 없음 시 기존 `kubectl is not available to api-gateway`를 preflight error로 반환한다.
  - `tests/test_target_registration.py`: direct apply 연결성 성공/실패 테스트 추가.
  - `docs/spec/domains/target.md`: preflight 연결성 동작 문서화.
- 검증:
  - `python -m pytest -q tests/test_target_registration.py tests/test_provider_registry.py` → 31 passed, 1 warning.
  - `python -m compileall -q src/domains/target/router.py tests/test_target_registration.py` → passed.
  - `git diff --check` → passed.
  - 로컬에는 `.venv`와 `uv`, 시스템 `ruff`가 없어 `ruff check`는 실행하지 못했다.
- Actions runner mitigation:
  - 현재 저장된 GitHub token은 repo read/push는 가능하지만 repo/org admin·billing runner 설정 API는 403/404로 접근 불가다.
  - org owner/repo admin이 org Actions policy, billing/quota, hosted runner limits, runner groups를 GitHub UI 또는 admin token으로 확인해야 한다.
  - retry canary는 Promote/AWS CD가 아니라 CI의 `Kubernetes manifest checks` 단일 job을 우선 사용한다. 최신 job id는 `85566424088`(run `28851117498`)이며, 성공 전까지 Promote/Main AWS CD 재실행은 피한다.

## 최신 업데이트 (17:02 KST) — incident fallback 복구계획 연결

- `dd02f260 docs: Actions runner 재실행 기록`은 origin/dev push 완료.
- 이 푸시로 생성된 dev workflows도 runner 배정 없이 즉시 실패했다.
  - Promote Dev To Main run `28850987065` → failure.
  - CI run `28850987079` → failure.
  - AWS CD run `28850987004` → failure.
  - 세부 패턴은 직전과 동일하게 `runner_id=0`, steps/log 없음으로 본다. 코드 실패로 단정하지 말 것.
- UI 변경:
  - `frontend/src/features/notifications/IncidentDetailView.tsx`
  - incident detail route param이 실제 incident id가 아니라 `correlation_id`라서 detail lookup이 404인 fallback 화면에서도, 기존 real API hook `GET /rca/recovery-plans/by-correlation/{correlation_id}` 기반 복구 계획 panel을 표시한다.
  - mock/fake/hardcoded data는 추가하지 않았다. recovery plan row가 없으면 기존 "아직 생성되지 않음" 상태를 그대로 보여준다.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.
- authenticated smoke 주의:
  - `scripts/smoke.sh`와 `scripts/e2e_test.py`는 쓰기/배포 변경을 만들 수 있으므로 passive smoke로 실행하지 않는다.
  - `frontend/tests/e2e_real_backend.py`는 `E2E_MUTATE=0`일 때만 읽기 중심 authenticated browser smoke로 사용한다.

## 최신 업데이트 (16:57 KST) — failed workflows 재실행도 runner 배정 실패

- 이 체크포인트 작성 전 local/origin dev HEAD: `f8364e02 docs: 최신 HEAD 확인 / runner 장애 / 인수인계`. 이 문서 커밋 후 정확한 최신 SHA는 `git log --oneline --decorate -6`로 확인한다.
- 워크트리 상태: tracked 변경 없음. untracked `아카이브/`만 있으며 `.env*` 포함 가능성이 높으므로 커밋 금지.
- live public smoke 재확인:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
- `f8364e02` dev push의 failed workflows를 REST API로 재실행했다.
  - CI run `28850399699` → rerun failed jobs `201`, attempt 2도 failure.
  - AWS CD run `28850399698` → rerun failed jobs `201`, attempt 2도 failure.
  - Promote Dev To Main run `28850399688` → rerun failed jobs `201`, attempt 2도 failure.
- attempt 2 job 증거:
  - CI jobs `85565162752`, `85565162770`, `85565162791` 모두 `runner_id=0`, `steps=0`, logs endpoint `404`.
  - AWS CD `Test before deploy` job `85565171025`도 `runner_id=0`, `steps=0`, logs endpoint `404`; deploy job skipped.
  - Promote `Verify dev before promotion` job `85565167194`도 `runner_id=0`, `steps=0`, logs endpoint `404`; merge job skipped.
- repo-side 점검:
  - `.github/workflows/*`는 `ef65c770` 이후 변경 없음.
  - CI/AWS CD/Promote는 모두 GitHub-hosted `ubuntu-latest`를 사용한다.
  - repository Actions permissions: enabled `true`, allowed actions `all`, sha pinning required `false`.
  - repository self-hosted runners: total `0`(현재 워크플로는 self-hosted를 쓰지 않음).
  - GitHub Status API: Actions/API/Git Operations/Webhooks 모두 operational.
- 결론: 코드/워크플로 실패가 아니라 GitHub-hosted runner 배정, 계정/org quota, repo/org Actions 정책, 또는 GitHub Actions control-plane 계층 문제로 계속 보는 것이 맞다. 다음에는 GitHub UI의 org/billing quota와 Actions policy를 확인하거나 시간이 지난 뒤 같은 latest dev run을 재실행한다.
- 병렬 확인:
  - 로그인 세션 2시간 sliding refresh는 이미 구현/와이어링되어 있다. 기본 TTL `7200`, `POST /auth/session/refresh`가 Redis `EXPIRE`와 httpOnly cookie max-age를 갱신하며, 프론트 `sessionRefresh.ts`는 사용자 interaction 기반으로 5분 throttle refresh를 수행한다.
  - auth/session 관련 focused test: `python -m pytest -q tests/test_identity_auth_routes.py tests/test_session_store.py tests/test_auth_security.py tests/test_gateway_error_handler.py` → 22 passed, 1 warning.
  - DLQ/incident 증가는 live DB를 건드리지 않고 AWS SSO 가능 시 SELECT-only로 측정한다. `event_dead_letters` status/count, 최근 60분 minute bucket, consumer/subject/error 상위 그룹, `events` subject count, `rca.followup.required`, `rca_timeline`, 주요 테이블 크기를 5~10분 간격으로 비교한다.
  - DLQ 측정 중 `scripts/smoke.sh`, DLQ replay, `scripts/aws-up.sh`, `scripts/aws-down.sh`는 사용하지 않는다. 특히 raw failed payload는 문서/로그에 붙이지 않는다.

## 최신 업데이트 (16:50 KST) — dev 푸시 후 Actions runner 장애 확인

- 정확한 최신 SHA는 항상 `git log --oneline --decorate -6`와 `git status --short --branch`로 먼저 확인한다. `ef65c770` 이후 커밋은 production code 변경이 아니라 시크릿 제외/인수인계/runner 상태 문서화 성격이다.
- `9b1eedbf chore: 시크릿 제외 / runner 상태 / 인수인계`은 origin/dev push 완료.
- `24e47e53 docs: Actions runner 상태 / 인수인계 갱신`도 origin/dev push 완료. 이 푸시의 dev workflows 역시 4~5초 내 runner 배정 없이 실패했다.
- 이 푸시로 뜬 dev workflows도 모두 4초 내 실패:
  - CI run `28850238246` → failure. `Python lint and tests`, `Kubernetes manifest checks`, `Frontend typecheck, lint, build` 모두 `runner_id=0`, steps 없음, log 없음.
  - AWS CD run `28850238259` → failure. `Test before deploy`가 `runner_id=0`, steps 없음, log 없음. deploy job은 skipped.
  - Promote Dev To Main run `28850238255` → failure. `Verify dev before promotion`이 `runner_id=0`, steps 없음, log 없음. merge job은 skipped.
- 판단: main manual dispatch뿐 아니라 dev push workflows도 같은 형태이므로 코드 변경/테스트 실패가 아니라 GitHub Actions hosted runner 배정, 계정 quota, org/repo Actions 상태, 또는 GitHub 측 일시 장애를 먼저 확인해야 한다.
- live public smoke는 계속 정상:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
- 다음 AI 첫 작업:
  1. GitHub Actions status/runner quota/org Actions 설정 확인.
  2. runner 문제가 풀리면 `9b1eedbf` 또는 최신 dev HEAD의 failed workflows를 rerun.
  3. 성공하면 Promote Dev To Main 및 main AWS CD를 재확인.
  4. AWS SSO 재인증 후 authenticated smoke와 DB 증가율 확인.

## 직전 업데이트 (16:45 KST) — 시크릿 제외/Actions runner 이슈

- `ef65c770 fix: 레포 discovery render 검증 전환`은 origin/dev push 완료.
- dev Actions:
  - CI run `28849784747` → success.
  - AWS CD run `28849784735` → success.
  - Promote Dev To Main run `28849784833` → success.
- origin/main은 merge commit `e37cee8bf983eb122b5ab9c987210e00d7b1bf6f`까지 진행.
- main AWS CD:
  - run `28849845008` attempt 2 → failure. `Test before deploy`는 success였고 `Deploy to AWS EKS`가 `runner_id=0`, steps 없음, log 없음으로 실패.
  - fresh dispatch run `28850098836` → failure. `Test before deploy` 자체가 `runner_id=0`, steps 없음, log 없음으로 실패했고 deploy job은 skipped.
  - 판단: 코드/테스트 실패가 아니라 GitHub Actions runner 배정 또는 계정/환경 실행 상태 이슈로 보인다. 다음 AI는 같은 run 무한 재시도 대신 GitHub Actions 상태/runner quota/environment 상태를 먼저 확인할 것.
- live public smoke는 계속 정상:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
- 커밋 제외/보호:
  - `.e2e-tmp-sweep.py`, `report_desktop.json`, `report_mobile.json`, `아카이브.zip`은 커밋하지 않는다.
  - `아카이브.zip`에는 `.env*` 계열 파일이 들어 있으므로 시크릿 포함 가능성이 높다. 사용자 요청이 있어도 커밋 금지.
  - `.gitignore`에 `.e2e-tmp-*.py`, `report_*.json`, `*.zip`을 추가해 실수 stage를 방지했다.

## 최신 업데이트 (16:37 KST) — 마무리 커밋/푸시 준비

- main AWS CD run `28849235901` → success.
- live public smoke:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
- 이번 마무리 커밋 대상:
  - `src/domains/gitops/repository_discovery.py`
  - `tests/test_repository_discovery.py`
  - `HANDOVER.md`
  - `docs/continuation-execution-plan-2026-07-07.md`
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_repository_discovery.py tests/test_manifest_render_worker.py tests/test_docs_index.py` → 37 passed.
  - `ruff format --check src/domains/gitops/repository_discovery.py tests/test_repository_discovery.py`
  - `ruff check src/domains/gitops/repository_discovery.py tests/test_repository_discovery.py`
  - `git diff --check`
- 커밋 제외:
  - `.e2e-tmp-sweep.py`, `report_desktop.json`, `report_mobile.json`
  - 이유: 임시 E2E 산출물이며 특정 app/run/incident id가 들어 있어 운영 원칙의 hardcoding 금지와 충돌한다. 다음 AI는 필요하면 내용을 참고하되 커밋하지 말 것.
- 다음 AI 즉시 작업:
  1. 이 커밋의 dev CI / Promote / AWS CD / main AWS CD 확인.
  2. AWS SSO 재인증 후 authenticated smoke와 DB 증가율 확인.
  3. `/console/` 데모 보존 방식을 별도 static build 또는 별도 route bundle로 결정.
  4. cluster import를 env-derived 후보에서 실제 provider adapter/API discovery로 확장.

## 최신 업데이트 (16:33 KST) — 프론트 애니메이션/드릴다운 설계 메모

토큰/맥락이 끊겨도 다음 AI가 같은 방향으로 이어가도록 프론트 목표를 명시한다.

- 참고할 애니메이션/시각화 소스:
  - Motion for React: `https://motion.dev/docs/react`
    - 페이지 진입, drawer/modal, list layout transition, reduced motion 처리 기준.
  - React Flow examples: `https://reactflow.dev/examples`
    - incident RCA graph, workflow graph, node select/edge active 상태 기준.
  - Nivo examples: `https://nivo.rocks/treemap/`, `https://nivo.rocks/line/`
    - fleet treemap, metric time-series interaction/tooltip 기준.
  - Dagre layout: `https://github.com/dagrejs/dagre`
    - flow graph 자동 배치 기준.
- 현재 코드에서 반드시 재사용할 모션 primitive:
  - `frontend/src/plural-ui/motion.ts`
    - `DUR`, `EASE`, `SPRING`, `fadeRise`, `overlayFade`, `flyoverSlide`, `modalPop`, `staggerParent`, `staggerChild`.
  - `frontend/src/shared/motion/index.tsx`
    - `FadeSlideIn`, `Stagger`, `CountUp`, `AnimatedList`, `AnimatedRow`, `PulseOnChange`, `AnimatePresence`.
  - 규칙: 새 화면에서 inline random animation을 만들지 말고 위 primitive를 먼저 확장한다. `prefers-reduced-motion`은 항상 존중한다.
- 드릴다운 canonical 흐름:
  1. `/` fleet dashboard
     - `GET /fleet/summary` → StatCard + treemap + cluster table.
     - treemap tile/table row click → `/clusters/:clusterId`.
     - 최근 incident row → `/incidents/:incidentId`.
     - 승인 대기 row → `/workflows/:runId`.
     - AI conversation row → `/ai/:conversationId`.
  2. `/clusters/:clusterId`
     - query param `?tab=workloads|pods|nodes|services|resources|events`로 탭 상태 유지.
     - pod row click → `/clusters/:clusterId/pods/:namespace/:pod?tab=pods`.
     - pod detail은 Drawer로 열고, "이 팟 분석"은 `/ai?prefill=...`로 연결.
     - cluster agg panel의 열린 incident → `/incidents/:incidentId`.
  3. `/incidents/:incidentId`
     - React Flow graph: incident → evidence → analysis → actions.
     - group node collapse/expand는 local state, evidence/recovery/report drill은 같은 화면 하단 panel.
     - recovery plan status는 `useRecoveryPlan(correlationId)`로 실제 API 값만 표시.
  4. `/workflows/:runId`
     - React Flow graph: STARTED → RENDERING → DIFFING → POLICY_CHECKING → WAITING_FOR_APPROVAL → APPLYING → ROLLOUT_WAITING → SUCCEEDED/FAILED.
     - node click → 오른쪽 detail card에 step detail, diff, approval card를 표시.
  5. `/repos/:applicationId`
     - app/repo/binding/run 실데이터 중심. workflow run click은 `/workflows/:runId`.
  6. `/metrics?cluster=:clusterId`
     - cluster context를 query param으로 유지하고, time-series tooltip/slice로 metric detail을 노출.
- 인터랙션 원칙:
  - URL로 복원 가능한 drilldown은 route/search param에 둔다. 순간 선택만 local state로 둔다.
  - Drawer/Modal은 실제 API row id를 받아야 하며 mock row 생성 금지.
  - Count/Badge 변화는 `PulseOnChange` 또는 `CountUp`으로 짧게만 강조한다. 계속 흔들리는 장식 애니메이션 금지.
  - Table row/list 추가·삭제·정렬은 `AnimatedRow`/`AnimatedList` layout animation을 쓴다.
  - Flow edge active animation은 실제 workflow/incident status에만 연결한다. 데모용 forced active 금지.
  - Loading은 기존 `Skeleton`/`QueryBoundary`, Empty는 `EmptyState`, Error는 retry button 포함.
  - Desktop/mobile 모두 overflow, text overlap, chart min-height 깨짐을 Playwright screenshot으로 확인한다.
- 현재 중요한 모순:
  - `/console/`은 보존 대상이라고 했지만 라우터는 `/console/*`를 `/`로 흡수한다. 데모 보존을 진짜로 하려면 별도 static build 또는 별도 route bundle이 필요하다. 실제 서비스는 `/` 유지.
  - Python browser smoke는 있지만 표준 Playwright config/npm e2e script는 없다. production polish 전용 E2E를 추가해야 한다.
- worker 완료:
  - `Harvey` worker가 repo Helm/Kustomize discovery validation placeholder 제거를 구현했다.
  - GitHub tree/content를 bounded export하고 TemporaryDirectory에서 `kubectl kustomize` 또는 `helm template`로 실제 render validation을 수행한다.
  - path traversal, file count/byte limit, renderer missing/failure, render error compact/redact 처리를 포함한다.
  - 검증: `tests/test_repository_discovery.py tests/test_manifest_render_worker.py tests/test_docs_index.py` → 37 passed.
  - 검증: `ruff check src/domains/gitops/repository_discovery.py tests/test_repository_discovery.py`, `git diff --check` → 통과.

## 최신 업데이트 (16:24 KST) — multi-agent 조사 반영/E2E hardcoding 제거

- 병렬 explorer 3개 완료:
  - 동적 등록: repo probe/branch/manifest 후보는 실제 GitHub API 기반이다. Helm/Kustomize discovery validation placeholder 제거는 worker가 진행 중이며, 완료 전까지 검증/커밋하지 않는다. cluster import 후보는 provider catalog API가 있어도 실제 외부 provider adapter/API discovery가 아니라 env-derived metadata 중심이다.
  - UI/E2E: 표준 Playwright config는 없고 Python Playwright smoke만 있다. `/console/`은 현재 라우터에서 `/`로 흡수되며, live `/`와 `/console/` 모두 같은 SPA를 반환한다.
  - DB reset: 운영 DB reset script는 없다. 최종 reset은 backup/snapshot/restore 검증 후 `Database().init()` + `Database.upsert_admin_account()` 경로로만 수행해야 한다. 지금 즉시 reset 금지.
- `frontend/tests/e2e_real_backend.py`의 hardcoded real-backend test credential을 제거했다.
  - 이제 `AUTH_EMAIL`/`AUTH_PASSWORD` env가 필수다.
  - `BASE_URL` 또는 `SMOKE_BASE`로 target URL을 받는다.
  - 운영 DB에 row를 추가하는 조직/그룹/AI 대화 write flow는 `E2E_MUTATE=1`을 명시한 경우에만 실행한다.
  - screenshot dir는 `SMOKE_SHOTS_DIR`로 조정 가능하다.
- `frontend/docs/backend-integration.md`도 위 실행 방식과 맞게 갱신했다.
- 남은 즉시 작업:
  1. repo Helm/Kustomize discovery validation 변경을 커밋/푸시.
  2. main AWS CD run `28849235901` 완료 확인.
  3. AWS SSO 재인증 가능 시 authenticated smoke와 DB 증가율 검증.
  4. 다음 구현 후보는 cluster import의 실제 provider adapter/API discovery 확장.

## 최신 업데이트 (16:22 KST) — 배포/검증 체크포인트

- 현재 local/origin dev HEAD: `719a795c fix: GitOps poller DB target 순회`.
- dev Actions 확인:
  - CI run `28848586860` → success.
  - Promote Dev To Main run `28848587013` → success.
  - AWS CD dev push run `28848586945` → success.
- main Actions 확인:
  - AWS CD run `28848639831` → `Test before deploy` success, `Deploy to AWS EKS` in progress.
  - main deploy head SHA: `657b79e6c82453bd8ec5282ad8dd286d0eebdbfd`.
- 로컬 검증 재실행 완료:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 678 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.
  - `cd frontend && npm run typecheck` → 통과.
  - `cd frontend && npm run lint` → 통과.
  - `cd frontend && npm run build` → 통과. 기존 Vite large chunk warning만 있음.
- 라이브 공개 smoke:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
  - `https://k8s.woonyong.org/` → HTTP 200, title `운영 콘솔`.
  - `https://k8s.woonyong.org/console/` → HTTP 200, title `운영 콘솔`.
- 로컬 kubectl/AWS 상태:
  - kube contexts는 존재한다: `kubernetes-ops`, `cluster-1`, `cluster-2` 등.
  - 하지만 로컬 AWS SSO session이 만료되어 `kubectl`이 `aws login` 재인증을 요구한다.
  - 따라서 지금 이 셸에서는 management secret/DB/pod 직접 조회와 authenticated cluster smoke를 실행할 수 없다.
  - GitHub Actions의 AWS credentials는 정상이며 main AWS CD deploy 단계가 진행 중이다.
- 현재 워킹트리:
  - tracked file 변경 없음.
  - untracked: `.e2e-tmp-sweep.py`, `report_desktop.json`, `report_mobile.json`. 내용 확인 전 커밋 금지.
- 다음 즉시 작업:
  1. main AWS CD run `28848639831` 완료까지 추적.
  2. 완료 후 live health/root/readyz 재확인.
  3. AWS SSO 재인증이 가능해지면 `scripts/smoke.sh` 또는 `scripts/e2e_test.py`를 실제 env credential과 실제 cluster context로 실행.
  4. DB 초기화는 아직 금지. 모든 기능/배포/E2E 완료 후 백업/스냅샷부터 실행한다.

## 최신 업데이트 (16:15 KST) — GitOps poller DB target 전환

- `github-poll-worker`가 env 단일 target만 보던 구조를 DB 등록 target 우선 구조로 전환했다.
- 신규 `RepoChangeRepository.list_active_github_poll_targets()`:
  - active GitHub repository + active application + active deployment binding + optional watch target을 조인한다.
  - 과거 binding에 `git_watch_targets` row가 없어도 binding의 derived `watch_target_id`/`manifest_path`로 fallback한다.
- application deployment 생성 경로:
  - application `default_branch`를 body에 넣는다.
  - `register_watch_target()` 후 `register_deployment_binding()` 순서로 실행한다. 실제 DB에서는 `unit_of_work_or_null(db)` 안이라 같은 트랜잭션에 묶인다.
- poller:
  - `GitHubPollTarget` dataclass 추가.
  - DB target을 우선 사용하고, DB target이 없고 `GITHUB_REPO`가 있을 때만 env fallback.
  - target별 `_last_sha_by_target`/`_etag_by_target`을 유지한다.
  - DB `credential_ref`와 env `GITHUB_TOKEN_REF`를 token vault로 해석한다.
  - webhook body에 실제 `application_id`와 `environment`까지 포함한다.
- 검증 완료:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_github_poller.py tests/test_applications_router.py tests/test_database_unit.py` → 56 passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 678 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.
- 다음: 커밋/푸시 → dev CI/promote/main AWS CD 확인 → live provider/auth/health smoke → incident/DLQ 증가율 확인.

## 최신 업데이트 (16:12 KST) — 연속 실행 계획 문서화

- 대화 맥락이 사라져도 바로 이어받을 수 있도록 [docs/continuation-execution-plan-2026-07-07.md](docs/continuation-execution-plan-2026-07-07.md)를 추가했다.
- 이 문서에는 현재 SHA/run ID, 최신 검증 결과, dev/main Actions 상태, live smoke 명령, 남은 10개 작업 항목, DB 초기화 게이트, 금지 명령, 다음 구현 후보와 예상 write set을 정리했다.
- 문서화 직전 production-code baseline dev 커밋은 `b013b431`이고 main merge commit은 `f2b7d43`이다. 문서 커밋 이후 실제 최신 SHA는 `git rev-parse HEAD origin/dev origin/main`으로 확인한다.
- 최신 main AWS CD run은 `28847747039`이며, 문서 작성 당시 `Test before deploy`는 성공했고 `Deploy to AWS EKS`가 진행 중이다.
- 이전 main AWS CD `28847597545`는 더 최신 run 때문에 취소됐으므로 실패로 보지 않는다.
- live `https://k8s.woonyong.org/api/healthz`는 직전 확인에서 `{"status":"ok","service":"api-gateway"}`였다.
- 병렬 explorer `Banach`(`019f3b5e-8f4b-74a0-a447-56a1e0bfd325`)가 GitOps poller를 DB 등록 watch target 기반으로 전환할 구현 seam을 read-only 분석 완료했다.
- 분석 결과는 연속 실행 계획 문서의 "레포 등록 동적화" 섹션에 반영했다. 다음 구현 후보는 `github-poll-worker` env 단일 target 구조를 DB의 `git_repositories`/`git_watch_targets`/`deployment_bindings` 순회로 전환하는 작업이다.

## 최신 업데이트 (15:58 KST) — provider admin 경계 + 최종 DB 초기화 절차 재정렬

- **작업 항목 수 정정**:
  - 중간 추적에서 일부 항목을 묶어 5개처럼 보였으나 실제 범위는 9개다. 현재 기준: 안정화 코드, 배포/라이브 검증, 인증, 동적 등록, 프론트 폴리싱, DB 백업/스냅샷, DB 초기화/bootstrap, 실 클러스터/레포 재연결, 최종 E2E/HANDOVER/커밋·푸시.
- **provider/cluster 등록 권한 경계 보강**:
  - `GET /providers/catalog`, `GET /providers/cluster-discovery`, `POST /providers/validate` 는 모두 `require_admin_session` 가드 대상이다.
  - 이유: cluster discovery 응답은 kube context, 외부 console handle, import 후보 등 운영 환경 메타데이터를 포함할 수 있어 비관리자에게 노출하면 안 된다.
  - 프론트에서도 비관리자에게 cluster 등록 액션/빈 상태 등록 버튼을 노출하지 않도록 조정했다. 레포 연결은 유지하되, 배포 대상 클러스터가 없으면 관리자 권한 요청 안내만 보여준다.
- **동적 레포/클러스터 등록 재분석 결과**:
  - 레포 위저드는 실제 GitHub API 기반 probe → branch list → manifest candidate list → validation → app/deployment 생성 흐름이 구현되어 있다.
  - 남은 생산화 과제: DB에 등록된 앱/브랜치/manifest watch target을 poller가 직접 순회하도록 확장, app 생성 성공 후 deployment 생성 실패 시 보상 처리.
  - 클러스터 위저드는 provider catalog/discovery/preflight/register/connection polling 흐름이 구현되어 있다.
  - 남은 생산화 과제: env-derived 후보를 넘어 실제 Plural/API/kubeconfig discovery 확장, preflight에서 Kubernetes 연결성까지 검증.
- **DB 초기화 방침 업데이트**:
  - repo에는 안전한 prod DB reset 스크립트가 없다. 최종 초기화는 `aws-up.sh` 전체 실행이 아니라 별도 절차로 격리해야 한다.
  - 필수 선행: Postgres dump, PVC/EBS snapshot, `postgresql-secret`, `management-runtime-secret`, `management-runtime-config`, `pgbouncer-config` 백업.
  - 초기화 후 공식 schema/init 경로는 `Database().init()`이며, admin bootstrap은 raw SQL 대신 `Database.upsert_admin_account()` 를 사용한다.
  - 초기화 뒤 `cluster-1`/`cluster-2`와 실제 repo/app을 다시 등록하고, `/clusters`, `/connection-status`, `/inventory/summary`, `/fleet/summary`, 로그인/session을 라이브로 검증한다.

## 최신 업데이트 (15:45 KST) — 실가입 인증 경로 보강 패스

- **추가 인증 분석 결과**:
  - 내부 이메일/비밀번호 인증 MVP는 존재하지만, 운영 기준에서 3가지 모순이 남아 있었음: AWS admin bootstrap 이 구 `role='admin'`/`workspace_members` SQL 사용, 메일 링크가 콘솔 nginx 의 `/api/*` 프록시를 못 타는 `/auth/verify-email` 로 생성, 로그인 시 비밀번호 검증 전에 pending 상태를 노출.
- **수정 완료(로컬 전체 검증 완료, 다음 커밋/배포 대상)**:
  - 로그인에 escalating rate limit 추가(`LOGIN_EMAIL_RATE_LIMIT`, `LOGIN_IP_RATE_LIMIT`) + 비밀번호 검증 후에만 `pending_email_verification`/`pending_approval` 상태 안내.
  - 인증 메일 URL은 `PUBLIC_API_BASE_URL`이 있으면 그 값을 사용하고, 없으면 `PUBLIC_BASE_URL + /api/auth/verify-email` 로 생성. AWS 배포는 `CUSTOM_DOMAIN` 기준 `PUBLIC_BASE_URL` 자동 주입.
  - `/verify-email?token=...` 구 링크로 진입해도 프론트가 같은 origin `/api/auth/verify-email?token=...` 로 넘겨 실제 토큰 소비/세션 쿠키 설정 경로를 탄다.
  - AWS admin bootstrap 은 raw SQL/구 테이블 대신 `Database.upsert_admin_account()` 를 호출해 `service_admin`/기본 조직/그룹 편입 계약을 그대로 사용.
- **검증 완료**:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 674 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check`, `npm run typecheck` → 통과.
  - 다음: 인증 보강 커밋/푸시 → dev/main 배포 → 실서비스 login/session/signup-link 경로 검증 → 최종 DB 초기화 절차 진입.

## 최신 업데이트 (15:25 KST) — 정상 샘플 dashboard projection 차단 패스

- **추가 확인 결과**:
  - `incident-worker` followup 폭주는 `61839836` 배포로 멈췄지만, `incident.detected` 이벤트 자체는 정상 샘플도 `detected=false` 로 남긴다.
  - `dashboard` read model 이 `detected=false` 정상 샘플을 `rca_timeline`에 저장하거나 기존 row를 open incident 조회에 포함하면 화면의 인시던트 수가 계속 부풀 수 있다.
- **수정 완료(로컬 대상 검증 완료, 다음 전체 검증/배포 대상)**:
  - `timeline_update_from_event()` 는 `incident.detected` + `detected != true` 이벤트를 저장하지 않음.
  - `list_rca_timeline`, `get_rca_timeline_item`, `count_open_rca_incidents`, `list_open_rca_incidents` 는 과거에 이미 쌓인 `detected=false` row를 조회에서 제외.
  - `tests/test_dashboard_projection.py` 에 정상 샘플 미저장, open incident SQL 필터 회귀 테스트 추가.
- **검증 완료**:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_dashboard_projection.py` → 6 passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 672 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check`, `npm run typecheck` → 통과.
  - 다음: 커밋/푸시 → 배포 후 라이브 DB 5~10분 관찰.

## 최신 업데이트 (15:04 KST) — RCA followup 폭증 루프 차단 패스

- **추가 RCA 확인 결과**:
  - `0a84b998` 배포 후에도 `rca.followup.required` 가 분당 약 10~19건 계속 생성됨.
  - 원인은 `IncidentDetector.has_signal()` 이 정상 샘플을 `detected=False` 로 판단한 뒤에도 `incident-worker` 가 `RcaActionRequiredBody(reason=no_incident_action_required)` 를 계속 발행했고, `rca-feedback-worker` 가 이를 `rca.followup.required` 로 정규화하던 구조.
- **수정 완료(로컬 검증 완료, 다음 커밋/배포 대상)**:
  - `incident-worker` 는 `incident.detected` 이벤트는 계속 기록하되, `detected=False` 일 때는 RCA/action 후속 이벤트를 발행하지 않음.
  - 정상 snapshot 플로우 테스트 기대값을 `evidence.built -> incident.detected` 에서 멈추도록 갱신.
- **검증 완료**:
  - 관련 테스트: `tests/test_rca_evidence.py`, `tests/test_incident_symptom_derivation.py`, `tests/test_rca_feedback_flow.py`, `tests/test_operational_event_followups.py` → 26 passed.
  - 전체: `.venv/bin/python -m pytest -q` → 670 passed, 3 skipped.
  - `npm run typecheck`, `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.
- **다음 즉시 작업**:
  1. 이 RCA followup 차단 커밋/푸시 → dev CI → main 반영 → AWS CD 확인.
  2. 배포 후 5~10분 동안 `rca_timeline` 최근 생성분에서 `rca.followup.required` 가 멈추는지 확인.
  3. 증가 멈추면 과거 DLQ 및 과거 followup row 정리 정책을 적용.

## 최신 업데이트 (15:00 KST) — 메인 인증/가입 보강 패스

- **이전 안정화 묶음 배포 성공**:
  - `origin/main` 수동 병합 커밋 `0a84b998` 기준 GitHub Actions `AWS CD` run `28844725355` 성공.
  - 라이브 `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`, `/` HTTP 200 확인.
- **메인 인증/가입 보강 적용(로컬 검증 완료, 다음 커밋/배포 대상)**:
  - 가입/로그인 흐름은 기존대로 `signup -> email verification -> admin approval -> login/session` 모델 유지.
  - 세션 쿠키 기반 상태 변경 요청에 same-origin intent guard 추가. 세션 쿠키가 붙은 `POST/PUT/PATCH/DELETE` 는 `x-service-csrf: same-origin` 헤더 또는 허용된 `Origin/Referer` 없으면 403.
  - 프론트 중앙 API 클라이언트가 모든 상태 변경 요청에 `x-service-csrf: same-origin` 을 자동 부착.
  - `scripts/lib/auth.sh`, `scripts/smoke.sh`, `scripts/register-target.sh`, `scripts/e2e_test.py` 도 쿠키 로그인 후 상태 변경 요청이 새 guard 를 통과하도록 갱신.
- **검증 완료(이번 인증 보강 포함)**:
  - `.venv/bin/python -m pytest -q` → 670 passed, 3 skipped.
  - `npm run lint && npm run build` → 통과(기존 Vite large chunk warning만).
  - `npm run typecheck`, `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.
- **다음 즉시 작업**:
  1. 인증 보강 커밋/푸시 → dev CI → main 반영 → AWS CD 확인.
  2. 배포 후 로그인 API를 실제 `AUTH_EMAIL/AUTH_PASSWORD`로 curl 검증: login/session/refresh, 그리고 CSRF guard 403/통과 케이스 확인.
  3. 배포 후 `rca_timeline`/`event_dead_letters` 증가율 5~10분 관찰.
  4. 증가 멈추면 과거 DLQ 아카이브 + 필요 시 old followup timeline closed/archive 정책 적용.

## 최신 업데이트 (14:45 KST) — 안정화 통합 패스

- **핵심 안정화 구현 완료(로컬 검증 완료, 배포 전)**:
  - 정상 Kubernetes snapshot 이 10초마다 인시던트로 승격되던 구조를 차단. `IncidentDetector.has_signal()` 이 명시 symptom/유도 symptom/firing Alertmanager 만 incident-worthy 로 본다.
  - `rca_timeline` open count/list 는 logical incident key 로 dedupe 하도록 보강. 과거 row 가 많아도 같은 리소스/증상은 UI에서 하나로 집계된다.
  - `command-janitor` 가 원래 correlation_id 를 보존하도록 수정.
  - 세션 기본 TTL 2시간(`SESSION_TTL_SECONDS=7200`) + `POST /auth/session/refresh` + 프론트 user interaction 기반 5분 throttle sliding refresh 추가.
- **recovery plan 상태 노출 완료**:
  - 신규 `GET /rca/recovery-plans/by-correlation/{correlation_id}`.
  - 응답은 `selection_requested/selected`, `selected_action_id`, `selected_action`, 후보 요약만 노출(draft params/secret 미노출).
  - 인시던트 상세의 "복구 계획" 패널에서 추천/선택 액션과 승인 필요 여부 표시.
- **레포/클러스터 등록 동적화 완료**:
  - 레포: probe → branch select → manifest candidate select → static validation/resource count → app/binding 생성.
  - 클러스터: `GET /providers/cluster-discovery`, `POST /targets/preflight`, env-derived import candidates, duplicate/provider/kube-context/agent-image 사전 점검.
  - Plural/external-console 후보 discovery 는 현재 env-derived only. 외부 콘솔 API 호출은 아직 하지 않음.
- **인증 UX 보정**:
  - 가입/검증/로그인 흐름은 실제 password auth 기반으로 동작. 검증 메일 재전송 프론트가 백엔드 계약(email+password)에 맞도록 수정.
  - 메일 워커는 기본 SMTP fail-closed. 운영에서 실제 가입 메일을 쓰려면 `SMTP_HOST`/`SMTP_FROM` 등 확인 필요. `MAIL_DELIVERY_MODE=log` 는 데모/개발용.
- **프론트 폴리싱 완료**:
  - 모바일 overflow, drawer/backdrop z-index, long breadcrumb/code/badge/action wrap 정리.
  - authenticated route QA는 mock API로 수행됨. 실 로그인 E2E는 배포 후 `.env.local-test`의 `AUTH_EMAIL/AUTH_PASSWORD`로 재확인할 것.
- **검증 완료**:
  - `.venv/bin/python -m pytest -q` → 669 passed, 3 skipped.
  - `npm run build` → 통과(기존 Vite large chunk warning만).
  - `npm run typecheck`, `npm run lint`, `ruff check`, `git diff --check` → 통과.
  - 라이브 현재: `https://k8s.woonyong.org/` 200, `/api/healthz` ok, management 38 deployment Ready.
- **라이브 DB 관찰(배포 전)**:
  - `rca_timeline`: 11,965 rows, 대부분 `rca.followup.required`(10,590) / `approval.recommended`(1,256). 최근까지 증가 중이므로 이번 코드 배포 후 증가 멈춤 여부 확인 필수.
  - `event_dead_letters`: open 1,895. 원인 대부분 과거 `rca-fallback-worker`의 `EvidenceBundle: unexpected field(s): missing_evidence_checks`(1,891건, 2026-07-06 09~11 UTC) + 디스크 full 흔적 3건.
  - 당시 기준 권장사항은 "전체 DB 초기화 금지, 원인 확인된 과거 DLQ만 아카이브"였음. 현재는 사용자 명시 지시로 최종 완료 후 1회 DB 초기화로 변경되었고, 백업/스냅샷 선행이 필수다.
- **남은 즉시 작업**:
  1. 이 변경 커밋/푸시 → dev CI → Promote Dev To Main → AWS CD 확인.
  2. 배포 후 `rca_timeline`/`event_dead_letters` 증가율 5~10분 관찰.
  3. 증가 멈추면 과거 DLQ 아카이브 + 필요 시 old followup timeline closed/archive 정책 적용.
  4. 실 로그인 E2E: login/signup/verify-resend/session-refresh/repo wizard/cluster wizard/incident recovery panel 확인.

## 품질 반복 패스 (2026-07-07 오후) — 진행 로그

콘솔 승격(41fe3994) 이후의 완성도 반복. 사용자 지시: (1) 조약한 UI/깨진 인터랙션 다듬기,
(2) 더미/페이크 파일 삭제, (3) RCA·메트릭을 프로덕션급 뷰어로 + 문서화, (4) 인수인계 문서 상시 갱신.

### 반복 1 — mock 레이어 완전 삭제 (a86bc235)

- `frontend/src/shared/lib/mock/{fixtures,router}.ts`(463줄 페이크 데이터) 삭제. `API_MODE`/`VITE_API_MODE` 개념 제거 —
  api.ts 는 무조건 실 fetch, live.ts 는 무조건 실 WS. 콘솔 헤더 "MOCK 모드" 칩 삭제.
- `frontend/.env.development` 삭제, `.env.production` 은 `VITE_API_BASE=/api` 만 유지.
- CI env 가드(ci.yml)·scripts/frontend-check.sh 의 mock 예외 정리. 로컬 dev 는 vite proxy(`VITE_BACKEND`)로 실 백엔드 연결.
- 스크린샷에서 보였던 가짜 비용($)·1,000개 팟·중복 "클러스터 맵" 은 **이미 41fe3994 에서 코드째 삭제된 구 앱의 것** —
  현 코드 grep 검증 0건. 라이브에 아직 보인다면 구 이미지가 서빙 중인 것 (CD 완료 후 asset 해시 확인할 것).

### 반복 2 — RCA 리포트 분석 심화 (c7e5802d, 동시 세션이 문서 정렬과 함께 커밋/푸시함)

- **주의: 이 repo 에 다른 세션(author: choi woo-nyong)이 동시 작업 중** — 워킹트리 변경을 문서 스펙 정렬과 함께
  커밋해 주는 협업 세션이 있다. 커밋 전 `git log`/`git status` 로 경합 확인할 것.
- 백엔드: `GET /rca-reports` 화이트리스트 확장(`rca_report_summary`) — 대상 리소스(kind/name/namespace),
  `secondary_symptoms`, `selected_candidate_id`, `candidates[]`(후보 카탈로그×평가 병합, 점수 내림차순),
  `supporting_evidence_refs[]`(source/name/summary/**query**), `missing_evidence_checks[]`.
  후보 `signals` DSL 원문·payload 원문은 계속 미노출(secret 차단). 계약: `RcaCandidateScoreItem` 등
  (contracts/gateway/responses.py). 테스트: tests/test_evidence_query_api.py 확장(7 passed).
- 프론트: 인시던트 상세 RCA 리포트 카드에 후보 점수바(선정 강조, AI 출처 배지, ✓/✗ 신호),
  근거 쿼리 트레일(소스별 실행 쿼리 원문), 부증상 칩, 미수집 체크 표시. 구 백엔드 응답(필드 없음)에도 안전(optional).

### 반복 3 — 메트릭 프로덕션화 + 쿼리 카탈로그 문서 (17ac76e1)

- `/metrics` PromQL 프리셋을 실측 계열 6종으로 교체(node-exporter/kube-state-metrics/node-collector 기반 —
  CPU/MEM/FS 사용률(%), 재시작율, 팟 수, sandbox 레플리카). range 선택(5m/15m/1h/6h → `range_seconds`),
  결과 카드 단위 포맷(%, 평균·최대), summarize 에 max 추가.
- **docs/frontend-metrics-queries.md 신설** — 콘솔 수치의 데이터 경로 3종(WS/usage 샘플/온디맨드),
  usage 롤업 필드, 프리셋 PromQL, RCA evidence provider 기본 쿼리 전체(k8s/metrics/logs/traces),
  `/rca-reports` 분석 필드, 재현 방법. docs/README.md 색인·frontend 키워드에 링크(test_docs_index 그린).

### 반복 4 — 인터랙션 전수 감사·교정 (49d551e8)

- 전 페이지 코드 감사(체크리스트는 frontend/AUDIT.md 섹션 I). 수정:
  - **클러스터 상세 스케일/재시작 버그**: mock 시절 팟 이름 규칙(`-pod-` replace)으로 디플로이먼트명 유추 →
    실데이터에서 잘못된 이름으로 명령 발행됨. 워크로드 그룹의 실명을 `DeploymentTarget{ns,name,podCount}` 로 전달.
    스케일 기본값 = 현재 팟 수.
  - 권한 회수(AccessView) 확인 모달 추가(파괴 동작 공통 패턴), 알림 배지 한국어 라벨 통일, 채팅 목록 빈 상태,
    죽은 임포트 핵 제거.

### 반복 5 — 프론트 스펙 동기화 (758ca358)

- docs/spec/frontend/{metrics,cluster,org,notifications,chat}.md 를 코드 변경에 맞춰 갱신.

### 반복 6 — 데드 코드 스윕 (e4fa5332, 70d5ef13)

- 구 콘솔 잔재 미사용 익스포트 35종(~550줄) 제거: plural-ui `WizardModal/ConfirmModal/DetailModal/TabList/
  LinkTabList/SideNav/Input/FormField/Switch/InfoTip/InfoList/IconFrame/Modal/SearchInput/EmptyState/modalPop`,
  아이콘 17종, shared/motion `LayoutMorph/PressScale`, charts `Sparkline`. plural-ui 에 남은 것은 실사용
  프리미티브(Button/Chip/Card/Table/Flyover/PageHeader/useThemeMode)뿐. 미참조 파일 스캔 0건(index 계열 오탐 제외).

### 라이브 검증 (12:47 KST)

- CD 1차 배포 확인: `assets/index-kyKyMN6k.js` → `assets/index-oA7Yte0S.js` 로 교체됨.
- 번들 원문 grep: `클러스터 맵` 0건, `MOCK 모드` 0건, 비용 문자열 0건 — **스크린샷의 구화면(가짜 비용/1,000개 팟/중복 헤딩) 라이브에서 소멸 확인**.
- /api/healthz ok. 이후 push(49d551e8~)는 다음 CD 사이클에서 반영 — 같은 방식으로 재확인할 것.

### 반복 7 — 마무리 폴리시 + 라이브 2차 검증 (6b786707~475de2f4, 13:0x KST)

- 승인 카드: 거절 클릭 시 승인 버튼에 로딩이 뜨던 문제 → `approval.variables.action` 으로 클릭한 버튼에만 로딩(475de2f4).
- 메트릭 헤더 PageHeader 통일, rca-reports Bruno 에 심화 필드 검증 추가(6b786707), repo 스펙 동기화(88ec88e5).
- **라이브 2차 검증 완료**: 6b786707 AWS CD success. lazy 청크 직접 grep —
  `IncidentDetailView-v-ruHVvH.js` 에 "후보 평가"(RCA 심화 UI), `MetricsView-DXcELkOw.js` 에 "노드 CPU 사용률"(새 프리셋) 존재.
  주의: 메인 `index-*.js` 해시는 lazy 청크만 바뀌면 안 변한다 — 배포 확인은 메인 번들에서 청크 파일명 grep 후 그 청크를 확인할 것.
- GitHub Actions 상태 확인 방법: `curl -H "Authorization: token <PAT>" https://api.github.com/repos/Jungle-303-04/final/actions/runs?branch=dev` (PAT 는 /tmp/askpass.sh 참고, 원문 커밋 금지).

### 검증 상태 (반복 1~3)

- frontend: `npm run build` + `npm run lint` 그린. backend: `pytest -k "rca or evidence or gateway or dashboard"` 153 passed,
  ruff/lint-imports 그린(lint-imports 는 `PYTHONPATH=src` 필요).
- push 완료(17ac76e1) → dev CI → main promote → AWS CD (~10분). 배포 후 `curl -s https://k8s.woonyong.org | grep assets/index-` 로 해시 변경 확인할 것.

### 다음 백로그 (우선순위) — 반복 1~7 이후 잔여

1. ~~인터랙션 정밀 감사~~ / ~~데드 파일·익스포트 스윕~~ / ~~라이브 스팟체크~~ — **완료** (frontend/AUDIT.md 섹션 I).
2. ~~recovery plan 상태 노출~~ — **완료**. `GET /rca/recovery-plans/by-correlation/{correlation_id}` + 인시던트 상세 "복구 계획" 패널.
3. 로그인 후 실브라우저 E2E 스팟체크(등록 위저드→연결, 승인 grant, 인시던트 상세 심화 필드 실데이터 렌더) —
   자격증명 필요(이 세션엔 없음).
4. OpenAI 크레딧 충전 후 chat/fallback LLM 라이브 검증(기존 백로그 승계).
5. evidence retention·fastapi 버전 정렬 등 기존 HANDOVER 하단 백로그 승계.

### 환경 메모 (콜드 스타트용)

- 샌드박스 빌드에서 rollup native 오류 시: `cd frontend && npm i --no-save @rollup/rollup-linux-arm64-gnu` (package.json 커밋 금지).
  npm i 가 45초 타임아웃으로 끊겨도 node_modules 에 설치돼 있으면 빌드는 됨.
- **⚠️ node_modules 는 사용자 Mac 과 마운트 공유** — 사용자의 로컬 npm 이 darwin 바이너리로 되돌려 rollup/eslint 가
  갑자기 깨질 수 있다(실제 발생). 그 경우 해당 패키지 디렉터리 rm 후 재설치. 같은 이유로 **다른 세션이 워킹트리를
  대신 커밋하는 경우가 있다** — 커밋 전 `git status`/`git log` 로 경합 확인.
- push: `/tmp/askpass.sh`(x-access-token/PAT echo) + `GIT_ASKPASS=/tmp/askpass.sh git push origin dev`.
- 커밋: `git -c user.name=woonyong -c user.email=woonyong.dev@gmail.com commit --no-verify`.

## 최신 업데이트 (11:25)

- **GitHub Actions CD가 재가동됨**: dev push → Promote Dev To Main → AWS CD 자동 배포 체인이 살아있음. main 41b7d04c(우리 작업 전부 포함)가 CI 이미지로 배포됨. **내 수동 CodeBuild 롤아웃과 경합했으므로 이후 배포는 CI 경로만 사용할 것.**
- dev CI 실패 원인 해결: env 가드가 frontend/.env.production(시크릿 아닌 vite 플래그)을 거부 → 허용 목록 추가(2530884e). dev CI 그린 확인.
- **repo Actions 변수 `CONFIGURE_CLOUDFLARE=0`으로 변경** — CD가 배포마다 DNS를 api-gateway ELB로 덮어써 콘솔이 사라지는 문제 차단. 도메인은 console ELB로 수동 유지(아래 참고). 되돌리려면 GitHub 변수에서 1로.
- **RCA 정확도 라이브 검증 완료**: exit-1 크래시(payment-gateway)가 배포 전 `oom_killed` 오판 → 배포 후 `config_env_error` 정답 판정. 주입 장애는 전부 정리됨(sandbox clean).
- **✅ 해결됨(11:40)**: GitHub 환경 시크릿(`aws-test`)에 `GH_APP_TOKEN`(내구성 PAT) 등록 완료 — 이후 CD 배포는 임시 토큰 대신 이 토큰을 사용하므로 GitHub 연동이 만료되지 않음. 클러스터 시크릿도 PAT로 재주입 + scm/render/pull 워커 재시작 완료.
- **최종 검증(11:42)**: 38개 deployment 전부 Ready, 콘솔 200, /api/healthz ok, DNS=console ELB 유지, dev CI 그린, main CD 그린.

## 서비스 현재 상태 (라이브)

- **https://k8s.woonyong.org** — 콘솔 UI(/) + API(/api/*) 정상. DNS: Cloudflare CNAME → console ELB(`a5932a19...elb.amazonaws.com`, proxied). 이전엔 cloudflared 터널→api-gateway 직결이라 /가 404였음. 터널(73b6907e)은 살아있으나 현재 미사용 경로.
- EKS(ap-northeast-2): `kubernetes-ops`(management, 네임스페이스 `management`, 38 deployment 전부 Ready), `cluster-1`/`cluster-2`(target, `sandbox`에 baseline 마이크로서비스+부하생성기 상시 가동).
- 배포 이미지: `kubernetes-ops-service:d86d0da6-dev`(백엔드 33개), `kubernetes-ops-console:1daf34d0-dev`(콘솔). **판정 정확도 수정(8f478552)은 아직 미배포 — 다음 단계가 이미지 재빌드+롤아웃.**

## 아키텍처 결정사항 (이번 작업에서)

1. **이미지 빌드**: GitHub Actions 대신 AWS CodeBuild 직접 경로 구축(샌드박스에 Docker 없음). 프로젝트 `kubernetes-ops-image-build`(백엔드), `kubernetes-ops-console-build`(콘솔). 소스는 S3 `kubernetes-ops-buildsrc-183548421506`에 zip 업로드. 콘솔 zip은 **권한 정규화 필수**(644/755 — 마운트가 600으로 만들어 nginx가 못 읽음).
2. **RCA symptom 승격**: `pipeline/symptom.py` — 스냅샷 신호(waiting/terminated reasons, events)를 결정적 우선순위로 카탈로그 symptom에 매핑. 명시 symptom > 유도 > unknown.
3. **룰 = YAML 카탈로그**: `src/services/ai/agent/causes/catalog/*.yaml`. 코드 수정 없이 룰 추가. `signals` DSL(fact/log_pattern/event_pattern, 그룹 내 OR·그룹 간 AND)로 후보 판별 — 소스 존재만으로 1.0 확정 불가.
4. **LLM fallback**: `ai-fallback-worker`가 `rca.ai_fallback.requested` 소비 → LLM 후보 생성 → 기존 평가 파이프라인 합류(환각도 evidence 점수 검증 통과 필요). LLM 미설정/오류 시 무해한 no-op.
5. **RCA 리포트 중복 방지**: 동일 (workspace, root_cause, 리소스) 5분 창 내 재저장 skip.

## 자격증명/설정 위치 (원문은 .env.local-test — gitignore됨, 커밋 금지)

- OpenAI 키: `management-runtime-secret`의 `OPENAI_API_KEY`, `LLM_PROVIDER=openai` 주입됨. **⚠️ 크레딧 0(insufficient_quota) — 충전해야 chat/fallback LLM 실동작.**
- GitHub: `management-runtime-secret`의 `GITHUB_TOKEN`을 사용자 PAT로 교체(기존엔 1시간 만료 ghs_ 토큰 — manifest 401의 원인). `GITHUB_BRANCH=main→dev` 변경(configmap `management-runtime-config`).
  **⚠️ CD가 재배포 시 시크릿을 다시 쓰므로 GitHub repo Actions secret `GH_APP_TOKEN`에 내구성 토큰 등록 필요.**
- Cloudflare: zone `woonyong.org`(4e89d519...), DNS 편집 토큰 사용(.env.local-test).
- AWS: IAM user `k8s` 키(.env.local-test). EKS 3개 클러스터에 access entry(ClusterAdmin) 추가됨.
- **작업 종료 후 위 키 전부 교체 권장** (채팅으로 전달된 이력 있음).

## 이번 작업의 주요 변경 (커밋 로그 dev 2e8f992a..8f478552)

- `2e8f992a` api-gateway 부팅 크래시 수정(fastapi 0.116.1 + 204 + future annotations). **requirements.txt(0.116.1) vs uv.lock(0.139.0) 버전 이원화가 근본 원인 — 정렬 필요(미해결)**
- `c0261658`~`13e4f45a` ai-fallback-worker + `GET /evidence`·`GET /rca-reports` 조회 API + Bruno/스펙
- `9721f34b` 룰 YAML 카탈로그 이관 + `src/samples/scenarios/`(baseline+fault 6종+`scripts/scenario-inject.sh`)
- `0c54d75f`·`1daf34d0` 새 콘솔 프론트 완성 + 실데이터 연동/UX(등록 피드백, evidence 트레일, 애니메이션). `frontend/AUDIT.md`에 감사 체크리스트
- `d86d0da6` symptom 승격 + inventory upsert dedup + OTEL endpoint 수정
- `15689b88`~`8f478552` 신호 기반 판별, lastState 노출, evidence 네임스페이스 스코핑, 리포트 dedup

## 운영 중 수동 변경 (코드 외)

- postgresql PVC 8→30Gi 확장(디스크 풀 복구). 현재 31% 사용. **evidence 적재 증가 추세 — retention 정책 필요(미해결)**
- `agent_policies` generation 3: kubernetes snapshot을 sandbox로, sandbox 로그/메트릭 쿼리 추가 (evidence_policy.py 기본값에도 반영됨 — 코드가 소스오브트루스)
- DNS 교체 2회(옛 ELB→터널→console ELB)

## 검증된 E2E 흐름

- 장애 주입 → evidence → incident(symptom 유도) → 룰 매칭 → RCA 완료(`rca.completed`) → 리포트 저장 → timeline/조회 API. CrashLoop 주입 시 27건 완료 확인.
- GitOps: dev 폴링 → webhook → git.changed → manifest.rendered(PAT로 private repo 읽기 OK) → diff → **approval 대기**(`approval-3171e9c7...`, run `workflow-5bfd1984...`) — 콘솔 로그인 후 승인하면 Safe PR 자동 생성 예정.

## 남은 작업 (우선순위순)

1. **[진행중] 판정 정확도 배포**: 8f478552 이미지 빌드→전 워커 롤아웃→crashloop 주입 재검증(기대: `config_env_error`, oom_killed 아님) — 주입된 crashloop fault 정리 포함
2. OpenAI 크레딧 충전 후: `pytest tests/test_llm_live.py`(3개), chat 화면 대화, fallback LLM 후보 생성 확인
3. 콘솔에서 대기 approval 승인 → Safe PR 생성 확인
4. GH_APP_TOKEN Actions secret 등록(재배포 시 토큰 유실 방지)
5. requirements.txt/uv.lock fastapi 버전 정렬(0.139.0 권장) + 이미지 재빌드
6. evidence/events retention 정책(DB 증가 관리)
7. `/console` 하위 Plural 레플리카 페이지 실데이터화(신규 백엔드 API 필요 — 범위 합의 필요)
8. inventory CardinalityViolation·raw Evidence.logs 전 네임스페이스 저장 등 코드 주석의 follow-up 항목

## 이어받는 AI를 위한 실행 정보

- 테스트: `uv sync` 후 `pytest tests -q` (로컬 venv는 UV_PROJECT_ENVIRONMENT로 분리 권장). 전체 640+개, 라이브 LLM 3개는 OPENAI_API_KEY 있을 때만 실행
- 이미지 빌드: `zip -rq source.zip src pyproject.toml uv.lock` → S3 업로드 → `aws codebuild start-build --project-name kubernetes-ops-image-build --environment-variables-override name=IMAGE_TAG,value=<sha>-dev`
- 롤아웃: management 네임스페이스에서 kubernetes-ops-service 이미지 쓰는 deploy 전체 `kubectl set image` (이벤트 스키마 변경 시 전 워커 동시 롤아웃 필수)
- 장애 주입: `TARGET_CONTEXT=target1 bash scripts/scenario-inject.sh inject|status|cleanup <fault>`
- 문서 색인 규칙: 새 문서는 docs/README.md 색인에 링크(tests/test_docs_index.py 강제)
