# Continuation Execution Plan — 2026-07-07

이 문서는 대화 맥락이 완전히 사라져도 다음 AI/개발자가 같은 작업을 이어가기 위한 단일 실행 문서다.
이 문서가 최신 상태인지 먼저 보고, 더 최신 내용은 repo root의 `HANDOVER.md` 상단을 확인한다.

## 0. 절대 원칙

1. 운영 코드, 운영 화면, API 응답, DB 복구/초기화 절차에 mock/fake/hardcoded production data를 넣지 않는다.
2. 테스트 내부의 fake/stub은 허용되지만 운영 경로에 연결하면 안 된다.
3. 라이브 화면 수치와 drilldown은 실제 DB/API/클러스터 관측값만 사용한다.
4. DB 초기화는 최종 안정화 완료 후 1회만 한다.
5. DB 초기화 전에 반드시 백업/스냅샷을 만든다.
6. 사용자가 만든 변경을 되돌리지 않는다. `git reset --hard`, `git checkout -- <file>` 금지.
7. 커밋은 최소 단위로 나누고, 각 단위마다 테스트 → 커밋 → 푸시 → 배포 확인 → HANDOVER 갱신을 닫는다.
8. `/console/`은 데모 보존 대상이고, 실제 서비스는 `/`다.

## 1. 현재 상태 요약

### 2026-07-07 18:40 KST 체크포인트

- 클러스터 드릴 URL state/컨텍스트 액션 보강.
- 구현:
  - 노드/서비스/워크로드 drawer를 local state 대신 URL search state로 복원 가능하게 만들었다.
  - 지원 URL:
    - `/clusters/{cluster_id}?tab=nodes&detail=node&name={node}`
    - `/clusters/{cluster_id}?tab=services&detail=service&namespace={ns}&name={service}`
    - `/clusters/{cluster_id}?tab=workloads&detail=workload&namespace={ns}&name={workload}`
  - 새로고침 후에도 실제 inventory API 응답에서 대상 리소스를 찾아 drawer가 다시 열린다.
  - cluster/node/service/workload/pod ContextActions는 이벤트, 메트릭, AI 분석 세 경로를 모두 제공한다.
  - 이벤트: `/clusters/{cluster_id}?tab=events&q={target}`.
  - 메트릭: `/metrics?cluster=...&subject=...&name=...&namespace=...`.
  - AI: `/ai?prefill=...`.
  - 워크로드 묶음은 실제 pod inventory의 `workload_name || pod.name` 기준으로 산출한다.
- 검증:
  - `cd frontend && npm test` → 5 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
  - `git diff --check` → passed.
- 다음 실행 순서:
  - AI chat prefill이 기존 `/ai` 컴포넌트 재사용 시에도 갱신되는지 수정.
  - 실제 대화/메시지 API 응답 품질, recovery action card context, 삭제 UX를 service-grade로 polish.
  - 이후 repo/cluster 등록 wizard의 동적 단계와 시각 polish를 이어간다.

### 2026-07-07 18:34 KST 체크포인트

- evidence/inventory 공개 응답 raw 차단.
- 구현:
  - `GET /evidence`는 더 이상 저장된 evidence `payload` 원문을 반환하지 않는다.
  - 응답 항목은 `cluster_id`, `evidence_ref`, `summary`, `sources[]` 안전 요약으로 구성된다.
  - `sources[]`는 source별 집계와 허용된 lineage 메타만 포함한다. 허용 필드: `schema_version`, `collector`, `collector_version`, `source_version`, `query_version`, `collected_at`, `evidence_key`, `source_id`, `agent_id`, `window_start`.
  - `GET /clusters/{cluster_id}/inventory/resources` 계열 공개 응답에서 Kubernetes raw object를 제거했다. DB/저장소 내부 raw는 유지한다.
  - 인시던트 상세 증거 panel은 raw JSON 대신 evidence ref, source 요약, collector version을 표시한다.
  - 프론트 타입/adapter에서 raw payload 의존을 제거했다.
- 운영 판단:
  - 실제 데이터 원칙은 유지한다. 값 자체를 가짜로 대체하지 않고, 실제 저장된 데이터에서 안전한 집계/lineage만 projection한다.
  - source version/collector version/evidence key는 버전 갱신·롤백 판단에 쓰기 위해 남긴다.
  - token/secret/manifest/raw Kubernetes object는 API와 UI에 노출하지 않는다.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_evidence_query_api.py tests/test_inventory_domain.py tests/test_fleet_router.py tests/test_platform_foundation_openapi.py` → 29 passed.
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm test` → 4 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
  - `git diff --check` → passed.
- 다음 실행 순서:
  - 이 체크포인트 커밋/푸시.
  - repo 등록 wizard: repo probe → branch select → manifest candidate select → render validation → binding 생성 흐름을 실제 API와 화면 상태로 재점검/폴리싱.
  - cluster 등록 wizard: provider discovery/import/preflight/listbox 흐름에서 실제 API 누락·UI 품질·검증 상태를 점검.
  - drill view: cluster → node/service/workload → pod 각 레벨에서 events/metrics/AI 분석 URL state와 drawer/detail이 유지되는지 수정.
  - AI chat: 실제 백엔드 연결, 대화 삭제 UX, recovery/action 컨텍스트 연결, 서비스형 채팅 UI 품질 개선.

### 2026-07-07 18:22 KST 체크포인트

- `6cf5f548 fix: 드릴 메트릭 / 실제시각 / 로그인 복원`은 origin/dev push 완료.
- 최신 Actions:
  - `6cf5f548`: CI `28855387595`, AWS CD `28855387636`, Promote `28855387617` failure.
  - 모든 test/verify job은 `runnerName=null`, 4~6초 내 failure. deploy/merge job은 skipped.
  - `c2dd6901`: CI `28854743151`, AWS CD `28854743097`, Promote `28854743082`도 같은 패턴.
  - 코드 로그가 없는 runner allocation/Actions control-plane/quota/policy 계층 문제로 본다.
- 라이브 smoke:
  - `/` HTTP 200, `/console/` HTTP 200.
  - `/api/healthz` HTTP 502.
  - `/api/readyz` timeout.
  - `/api/providers/cluster-discovery` timeout.
  - DB reset 금지. Cloudflare origin, console nginx `/api` proxy, api-gateway service/endpoints/rollout부터 확인한다.
- 정리:
  - collection/aws-test Bruno 인증값은 placeholder + `auto_login: false`.
  - 실제 AWS 계정은 gitignore된 `*.local.bru` 또는 Bruno UI override에만 둔다.
  - `frontend/docs` stale mock 설명과 삭제된 mock import script를 정리했다.
  - `tests/test_docs_index.py`가 `frontend/docs`와 `frontend/scripts`도 stale language scan에 포함한다.

### 2026-07-07 18:14 KST 체크포인트

- 프론트 실제시각/드릴 메트릭 보강.
- 구현:
  - adapter fallback에서 `new Date()` timestamp 합성을 제거했다. 백엔드가 관측 시각을 주지 않으면 빈 값으로 두고 `timeAgo()`가 `—`를 표시한다.
  - `/metrics?cluster=...&subject=...&name=...&namespace=...`는 선택 context에 맞는 PromQL 후보를 자동 입력한다.
  - pod는 container restart rate, workload는 deployment replicas, node는 node CPU, service는 kube service info, cluster는 namespace별 pod count로 매핑한다.
  - 실행은 기존 real command pipeline(`POST /agent/debug/query`, `GET /commands/{id}`)을 그대로 사용한다.
  - 로그인 redirect는 `pathname + search + hash`를 보존한다. drill/metrics/ai prefill URL이 인증 경유 후에도 유지된다.
  - light theme의 invalid hex token을 수정했다.
- 검증:
  - `cd frontend && npm test` → 4 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `cd frontend && npm run build` → passed. 기존 large chunk warning 만 있음.
  - `git diff --check` → passed.

### 2026-07-07 18:04 KST 체크포인트

- AI 대화 삭제 API/프론트/Bruno 계약이 1차 구현됐다.
- 구현:
  - `DELETE /ai/conversations/{conversation_id}`는 세션 workspace 범위의 대화만 삭제한다.
  - 메시지는 FK cascade로 함께 삭제된다.
  - 프론트 `ChatView` 목록 row와 현재 대화 헤더에서 삭제할 수 있다.
  - Bruno `07-ai/05-delete-conversation.bru`, API map, gateway/ai spec에 DELETE 계약을 추가했다.
- 검증:
  - `uv run pytest tests/test_docs_index.py tests/test_bruno_collection.py tests/test_ai_conversation.py -q` → 27 passed.
  - `bash scripts/frontend-check.sh` → typecheck, eslint, unit test, production build OK.
  - `make check` → 688 passed, 3 skipped; manifest check 포함.
  - `make manifest-check` → management 53 objects, target 16 objects.

### 2026-07-07 18:10 KST 체크포인트

- evidence lineage/rollback 표시가 1차 구현됐다.
- 핵심 설계:
  - `EvidenceItem.source`는 룰 매칭용 안정 키로 유지한다.
  - 수집·버전 메타는 evidence JSON payload 내부 `_lineage`에 저장한다. 새 최상위 event body 필드는 rolling deploy 중 구버전 워커 DLQ를 만들 수 있어 쓰지 않는다.
  - `/rca-reports`는 raw evidence payload 대신 `supporting_evidence_refs[]`에 허용된 lineage 필드만 노출한다.
  - 인시던트 상세 RCA 리포트는 schema/collector/version/evidence_key/window/agent 메타를 표시한다.
  - 복구 후보 row에는 `rollback_plan`을 표시한다.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_rca_evidence.py tests/test_evidence_query_api.py` → 17 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.
- DB 초기화:
  - 사용자는 신버전 구현 완료 후 기존 DB를 삭제하고 새 버전으로 시작하길 원한다.
  - 아직 실행 금지. 모든 기능/배포/E2E/live smoke 완료 후 백업/스냅샷, reset/migrate/bootstrap, 실제 cluster/repo 재등록, fresh evidence 수집 확인 순서로만 진행한다.

### 2026-07-07 17:16 KST 체크포인트

아래의 오래된 SHA/run ID는 당시 기록으로 보존한다. 실제 재개 시에는 가장 위의 체크포인트와 `HANDOVER.md` 상단을 먼저 본다.

- `c5f81982 fix: repo manifest 검증 gate 강화`는 origin/dev push 완료.
- 해당 push의 dev workflows도 runner 배정 없이 실패:
  - CI run `28851760498`: failure.
  - Promote Dev To Main run `28851760555`: failure.
  - AWS CD run `28851760534`: failure.
  - 기존과 같은 runner allocation 계층 문제로 본다.
- 프론트 테스트 추가:
  - `frontend/tests/incident_detail_recovery_fallback.test.mjs`: Vite SSR + React Query cache로 incident detail `not_found` fallback이 real recovery-plan payload를 표시하는지 검증.
  - `frontend/package.json`: `npm test` script 추가.
  - `frontend/tests/README.md`: mock 중심 설명 제거, component smoke와 real-backend smoke(`E2E_MUTATE=0`) 원칙 문서화.
- 검증:
  - `cd frontend && npm test` → 1 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.

### 2026-07-07 17:14 KST 체크포인트

- `ec00ea77 feat: target preflight 연결성 확인`은 origin/dev push 완료.
- 해당 push의 dev workflows도 runner 배정 없이 실패:
  - CI run `28851671441`: failure.
  - AWS CD run `28851671409`: failure.
  - Promote Dev To Main run `28851671384`: failure.
  - 기존과 같은 runner allocation 계층 문제로 본다.
- repo 연결 위저드 개선:
  - `frontend/src/features/resources/ConnectRepoWizard.tsx`.
  - legacy placeholder인 `validation.status === "not_run"`으로는 진행하지 못하게 막고, `validation.valid === true`일 때만 app/binding 생성 단계로 진행한다.
- 검증:
  - `python -m pytest -q tests/test_repository_discovery.py tests/test_manifest_render_worker.py` → 28 passed.
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.

### 2026-07-07 17:10 KST 체크포인트

- `2107376f feat: incident 복구계획 fallback 연결`은 origin/dev push 완료.
- 해당 push의 dev workflows도 runner 배정 없이 실패:
  - CI run `28851117498`: jobs `85566424069`, `85566424087`, `85566424088` all `runner_id=0`.
  - Promote Dev To Main run `28851117588`: verify job `85566424109` `runner_id=0`, merge skipped.
  - AWS CD run `28851117482`: `Test before deploy` job `85566424684` `runner_id=0`, deploy skipped.
- target 등록 preflight 개선:
  - direct apply(`deploy_provider="kube-context"`, `apply=true`)이고 allowlist/provider/image 검증을 통과하면 `kubectl [--context <ctx>] get --raw=/version --request-timeout=5s`로 실제 Kubernetes API 연결성을 non-mutating 방식으로 확인한다.
  - 실패/timeout/kubectl 없음은 preflight error로 반환된다.
- 검증:
  - `python -m pytest -q tests/test_target_registration.py tests/test_provider_registry.py` → 31 passed, 1 warning.
  - `python -m compileall -q src/domains/target/router.py tests/test_target_registration.py` → passed.
  - `git diff --check` → passed.
  - 로컬에는 `.venv`와 `uv`, 시스템 `ruff`가 없어 `ruff check`는 실행하지 못했다.
- Actions runner mitigation:
  - 현재 token은 repo read/push는 가능하지만 repo/org admin·billing runner 설정 API는 403/404로 접근 불가다.
  - org owner/repo admin이 org Actions policy, billing/quota, hosted runner limits, runner groups를 확인해야 한다.
  - retry canary는 Promote/AWS CD가 아니라 CI의 `Kubernetes manifest checks` 단일 job을 우선 사용한다. 최신 job id는 `85566424088`(run `28851117498`).

### 2026-07-07 17:02 KST 체크포인트

- `dd02f260 docs: Actions runner 재실행 기록`은 origin/dev push 완료.
- 이 푸시로 생성된 dev workflows도 runner 배정 없이 즉시 실패했다:
  - Promote Dev To Main run `28850987065`: failure.
  - CI run `28850987079`: failure.
  - AWS CD run `28850987004`: failure.
  - 세부 패턴은 직전과 동일하게 `runner_id=0`, steps/log 없음으로 본다. 코드 실패로 단정하지 않는다.
- UI advance:
  - `frontend/src/features/notifications/IncidentDetailView.tsx`.
  - incident detail lookup 404 fallback 화면에서도 real API hook `GET /rca/recovery-plans/by-correlation/{correlation_id}` 기반 복구 계획 panel을 표시한다.
  - mock/fake/hardcoded data 없음. recovery plan row가 없으면 기존 not-generated 상태를 표시한다.
- 검증:
  - `cd frontend && npm run typecheck` → passed.
  - `cd frontend && npm run lint` → passed.
  - `git diff --check` → passed.
- authenticated smoke 주의: `scripts/smoke.sh`, `scripts/e2e_test.py`는 쓰기/배포 변경을 만들 수 있으므로 passive smoke로 실행하지 않는다. `frontend/tests/e2e_real_backend.py`는 `E2E_MUTATE=0`일 때만 사용한다.

### 2026-07-07 16:57 KST 체크포인트

- 이 체크포인트 작성 전 local/origin dev HEAD: `f8364e02 docs: 최신 HEAD 확인 / runner 장애 / 인수인계`. 이 문서 커밋 후 정확한 최신 SHA는 `git log --oneline --decorate -6`로 확인한다.
- 워크트리는 tracked clean이어야 한다. untracked `아카이브/`는 `.env*` 포함 가능성이 높으므로 커밋하지 않는다.
- 정확한 현재 local/origin dev HEAD는 `git log --oneline --decorate -6`와 `git status --short --branch`로 확인한다. 이 문서가 자기 자신을 커밋할 때마다 SHA가 바뀌므로 문서 안의 SHA는 체크포인트 예시로만 본다.
- 최신 production code 기준 dev HEAD: `ef65c770 fix: 레포 discovery render 검증 전환`.
- `ef65c770` 이후 커밋은 시크릿 제외, local artifact ignore, runner 상태, 인수인계 갱신 성격이다.
- 최신 dev failed workflows를 REST API로 재실행했지만 attempt 2도 같은 형태로 실패했다:
  - CI run `28850399699`: rerun failed jobs `201`, attempt 2 failure. Jobs `85565162752`, `85565162770`, `85565162791` all `runner_id=0`, `steps=0`, logs `404`.
  - AWS CD run `28850399698`: rerun failed jobs `201`, attempt 2 failure. `Test before deploy` job `85565171025` `runner_id=0`, `steps=0`, logs `404`; deploy skipped.
  - Promote Dev To Main run `28850399688`: rerun failed jobs `201`, attempt 2 failure. `Verify dev before promotion` job `85565167194` `runner_id=0`, `steps=0`, logs `404`; merge skipped.
- repo-side 점검:
  - `.github/workflows/*`는 `ef65c770` 이후 변경 없음.
  - CI/AWS CD/Promote는 모두 GitHub-hosted `ubuntu-latest`를 사용한다.
  - repository Actions permissions: enabled `true`, allowed actions `all`, sha pinning required `false`.
  - repository self-hosted runners: total `0`; 현재 워크플로는 self-hosted를 쓰지 않는다.
  - GitHub Status API: Actions/API/Git Operations/Webhooks all operational.
- 판단: 코드/워크플로 실패가 아니라 GitHub-hosted runner 배정, 계정/org quota, repo/org Actions 정책, 또는 GitHub Actions control-plane 계층 문제로 계속 본다.
- 다음 조치: GitHub UI에서 org/billing quota와 Actions policy를 확인하거나 시간이 지난 뒤 latest dev run failed jobs를 다시 rerun한다. 성공하면 Promote Dev To Main 및 main AWS CD를 재확인한다.
- live public smoke:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.

### 2026-07-07 16:50 KST 체크포인트

- `9b1eedbf chore: 시크릿 제외 / runner 상태 / 인수인계`는 origin/dev에 push 완료.
- `24e47e53 docs: Actions runner 상태 / 인수인계 갱신`도 origin/dev에 push 완료했고 동일하게 새 dev workflows가 runner 배정 없이 실패했다.
- 대표 dev workflow failure:
  - CI run `28850238246`: failure. 모든 job이 steps/log 없음, runner 배정 없음.
  - AWS CD run `28850238259`: failure. test job이 steps/log 없음, runner 배정 없음. deploy skipped.
  - Promote Dev To Main run `28850238255`: failure. verify job이 steps/log 없음, runner 배정 없음. merge skipped.

### 2026-07-07 16:45 KST 체크포인트

- 코드 기준 dev HEAD: `ef65c770 fix: 레포 discovery render 검증 전환`.
- `ef65c770`는 origin/dev에 push 완료, dev CI/AWS CD success, Promote Dev To Main success.
- origin/main은 merge commit `e37cee8bf983eb122b5ab9c987210e00d7b1bf6f`까지 진행.
- main AWS CD latest 상태:
  - run `28849845008` attempt 2: failure. `Test before deploy` success, `Deploy to AWS EKS` failure, runner 배정 없음(`runner_id=0`), steps/log 없음.
  - fresh dispatch run `28850098836`: failure. `Test before deploy`도 runner 배정 없음(`runner_id=0`), steps/log 없음, deploy skipped.
  - 판단: 코드/테스트 실패가 아니라 GitHub Actions runner 배정, quota, repo Actions 상태, environment 실행 상태를 먼저 확인해야 한다.
- 직전 성공 main AWS CD run: `28849235901`: success.
- live public smoke:
  - `https://k8s.woonyong.org/api/healthz` → `{"status":"ok","service":"api-gateway"}`.
  - `https://k8s.woonyong.org/api/readyz` → `{"status":"ready"}`.
- 현재 로컬 tracked 변경:
  - `.gitignore`: 임시 E2E 산출물과 로컬 압축 아카이브 stage 방지.
  - `HANDOVER.md`: 시크릿 제외 원칙과 main Actions runner 실패 상태 갱신.
  - `docs/continuation-execution-plan-2026-07-07.md`: 이 체크포인트 갱신.
- worker `Harvey` 보고:
  - GitHub tree/content를 bounded export한 뒤 TemporaryDirectory에서 `kubectl kustomize` 또는 `helm template` 실행.
  - path traversal, file count/byte limit, renderer missing/failure 응답, render error compact/redact 처리.
  - 실행 테스트: `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_repository_discovery.py tests/test_manifest_render_worker.py` → 28 passed.
  - 실행 lint: `PYTHONPATH=src .venv/bin/python -m ruff check src/domains/gitops/repository_discovery.py tests/test_repository_discovery.py` → passed.
- 메인 에이전트 추가 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_repository_discovery.py tests/test_manifest_render_worker.py tests/test_docs_index.py` → 37 passed.
  - `PYTHONPATH=src .venv/bin/python -m ruff check src/domains/gitops/repository_discovery.py tests/test_repository_discovery.py` → passed.
  - `git diff --check` → passed.
- 이번 마무리 커밋 대상:
  - `.gitignore`
  - `HANDOVER.md`
  - `docs/continuation-execution-plan-2026-07-07.md`
- 커밋 제외:
  - `.e2e-tmp-sweep.py`
  - `report_desktop.json`
  - `report_mobile.json`
  - local env archive zip
  - 이유: 임시 E2E 산출물에는 특정 app/run/incident id가 있고, env archive는 secret 포함 가능성이 높다. hardcoding 금지와 secret hygiene 원칙상 커밋하지 않는다.
- dev Actions:
  - CI run `28849784747`: success.
  - Promote Dev To Main run `28849784833`: success.
  - AWS CD dev push run `28849784735`: success.
- main Actions:
  - latest failed run `28850098836`: no runner/log.
  - previous failed run `28849845008`: deploy job no runner/log.
  - previous successful run `28849235901`: success.
  - deploy head SHA: `e37cee8bf983eb122b5ab9c987210e00d7b1bf6f`.
- 로컬 검증:

```bash
PYTHONPATH=src .venv/bin/python -m pytest -q
# 678 passed, 3 skipped

ruff format --check src scripts tests
ruff check src scripts tests
git diff --check
# all passed

cd frontend && npm run typecheck
cd frontend && npm run lint
cd frontend && npm run build
# all passed, Vite large chunk warning only
```

- 라이브 공개 smoke:

```bash
curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
# {"status":"ok","service":"api-gateway"}

curl --max-time 8 -fsS https://k8s.woonyong.org/api/readyz
# {"status":"ready"}

curl --max-time 8 -fsS -D - https://k8s.woonyong.org/ -o /tmp/k8s-root.html
# HTTP 200, title: 운영 콘솔

curl --max-time 8 -fsS -D - https://k8s.woonyong.org/console/ -o /tmp/k8s-console.html
# HTTP 200, title: 운영 콘솔
```

- 로컬 인증/클러스터 접근 상태:
  - `kubectl config get-contexts`에는 `kubernetes-ops`, `cluster-1`, `cluster-2` 등이 있다.
  - 현재 로컬 AWS SSO session은 만료되어 `kubectl`이 `aws login` 재인증을 요구한다.
  - 이 상태에서는 management secret, Postgres pod, cluster inventory, authenticated live E2E를 직접 조회할 수 없다.
  - GitHub Actions의 AWS credentials는 정상 동작 중이므로 main CD 결과를 우선 추적한다.
- 워킹트리:
  - 위 4개 tracked 변경이 있으면 검증 후 작은 커밋으로 닫는다.
  - untracked `.e2e-tmp-sweep.py`, `report_desktop.json`, `report_mobile.json`은 내용 확인 전 커밋 금지.

즉시 이어갈 명령:

```bash
gh run list --repo Jungle-303-04/final --branch dev --limit 8
gh run list --repo Jungle-303-04/final --branch main --limit 8
curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
curl --max-time 8 -fsS https://k8s.woonyong.org/api/readyz
PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_repository_discovery.py tests/test_manifest_render_worker.py tests/test_docs_index.py
PYTHONPATH=src .venv/bin/python -m ruff check src/domains/gitops/repository_discovery.py tests/test_repository_discovery.py
git diff --check
git status --short --branch
```

프론트 애니메이션/드릴다운 설계:

- 참고할 소스:
  - Motion for React: `https://motion.dev/docs/react`
  - React Flow examples: `https://reactflow.dev/examples`
  - Nivo treemap/line: `https://nivo.rocks/treemap/`, `https://nivo.rocks/line/`
  - Dagre layout: `https://github.com/dagrejs/dagre`
- 기존 primitive를 먼저 재사용한다:
  - brand UI motion token file under `frontend/src/*-ui/motion.ts`
    - `DUR`, `EASE`, `SPRING`, `fadeRise`, `overlayFade`, `flyoverSlide`, `modalPop`, `staggerParent`, `staggerChild`.
  - `frontend/src/shared/motion/index.tsx`
    - `FadeSlideIn`, `Stagger`, `CountUp`, `AnimatedList`, `AnimatedRow`, `PulseOnChange`, `AnimatePresence`.
  - `frontend/src/shared/ui/charts.tsx`
    - `TreemapChart`, `TimeSeriesChart`; Nivo motion은 `useReducedMotion()`으로 직접 제어.
- 드릴다운 canonical route:
  1. `/`
     - `GET /fleet/summary`를 StatCard, treemap, cluster table에 매핑.
     - treemap tile/table row → `/clusters/:clusterId`.
     - recent incident → `/incidents/:incidentId`.
     - pending approval/workflow → `/workflows/:runId`.
     - AI conversation → `/ai/:conversationId`.
  2. `/clusters/:clusterId`
     - `?tab=workloads|pods|nodes|services|resources|events`로 탭 복원.
     - pod row → `/clusters/:clusterId/pods/:namespace/:pod?tab=pods`.
     - pod detail은 Drawer, AI 분석 진입은 `/ai?prefill=...`.
     - cluster agg panel incident → `/incidents/:incidentId`.
  3. `/incidents/:incidentId`
     - React Flow graph: incident → evidence → analysis → actions.
     - evidence/action group collapse는 local state, recovery plan은 실제 `useRecoveryPlan(correlationId)` API.
  4. `/workflows/:runId`
     - React Flow graph: STARTED → RENDERING → DIFFING → POLICY_CHECKING → WAITING_FOR_APPROVAL → APPLYING → ROLLOUT_WAITING → SUCCEEDED/FAILED.
     - node click → right detail card with step detail/diff/approval.
  5. `/repos/:applicationId`
     - repo/app/binding/run 실데이터 중심. run click → `/workflows/:runId`.
  6. `/metrics?cluster=:clusterId`
     - cluster context를 query param으로 보존하고 time-series tooltip/slice로 detail 노출.
- 모션 적용 규칙:
  - URL 복원 가능한 drilldown은 route/search param에 둔다.
  - 순간 선택만 local state로 둔다.
  - table/list add/remove/reorder는 `AnimatedRow`/`AnimatedList`.
  - count/badge 변화는 `CountUp`/`PulseOnChange`.
  - Flow edge active animation은 실제 incident/workflow status에만 연결한다.
  - 계속 흔들리는 장식, gradient orb, fake demo active state 금지.
  - loading은 `Skeleton`/`QueryBoundary`, empty는 `EmptyState`, error는 retry button 포함.
  - desktop/mobile screenshot으로 overflow/text overlap/chart min-height를 확인한다.
- 현재 모순:
  - `/console/`은 데모 보존 대상이지만 라우터는 `/console/*`를 `/`로 흡수한다. 진짜 보존하려면 별도 static demo build 또는 별도 route bundle이 필요하다.
  - 표준 Playwright config/npm e2e script가 없다. production polish 전용 E2E 추가 필요.

병렬 explorer 결론:

- Repo 등록:
  - `/repositories/discovery/probe`, `branches`, `manifests`, `validate`는 실제 GitHub repository/branch/tree/content API를 사용한다.
  - 단, Helm/Kustomize discovery validation은 아직 placeholder이며 실제 render validation으로 바꿔야 한다.
- Cluster 등록:
  - provider catalog/discovery/preflight/register/connection polling flow는 있다.
  - import 후보는 실제 외부 provider adapter/API 호출이 아니라 env-derived metadata 중심이다.
  - selected import candidate의 `external_handle`, `console_url`, `labels`는 현재 register payload로 보존되지 않는다.
- GitOps poller:
  - DB target 순회 후 `/github/webhook` → `git.webhook.received` → `git.changed` → `manifest.rendered` → workflow run까지 이어지는 경로는 있다.
  - poller 내부 dedup은 메모리이고, 최종 중복 억제는 git-pull/render 단계의 DB cursor에 의존한다.
- UI/E2E:
  - 표준 Playwright config와 npm e2e script는 없다.
  - Python Playwright smoke가 있지만 mock smoke와 real backend smoke가 섞여 있었고, real backend smoke의 hardcoded credential은 제거했다.
  - `/console/`은 현재 `/`로 redirect/absorb되어 demo 보존 요구와 충돌한다. 별도 정적 demo 보존 또는 명시 redirect 정책 중 하나를 결정해야 한다.
- DB reset:
  - 운영 DB 안전 reset script는 없다.
  - `DROP/TRUNCATE/DELETE`, Redis flush, NATS purge, PVC/EBS 삭제, `aws-down.sh`, `aws-up.sh` reset 용도 실행은 현재 금지.
  - 최종 reset은 backup/snapshot/restore 검증 후 `Database().init()` + `upsert_admin_account()` 경로로만 수행한다.

AWS SSO 재인증 후 실행할 authenticated smoke:

```bash
BASE_URL=https://k8s.woonyong.org \
AUTH_EMAIL=<secret-from-approved-env> \
AUTH_PASSWORD=<secret-from-approved-env> \
SMOKE_CLUSTER_ID=<real-cluster-id> \
MGMT_CONTEXT=kubernetes-ops \
TARGET_CONTEXT=cluster-1 \
bash scripts/smoke.sh

BASE_URL=https://k8s.woonyong.org \
AUTH_EMAIL=<secret-from-approved-env> \
AUTH_PASSWORD=<secret-from-approved-env> \
SMOKE_CLUSTER_ID=<real-cluster-id> \
MGMT_CONTEXT=kubernetes-ops \
TARGET_CONTEXT=cluster-1 \
PYTHONPATH=src .venv/bin/python scripts/e2e_test.py
```

위 예시의 `<secret-from-approved-env>` 값은 문서/로그/커밋에 남기면 안 된다. shell history에 남는 것도 피해야 하므로 실제 실행은 temporary env file 또는 one-shot sanitized wrapper를 사용한다.

### 브랜치와 커밋

- 작업 브랜치: `dev`.
- 이 문서 작성 직전 production-code baseline local/dev 및 origin/dev: `b013b431d5c766ea4c2b37f75ce31db974d98efe`
  - 커밋 메시지: `docs: target preflight route 상수 정합성`
- 최신 origin/main: `f2b7d43c0c5eba7afb5d5a6a92e4cfb837db6d11`
  - dev를 main에 자동 merge한 merge commit.
- 이 문서 자체 또는 이후 HANDOVER 문서 커밋 때문에 origin/dev가 더 앞서 있을 수 있다. 항상 `git rev-parse HEAD origin/dev origin/main`으로 실제 최신 SHA를 먼저 확인한다.
- `git status --short --branch` 기준 추적 파일은 깨끗해야 한다.
- 현재 untracked로 남아 있을 수 있는 파일:
  - `.e2e-tmp-sweep.py`
  - `report_desktop.json`
  - `report_mobile.json`
- 위 untracked 파일은 자동 E2E 산출물/임시 파일로 보인다. 내용을 확인하기 전에는 커밋하지 않는다.

### 최근 완료한 안정화 커밋

1. `001bd278 fix: 정상 샘플 / RCA 표시 / 운영 원칙`
   - 정상 `incident.detected` 중 `detected != true`를 dashboard projection/read model에서 제외.
   - 전체 테스트 통과 당시 `672 passed, 3 skipped`.
2. `9d919082 fix: 실가입 인증 / 부트스트랩 / 메일 링크`
   - 로그인 rate limit, 비밀번호 검증 전 pending 정보 노출 방지.
   - `PUBLIC_BASE_URL`/`PUBLIC_API_BASE_URL` 기반 email verification URL.
   - AWS bootstrap이 `Database.upsert_admin_account()` 사용.
   - 전체 테스트 통과 당시 `674 passed, 3 skipped`.
3. `6a27d95f fix: 로그인 smoke 재시도 보강`
   - `scripts/lib/auth.sh` login smoke retry 보강.
   - AWS workflow 관련 테스트 14 passed.
4. `8ebca771 fix: provider 등록 권한 경계 정렬`
   - provider catalog/discovery/validate를 admin 전용으로 변경.
   - 비관리자에게 cluster 등록 CTA를 숨김.
   - cluster registration 문서가 `cluster-discovery -> preflight -> targets -> connection-status` 흐름과 일치하도록 정렬.
5. `b013b431 docs: target preflight route 상수 정합성`
   - contracts 문서의 target preflight route 상수명을 실제 코드와 맞춤.

### 최신 검증 결과

`8ebca771` 커밋 전 로컬에서 다음을 통과했고, `b013b431`은 문서 상수 정합성만 변경했다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_provider_registry.py tests/test_bruno_collection.py
# 15 passed

ruff format --check src scripts tests
ruff check src scripts tests
git diff --check
# all passed

cd frontend && npm run typecheck
cd frontend && npm run lint
cd frontend && npm run build
# all passed, Vite large chunk warning only

PYTHONPATH=src .venv/bin/python -m pytest -q
# 675 passed, 3 skipped
```

GitHub Actions `dev` 기준:

- CI run `28847540798`: success.
- Promote Dev To Main run `28847540802`: success.
- AWS CD dev push run `28847540852`: success.

GitHub Actions `main` 기준:

- AWS CD run `28847747039`: 최신 main deploy run.
- 이 문서를 갱신할 당시 상태: `Test before deploy` success, `Deploy to AWS EKS` in progress.
- 이전 main run `28847597545`와 `28847358844`는 더 최신 run 때문에 cancel됨. 실패로 보지 않는다.

라이브 health check:

```bash
curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
# {"status":"ok","service":"api-gateway"}
```

## 2. 가장 먼저 실행할 재개 절차

새 AI가 이어받으면 바로 아래 순서대로 현재 상태를 확인한다.

```bash
cd /Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final

git status --short --branch
git log --oneline -5
git ls-remote origin refs/heads/dev refs/heads/main

gh run list --repo Jungle-303-04/final --branch dev --limit 6
gh run list --repo Jungle-303-04/final --branch main --limit 8
gh run view 28847747039 --repo Jungle-303-04/final --json status,conclusion,headSha,jobs

curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
```

판단 규칙:

- 최신 main run이 `28847747039`가 아니면 `gh run list --branch main`의 가장 최신 AWS CD run을 기준으로 이어간다.
- run이 `cancelled`이고 더 최신 run이 있으면 최신 run을 추적한다.
- run이 `failure`면 `gh run view <run-id> --log-failed`로 원인 로그를 먼저 본다.
- healthz가 일시 502면 CD rollout 중일 수 있다. 1~2분 간격으로 재확인하고, CD가 끝났는데도 502면 AWS/kubectl 상태 확인으로 전환한다.

## 3. 현재 작업 항목과 완료 기준

### A. 인시던트/followup/projection 폭증 차단

상태: 코드 완료, 배포 검증 중.

완료 기준:

- 최신 main AWS CD success.
- 라이브 DB에서 신규 `rca.followup.required`가 정상 snapshot 10초 주기로 계속 증가하지 않는다.
- dashboard open incident count가 `detected=false` 과거 row 때문에 부풀지 않는다.
- DLQ 신규 증가가 멈추거나 원인이 신규 코드가 아닌 과거 stale 이벤트로 확인된다.

필요 확인:

```bash
gh run list --repo Jungle-303-04/final --branch main --limit 8
curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
```

DB 직접 확인은 AWS/kubectl 인증이 필요하다. 현재 로컬 `kubectl`은 AWS SSO 세션 만료로 다음 오류가 날 수 있다.

```text
aws: [ERROR]: Your session has expired. Please reauthenticate using 'aws login'.
```

이 경우 로컬에서 AWS SSO를 재인증하거나, GitHub Actions의 AWS CD/smoke 결과를 우선 신뢰한다. 로컬에서 인증이 가능해지면 Postgres pod나 pgbouncer를 통해 최근 row 증가율을 확인한다.

### B. 실가입 인증/로그인/session

상태: 코드 완료, 배포 검증 중.

완료 기준:

- live `/api/auth/login`이 실제 admin credential로 성공.
- `GET /api/auth/session`이 로그인 쿠키로 현재 사용자/role을 반환.
- `POST /api/auth/session/refresh`가 2시간 sliding session 의도대로 동작.
- 잘못된 비밀번호에서 pending 상태를 누설하지 않음.
- email verify URL이 `/api/auth/verify-email` 경로로 실제 token 소비.

실행 기준:

- credential은 환경변수나 GitHub/AWS secret에서만 사용한다.
- secret 값을 로그/문서/커밋에 쓰지 않는다.

### C. provider/cluster 등록 권한 경계

상태: 코드 완료, dev/main 배포 진행 중.

변경 파일:

- `src/domains/providers/router.py`
- `tests/test_provider_registry.py`
- `frontend/src/features/console/pages/HomePage.tsx`
- `frontend/src/features/cluster/ClusterListView.tsx`
- `frontend/src/features/metrics/MetricsView.tsx`
- `frontend/src/features/resources/ConnectRepoWizard.tsx`
- `docs/api/01-providers/*`
- `docs/api/README.md`
- `docs/spec/domains/providers.md`
- `docs/spec/domains/target.md`
- `docs/spec/frontend/*`
- `docs/fd/*`
- `HANDOVER.md`

완료 기준:

- 비로그인 상태에서 `/api/providers/catalog`, `/api/providers/cluster-discovery`, `/api/providers/validate`는 401.
- 일반 user session에서 같은 endpoint는 403.
- admin session에서 200.
- UI에서 non-admin은 `+ 클러스터 등록` CTA를 보지 않는다.
- admin은 cluster discovery/preflight/register flow를 진행할 수 있다.

라이브 확인 예:

```bash
curl -i --max-time 8 https://k8s.woonyong.org/api/providers/cluster-discovery
# 401 expected when no session cookie
```

admin 확인은 로그인 cookie jar를 사용한다. secret 출력 금지.

### D. 레포 등록 동적화

상태: 기본 동적 flow 구현됨. GitHub poller DB watch target 순회는 코드 구현/로컬 검증 완료, 배포 대기.

이미 구현된 것:

- repo URL/ref 입력.
- 실제 GitHub API 기반 probe.
- branch list 동적 선택.
- manifest candidate list 동적 선택.
- validation/resource count.
- application + deployment 생성.

주요 파일:

- `frontend/src/features/resources/ConnectRepoWizard.tsx`
- `frontend/src/features/repo/api.ts`
- `src/domains/gitops/repository_discovery.py`
- `src/domains/applications/router.py`
- GitHub poller 관련 파일은 `rg "github-poll|poller|GITHUB_REPO|manifest_path" src scripts -n`로 찾는다.

남은 생산화 gap:

1. GitHub poller DB target 순회 — 구현 완료. `list_active_github_poll_targets`가 DB의 active repo/application/binding/watch target을 읽고, poller는 DB target을 우선 사용하며 env target은 fallback으로만 유지한다.
2. `/applications` deployment 생성은 `register_watch_target` 후 `register_deployment_binding` 순서로 한 트랜잭션에서 처리한다.
3. 남은 gap: Helm/Kustomize validation이 placeholder라면 실제 render/validate로 바꾼다.

병렬 explorer 결과:

- Agent nickname: `Banach`
- Agent id: `019f3b5e-8f4b-74a0-a447-56a1e0bfd325`
- 상태: read-only 분석 완료. 파일 수정 없음.

정확한 구현 seam:

- `src/services/gitops/github-poll-worker/poller.py`
  - `GitHubPoller.__init__`, `poll_once`, `latest_commit_sha`, `emit_webhook`, `_github_headers`.
  - 현재 poller가 env에서 단일 target을 `self`에 저장하고 `poll_once()`가 대상 인자 없이 한 repo만 polling한다.
- `src/services/gitops/github-poll-worker/settings.py`
  - 현재 env target: `GITHUB_REPO`, `GITHUB_BRANCH`, `WATCH_TARGET_ID`, `DEPLOYMENT_BINDING_ID`, `TARGET_CLUSTER_ID`, `MANIFEST_PATH`.
- `src/domains/gitops/models.py`
  - 이미 존재하는 테이블: `git_repositories`, `git_watch_targets`, `deployment_bindings`, `applications`.
- `src/domains/gitops/repository.py`
  - DB target 조회 method를 추가할 적정 위치. 이 repository가 등록과 watch state method를 이미 소유한다.
- `src/domains/applications/router.py`
  - app/deployment 등록 경로. 현재 repository/application/binding은 만들지만 deployment 생성 시 watch target row를 만들지 않는다.
- `src/services/gitops/git-pull-worker/app.py`
  - downstream dedupe는 `get_watch_last_seen_commit_sha`를 사용한다.
- `src/services/gitops/manifest-render-worker/app.py`
  - downstream은 `git_watch_targets.last_seen_commit_sha`를 갱신한다.

구현 전 동작:

- poller는 `GET /repos/{repo}/commits?per_page=1&sha={branch}`로 env 단일 repo의 최신 commit을 가져온다.
- poller는 `/github/webhook`으로 단일 webhook body를 보낸다.
- `tests/test_github_poller.py`는 이 env 단일 대상 동작을 고정하고 있다.
- DB에는 필요한 shape가 이미 있다.
  - `git_repositories.credential_ref`
  - `git_watch_targets.branch`, `manifest_path`, `last_seen_commit_sha`
  - `deployment_bindings.cluster_id`, `environment`
  - `applications.application_id`

안전한 최소 구현 계획:

1. `src/domains/gitops/repository.py`
   - `list_active_github_poll_targets(...)` 추가.
   - active GitHub repo, active application, active deployment binding, watch target을 join한다.
   - 실제 `git_watch_targets` row를 우선하고, 기존 row 호환을 위해 binding/application/repository 필드 fallback을 둔다.
   - 반환 필드: `credential_ref`, `application_id`, `repository_id`, `repo_ref`, `branch`, `watch_target_id`, `binding_id`, `environment`, `cluster_id`, `manifest_path`, `last_seen_commit_sha`.
2. `src/domains/applications/router.py`
   - deployment 생성 시 `branch=application["default_branch"]`를 body에 포함한다.
   - `db.register_watch_target(body)`를 `db.register_deployment_binding(body)`보다 먼저 호출한다.
   - normal binding path와 global binding path 모두 같은 계약으로 처리한다.
3. `src/services/gitops/github-poll-worker/poller.py`
   - `GitHubPollTarget` dataclass를 둔다.
   - `latest_commit_sha(target)`와 `emit_webhook(target, sha)` 형태로 대상 인자를 받게 한다.
   - `poll_once()`는 DB target을 먼저 조회하고, target별로 실제 webhook을 낸다.
   - DB target이 없고 `GITHUB_REPO`가 명시된 경우에만 env fallback을 사용한다.
4. `src/services/gitops/github-poll-worker/app.py`
   - `DATABASE_URL`이 있으면 `Database`/`AsyncDb`를 poller에 주입한다.
   - `build_token_vault()`로 `credential_ref`를 해석한다.
   - 기존 `GITHUB_TOKEN_REF`/`GITHUB_TOKEN` fallback은 유지한다.

필요 테스트:

- `tests/test_github_poller.py`
  - DB target mode가 DB의 `application_id`, `repository_id`, `watch_target_id`, `binding_id`, `environment`, `cluster_id`, `branch`, `manifest_path`를 webhook body에 싣는지 확인.
  - DB target이 있으면 `GITHUB_REPO` 없이도 poll 되는지 확인.
  - `credential_ref`가 token vault를 거쳐 GitHub `Authorization` header에 반영되는지 확인.
  - DB target이 없으면 기존 env fallback이 유지되는지 확인.
- `tests/test_database_unit.py`
  - `list_active_github_poll_targets` SQL join/filter compile 또는 결과 검증.
- `tests/test_applications_router.py`
  - deployment 생성이 `register_watch_target`을 application `default_branch`와 함께 호출한 뒤 binding을 생성하는지 확인.

운영 리스크:

- schema migration은 필요 없을 가능성이 높다. 필요한 table/column이 이미 있다.
- 기존 deployment binding에는 `git_watch_targets` row가 없을 수 있다. 따라서 query fallback을 먼저 넣고, 실제 row 관찰 후 필요하면 one-time backfill을 별도 작업으로 둔다.
- GitHub API 호출량은 env 한 repo에서 등록된 watch target 수만큼 늘어난다. 가능하면 `(repo_ref, branch, credential_ref)` 단위로 묶거나, access error는 기존처럼 soft-skip한다.
- `credential_ref=k8s-secret:...`를 poller CronJob이 읽으려면 service account/RBAC가 필요할 수 있다. env/AWS ref는 manifest 변경 없이 가능하다.

구현 결과:

- `src/domains/gitops/repository.py`
  - `list_active_github_poll_targets(workspace_id=None, limit=500)` 추가.
  - active GitHub repo, active application, active deployment binding, optional watch target을 join한다.
  - 기존 binding에 watch target row가 없어도 binding의 derived watch_target_id/manifest_path로 fallback한다.
- `src/domains/applications/router.py`
  - deployment 생성 시 application default branch를 body에 넣고, watch target을 먼저 upsert한 뒤 deployment binding을 upsert한다.
- `src/services/gitops/github-poll-worker/poller.py`
  - `GitHubPollTarget` dataclass 추가.
  - DB target을 우선 순회, DB target이 없고 `GITHUB_REPO`가 있을 때만 env fallback.
  - target별 `_last_sha_by_target`/`_etag_by_target` 유지.
  - DB `credential_ref` 또는 env `GITHUB_TOKEN_REF`를 token vault로 해석해 GitHub Authorization header에 반영.
  - webhook body에 실제 `application_id`와 `environment`까지 포함한다.
- `src/services/gitops/github-poll-worker/app.py`
  - `DATABASE_URL`이 있으면 `Database()`를 poller에 주입한다.
- 검증:
  - `PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_github_poller.py tests/test_applications_router.py tests/test_database_unit.py` → 56 passed.
  - `PYTHONPATH=src .venv/bin/python -m pytest -q` → 678 passed, 3 skipped.
  - `ruff format --check src scripts tests`, `ruff check src scripts tests`, `git diff --check` → 통과.

### E. 클러스터 등록 동적화

상태: 기본 dynamic flow 구현됨, 생산화 gap 남음.

이미 구현된 것:

- provider catalog/discovery.
- env-derived import candidate.
- target preflight.
- target registration.
- connection polling.

주요 파일:

- `frontend/src/features/resources/RegisterClusterWizard.tsx`
- `src/domains/providers/catalog.py`
- `src/domains/providers/router.py`
- `src/domains/target/router.py`
- `src/packages/contracts/gateway/requests.py`
- `src/packages/contracts/gateway/responses.py`

남은 생산화 gap:

1. env-derived 후보를 넘어 실제 외부 콘솔 API/kubeconfig discovery 확장.
2. preflight에서 실제 Kubernetes 연결성 검증.
3. `kube-context` direct apply 후보와 backend allowlist 정책이 UI/서버에서 완전히 같은 기준인지 확인.

### F. 프론트 폴리싱/E2E

상태: 주요 build/lint/typecheck 통과. live visual/E2E 반복 필요.

완료 기준:

- `/`, `/clusters`, `/clusters/:id`, `/metrics`, `/incidents/:id`, `/repos`, `/settings/*`, `/login`, `/signup`, `/verify-email` smoke.
- desktop/mobile 화면에서 overflow, text overlap, broken empty/loading/error state 없음.
- 로딩 skeleton, 에러 메시지, 빈 상태가 실제 권한/데이터 상태와 맞음.
- `/console/` 데모 보존 정책과 `/` 실제 서비스 정책이 충돌하지 않음.

주의:

- 기존 untracked `report_desktop.json`, `report_mobile.json`이 E2E 산출물일 수 있다. 재사용하려면 내용을 확인하고, 아니면 커밋하지 않는다.

### G. DB 초기화 준비

상태: 아직 실행 금지. 계획/백업 절차부터 준비.

초기화는 모든 기능 배포/검증 후 마지막 1회만 한다.

현재 알려진 운영 DB 구조:

- Namespace: `management`
- Postgres StatefulSet: `postgresql`
- Service: `postgresql`
- Secret: `postgresql-secret`
- PVC 예: `data-postgresql-0`
- PgBouncer Deployment: `pgbouncer`
- PgBouncer Secret: `pgbouncer-config`
- Runtime ConfigMap/Secret:
  - `management-runtime-config`
  - `management-runtime-secret`

금지:

- 백업 없이 DB drop/truncate/delete.
- 전체 `scripts/aws-up.sh`를 DB reset 도구처럼 실행.
- secret 값을 로그/문서에 남김.
- mock seed로 운영 화면 채우기.

필수 백업:

1. Postgres logical dump.
2. PVC/EBS snapshot.
3. Kubernetes Secrets/ConfigMaps backup.
4. 현재 deployment image/tag와 env 기록.

DB schema/init 공식 경로:

- `Database().init()`
- admin bootstrap: `Database.upsert_admin_account()`

### H. DB 초기화 실행

상태: 대기.

게이트:

- 최신 main AWS CD success.
- live healthz ok.
- provider/admin/auth smoke 통과.
- incident/DLQ 신규 증가 원인 확인.
- DB backup artifact 위치 기록.
- 사용자에게 "이제 DB 초기화를 실행한다"는 상태 업데이트를 남긴 뒤 실행.

초기화 후 복구 순서:

1. schema/init.
2. admin bootstrap.
3. `cluster-1`, `cluster-2` 실제 target 재등록.
4. 실제 repo/app 재등록.
5. target agent 연결 확인.
6. inventory/evidence/fleet data 재수집.
7. `/`, `/clusters`, `/metrics`, `/incidents`, `/repos` live smoke.

### I. 최종 커밋/푸시/HANDOVER

완료 기준:

- 각 변경 단위가 commit/push됨.
- main AWS CD success.
- live smoke 통과.
- DB reset 결과와 백업 위치가 문서화됨.
- `HANDOVER.md` 최상단에 최종 상태, 남은 위험, 재개 명령이 있음.

## 4. GitHub Actions 운영 메모

자주 쓰는 명령:

```bash
gh run list --repo Jungle-303-04/final --branch dev --limit 8
gh run list --repo Jungle-303-04/final --branch main --limit 8
gh run view <run-id> --repo Jungle-303-04/final --json status,conclusion,headSha,jobs
gh run view <run-id> --repo Jungle-303-04/final --log-failed
```

workflow 해석:

- `dev` push 후 `CI`, `Promote Dev To Main`, `AWS CD`가 돈다.
- Promote가 성공하면 main merge commit이 생성되고 main AWS CD workflow_dispatch가 추가로 뜬다.
- AWS CD는 concurrency 때문에 이전 run을 cancel할 수 있다. 최신 run이 성공하면 이전 cancel은 정상이다.

## 5. 로컬 AWS/kubectl 메모

현재 로컬에서 `kubectl` 조회 시 AWS SSO 만료가 발생할 수 있다.

```text
aws: [ERROR]: Your session has expired. Please reauthenticate using 'aws login'.
Unable to connect to the server: getting credentials: exec: executable aws failed with exit code 255
```

이 상태에서 할 일:

1. GitHub Actions CD/smoke 결과를 우선 확인한다.
2. 로컬 AWS 환경변수나 SSO 재인증이 가능하면 재인증 후 `kubectl`을 사용한다.
3. secret 값은 절대 출력하지 않는다.

확인 명령 예:

```bash
kubectl config current-context
kubectl -n management get deploy
kubectl -n management get pods
kubectl -n management rollout status deploy/api-gateway --timeout=180s
kubectl -n management rollout status deploy/console --timeout=180s
```

## 6. 라이브 smoke 체크리스트

최신 main AWS CD가 끝난 뒤 수행한다.

```bash
curl --max-time 8 -fsS https://k8s.woonyong.org/api/healthz
curl --max-time 8 -fsS https://k8s.woonyong.org/ >/tmp/k8s-root.html
curl -i --max-time 8 https://k8s.woonyong.org/api/providers/cluster-discovery
```

기대:

- healthz 200.
- `/` 200.
- provider cluster-discovery 비로그인 호출은 401.

로그인 smoke는 cookie jar로 수행한다. 예시는 형태만 남긴다.

```bash
cookie_jar="$(mktemp)"
curl -sS -c "$cookie_jar" -H 'content-type: application/json' \
  -H 'x-service-csrf: same-origin' \
  -d '{"email":"<env AUTH_EMAIL>","password":"<env AUTH_PASSWORD>"}' \
  https://k8s.woonyong.org/api/auth/login

curl -sS -b "$cookie_jar" https://k8s.woonyong.org/api/auth/session
curl -sS -b "$cookie_jar" https://k8s.woonyong.org/api/providers/cluster-discovery
```

문서나 로그에 실제 email/password/token을 쓰지 않는다.

## 7. 다음 구현 후보 우선순위

1. 최신 main AWS CD 완료 확인.
2. provider admin live smoke.
3. incident/DLQ 증가율 live 확인.
4. GitOps poller DB watch target 순회 구현.
5. Helm/Kustomize render validation 실제화.
6. cluster preflight Kubernetes 연결성 검증.
7. 프론트 live E2E와 responsive polish.
8. DB backup/snapshot 절차 구현 또는 런북 확정.
9. 최종 DB reset.
10. 클러스터/레포 재등록 및 데이터 재수집.

## 8. 파일 소유권과 예상 write set

### GitOps poller DB watch target

예상 write set은 explorer 결과를 확인한 뒤 확정한다. 후보:

- GitHub poller worker 파일.
- GitOps repository/application DB access 파일.
- application/watch target 생성 로직.
- 관련 tests.
- `HANDOVER.md`.

주의:

- env fallback은 local/dev bootstrap 호환용으로 남겨도 되지만, production path는 DB registered watch target을 우선해야 한다.
- DB migration 파일이 없다면 기존 `Database().init()` schema와 repository method를 맞춰야 한다.

### DB reset/runbook

예상 write set:

- `docs/aws-testing-runbook.md` 또는 별도 ops 문서.
- 필요하면 `scripts/` 아래 안전한 backup/reset helper.
- helper를 만들면 dry-run/default-safe 옵션 필수.
- `HANDOVER.md`.

주의:

- destructive command는 dry-run 없이 기본 실행되면 안 된다.
- full `aws-up.sh` 재사용 금지. 필요한 함수만 격리한다.

## 9. 장애 대응 판단 기준

### healthz 502

1. 최신 AWS CD deploy 중이면 1~2분 재시도.
2. deploy 종료 후에도 502면 `gh run view --log-failed`.
3. CD success인데 502면 kubectl로 api-gateway/console rollout, service endpoints, ingress/load balancer를 확인.

### 신규 incident 증가

1. 신규 row의 event type/body를 확인한다.
2. `incident.detected`의 `detected=false`가 projection/read model에 보이면 regression.
3. `rca.followup.required`가 정상 snapshot만으로 계속 생기면 incident-worker/feedback-worker regression.
4. 실제 crash/alert 기반이면 정상 incident일 수 있으므로 원인 분류 후 조치.

### DLQ 증가

1. worker/source/error message별 group count를 본다.
2. 같은 stale schema error가 과거 timestamp라면 archive 후보.
3. 최신 timestamp와 동일 worker가 계속 실패하면 코드/contract mismatch를 먼저 수정.
4. replay는 idempotency와 side effect 확인 전 실행하지 않는다.

## 10. 문서 갱신 규칙

매 반복마다 다음을 갱신한다.

1. `HANDOVER.md` 최상단 최신 업데이트.
2. 이 문서의 "현재 상태 요약" 또는 새 결과.
3. 관련 spec/API/FD 문서.
4. 검증 명령과 결과.
5. 남은 위험과 다음 명령.

커밋 전 확인:

```bash
git status --short
git diff --check
```

가능하면 문서 링크 체크 또는 docs 관련 테스트도 돌린다.

```bash
PYTHONPATH=src .venv/bin/python -m pytest -q tests/test_docs_index.py tests/test_fd_docs_links.py
```
