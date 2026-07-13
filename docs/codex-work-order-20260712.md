# Codex 작업 지시서 — 테넌트 경계 결함 및 즉시 안전장치

작성일: 2026-07-12 · 대상 브랜치: 최신 `dev` 기준 rebase
이 문서는 Codex에게 그대로 전달할 지시서다. **추측하지 말고 이 문서의 사실만 신뢰하라.**
모든 file:line은 실제 코드를 읽어 검증한 값이다.

---

## 0. 최우선 규칙 (위반 시 작업 무효)

1. **아래 경로는 절대 수정 금지 (RCA 작업열이 동시 작업 중이다):**
   - `src/domains/rca/**`
   - `src/services/ai/agent/**`
   - `src/services/ai/` 하위의 `*rca*`, `plan-worker`, `analyze-worker`, `recovery-worker`, `select-worker`, `dispatch-worker`
   - RCA 관련 event subject / event body 정의
   - `tests/test_rca*`
2. **`src/packages/runtime/worker.py`를 수정하지 마라.** 이 파일은 모든 RCA worker의 실행 의미를 바꾼다.
   트랜잭션 구조 개선은 이번 작업 범위가 **아니다**. 별도 PR에서 opt-in 방식으로 한다.
3. **새 event subject 추가 금지, RCA DB migration 추가 금지.** 이번 작업은 기존 계약 안에서만 한다.
4. 목업·페이크·하드코딩 데이터 금지. 값이 없으면 `null` 또는 명시적 unavailable을 반환하라.
5. 권한 판정은 전부 **fail-closed**. 빈 권한은 "전체 허용"이 아니라 **빈 집합**이다.
6. 커밋은 의미 단위 한국어 conventional commit. 다른 팀원의 커밋을 reset/revert하지 마라.
7. 한 PR에서 한 섹션만 처리하라. 섹션을 섞지 마라.

---

## 1. 반드시 알아야 할 교정 사항 (외부 리뷰가 과장한 부분)

Codex가 과잉 리팩터링하지 않도록, 아래 3건은 **리뷰 내용이 사실과 다르다.** 그대로 믿고 크게 뜯어고치지 마라.

### 교정 A — Evidence job "무한 재시도"는 부분적으로 틀렸다
- 리뷰 주장: lease에 max-attempts 검사가 없어 실패 job이 무한 재시도된다.
- **실제**: `complete_evidence_job` (`src/domains/target/repository.py:538-543`)에서
  `attempt_count >= max_attempts`면 terminal `FAILED`로 종결한다. **보고된 실패는 이미 상한이 있다.**
- **진짜 결함은 좁다**: agent가 `complete_evidence_job` 호출 **전에 죽으면** lease만 만료되고
  재리스 조건(`repository.py:434-436`)에 상한이 없어 계속 재리스된다. 그리고 이런 stale leased job을
  종결시키는 **evidence-job janitor가 없다**.
- **따라서 하지 말 것**: 재시도 모델 전면 재설계, `lease_generation`/`deadline_at` 등 대규모 스키마 추가.
- **할 것**: (a) 재리스 조건에 `attempt_count < max_attempts` 추가, (b) stale leased job을 terminal로
  닫는 janitor 추가. 이 두 가지로 충분하다.

### 교정 B — Strict 실패 "영구 hang"은 틀렸다
- 리뷰 주장: strict provider 실패 시 aggregate가 계속 None을 반환해 영구히 hang된다.
- **실제**: `aggregate_evidence_payload` (`src/domains/target/evidence_jobs.py:84`)가 None을 반환하는 건
  맞다(= strict이면 부분 evidence를 내보내지 않는다, 이는 올바른 동작). 그러나
  release-workflow-failure 경로는 terminal 이벤트를 발행하고(`src/domains/target/router.py:1459-1483`,
  `EvidenceJobUpdatedBody(status=failed, evidence_emitted=False)`), pending evidence window는
  `PENDING_EVIDENCE_EVENT_TTL_SECONDS = 120`으로 회수된다(`router.py:1376`).
- **따라서 하지 말 것**: 새 `evidence.window.failed|timed_out` subject 신설(규칙 3 위반).
- **할 것**: 없음. 이번 PR 범위 밖이다. 굳이 손대지 마라.

### 교정 C — LLM 프롬프트가 evidence value를 버리는 건 "의도된 설계"다
- `src/services/ai/agent/pipeline/ai_fallback.py:51-90`이 `EvidenceItem.value`를 안 쓰고 summary만 쓰는 건
  사실이나, docstring에 "프롬프트 크기 제한과 secret 원문 유출 방지"라고 의도가 명시돼 있다.
- **절대 하지 말 것**: raw `value`를 프롬프트에 그대로 넣기. 이는 secret 유출 회귀다.
- 애초에 이 파일은 **수정 금지 경로**(규칙 1)다. 건드리지 마라.

---

## 2. PR-0 — 즉시 안전장치 (RCA 파일 변경 0건)

목적: RCA 작업과 충돌 없이, 지금 당장 실익이 큰 차단만 넣는다.

### 0-1. AI 자동 명령 kill switch

**검증된 사실**: `select.py` → `dispatch.py`가 `actor={"auto_selected": true}`인 `CommandRequestedBody`를
발행하고, `src/domains/command/handler.py:446-480`이 이를 그대로 agent에 큐잉한다. `rollout_restart`는
`src/domains/command/builtin_actions.py:10-17`에서 `requires_approval=False`라 **승인 없이 실행된다.**
현재 blast radius는 sandbox namespace로 제한돼 있고, `RecoveryDefaults.dry_run` 플래그는 이 경로에서
**읽히지 않는다(장식적)**.

**구현 위치**: `src/domains/command/handler.py` (command 계층 **안에서만**. `services/ai/**`는 건드리지 마라)

**요구사항**:
- 새 env 플래그 `AUTO_COMMANDS_ENABLED` 도입. **기본값 = 비활성(0)** — 즉 기본 거부(fail-closed).
- `CommandRequestedBody.actor`에 `auto_selected == true`가 있으면, `AUTO_COMMANDS_ENABLED`가 참이 아닌 한
  큐잉하지 말고 **명시적 거부**로 처리하라. 조용히 무시(silent drop)하지 마라 — 거부 사유를 남겨라.
- 사람이 요청한 명령(`auto_selected` 없음/false)은 **영향받지 않아야 한다.**
- 거부는 기존 command 거부 경로/상태를 재사용하라. 새 event subject를 만들지 마라.

**테스트(필수)**:
- `auto_selected=true` + 플래그 off → 거부, agent 큐에 안 들어감
- `auto_selected=true` + 플래그 on → 기존과 동일하게 큐잉
- 사람 요청 명령 → 플래그 값과 무관하게 정상 동작

### 0-2. `GET /access` admin-only 전환

**검증된 사실**: `src/domains/identity/admin_router.py:189`의 `GET /access`만 `require_session`이고,
같은 파일의 다른 access 라우트는 전부 `require_admin_session`이다.

**요구사항**: `require_session` → `require_admin_session`으로 교체. 한 줄이다. (근본 수정은 PR-1)

### 0-3. 명시적 ID 거부

**검증된 사실**:
- `src/packages/contracts/gateway/requests.py:351-354` — `ApplicationUpsertRequest.repository_id`가
  클라이언트 입력으로 관통한다.
- `src/packages/contracts/gateway/requests.py:414-415` — `ReleasePlanUpsertRequest.plan_id` 동일.

**요구사항**:
- `POST /applications` **create** 요청에 `repository_id`가 명시되면 **422로 거부**하라.
- `POST /release-plans` **create** 요청에 `plan_id`가 명시되면 **422로 거부**하라.
- **update(PUT) 경로는 건드리지 마라.** update는 path의 ID를 쓰며 이미 workspace 스코프 조회를 한다.
- 이건 임시 차단이다. 서버 측 ID 생성/소유권 검증은 PR-1에서 한다.

### 0-4. install 토큰 로그 마스킹

**검증된 사실**: `GET /install/{agent_token}` (`src/domains/target/router.py:950-951`). 응답은
`PlainTextResponse`이며 `Cache-Control` 헤더가 없다(`router.py:969`).

**요구사항**:
- install 응답에 `Cache-Control: no-store` 추가.
- gateway 요청 로깅 미들웨어에서 `/install/` 경로의 토큰 세그먼트를 `/install/[REDACTED]`로 마스킹하라.
  (`src/services/gateway/api-gateway/gateway.py`의 `request_logging` 미들웨어)
- **토큰 회전·enrollment 분리는 이번 PR 범위가 아니다.** 로그 유출만 먼저 막는다.

### 0-5. `/live/browser` 제한

**검증된 사실**: `src/services/realtime/realtime-gateway/app.py`의 `browser_live`는 session의
workspace 일치만 검증하고, **workspace 내 cluster 접근권은 검증하지 않는다.** 게다가 hub는
cluster_id만 key로 쓰고(`hub.py`의 `_summaries: dict[str, LiveSummary]`, `_summary_matches`는
cluster_id만 비교) workspace로 필터링하지 않는다. 따라서 `cluster_id=""`(와일드카드) 구독 시
**다른 workspace의 cluster summary까지 수신된다.**

**요구사항 (PR-0에서는 최소 차단만)**:
- `browser_live` 구독에서 **`cluster_id` 와일드카드(빈 문자열)를 거부**하라. 명시적 cluster_id를 요구한다.
- 요청한 `cluster_id`가 **세션 workspace가 실제로 접근 가능한 cluster 집합에 속하는지** 검증하고,
  아니면 연결을 거부하라(`CLOSE_UNAUTHORIZED`).
- **프로토콜 v2, snapshot handshake, multi-replica backplane은 이번 PR 범위가 아니다.** 만들지 마라.

---

## 3. PR-1 — 테넌트 경계 (RCA 파일 변경 0건)

PR-0 머지 후에 착수하라. 4건 모두 **실제 익스플로잇이 검증된 결함**이다.

### 1-1. `/access` 목록 workspace 강제

**검증된 사실**: `src/domains/identity/repository.py:1075-1114` `list_access_grants(resource_id)`의 필터는
`role.c.status == AccessStatus.ACTIVE`와 선택적 `resource_id`뿐이다. **`organization_id`/`workspace_id`
조건이 전혀 없다** → 전 workspace의 grant(사용자 id·이메일 포함)가 노출된다.

**요구사항**:
- `list_access_grants`가 `organization_id`(= 세션 workspace)를 **필수 인자로** 받도록 시그니처를 바꾸고,
  SQL에 `WHERE resource_assignments.organization_id = :organization_id`를 강제하라.
- 라우터는 세션에서 organization_id를 파생해 전달하라. **요청 body/query에서 받지 마라.**
- 호출부를 모두 갱신하라. 기본값 `None`으로 두어 "전체"를 의미하게 만들지 마라.

### 1-2. Repository 교차테넌트 덮어쓰기

**검증된 사실**:
- `src/domains/applications/router.py:194-211` — `POST /applications`가 클라이언트 `repository_id`를
  그대로 `db.register_repository(body)`에 넘긴다.
- `src/domains/gitops/repository.py:1469-1472` — `derive_repository_id`가 명시 `repository_id`를 그대로 사용.
- `src/domains/gitops/repository.py:219-230` — `on_conflict_do_update(index_elements=[repository_id])`에
  **workspace 가드가 없다.** conflict 시 `provider, repo_ref, default_branch, credential_ref, status,
  access_policy`를 덮어쓴다. → workspace A 사용자가 workspace B의 repo `credential_ref`를 하이재킹 가능.
- 참고: `workspace_id` 컬럼 자체는 `set_`에 없어 **소유권은 안 바뀐다.** 즉 "소유자 탈취"가 아니라
  **"내용 덮어쓰기/자격증명 하이재킹"**이다. 수정 티켓에 정확히 그렇게 써라.

**요구사항**:
- create: repository_id를 **서버가 생성**하라(서버 UUID 또는 `workspace_id + repo_ref` 기반 결정적 ID).
  클라이언트 값을 쓰지 마라.
- update: path의 repository_id를 쓰고, 기존 row의 `workspace_id`가 **호출자 workspace와 일치하는지**
  확인하라. 불일치면 404(존재 노출 방지). manage 권한도 확인하라.
- upsert의 conflict 처리에 workspace 조건을 넣어라. 다른 workspace의 row면 덮어쓰지 말고 404/409.
- 장기적으로 `(workspace_id, repository_id)` composite 제약을 검토하라(이번 PR에서 강제하진 않는다).

### 1-3. Release plan 교차테넌트 덮어쓰기 + step 삭제

**검증된 사실**:
- `src/domains/release_flow/router.py:1028-1041` — `POST /release-plans`는 `require_session`만.
  접근 검사 `require_plan_application_plan_manage_access`(`router.py:3590-3608`)는 **`steps`를 순회**한다.
  → **`steps=[]`이면 loop 본문이 실행되지 않아 검사가 공회전(vacuous)한다.**
- `src/domains/release_flow/repository.py:94-132` — `on_conflict_do_update(index_elements=[plan_id])`에
  workspace 가드 없음. 이어서 `:120`의 `delete(step_table).where(step_table.c.plan_id == plan_id)`에
  **`workspace_id` 조건이 없다** → 피해 plan의 step 전부 삭제.
- 익스플로잇: `{plan_id: <B의 plan>, name: "x", steps: []}` → 검사 통과 → B의 plan 메타데이터 덮어쓰고
  step 전멸.
- 참고: `PUT /release-plans/{plan_id}`는 `get_release_plan(workspace_id, plan_id)`로 먼저 스코프 조회 후
  404하므로 **안전하다.** 취약 벡터는 **POST create**다.

**요구사항**:
- POST create에서 `plan_id` 명시 거부(PR-0에서 이미 차단했다면 서버 생성 ID로 확정).
- upsert의 conflict 처리에 workspace 소유권 검사를 넣어라. 타 workspace plan이면 404/409.
- **step delete의 WHERE에 `workspace_id` 조건을 반드시 추가하라.**
- `steps=[]`일 때 접근 검사가 공회전하지 않도록, **plan 자체에 대한 manage 권한을 먼저 검사**하라
  (steps 순회에만 의존하지 마라).

### 1-4. Raw evidence 교차 cluster 열람

**검증된 사실**: `src/domains/rca/query_router.py`의 `list_evidence`(46-78),
`list_evidence_windows`(81-103), `get_evidence_window_payload`(106-143)는 `require_session`만 쓰고
**workspace로만 스코프**한다. `require_cluster_access`도, `Permission.EVIDENCE_READ`도 없다.
repository도 workspace만 필터한다(`rca/repository.py:176-181`, `target/repository.py:670-673, 699`).
→ cluster-1만 접근 가능한 사용자가 같은 workspace의 cluster-2 evidence(로그·메트릭·트레이스·k8s
스냅샷 원문)를 읽는다.

**⚠️ 주의**: `query_router.py`는 RCA 작업열 범위와 겹칠 수 있다. **지금 직접 수정하지 마라.**

**요구사항 (준비만)**:
- 중앙 인가 helper와 repository 계약을 **먼저 준비**하라:
  - `list_evidence(workspace_id, allowed_cluster_ids)` / `get_evidence(workspace_id, evidence_key, allowed_cluster_ids)`
  - `allowed_cluster_ids=None`을 "전체"로 해석하지 마라. **빈 권한 = 빈 set = 결과 없음.**
- 이미 올바른 패턴이 `src/domains/rca/router.py:284-291`, `src/domains/dashboard/router.py:300-322`에
  있다(`require_cluster_access(..., Permission.EVIDENCE_READ)`). 이를 참고하라.
- **알려진 함정**: `src/domains/dashboard/repository.py:822-826`의 `_apply_cluster_filter`는
  `allowed_cluster_ids is None`이면 필터 없이 전체를 반환한다. 새 helper는 이 패턴을 따르지 마라.
- 실제 `query_router.py` 연결은 RCA 작업 병합 후 **의존성 한 줄 교체**로 한다.
- 임시 완화가 필요하면 raw evidence 라우트를 **admin-only**로 낮추거나 비활성화하라.

---

## 4. 수용 기준 (하나라도 실패하면 머지 금지)

- 기존 실패 중인 format / import contract / pytest 4건이 **전부 통과**해야 한다. 새 실패를 만들지 마라.
- 교차 workspace negative test (필수, 각각 독립 테스트):
  - workspace A 사용자가 `GET /access` 호출 → B의 grant가 **응답에 없어야** 한다
  - A가 B의 `repository_id`로 create → **거부**되고 B의 row가 **변경되지 않아야** 한다
  - A가 B의 `plan_id` + `steps=[]`로 create → **거부**되고 B의 plan step이 **살아 있어야** 한다
  - 같은 workspace에서 cluster-1 grant만 가진 사용자가 cluster-2 evidence 조회 → **거부**
  - `/live/browser`에서 접근 불가 cluster 구독 시도 → **연결 거부**
  - `/live/browser`에서 `cluster_id=""` 와일드카드 → **거부**
- AI 자동 명령 차단 테스트: `auto_selected=true` + `AUTO_COMMANDS_ENABLED` 미설정 → agent 큐 **비어 있음**
- 사람 요청 명령 회귀 없음
- `/install/{token}` 요청 로그에 토큰 원문이 **남지 않아야** 한다

---

## 5. 작업 순서 (엄수)

1. PR-0 (안전장치) — 위 2절 5개 항목. RCA 파일 0건 변경.
2. PR-1 (테넌트 경계) — 위 3절 4개 항목. RCA 파일 0건 변경. `query_router.py`는 준비만.
3. 그 이후(별도 결정): worker 트랜잭션 구조, realtime 프로토콜 v2, evidence lease janitor,
   production HA/NetworkPolicy, agent enrollment 토큰 분리.
   **이번 지시서 범위가 아니다. 착수하지 마라.**

---

## 6. 보고 형식

각 PR마다 다음을 보고하라.

- 변경 파일 목록과 각 파일의 변경 이유 한 줄
- 위 수용 기준 중 어떤 테스트를 추가했는지, 실행 결과
- RCA 금지 경로를 건드리지 않았음을 `git diff --name-only`로 증명
- 확신이 없거나 지시가 모호한 부분은 **추측해서 진행하지 말고 질문하라**
