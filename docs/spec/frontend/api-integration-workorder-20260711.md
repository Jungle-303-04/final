---
title: API 연결 작업지시서 — 백엔드 연동 담당자용 (병렬 작업)
status: active-directive — 골모드 allowlist 8번 항목 (병렬 API 작업의 정본)
date: 2026-07-11
audience: 프론트↔백엔드 API 연결 담당 개발자 (이 문서만 따라 하면 완결되도록 작성됨)
owner_paths: references/ui-layer-lab/src/product/api/** (이 폴더만 수정한다)
verified_against: HEAD d61623c11 — routes.py 경로 상수 100개, 기존 api 파일 17개 확인
---

# API 연결 작업지시서

## 0. 당신의 역할과 경계 (가장 중요)

- 당신의 임무: 백엔드 API를 프론트에서 호출 가능한 **타입 안전 함수**로 만드는 것.
  화면(컴포넌트)은 만들지 않는다 — 그건 골모드 작업자(Codex)의 몫이다.
- **수정 가능한 폴더는 정확히 하나**: `references/ui-layer-lab/src/product/api/`.
  다른 폴더의 파일은 읽기만 한다. 특히 `client.ts`, `url.ts`는 **절대 수정 금지**
  (모든 함수가 공유하는 기반이라 깨지면 전체가 죽는다).
- 골모드 작업자와의 병렬 규칙:
  1. 당신이 함수를 하나 완성할 때마다 `docs/spec/frontend/codex-progress-20260711.md`에
     `API 완성: <함수명> (<커밋 해시>)` 한 줄을 append한다. Codex는 이 목록에 있는 것만 쓴다.
  2. Codex가 필요한데 아직 없는 함수는 `docs/spec/frontend/api-needs.md`에 요청 행을
     쌓는다. 당신은 §6 우선순위보다 이 파일의 요청을 먼저 처리한다.
  3. 요청이 24시간 넘게 미처리면 Codex가 직접 만들 수 있다(같은 레시피 준수) —
     그러니 매일 `api-needs.md`를 먼저 확인하라.
- 모르면 **추측으로 구현하지 말고** progress 파일에
  `blocked: <함수명> — <이유>`를 기록하고 다음 항목으로 넘어간다.

## 1. 최초 1회 준비 (약 15분)

```bash
cd references/ui-layer-lab
npm install
npm run check          # 전부 통과해야 시작 가능. 실패하면 만지지 말고 blocked 보고
npm run dev            # http://127.0.0.1:5173 (vite가 /api 를 백엔드로 proxy)
```

로그인 세션 만들기(터미널 검증용 — 자격증명은 팀에서 받고 **절대 커밋 금지**):

```bash
# 쿠키 저장소를 만들며 로그인
curl -c /tmp/kh.cookie -H 'content-type: application/json' \
  -X POST http://127.0.0.1:5173/api/auth/login \
  -d '{"email":"<받은 이메일>","password":"<받은 비밀번호>"}' -i

# 세션 확인 — 200 과 authenticated:true 가 나와야 정상
curl -b /tmp/kh.cookie http://127.0.0.1:5173/api/auth/session
```

401이 계속 나오면: vite proxy 문제다. 우회 코드를 만들지 말고 blocked 보고.

## 2. 반드시 먼저 읽을 기존 부품 (모범 답안)

| 파일 | 역할 | 당신이 할 일 |
|---|---|---|
| `src/product/api/client.ts` | 유일한 fetch 관문 `apiRequest(path, schema, init)` — zod 검증, CSRF, 쿠키 자동 처리 | 그대로 사용. 수정 금지 |
| `src/product/api/url.ts` | 경로 조립 헬퍼(`withQuery`, `encodePathSegment`) | 그대로 사용 |
| `src/product/api/inventory.ts` + `inventory-schemas.ts` | **모범 예제** — 함수/스키마 분리, limit 상수, AbortSignal | 새 파일은 이 구조를 그대로 복사해 시작 |
| `src/product/api/index.ts` | 모든 함수의 export 목록 | 함수 만들 때마다 여기 추가 |

이미 완성된 영역(수정 금지, 참고만): `auth.ts`, `clusters.ts`, `fleet.ts`,
`inventory.ts`, `live.ts`, `metrics.ts`, `rca.ts`.

## 3. 새 endpoint 하나를 붙이는 표준 레시피 (7단계 — 항상 이 순서)

예제: "명령 상태 조회" `GET /commands/{command_id}` 를 붙인다고 하자.

**1단계 — 경로 상수 확인.** 백엔드 계약 정본은
`src/packages/contracts/gateway/routes.py` 하나다. 열어서 찾는다:
`COMMAND_STATUS_PATH = "/commands/{command_id}"` (23행). 브라우저에서 실제 호출 경로는
항상 앞에 `/api`를 붙인 `/api/commands/{command_id}`다.

**2단계 — 응답 모양 찾기.** 절대 추측하지 않는다. 순서:

```bash
# (a) 이 경로 상수를 쓰는 라우터 파일 찾기
grep -rn "COMMAND_STATUS_PATH" src/domains/
# (b) 그 라우터 함수의 response_model=XxxResponse 클래스명 확인
# (c) 그 클래스 정의를 열기
grep -n "class XxxResponse" src/packages/contracts/gateway/responses.py
```

응답 클래스의 필드 하나하나가 곧 zod 스키마의 필드다. `Optional[...] = None` 필드는
`.nullable()` 또는 `.optional()`, 나머지는 필수.

**3단계 — 스키마 파일 작성.** `src/product/api/commands-schemas.ts` 생성:

```ts
import { z } from "zod";

export const commandStatusSchema = z.object({
  command_id: z.string(),
  status: z.string(),          // 상태 리터럴은 절대 축소하지 않는다(§4-5)
  // ...responses.py 필드를 전부, 이름 그대로(snake_case 유지)
}).strict();

export type CommandStatus = z.infer<typeof commandStatusSchema>;
```

**4단계 — 함수 작성.** `src/product/api/commands.ts` 생성:

```ts
import { apiRequest } from "./client";
import { encodePathSegment } from "./url";
import { commandStatusSchema, type CommandStatus } from "./commands-schemas";

export function getCommandStatus(
  commandId: string,
  signal?: AbortSignal,
): Promise<CommandStatus> {
  return apiRequest(
    `/api/commands/${encodePathSegment(commandId)}`,
    commandStatusSchema,
    { signal },
  );
}
```

쓰기 요청(POST/PUT/DELETE)이면 `{ method: "POST", body: JSON.stringify(payload), signal }`
— CSRF 헤더는 `client.ts`가 자동으로 붙이므로 신경 쓰지 않는다.

**5단계 — export.** `index.ts`에 `export { getCommandStatus } from "./commands";` 추가.

**6단계 — 실검증.** 두 가지 다 한다:

```bash
# (a) 터미널: 실제 응답과 스키마 필드 눈으로 대조
curl -b /tmp/kh.cookie http://127.0.0.1:5173/api/commands/<실제ID> | python3 -m json.tool
# (b) 게이트
npm run check
```

스키마가 실제 응답과 다르면 화면이 error 배지를 띄우게 되어 있다 — **스키마를 실제 응답에
맞춘다**(응답을 스키마에 맞추려고 백엔드를 고치지 않는다. 백엔드가 이상하면 blocked 보고).

**7단계 — 커밋.** 형식: `feat: api — 명령 상태 조회 함수` (한 함수군 = 한 커밋).
커밋 후 progress 파일에는 export 함수 하나당 `API 완성:` 한 줄을 append한다(§0-1). 한 커밋에
여러 함수를 포함해도 각 함수가 독립적인 소비 게이트이므로 완료 기록을 합치지 않는다.

## 4. zod 다섯 계명 (전 스키마 공통)

1. 최상위 객체는 `.strict()` — 단, `summary` 같은 잡동사니 통은
   `z.record(z.string(), z.unknown())`으로 열어둔다(서버가 필드를 늘려도 안 죽게).
2. `raw` 필드는 스키마에 넣지 않는다(브라우저 계약상 금지).
3. 상태 문자열은 `z.string()` 그대로 두거나 백엔드 리터럴 **전부**를 enum으로 —
   일부만 골라 담아 축소하는 것 금지(예전 사고: `failed`가 사라져 실패가 '완료'로 표시됨).
4. 숫자 0과 null은 다르다 — `.nullable()`을 정확히, 코드에서 `?? 0` 금지.
5. 타임스탬프는 `z.string()` — 클라이언트에서 변환하지 않고 그대로 전달.

## 5. 초보자가 반드시 빠지는 함정 10개

1. `/api` 접두 누락 → 404. routes.py 경로 앞에 항상 `/api`.
2. 쿠키 없이 curl → 401. 항상 `-b /tmp/kh.cookie`.
3. 401이 나온다고 fetch에 토큰 헤더 발명 금지 — 이 시스템은 쿠키 세션이다.
4. percent 값(`cpu_pct` 등)은 서버가 이미 percent다. ×100 하지 않는다.
5. DELETE는 204 무본문일 수 있다 — 그 경우 스키마는 `z.undefined()`가 아니라
   `client.ts`의 no-content 처리를 따른다(기존 함수 예 참고, 없으면 blocked).
6. 생성/실행류 POST는 즉시 결과가 아니라 `202 accepted` 봉투(correlation/command id)를
   줄 수 있다 — 봉투 그대로 스키마로 만들고, "결과처럼" 가공하지 않는다.
7. 목록에는 `limit` 파라미터가 있다 — inventory.ts의 상수 패턴을 따라 명시한다.
8. 필드명은 snake_case 그대로 — camelCase로 바꾸지 않는다(변환 계층은 Codex 몫).
9. 같은 파일을 Codex와 동시에 만지지 않는다 — api-needs.md로 조율.
10. 실검증 없이 커밋 금지 — 6단계 (a)를 건너뛰면 반드시 사고 난다.

## 6. 작업 목록 (우선순위순 — routes.py 상수명 기준)

이미 있음(건드리지 않음): AUTH_*, CLUSTERS/CLUSTER_PATH, FLEET_SUMMARY,
CLUSTER_INVENTORY_* 전부, CLUSTER_USAGE, CLUSTER_METRIC_* (metrics.ts 확인),
RCA 타임라인(rca.ts 확인 — 부족분은 아래 1군에서 보강).

| 순위 | 군 | routes.py 상수 | 만들 파일 |
|---|---|---|---|
| 1 (RCA — 골모드 §4 의존) | 인시던트 상세·복구·증거 | RCA_INCIDENT 상세, RCA_RECOVERY_PLAN_BY_CORRELATION_PATH, RCA_RECOVERY_ACTION_SELECT_PATH, EVIDENCE 계열 | `rca-detail.ts`, `recovery.ts`, `evidence.ts` (+각 -schemas) |
| 2 | 명령·승인 | COMMANDS_PATH, COMMAND_STATUS_PATH, APPROVAL_GRANT/REJECT_PATH | `commands.ts`, `approvals.ts` |
| 3 | 애플리케이션·릴리스 | APPLICATIONS_*, APPLICATION_DEPLOYMENTS/RUNS, RELEASE 계열 | `applications.ts`, `releases.ts` |
| 4 | 레포 연결 | REPOSITORY_DISCOVERY_*(probe/branches/manifests/validate) | `repo-discovery.ts` |
| 5 | 클러스터 등록 | PROVIDERS 계열, TARGETS_PATH, TARGETS preflight, CLUSTER_CONNECTION_STATUS_PATH | `providers.ts`, `targets.ts` |
| 6 | AI 채팅 | AI_CONVERSATIONS_PATH, AI_CONVERSATION_PATH, AI_CONVERSATION_MESSAGES_PATH | `conversations.ts` |
| 7 | 조직·운영 | ORGS/GROUPS/USERS/ACCESS, ALERT_CHANNELS_*, DEAD_LETTERS_* | `org.ts`, `alert-channels.ts`, `dead-letters.ts` |

각 군의 정확한 상수 전체 목록은 `routes.py`에서 해당 접두로 검색해 **전부** 구현한다
(예: `grep "APPLICATION" routes.py`). 군 하나 끝날 때마다 §3-7 커밋 + progress 기록.
agent 전용 경로(AGENT_*), webhook 경로(GITHUB/ALERTMANAGER), INSTALL_MANIFEST는
브라우저가 호출하지 않는다 — **만들지 않는다**.

## 7. 함수 하나의 완료 기준 (전부 충족 = 완료)

스키마 파일 존재(다섯 계명 준수) · 함수 파일 존재(레시피 형태) · index.ts export ·
실호출 검증 로그(6단계-a 출력 일부를 progress에 붙임) · `npm run check` 통과 ·
progress에 해당 export 함수 이름의 `API 완성:` 기록. 여섯 개 중 하나라도 빠지면 미완료다.
