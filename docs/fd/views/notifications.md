# 뷰: 알림

[← 지도](../README.md) · 요구사항 [R11](../01-requirements.md#r11-알림) · 갭 [G9](../06-api-map.md#g9-알림-피드)

통합 알림 API 가 없으므로(G9) 현재 버전은 **3개 실존 소스의 클라이언트 합성**으로 구현.
합성 로직은 `features/notifications/api.ts :: useNotices` 한 곳 — G9 도입 시 이 훅만 교체.

## 소스 → 알림 항목 정규화

| 소스 | API | 알림 유형 | tone |
|---|---|---|---|
| 승인 대기 run | `GET /applications` + runs 중 WAITING_FOR_APPROVAL | "배포 승인 필요: {app} {sha}" | warn |
| 인시던트 | `GET /dashboard/rca/timeline` 신규 항목 | "인시던트 감지: {cluster} {요약}" | danger |
| DLQ (admin 만) | `GET /dead-letters` open 건수 증가 | "처리 실패 이벤트 {n}건" | danger |
| 클러스터 연결 | `GET /clusters` 연결 상태 변화 | "{cluster} 연결 끊김/복구" | warn/ok |

정규화 타입(단일):

```ts
type Notice = { id: string; kind: 'approval'|'incident'|'dlq'|'cluster';
  tone: Tone; title: string; at: string; link: string; read: boolean };
```

- 폴링: 60s 통합(개별 화면 폴링과 캐시 공유 — queryKey 동일해 추가 트래픽 없음)
- read 상태: localStorage(`notice:lastSeen:{kind}` 워터마크) — 서버 저장은 G9 범위

## Header 알림 Flyover

- 미읽음 수 badge + 최근 알림 최대 30건.
- 클릭 → `ConsoleLayout`의 `Flyover`. "모두 읽음"은 `markAllSeen()`, "인시던트로 이동"은 `/incidents`.

## NotificationsView (/incidents)

```text
필터 칩: [전체] [승인] [인시던트] [운영(DLQ)] [클러스터]
리스트(시간 역순):
  tone dot · 제목 · 상대시각 · [바로가기 →]
```

바로가기 딥링크 규칙은 [05 § 딥링크](../05-routes-ia.md#딥링크url-상태-규칙) 정본.

## 운영 화면과의 경계

DLQ 의 조치(replay)는 알림이 아니라 /settings/ops(OpsView)에서:
`GET /dead-letters` 테이블 + [재처리] `POST /dead-letters/{id}/replay` (admin, 확인 Modal).
알림은 링크만 제공 — 조치 UI 중복 금지.

## AC

- [ ] 벨 배지 수 = 필터 "전체" 미읽음 수와 항상 일치(동일 selector)
- [ ] admin 아닌 사용자에게 DLQ 알림 유형 자체가 생성되지 않음
- [ ] 알림 클릭 후 해당 kind 워터마크 갱신 → 배지 감소
- [ ] G9 도입 시 `useNotices` 교체만으로 화면 무변경(어댑터 경계 테스트)
