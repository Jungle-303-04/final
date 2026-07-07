---
source_commit: 664925a6
status: synced
---

# features/chat — AI 운영 어시스턴트 대화

> 소스: `frontend/src/features/chat/`

## 책임 (Responsibility)

- AI 대화 목록/단건 조회, 대화 생성, 메시지 전송, 복구 액션 선택 훅과 2열 채팅 화면.
- assistant 메시지의 `tool_calls`(도구 호출 로그), `actions`(복구 액션 선택 카드), `approval_ref`(승인 카드) 렌더링.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `@/shared/lib/api`, `@/shared/lib/types`(`Conversation`, `ChatMessage`), `@/shared/lib/adapt`(`adaptConversationSummary`), `@/shared/lib/query`(`queryClient`), `@/shared/lib/format`, `@/shared/ui`, `@/shared/motion` | [shared](shared.md) | API·UI |
| import | `@/features/repo/ApprovalCard` | [repo](./repo.md) | `approval_ref` 렌더 |
| import | `@/features/auth/api`(`useIsAdmin`) | [auth](./auth.md) | 액션 실행 권한 |
| 백엔드 | `/ai/*`, `/rca/recovery-plans/*` | [api-gateway](../services/gateway-api-gateway.md) | G10 대화 route |

## 공개 인터페이스 (Public API) — `api.ts`

| 심볼 | 앵커 | API | 폴링/옵션 |
|---|---|---|---|
| `chatKeys` | `frontend/src/features/chat/api.ts :: chatKeys` | — | `list() = ['ai','conversations']`, `one(id) = ['ai','conversations', id]` |
| `useConversations` | `frontend/src/features/chat/api.ts :: useConversations` | GET `/ai/conversations` | 15s, select `d.conversations.map(adaptConversationSummary)` |
| `useConversation` | `frontend/src/features/chat/api.ts :: useConversation` | GET `/ai/conversations/${id}` → `Conversation` | `(id: string \| undefined)`, `enabled: !!id`. **적응 폴링**: `data.status === 'waiting'` 이면 2s, 아니면 15s(status 만으로 파생) |
| `useCreateConversation` | `frontend/src/features/chat/api.ts :: useCreateConversation` | POST `/ai/conversations` body `{message}` → `{conversation_id}` | 성공 시 list invalidate |
| `useSendMessage` | `frontend/src/features/chat/api.ts :: useSendMessage` | POST `/ai/conversations/${id}/messages` body `{message}` | `(id: string)`, 성공 시 `one(id)` invalidate |
| `useSelectAction` | `frontend/src/features/chat/api.ts :: useSelectAction` | POST `/rca/recovery-plans/${planId}/actions/${actionId}/select` | mutation `({planId, actionId})`, 성공 시 list invalidate |
| `MAX_AI_MESSAGE_LENGTH` | `frontend/src/features/chat/api.ts :: MAX_AI_MESSAGE_LENGTH` | — | `16_000` |

## 컴포넌트

### `frontend/src/features/chat/ChatView.tsx :: ChatView` (default export)

- 라우트: `/ai`(새 대화), `/ai/:conversationId`. 쿼리스트링 `prefill` — draft 초기값(타 화면의 "✦ 분석" 딥링크용).
- state: `draft: string`. ref: `bottomRef` — `conv.messages.length` 변경 시 `scrollIntoView({behavior:'smooth'})`.
- `submit()`: trim 후 빈 문자열/16,000자 초과면 무시. `conversationId` 있으면 `send.mutate(text)`, 없으면 `create.mutate(text, { onSuccess: d => nav('/ai/'+d.conversation_id) })`. 이후 draft 비움.
- 트리:
  ```
  FadeSlideIn > 그리드(260px 1fr, 높이 calc(100vh - 140px))
  ├─ Card('대화', actions="+ 새 대화" → nav('/ai'))   ← 좌측 목록 (성공+0건이면 '대화 이력이 없습니다…' 안내)
  │   대화별 행: status==='waiting' 이면 info 점, title(ellipsis), timeAgo(updated_at)
  │   현재 대화는 surface-3 배경. 클릭 → /ai/:id
  └─ Card(flex column)                                ← 우측 스레드
     ├─ 메시지 영역(overflow auto):
     │   conversationId 없으면 EmptyState('✦ AI 운영 어시스턴트')
     │   conv.messages.map(MessageRenderer)
     │   conv.status==='waiting' → "✦ 분석 중" + skeleton (data-testid="typing")
     └─ 입력줄: 16,000자 초과 시 role="alert" 경고 · textarea(rows 2, ⌘/Ctrl+Enter 전송,
        data-testid="chat-input") · 전송 Button(primary, loading=create||send, data-testid="chat-send")
  ```

내부(비공개) 서브컴포넌트:

- `MessageRenderer { m: ChatMessage }`
  - user: 우측 정렬 말풍선(배경 `--brand`, radius `12px 12px 2px 12px`, `white-space: pre-wrap`).
  - assistant: 좌측 정렬(surface-2). content 는 `split('**')` 로 홀수 인덱스만 `<b>`(단순 볼드 마크업). 이어서 `tool_calls` 행들(`Badge tone=status '도구'` + code name + args), `actions` → `ActionSelectCard`, `approval_ref` → `ApprovalCard(approval_id, summary, resolved, compact)`.
- `ActionSelectCard { actions: NonNullable<ChatMessage['actions']> }` (`data-testid="action-card"`)
  - state: `picked: string | null`. `locked = !!actions.selected`.
  - 옵션별 radio(라벨 + `Badge tone=risk '위험도'` + impact 설명). locked 면 radio disabled, 미선택 옵션 opacity 0.5.
  - locked → `Badge ok '실행됨 — 진행은 워크플로우에서 확인'`. 아니면 "선택 실행" 버튼(primary sm): `!picked || !canDeploy` disabled(title `'release_operator 권한 필요'`), 클릭 시 `select.mutate({planId, actionId: picked})` + 성공 시 `queryClient.invalidateQueries({ queryKey: ['ai'] })`.

## 라우트

| 경로 | 컴포넌트 | 가드 | 설명 |
|---|---|---|---|
| `/ai` | `ChatView` | `RequireSession`+`AppShell` | 새 대화(`?prefill=` 지원) |
| `/ai/:conversationId` | `ChatView` | `RequireSession`+`AppShell` | 기존 대화 스레드 |

## 동작 (Behavior)

1. 새 대화: 입력 → POST `/ai/conversations` → 응답 `conversation_id` 로 이동 → 단건 폴링 시작.
2. waiting 동안 2s 폴링 + "분석 중" 인디케이터 → assistant 응답이 오면 status idle → 15s 로 완화.
3. 복구 액션: assistant `actions` 카드에서 radio 선택 → 선택 실행 → 서버가 `selected` 를 채우면 카드 잠금.
4. 승인: assistant `approval_ref` 는 [repo](./repo.md) 의 `ApprovalCard` 로 처리(승인 성공 시 repo 쪽 훅이 `['ai']` 캐시도 invalidate).

## 불변식·오류 (Invariants & Errors)

- 메시지 길이 상한 16,000자 — 초과 시 클라이언트에서 전송 차단 + 경고 표시.
- 폴링 주기는 서버가 준 `status` 만으로 파생(별도 타이머·웹소켓 없음).
- 대화 목록 응답에는 `messages` 가 없다(`adaptConversationSummary` 로 요약 정규화).
