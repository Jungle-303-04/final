---
source_commit: b729ee6e4
status: synced
---

# audit — 이벤트 감사 타임라인과 retention delete

> 소스: `src/domains/audit/`

## 책임 (Responsibility)

- 흘러간 모든 이벤트 envelope를 `audit_log` 테이블에 적재하는 테이블·리포지토리를 소유한다. 이벤트 처리 경로는 append-only이고, 운영 보존 정책은 오래된 row를 bounded delete로 정리한다.
- workspace와 cluster 권한을 먼저 확인한 뒤 correlation의 불변 이벤트를 keyset 순서로 반환한다. raw payload 대신 scalar allowlist 요약만 노출한다.
- `event_id`(자기 이벤트)와 `causation_id`(직접 부모)를 분리하고, exact subject를 서버 권위의 `journey_stage`로 분류한다.
- 파일 구성: `__init__.py`, `models.py`, `repository.py`, `router.py`.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `Base`/컬럼 헬퍼, `DatabaseConnection` |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | `EventEnvelope`, `JsonObject` |
| import | `domains.identity` | [./identity.md](./identity.md) | 세션 workspace와 cluster `rca.read` 권한 확인 |

## 공개 인터페이스 (Public API)

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `audit_log_row` | `def audit_log_row(evt: EventEnvelope) -> JsonObject` | `src/domains/audit/repository.py :: audit_log_row` |
| `AuditLogRepository.append_audit_logs` | `def append_audit_logs(self, rows: list[JsonObject]) -> None` | `src/domains/audit/repository.py :: AuditLogRepository.append_audit_logs` |
| `AuditLogRepository.append_audit_log` | `def append_audit_log(self, evt: EventEnvelope) -> None` | `src/domains/audit/repository.py :: AuditLogRepository.append_audit_log` |
| `AuditLogRepository.list_audit_timeline` | `def list_audit_timeline(workspace_id, correlation_id, authorized_cluster_id, *, cursor=None, limit=51) -> list[JsonObject]` | `src/domains/audit/repository.py :: AuditLogRepository.list_audit_timeline` |
| `audit_journey_stage` | `def audit_journey_stage(subject: str) -> AuditJourneyStage` | `src/domains/audit/router.py :: audit_journey_stage` |
| `AuditLogRepository.delete_audit_logs_older_than` | `def delete_audit_logs_older_than(self, cutoff: datetime, *, limit: int = 1000) -> int` | `src/domains/audit/repository.py :: AuditLogRepository.delete_audit_logs_older_than` |

- `audit_log_row(evt)`: envelope의 `event_id/subject/source/correlation_id/causation_id/workspace_id/payload/created_at`을 insert 행으로 옮긴다. 단건·벌크가 같은 매핑을 공유하는 단일 출처다.
- `AuditLogRepository(DatabaseConnection)` — `src/domains/audit/repository.py :: AuditLogRepository`:
  - `append_audit_logs(rows)`: 빈 리스트면 no-op. `conn.execute(pg_insert(AuditLog.__table__), rows)` — executemany 스타일 벌크 INSERT 한 문장.
  - `append_audit_log(evt)`: `self.append_audit_logs([audit_log_row(evt)])`로 위임(매핑 한 곳 유지).
  - `list_audit_timeline(...)`: `(workspace_id, correlation_id)`와 권위 cluster를 SQL에 모두 강제하고 `(created_at, id)` 오름차순 keyset으로 반환한다. `event_id`는 payload가 아니라 전용 컬럼에서 읽는다.
  - `delete_audit_logs_older_than(cutoff, limit=1000)`: `created_at < cutoff`인 오래된 row를 CTE `expired_audit_log`로 `LIMIT`개 선택 후 삭제하고 삭제 수를 반환한다. `packages.storage.retention`이 호출한다.

### 여정 단계 계약

`AUDIT_JOURNEY_STAGE_BY_SUBJECT`는 현재 `EventSubject` 65개를 exact key로 전부 분류한다.
새 enum subject가 분류 없이 추가되면 모듈 로딩과 계약 테스트가 실패한다. 외부 확장처럼 enum에
없는 subject만 `unknown`으로 반환하고 payload 요약은 비운다. 프론트는 subject prefix를 다시
해석하지 않고 응답의 `journey_stage`를 사용한다. 이 값은 시간 순서를 다시 매기는 phase가 아니라
표시 lane 분류다. 응답의 `(created_at, id)` 순서를 유지하고 stage별로 재정렬하지 않는다.

- `alert`: incident 탐지와 alert 요청·발송·거부
- `evidence`: evidence 수신·job·bundle 생성
- `rca`: 후보 계획·평가·완료·blocked/follow-up/backlog
- `recovery`: 복구 계획·선택, rollout 진단, 승인 추천
- `command`, `pr`: 명령 lifecycle과 Safe PR lifecycle
- `workflow`, `cluster`, `ai`, `notification`, `system`: release/GitOps, target 상태,
  대화, 메일, DLQ·계약 실패

## 데이터 모델 (Data Model)

### `audit_log` — `src/domains/audit/models.py :: AuditLog`

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 시퀀스 |
| event_id | Text | NOT NULL | 원본 이벤트 ID |
| subject | Text | NOT NULL | 이벤트 subject(라우팅 키) |
| source | Text | NOT NULL | 발행 서비스 |
| correlation_id | Text | NOT NULL | 상관관계 ID |
| causation_id | Text | NULL | 직접 부모 이벤트 ID |
| workspace_id | Text | NULL | 신뢰 envelope에서 전파된 tenant 귀속. 구버전 행은 NULL |
| payload | JSONB | NOT NULL | 이벤트 payload 전문 |
| event_created_at | TIMESTAMP(timezone=True) | NULL | 유효한 envelope 발생 시각 |
| created_at | TIMESTAMP(timezone=True) | NOT NULL, server_default now() | 적재 시각 |

인덱스: 기존 `ix_audit_log_created_at (created_at)`,
`ix_audit_log_correlation_id_created_at (correlation_id, created_at)`,
`ix_audit_log_workspace_id_correlation_id_created_at (workspace_id, correlation_id, created_at)`.

## 이벤트 (Events)

발행·구독 없음. 이 도메인은 모든 이벤트의 기록 대상이며 조회 API만 제공한다.

## 동작 (Behavior)

1. 소비 서비스가 이벤트 envelope 수신.
2. `audit_log_row`로 행 매핑 후 `append_audit_logs`(배치) 또는 `append_audit_log`(단건) 호출.
3. 이벤트 처리 경로는 INSERT만 수행한다. 운영 retention 경로는 `delete_audit_logs_older_than`으로 오래된 row를 batch 삭제한다.
4. `GET /audit/timeline`은 세션 workspace → correlation의 단일 권위 cluster → `rca.read` 순서로 확인한다. 미존재·교차 workspace·권한 거부·복수 cluster 충돌은 모두 404로 감춘다.
5. 응답은 `event_id`, `causation_id`, `journey_stage`, subject/source/created_at과 scalar 요약만 포함한다. raw payload는 반환하지 않는다.

## 불변식·오류 (Invariants & Errors)

- append-only ingest: 이벤트 소비 경로에는 UPDATE가 없고, 삭제는 retention sweep 전용 bounded delete 메서드로만 제공한다.
- 단건 경로는 반드시 벌크 경로로 위임한다(insert 매핑 단일 출처).
- `append_audit_logs([])`는 DB에 접근하지 않는다.
- `event_id`는 non-empty 자기 ID이며 `causation_id`와 합성하거나 대체하지 않는다.
- 알려진 `EventSubject`는 정확히 한 단계에 속한다. 미지 subject는 `unknown`이고 raw payload를 노출하지 않는다.

## 설정 (Settings)

없음.
