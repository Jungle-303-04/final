# 뷰: AI 채팅

[← 지도](../README.md) · 요구사항 [R10](../01-requirements.md#r10-ai-채팅) · 참조: 외부 기준 AI, Claude/Codex 승인 UX

요구 흐름: "채팅 주고받고 → 권한/선택 창 → 선택하면 실행".
백엔드 실체 매핑(정합성 핵심):

| Claude식 개념 | 우리 백엔드 실체 |
|---|---|
| 채팅 왕복 | `GET /ai/conversations`, `POST /ai/conversations`, `POST .../messages`, `GET /ai/conversations/{id}` 폴링 |
| 도구 실행 제안 | assistant 메시지 metadata(도구 호출 기록) + RCA recovery plan 의 action 후보 |
| 선택 창 | recovery action 선택: `POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select` |
| 실행 승인 | approval: `POST /approvals/{approval_id}/grant\|reject` |

## 목록 — ChatListView (/ai)

좌측 대화 목록(제목·시각·상태 dot) + [새 대화].
데이터: `GET /ai/conversations` (G10 코드 반영).
새 대화: 첫 메시지 입력 → `POST /ai/conversations` → /ai/:id 이동.

## 대화 — ChatView (/ai/:conversationId)

```text
┌ 목록(260px) ┬ 대화 영역 ──────────────────────────────┐
│            │  MessageBubble[]  (가상 스크롤, 하단 고정) │
│            │  · user: 우측 정렬                        │
│            │  · assistant: 좌측, 마크다운 렌더          │
│            │  · tool 카드/선택 카드: 아래 별도 정의     │
│            │  · waiting: assistant 타이핑 인디케이터    │
│            ├──────────────────────────────────────────┤
│            │  Composer: TextArea 자동높이 · ⌘↵ 전송     │
│            │  컨텍스트 칩: [클러스터 target ×] (프리필) │
└────────────┴──────────────────────────────────────────┘
```

## 데이터 흐름 (폴링 기반 — G8 스트리밍은 선택)

1. 전송: `POST /ai/conversations/{id}/messages` → 대화 상태 waiting
2. 폴링: `GET /ai/conversations/{id}` — waiting 동안 2s, idle 시 15s (conversation.status 로 파생)
3. 새 assistant 메시지 도착 → Stagger 등장 + 하단 스크롤(사용자가 위로 스크롤 중이면 "새 메시지 ↓" 칩)

메시지 렌더 분기(단일 컴포넌트 `MessageRenderer` 의 매핑 테이블 — switch 산개 금지):

| 메시지 형태 | 렌더 |
|---|---|
| text | 마크다운(코드블록 CodeBlock) |
| metadata.tool_calls 존재 | ToolCallCard: 도구명·인자 요약(접힘)·결과 상태 Badge |
| metadata 에 recovery plan/actions | ActionSelectCard (아래) |
| metadata 에 approval 참조 | ApprovalCard ([workflow](workflow.md#노드-클릭--사이드-패널)와 동일 컴포넌트) |
| 실패(status failed) | danger 카드 + [다시 시도] |

## ActionSelectCard — "선택하면 실행" 카드

```text
┌ 복구 액션 제안 (plan: {plan_id}) ────────────────┐
│ ○ rollout restart deployment/checkout-api        │
│   위험도 Badge · 예상 영향 1줄                    │
│ ○ scale replicas 2→3                             │
│ [선택 실행]  [무시]                               │
└──────────────────────────────────────────────────┘
```

- 라디오 선택 → [선택 실행] `POST /rca/recovery-plans/{plan_id}/actions/{action_id}/select`
- 권한 가드: RequirePermission(deploy) — 미보유 시 버튼 disabled + "release_operator 필요"
- 실행 후 카드는 잠금(선택 결과 Badge) — 재선택 불가(백엔드 멱등 정책과 일치)
- 이후 진행은 command/approval 이벤트로 이어짐 — 카드 하단에 "진행 보기" → [workflow](workflow.md) 또는 [notifications](notifications.md)

## 컨텍스트 프리필 (타 화면 진입점 — 전부 이 형식)

`/ai?prefill=...&cluster=...` → Composer 에 초안 삽입(자동 전송 안 함).
진입점: 팟 Drawer "이 팟 분석", safe-pr 실패 "원인 묻기", workflow FAILED "AI 분석".

## AC

- [ ] waiting ↔ idle 폴링 간격 전환이 conversation.status 만으로 파생(별도 상태 없음)
- [ ] ActionSelectCard 실행이 권한 없이는 불가(UI+서버 모두), 실행 후 잠금 유지(새로고침 포함)
- [ ] 폴링 중 중복 메시지 렌더 없음(message_id 키)
- [ ] 16k자 제한(MAX_AI_MESSAGE_LENGTH) 초과 입력 시 전송 전 인라인 경고
- [ ] 프리필 진입 시 자동 전송되지 않음(사용자 확인 후 전송)
