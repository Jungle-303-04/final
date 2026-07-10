---
source_commit: 1960ed83
status: synced
---

# features/chat — AI 운영 어시스턴트 대화

> 소스: `frontend/src/features/chat/`

## 책임 (Responsibility)

- AI 대화 목록/단건 조회, 대화 생성, 메시지 전송, 대화 삭제, 복구 액션 선택 훅과 2열 채팅 화면.
- assistant 메시지의 `tool_calls`(도구 호출 로그), `actions`(복구 액션 선택 카드), `approval_ref`(승인 카드) 렌더링.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`, `@/shared/lib/types`(`AiConversationAcceptedResponse`, `AiConversationDetailResponse`, `Conversation`, `ConversationSummary`, `ChatMessage`, `ChatToolCall`, `ChatActions`, `ChatApprovalRef`, `Tone`), `@/shared/lib/adapt`(`adaptConversationSummary`), `@/shared/lib/format` | [shared](shared.md) | API·타입·포맷 |
| import | `@/features/repo/ApprovalCard` | [repo](./repo.md) | `approval_ref` 렌더 |
| import | `@/features/auth/api`(`useSession`) | [auth](./auth.md) | 액션 실행 권한(`service_admin`, `release_operator`) |
| import | `@/features/console/ui`(`useConsolePath`) | [app](./app.md) | `/console` base path 보존 링크 |
| import | `@/ui`, `@/ui/motion`, `@tanstack/react-query`(`useQueryClient`) | [shared](shared.md) | 디자인 시스템 프리미티브·Motion preset·캐시 무효화 |
| 백엔드 | `/ai/*`, `/rca/recovery-plans/*` | [api-gateway](../services/gateway-api-gateway.md) | G10 대화 route |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | API | 폴링/옵션 |
|---|---|---|---|
| `chatKeys` | `frontend/src/features/chat/api.ts :: chatKeys` | — | `list() = ['ai','conversations']`, `one(id) = ['ai','conversations', id]` |
| `CHAT_QUERY_TIMEOUT_MS` | `frontend/src/features/chat/api.ts :: CHAT_QUERY_TIMEOUT_MS` | — | `8_000` — 대화 목록/단건 조회 전용 |
| `useConversations` | `frontend/src/features/chat/api.ts :: useConversations` | GET `/ai/conversations` with `{timeoutMs: 8_000}` | 15s, `retry:false`, select `d.conversations.map(adaptConversationSummary)` |
| `useConversation` | `frontend/src/features/chat/api.ts :: useConversation` | GET `/ai/conversations/${id}` with `{timeoutMs: 8_000}` → `AiConversationDetailResponse` envelope | `(id: string \| undefined)`, `enabled: !!id`, `retry:false`, `select: adaptConversationDetail`. **적응 폴링**: raw `conversation.status === 'waiting'` 이면 2s, 아니면 15s(status 만으로 파생) |
| `AiMessagePayload` | `frontend/src/features/chat/api.ts :: AiMessagePayload` | `{message, title?, context?}` | `context`는 `AiChatContext` |
| `aiMessagePayload` | `frontend/src/features/chat/api.ts :: aiMessagePayload` | `string \| AiMessagePayload`, `{includeTitle?: boolean}` → `AiMessagePayload` | 문자열 입력은 `{message}`로 보정한다. `title`은 새 대화 생성에서 `includeTitle`일 때만 포함하고, 기존 대화 메시지 전송에는 보내지 않는다 |
| `useCreateConversation` | `frontend/src/features/chat/api.ts :: useCreateConversation` | POST `/ai/conversations` body `{message, title?, context?}` → `AiConversationAcceptedResponse` | 성공 시 list invalidate |
| `useSendMessage` | `frontend/src/features/chat/api.ts :: useSendMessage` | POST `/ai/conversations/${id}/messages` body `{message, context?}` → `AiConversationAcceptedResponse` | `(id: string)`, 성공 시 `one(id)` + list invalidate |
| `useDeleteConversation` | `frontend/src/features/chat/api.ts :: useDeleteConversation` | DELETE `/ai/conversations/${id}` | 성공 시 list invalidate + `one(id)` cache remove |
| `useSelectAction` | `frontend/src/features/chat/api.ts :: useSelectAction` | POST `/rca/recovery-plans/${planId}/actions/${actionId}/select` | mutation `({planId, actionId})`, 성공 시 list invalidate |
| `adaptConversationDetail` | `frontend/src/features/chat/api.ts :: adaptConversationDetail` | `AiConversationDetailResponse` → `Conversation` | `conversation`은 `adaptConversationSummary`, `messages[]`는 `adaptChatMessage`로 정규화. `metadata.tool_trace`/`metadata.tool_calls`/top-level `tool_calls`, `actions`, `approval_ref`를 렌더 타입으로 보정 |
| `MAX_AI_MESSAGE_LENGTH` | `frontend/src/features/chat/api.ts :: MAX_AI_MESSAGE_LENGTH` | — | `16_000` |

## 컨텍스트 헬퍼 — `context.ts`

| 심볼 | 앵커 | API | 설명 |
|---|---|---|---|
| `AiChatContext` | `frontend/src/features/chat/context.ts :: AiChatContext` | `cluster_id`, `application_id`, `diff_source`, `workflow_run_id`, `approval_id`, `resource_type`, `kind`, `namespace`, `name`, `uid`, `incident_id`, `correlation_id`, `symptom`, `root_cause`, `locale` 선택 필드 | AI 요청에 함께 보내는 화면/리소스 컨텍스트 |
| `compactContext` | `frontend/src/features/chat/context.ts :: compactContext` | `AiChatContext` → `AiChatContext \| undefined` | 문자열 trim, 빈 값 제거. `resource_type`만 있고 `kind`가 없으면 cluster/node/pod/service 기본 kind 보정 |
| `encodeChatContext` | `frontend/src/features/chat/context.ts :: encodeChatContext` | `AiChatContext` → JSON 문자열 \| undefined | `ContextActions`가 `/ai?context=...` 링크를 만들 때 사용 |
| `chatContextFromSearchParams` | `frontend/src/features/chat/context.ts :: chatContextFromSearchParams` | `URLSearchParams` → `AiChatContext \| undefined` | `context` JSON을 우선 파싱하고, 없으면 `cluster_id`/`cluster`, `application_id`, `diff_source`, `workflow_run_id`, `approval_id`, `resource_type`/`subject`, `kind`, `namespace`, `name`, `uid`, `locale` query를 보정 |

### Diff 설명 context

GitOps/Workflow/Safe PR 화면에서 AI 채팅을 열 때는 전체 diff나 manifest YAML을 query string에 싣지 않는다. 대신 아래 작은 식별자만 `context` JSON으로 전달한다.

```json
{
  "diff_source": "gitops",
  "workflow_run_id": "workflow-...",
  "approval_id": "approval-...",
  "application_id": "app-..."
}
```

또는 Safe PR 탭:

```json
{
  "diff_source": "safe_pr",
  "workflow_run_id": "workflow-...",
  "application_id": "app-..."
}
```

이 값은 `explain_diff_risk` tool의 조회 힌트다. 권한 근거가 아니며, 백엔드 tool은 workspace/session 범위 DB 조회와 기존 approval/event 데이터를 다시 확인해야 한다. context에 전체 patch/YAML/secret/config 내용을 넣지 않는다.

## 컴포넌트

### `frontend/src/features/chat/ChatView.tsx :: ChatView` (default export)

- 라우트: `/ai`(새 대화), `/ai/:conversationId`. 쿼리스트링 `prefill` — draft 초기값(타 화면의 "✦ 분석" 딥링크용), `context` — JSON 직렬화된 `AiChatContext`.
- state: `draft: string`. ref: `bottomRef` — `conv.messages.length` 변경 시 reduced-motion을 깨지 않도록 `scrollIntoView({ block: 'end' })`.
- `chatContext = chatContextFromSearchParams(sp)` 를 `useMemo`로 파생한다. `context` JSON이 깨졌거나 비어 있으면 `undefined`.
- `submit()`: trim 후 빈 문자열/16,000자 초과면 무시. payload는 `{message: text, context: chatContext}`. `conversationId` 있으면 `send.mutate(payload, {onSuccess: clearPrefill})`, 없으면 `create.mutate(payload, { onSuccess: d => nav(pathFor('/ai/'+d.conversation_id)) })`. 이후 draft 비움, 실패 시 draft 복원.
- `deleteConversation(id)`: DELETE 성공 시 ok toast. 현재 열린 대화면 `pathFor('/ai')`로 replace 이동한다. 실패는 danger toast.
- `aiConfigurationIssue()`: list/detail/create/send 오류 메시지에서 `LLM_PROVIDER`, `API_KEY`, quota/auth 계열 오류를 감지하거나 conversation status가 `failed`면 채팅창 대신 설정 안내 EmptyState를 먼저 보여준다. 현 백엔드에 별도 설정 조회 API가 없으므로 오류 계약 기반 선행 차단으로 동작한다.
- 트리:
  ```
  motion.div(fadeInUp) > PageHeader('AI 채팅') > responsive grid
  ├─ Card('대화', actions="새 대화" → nav(pathFor('/ai'))) ← 좌측 목록 (성공+0건이면 '대화 없음')
  │   listQ.isPending → Skeleton
  │   listQ.isError → EmptyState(error message, 다시 시도)
  │   listQ.isSuccess → motion list(listStagger)
  │   대화별 행: 열기 button(status==='waiting' 이면 info 점, title ellipsis, timeAgo(updated_at)) + 삭제 button
  │   현재 대화는 accent border/background. 열기 button 클릭 → /ai/:id, 삭제 button 클릭 → deleteConversation
  └─ Card(flex column, padding 0, overflow hidden) ← 우측 스레드
     ├─ 헤더: 제목 또는 'AI 운영 어시스턴트' + status, 현재 대화면 삭제 버튼
     ├─ 메시지 영역:
     │   aiConfigurationIssue 있으면 EmptyState('AI 설정 확인 필요' 또는 'AI 응답 실패') + 다시 시도 + 운영 설정 링크
     │   conversationId 없으면 EmptyState('AI', '새 대화')
     │   conversationId 있고 convQ.isPending → Skeleton
     │   conversationId 있고 convQ.isError → EmptyState(error message, 다시 시도)
     │   conv.messages.map(MessageRenderer)
     │   conv.status==='waiting' → "분석 중" 인디케이터(data-testid="typing")
     └─ 입력줄: Field/Textarea(rows 2, Ctrl/Meta+Enter 전송, data-testid="chat-input") + Button(primary, loading=create||send, disabled=빈 draft/16,000자 초과/pending/AI 설정 오류, data-testid="chat-send")
  ```

내부(비공개) 서브컴포넌트:

- `MessageRenderer { message: ChatMessage }`
  - user: 우측 정렬 Tailwind bubble. `bg-accent`, `text-on-accent`, `rounded-panel`, `shadow-soft`, `whitespace-pre-wrap`, `break-words`.
  - assistant: 좌측 정렬 Tailwind bubble. `bg-bg`, `border-border`, `rounded-panel`, `shadow-soft`. content 는 `split('**')` 로 홀수 인덱스만 `<strong>`(단순 볼드 마크업). 이어서 `tool_calls` → `ToolTraceRow`, `actions` → `ActionSelectCard`, `approval_ref` → `ApprovalCard(approval_id, summary, resolved, compact)`.
- `ToolTraceRow { trace }`: assistant 도구 호출 1건을 디자인 시스템 토큰 기반 `<details>`로 렌더한다. `compactToolArgs(args)`는 앞뒤 공백 제거 후 900자를 넘으면 900자 + `...`로 줄인다.
- `ActionSelectCard { actions: NonNullable<ChatMessage['actions']> }` (`data-testid="action-card"`)
  - state: `picked: string | null`. `locked = !!actions.selected`.
  - 옵션별 radio(라벨 + `Badge tone=risk '위험도'` + impact 설명). locked 면 radio disabled, 미선택 옵션 opacity 0.5.
  - locked → `Badge success '실행됨'`. 아니면 "선택 실행" 버튼(primary sm): `!picked || !canDeploy` disabled, Tooltip `'release_operator 권한 필요'`, 클릭 시 `select.mutate({planId, actionId: picked})` + 성공 시 `queryClient.invalidateQueries({ queryKey: chatKeys.list() })`.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/ai` | `ChatView` | `RequireSession`+`ConsoleLayout` | 새 대화(`?prefill=` 지원) |
| `/ai/:conversationId` | `ChatView` | `RequireSession`+`ConsoleLayout` | 기존 대화 스레드 |

## 동작 (Behavior)

1. 새 대화: 입력 → POST `/ai/conversations` `{message, context?}` → `AiConversationAcceptedResponse.conversation_id` 로 이동 → 단건 폴링 시작. `/console` 아래에서 열린 경우 `useConsolePath`로 `/console/ai/:id`를 유지한다.
2. waiting 동안 2s 폴링 + "분석 중" 인디케이터 → assistant 응답이 오면 status idle → 15s 로 완화.
3. 복구 액션: assistant `actions` 카드에서 radio 선택 → 선택 실행 → 서버가 `selected` 를 채우면 카드 잠금.
4. 승인: assistant `approval_ref` 는 [repo](./repo.md) 의 `ApprovalCard` 로 처리(승인 성공 시 repo 쪽 훅이 `['ai']` 캐시도 invalidate).
5. 대화 삭제: 좌측 행 또는 우측 헤더 삭제 → DELETE `/ai/conversations/:id` → 목록 갱신. 현재 대화 삭제 시 `pathFor('/ai')`로 이동.
6. 타 화면에서 들어온 리소스/diff 컨텍스트는 `/ai?prefill=...&context=<json>`으로만 전달하고, 전송 버튼을 누른 시점의 POST body에 포함한다(자동 전송 없음).
7. LLM 미설정/키 오류/크레딧 오류는 입력창보다 먼저 설정 안내 카드를 표시한다. 사용자는 "운영 설정"으로 이동하거나 "다시 시도"로 목록/상세 쿼리를 재실행한다.

## 불변식·오류 (Invariants & Errors)

- 메시지 길이 상한 16,000자 — 초과 시 클라이언트에서 전송 차단 + 경고 표시.
- 폴링 주기는 서버가 준 `status` 만으로 파생(별도 타이머·웹소켓 없음).
- 대화 조회가 실패한 상태에서는 현재 대화 전송 버튼도 비활성화한다. 실패 상태를 빈 대화로 위장하지 않고 오류 메시지와 재시도 버튼을 보여준다.
- LLM 설정 오류 상태에서는 전송 버튼과 composer를 숨겨 "제출 후 실패"를 만들지 않는다. 정상 상태가 확인되어야 입력 UI가 다시 나타난다.
- 대화 목록 응답에는 `messages` 가 없다(`adaptConversationSummary` 로 요약 정규화).
- 대화 단건 응답은 `{conversation, messages}` envelope 이며, `ChatView`는 `adaptConversationDetail`이 만든 `Conversation`만 소비한다. assistant 도구 표시는 message top-level `tool_calls`, `metadata.tool_calls`, `metadata.tool_trace`를 모두 허용한다.
- 삭제는 workspace 범위 서버 검증에 의존한다. 클라이언트는 성공 후 해당 detail cache만 제거한다.
- context 는 리소스·diff 식별자만 담는다. 리소스 상세·이벤트·RCA report·GitOps diff·Safe PR patch 는 백엔드 AI 도구가 세션 workspace 범위에서 다시 읽는다.
