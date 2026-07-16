---
title: VP-021 — Opsia AI 운영 어시스턴트 (대화·도구·근거·액션·요약)
status: spec-approved
date: 2026-07-15
owner: 우녕 (확정) / 조율 세션 (설계)
governing: AI 어시스턴트 패널의 정본. 결정적(deterministic) 경로에서 LLM 대화 흐름으로의 전환과
  메시지 파트 모델을 여기서 확정한다. 구현자는 이 문서만 보고 논리적 결정 없이 작업한다.
depends_on: VP-020(알림 · AiChatAction), packages/ai/engine(ConversationEngine), ai-chat-worker
---

# VP-021 — Opsia AI 운영 어시스턴트

> **구현 원칙:** 이 문서는 "논리적 고민 0"을 목표로 한다. 타입·상태·애니메이션·i18n·테스트를 모두
> 명시했다. 값이 애매하면 **여기 적힌 값을 그대로 쓴다.** 새 결정을 만들지 마라.

---

## 0. 무엇을 만드나 (한 문장)

우하단 Sparkles 버튼으로 여는 **대화형 운영 AI 패널**. 사용자가 질문하면 LLM(ai-chat-worker)이
도구를 호출해 답하고, 그 과정에서 **처리 단계 · 근거 링크 · 페이지 링크 · 액션 제안(선택 실행) ·
결과 시각화**를 파트로 쌓아 보여주며, 끝나면 **한 줄 요약으로 접고**, 대화는 **목록**에 남는다.

지금 상태: 패널 UI·백엔드 결정적 경로(`/api/ai/chat`)·LLM 워커·대화 API가 모두 존재한다.
**이 작업은 (1) 패널을 대화 흐름(`/ai/conversations`)에 배선하고 (2) 응답을 파트 모델로 렌더한다.**

---

## 1. 데이터 흐름 (정본)

```
패널 submit
  → 대화 없으면 POST /api/ai/conversations {message, context}  → { conversation_id, message_id }
  → 대화 있으면 POST /api/ai/conversations/{id}/messages {message, context} → { message_id }
  (백엔드가 ai.message.received 발행 → ai-chat-worker(LLM+도구루프) → ai.message.responded 저장)
  → 패널이 GET /api/ai/conversations/{id} 를 1초 간격 폴링
  → 해당 request message_id 의 assistant 응답이 도착(responded)하거나 failed 될 때까지
  → 응답의 content · metadata.tool_trace · evidence · action 을 "파트"로 변환해 렌더
```

- **폴링 종료 조건:** assistant 메시지 status ∈ {`responded`, `failed`} 또는 경과 **25초 초과**(타임아웃 → failed 파트).
- **폴링 간격:** 1000ms. 폴링 중 `tool_trace`가 부분적으로 오면 **오는 대로 steps 파트를 갱신**(스트리밍 느낌).
- **중단:** 사용자가 Stop 누르면 폴링만 중단(서버 실행은 백그라운드로 완료, 다음 열람 시 반영).

---

## 2. 프론트 계약 타입 (그대로 복사)

`frontend/src/features/ai-assistant/aiConversationContract.ts` **신규 파일**:

```ts
import type { AiEvidenceLink, AiChatActionProposal } from "./aiAssistantContract";

/** 어시스턴트 한 턴을 구성하는 파트. 순서대로 렌더된다. */
export type AiMessagePart =
  | AiTextPart
  | AiStepsPart
  | AiEvidencePart
  | AiLinksPart
  | AiActionPart
  | AiResultPart
  | AiStatusPart;

export interface AiTextPart {
  kind: "text";
  /** 마크다운. 링크·코드·목록 허용. */
  markdown: string;
}

export interface AiStep {
  id: string;
  /** "리소스 조회", "메트릭 확인" 등 도구 이름의 사람 문구 */
  label: string;
  /** "3건 확인", "CPU 82%" 등 결과 요약. 없으면 null */
  detail: string | null;
  state: "running" | "done" | "failed";
}
export interface AiStepsPart {
  kind: "steps";
  steps: AiStep[];
  /** 아직 진행 중이면 true (스피너 유지) */
  running: boolean;
}

export interface AiEvidencePart {
  kind: "evidence";
  items: AiEvidenceLink[]; // { type, id, label, link:`/${string}` }
}

export interface AiPageLink {
  label: string;
  href: `/${string}`;
  /** lucide 아이콘 키. 없으면 기본 ArrowUpRight */
  icon?: "resources" | "incident" | "gitops" | "cluster" | "alert";
}
export interface AiLinksPart {
  kind: "links";
  items: AiPageLink[];
}

export interface AiActionPart {
  kind: "action";
  proposal: AiChatActionProposal; // { type:"create_alert_rule", payload, rationale }
}

export interface AiResultMetric {
  label: string;
  value: string;
  tone: "healthy" | "warning" | "critical" | "neutral";
}
export interface AiResultPart {
  kind: "result";
  title: string;
  tone: "healthy" | "warning" | "critical" | "neutral";
  summary: string;
  metrics?: AiResultMetric[];
}

export interface AiStatusPart {
  kind: "status";
  state: "pending" | "failed";
  reason?: string;
}

export interface AiTurn {
  id: string;
  role: "user" | "assistant";
  /** user 턴이면 질문 문자열 */
  question?: string;
  /** assistant 턴이면 파트 배열 */
  parts?: AiMessagePart[];
  createdAt: string;
  /** 시간 경과·완료로 접힘 */
  collapsed: boolean;
  /** 접혔을 때 보여줄 한 줄 요약 */
  summary?: string;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AiConversation {
  id: string;
  title: string;
  updatedAt: string;
  turns: AiTurn[];
}
```

### 2.1 포트 (apiComposition에서 배선)

`aiConversationContract.ts` 에 이어서:

```ts
export interface AiConversationContext {
  screen: string;
  filters: {
    clusters: string[]; namespaces: string[]; applications: string[];
    labels: string[]; resourceTypes: string[]; health: string[]; query: string;
  };
  selection: { type: "resource"; identity: string } | null;
  time: string | null;
  logStreamId: string | null;
}

export interface AiConversationPort {
  create(context: AiConversationContext, message: string, signal?: AbortSignal):
    Promise<{ conversationId: string; requestMessageId: string }>;
  append(conversationId: string, context: AiConversationContext, message: string, signal?: AbortSignal):
    Promise<{ requestMessageId: string }>;
  /** 폴링용. 턴 배열(파트 변환 완료)로 반환 */
  load(conversationId: string, signal?: AbortSignal): Promise<AiConversation>;
  list(signal?: AbortSignal): Promise<AiConversationSummary[]>;
  remove(conversationId: string, signal?: AbortSignal): Promise<void>;
  /** 액션 확정 실행. 화이트리스트: 알림 규칙 생성 */
  createAlertRule(payload: AiChatActionProposal["payload"], signal?: AbortSignal):
    Promise<{ ruleId: string }>;
}

export const EMPTY_AI_CONVERSATION_PORT: AiConversationPort = {
  create: async () => { throw new Error("unavailable"); },
  append: async () => { throw new Error("unavailable"); },
  load: async () => ({ id: "", title: "", updatedAt: "", turns: [] }),
  list: async () => [],
  remove: async () => undefined,
  createAlertRule: async () => { throw new Error("unavailable"); },
};
```

### 2.2 어댑터 매핑 (백엔드 응답 → 파트)

`createAiConversationAdapter.ts`. 백엔드 대화 상세(GET)는 메시지 배열을 준다. 어시스턴트 메시지 하나를
아래 **고정 순서**로 파트 변환한다(순서 절대 바꾸지 마라):

```
1) steps    ← metadata.tool_trace (있으면). running = (message.status !== "responded")
2) text     ← content (비어있지 않으면)
3) result   ← metadata.result (있으면; 백엔드가 주면 그대로, 없으면 생략)
4) evidence ← evidence[] (있으면)
5) links    ← metadata.page_links (있으면; 없으면 evidence에서 파생 금지 — 생략)
6) action   ← action (있으면)
7) status   ← status==="failed" → {kind:"status", state:"failed", reason} / 아직 미응답 → {state:"pending"}
```

- `tool_trace` 항목 형태(백엔드): `{ tool, args_summary, result_summary, ok }`.
  → `AiStep { id: tool+idx, label: toolLabel(tool), detail: result_summary ?? null, state: ok? "done":"failed" }`.
  `toolLabel` 매핑은 §7 i18n `ai.tool.*` 참조. 미매핑 tool은 raw 이름 그대로.
- `content`는 마크다운으로 간주(그대로 `AiTextPart.markdown`).
- 폴링 중 아직 미응답이면 parts = `[steps(running:true, 지금까지 trace), status(pending)]`.

---

## 3. 컴포넌트 트리 (파일 단위)

```
app/AiAssistantPanel.tsx                 (오케스트레이션 · 상태 머신 · 폴링)
  ├─ ai-assistant/AiPanelHeader.tsx      (제목 · 컨텍스트 칩 · [목록][＋새대화][닫기])
  ├─ ai-assistant/AiConversationList.tsx (드로어: 대화 목록 · 재열기 · 삭제)
  ├─ ai-assistant/AiThread.tsx           (스크롤 로그 · role=log)
  │   ├─ ai-assistant/AiSuggestions.tsx  (빈 상태 제안)
  │   ├─ ai-assistant/AiUserBubble.tsx
  │   └─ ai-assistant/AiAssistantTurn.tsx (collapsed면 요약 한 줄)
  │        └─ ai-assistant/parts/*        (파트별 렌더러 — 아래 7개)
  │             AiTextPart.tsx AiStepsPart.tsx AiEvidencePart.tsx
  │             AiLinksPart.tsx AiActionPart.tsx AiResultPart.tsx AiStatusPart.tsx
  └─ ai-assistant/AiComposer.tsx         (textarea · 전송/중단 · Enter 제출)
```

각 파일은 **한 가지 파트만** 렌더한다. `AiAssistantTurn`이 `part.kind`로 스위치해 위 렌더러를 부른다.

---

## 4. 상태 머신 (패널)

```
type PanelPhase =
  | "idle"        // 입력 대기
  | "submitting"  // create/append 요청 중
  | "awaiting"    // 폴링 중 (응답 아직) — steps/pending 표시
  | "streaming"   // 폴링 중 파트가 부분 도착 — steps 갱신
  | "complete"    // 응답 완료
  | "failed";     // 타임아웃/에러
```

전이:
- `idle` --submit--> `submitting` --성공--> `awaiting`
- `awaiting` --tool_trace 도착--> `streaming` --responded--> `complete`
- `awaiting|streaming` --25초 초과 or 에러--> `failed`
- `complete` --3분 경과 or 새 질문--> 직전 어시스턴트 턴 `collapsed=true`(§5)
- `failed` --재시도--> `submitting`

**폴링 로직(그대로):**
```ts
const DEADLINE_MS = 25_000;
const POLL_MS = 1_000;
// submit 후:
const startedAt = Date.now();
const tick = async () => {
  const convo = await port.load(conversationId, signal);
  const turn = findAssistantTurnFor(convo, requestMessageId);
  setConversation(convo);
  if (turn?.parts?.some(p => p.kind === "status" && p.state === "failed")) { setPhase("failed"); return; }
  if (turn && !turn.parts?.some(p => p.kind === "status" && p.state === "pending")) { setPhase("complete"); return; }
  if (Date.now() - startedAt > DEADLINE_MS) { setPhase("failed"); return; }
  setPhase(turn?.parts?.some(p => p.kind === "steps") ? "streaming" : "awaiting");
  timer = window.setTimeout(() => void tick(), POLL_MS);
};
```

---

## 5. 대화 수명주기 — 요약·접기 (정본 규칙)

- **자동 접기:** 어시스턴트 턴이 `complete`가 되고 **(a) 새 질문이 제출되거나 (b) 그 턴 완료 후 180초 경과**하면 `collapsed=true`.
- **요약 문자열 생성(프론트, 결정적):** 우선순위대로 첫 번째를 `summary`로:
  1. `result` 파트 있으면 → `result.title` + " · " + `result.summary`
  2. `action` 파트 있으면 → i18n `ai.summary.action`(rule name 삽입)
  3. `text` 파트 있으면 → text 첫 문장(마크다운 제거) 최대 60자 + "…"
  4. 없으면 → i18n `ai.summary.empty`
- **접힌 턴 UI:** 한 줄(아이콘 + 요약 + 시각). 클릭하면 다시 펼침(`collapsed=false`).
- **대화 목록:** 헤더 [목록] → `AiConversationList` 드로어. 항목 = 제목·상대시각. 클릭 재열기, 휴지통 아이콘으로 삭제(`port.remove`). 새 대화는 `conversationId=null`로 리셋.

---

## 6. 애니메이션 (그대로 — tw-animate-css + 모션 토큰)

| 대상 | 클래스 |
|---|---|
| 새 턴 등장 | `animate-in fade-in-0 slide-in-from-bottom-1 duration-200 motion-reduce:animate-none` |
| 사용자 말풍선 | `ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground` |
| 어시스턴트 카드 | `mr-auto w-fit max-w-[92%] rounded-2xl rounded-bl-sm border bg-card` |
| pending 상태 파트 | `animate-pulse ... motion-reduce:animate-none` |
| steps 블록 펼침 | `animate-in fade-in-0 slide-in-from-top-1 duration-150` |
| step running 아이콘 | 공용 `<Spinner decorative />` 사용(`motion-safe:animate-spin motion-reduce:animate-none`는 `frontend/src/shared/ui/primitives/spinner.tsx`가 제공) |
| step done 체크 | `text-status-healthy` + `animate-in zoom-in-95 duration-150` |
| 근거 칩 (스태거) | 각 칩 `animate-in fade-in-0 duration-150` + `style={{animationDelay: idx*40+"ms"}}` |
| 액션 카드 | `animate-in fade-in-0 zoom-in-95 duration-200` |
| 결과 카드 tone 색 | `border-l-2` + tone별 `border-l-status-healthy|warning|destructive` |
| 접기/펼치기 | 높이·투명도 전환. 컨테이너 `transition-all duration-(--motion-quick) ease-(--ease-out) motion-reduce:transition-none` |
| 스트리밍 텍스트 커서 | 마지막 텍스트 끝에 `<span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-text-bottom" />` (phase==="streaming"일 때만) |
| 전송 버튼 | 기존 `size="icon-sm"`; 중단 시 `Square` + "중단" |

**전 파트 공통:** `motion-reduce:*`로 감속 모드 대응. 색은 반드시 상태 토큰(`status-healthy/warning/stale`, `destructive`) 사용 — 하드코드 색 금지.

---

## 7. i18n 키 (keys/shell.ts + catalogs ko/en 동시 추가)

```
ai.panel.title            "Opsia AI"
ai.panel.description       "현재 화면 맥락으로 질문하고 근거를 확인합니다." / "Ask with the current view context and verify the evidence."
ai.panel.history           "대화 목록" / "Conversations"
ai.panel.new               "새 대화" / "New chat"
ai.panel.close             "닫기" / "Close"
ai.panel.context           "현재 맥락" / "Context"
ai.panel.placeholder       "지금 보고 있는 것에 대해 질문하세요…" / "Ask about what you are viewing…"
ai.panel.send              "보내기" / "Send"
ai.panel.stop              "중단" / "Stop"
ai.state.pending           "확인하고 있습니다…" / "Working on it…"
ai.state.failed            "답을 완성하지 못했습니다. 다시 시도하세요." / "Could not finish. Try again."
ai.state.timeout           "응답이 지연됩니다. 다시 시도하세요." / "The response is delayed. Try again."
ai.steps.title             "처리 과정" / "Steps"
ai.evidence.title          "근거" / "Evidence"
ai.links.title             "바로가기" / "Open"
ai.action.title            "제안" / "Suggestion"
ai.action.createAlert      "알림 만들기" / "Create alert"
ai.action.created          "알림 규칙을 만들었습니다" / "Alert rule created"
ai.action.edit             "수정" / "Edit"
ai.summary.action          "알림 규칙 제안: {name}" / "Alert rule proposed: {name}"
ai.summary.empty           "대화" / "Conversation"
ai.turn.expand             "펼치기" / "Expand"
ai.list.empty              "아직 대화가 없습니다." / "No conversations yet."
ai.list.delete             "대화 삭제" / "Delete conversation"
ai.tool.inventory          "리소스 조회" / "Inventory lookup"
ai.tool.metrics            "메트릭 확인" / "Metrics"
ai.tool.logs               "로그 확인" / "Logs"
ai.tool.rca                "장애 분석" / "Root-cause"
ai.tool.recovery           "복구 계획" / "Recovery plan"
```
디자인 가드(i18n-literal)를 지키려면 **모든 사용자 문구는 위 키에서** 온다. 인라인 한글 금지.

---

## 8. apiComposition 배선 (그대로)

`api/ai-conversations.ts`(존재)의 `createAiConversation`·`appendAiMessage`·`getAiConversation`·
`listAiConversations`·`deleteAiConversation`, `api/alert-rules.ts`의 `createAlertRule`을 조합해
`createAiConversationAdapter({...})`로 포트를 만든다. 어댑터가 §2.2 매핑으로 파트를 생성한다.

- **apiBoundary 준수:** 각 엔드포인트는 이미 계약 테스트·배럴·Zod 스키마가 있어야 한다. `getAiConversation`
  응답 스키마에 `metadata.tool_trace`·`page_links`·`result`가 없으면 **Zod에 optional로 추가**한다(백엔드가 이미 채워 보냄; 없으면 undefined).
- `ProductShell`/`productComposition`의 목(mock) 포트에 `AiConversationPort` 6개 메서드를 추가(테스트 통과).

---

## 9. 백엔드 확인 (프론트 배선 전 1회)

1. `POST /api/ai/conversations`·`/{id}/messages`·`GET /{id}`·`GET /api/ai/conversations`·`DELETE`가 열려 있는가 → `src/domains/ai/router.py` 확인(존재).
2. `ai.message.responded.metadata`에 `tool_trace`가 실리는가 → `src/services/ai/chat-worker/app.py` 라인 143 `"tool_trace": result.tool_trace` 확인(존재).
3. **LLM 활성화 전제:** `management-runtime-secret`에 `LLM_PROVIDER=openai`,`OPENAI_API_KEY`,`OPENAI_MODEL` 필요. 없으면 워커가 `UnconfiguredLlmAdapter`(stub) → 빈 응답. **이건 인프라(사람) 작업.** 프론트는 stub 응답도 파트로 정상 렌더(빈 text → status pending→complete)해야 하며 깨지면 안 된다.

---

## 10. UI 상태 전수 (하나도 빠뜨리지 마라)

| 상태 | 화면 |
|---|---|
| 대화 없음(빈) | 컨텍스트 카드 + 제안 3개 + composer |
| 제출 직후 | 사용자 말풍선 + pending 파트(`animate-pulse`) |
| 폴링 중(steps만) | steps 블록(running 스피너) + pending |
| 스트리밍(text 도착) | steps(done) + text(+커서) |
| 근거 있는 완료 | text + evidence 칩 + (있으면)links |
| 액션 제안 | text + action 카드([수정][알림 만들기]) |
| 액션 실행 중 | 버튼 스피너 "만드는 중" |
| 액션 완료 | ✓ "알림 규칙을 만들었습니다" + [규칙 보기] 링크 |
| 결과 요약 | result 카드(tone 색 · metrics 칩) |
| 실패/타임아웃 | status(failed) + [다시 시도] |
| 접힘 | 한 줄 요약(아이콘+요약+시각), 클릭 펼침 |
| 목록 열림 | 드로어(항목·삭제) |
| 권한 없음(capability) | 액션 카드 **렌더 안 함**(disabled 금지 — VP-020 규율) |
| 로그인 만료 | 기존 `reportUnauthorized()` 경유 |

---

## 11. 테스트 기대(vitest) — 최소 목록

`AiAssistantPanel.test.tsx` / `createAiConversationAdapter.test.ts`:

1. 어댑터: `tool_trace`+`content`+`evidence`+`action` 응답 → `[steps, text, evidence, action]` 순서 파트 생성.
2. 어댑터: 미응답(status!=responded) → `[steps(running), status(pending)]`.
3. 패널: 제출 → create 호출 → 폴링으로 responded 도착 시 text 렌더.
4. 패널: 25초 초과 → failed 파트 + 다시 시도 버튼(가짜 타이머).
5. 패널: 근거 없는 응답도 깨지지 않음(빈 text 허용).
6. 액션 카드: [알림 만들기] → `createAlertRule(payload)` 호출 → ✓ 상태.
7. capability hidden → 액션 카드 미렌더.
8. 접기: complete 후 새 질문 → 직전 턴 `collapsed` + 요약 문자열 규칙(§5) 적용.
9. 목록: list 렌더 · delete 호출 · 새 대화 리셋.
10. 스트리밍 커서는 phase==="streaming"에서만 존재.

---

## 12. Codex 구현 체크리스트 (순서대로)

- [ ] `aiConversationContract.ts` 타입·포트 추가(§2).
- [ ] `api/ai-conversations-schemas.ts` Zod에 `metadata.tool_trace/page_links/result` optional 추가(§8).
- [ ] `createAiConversationAdapter.ts` + §2.2 매핑 + 테스트.
- [ ] `apiComposition.ts`에 `aiConversationPort` 조합, 목 포트 업데이트.
- [ ] i18n 키 33개 추가(ko/en/keys 동시, §7).
- [ ] 파트 렌더러 7개(`parts/*`) — §6 애니메이션·§10 상태 포함.
- [ ] `AiPanelHeader`·`AiConversationList`·`AiThread`·`AiUserBubble`·`AiAssistantTurn`·`AiComposer`.
- [ ] `AiAssistantPanel.tsx`를 결정적 경로에서 대화 흐름으로 교체(상태 머신 §4 · 폴링 · 접기 §5).
- [ ] 기존 알람 액션 카드(내가 만든 것)를 `AiActionPart`로 이관.
- [ ] `AiAssistantPanel.test.tsx` §11 통과 · typecheck 0 · lint 0 · `make gate-fast` green.
- [ ] 파일당 300줄 초과 시 파트 렌더러로 분리(디자인 가드).

## 13. 금지

- 인라인 한글/영문 리터럴(전부 i18n) · 하드코드 색(전부 토큰) · pages/features의 `../../api` 직접 import.
- 액션은 **화이트리스트 `create_alert_rule` 하나만**. 임의 클러스터 변경 액션 카드 금지(그건 GitOps).
- AI가 **확인 없이 실행하는 경로** 금지(제안 → 사람이 누름).
- 근거 없는 텍스트를 "사실"처럼 단정하는 스타일 금지(백엔드 evidence-gating 존중).
