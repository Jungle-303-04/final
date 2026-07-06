---
source_commit: 1616d295
status: synced
---

# audit — 불변 감사 타임라인 (append-only 이벤트 감사 로그)

> 소스: `src/domains/audit/`

## 책임 (Responsibility)

- 흘러간 모든 이벤트 envelope를 append-only `audit_log` 테이블에 적재하는 테이블·리포지토리를 소유한다.
- 이 도메인은 이벤트 계약·라우터를 갖지 않는다. 적재 호출은 이벤트를 소비하는 서비스(예: audit 워커)가 수행한다.
- 파일 구성: `__init__.py`(docstring `"audit 도메인 — 불변 감사 타임라인."`), `models.py`, `repository.py`.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `Base`/컬럼 헬퍼, `DatabaseConnection` |
| import | `packages.contracts` | [../packages/contracts.md](../packages/contracts.md) | `EventEnvelope`, `JsonObject` |

## 공개 인터페이스 (Public API)

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `audit_log_row` | `def audit_log_row(evt: EventEnvelope) -> JsonObject` | `src/domains/audit/repository.py :: audit_log_row` |
| `AuditLogRepository.append_audit_logs` | `def append_audit_logs(self, rows: list[JsonObject]) -> None` | `src/domains/audit/repository.py :: AuditLogRepository.append_audit_logs` |
| `AuditLogRepository.append_audit_log` | `def append_audit_log(self, evt: EventEnvelope) -> None` | `src/domains/audit/repository.py :: AuditLogRepository.append_audit_log` |

- `audit_log_row(evt)`: envelope → insert 행 매핑 `{"event_id": evt.event_id, "subject": evt.subject, "source": evt.source, "correlation_id": evt.correlation_id, "payload": evt.payload}`. 단건·벌크가 같은 매핑을 공유하는 단일 출처.
- `AuditLogRepository(DatabaseConnection)` — `src/domains/audit/repository.py :: AuditLogRepository`:
  - `append_audit_logs(rows)`: 빈 리스트면 no-op. `conn.execute(pg_insert(AuditLog.__table__), rows)` — executemany 스타일 벌크 INSERT 한 문장.
  - `append_audit_log(evt)`: `self.append_audit_logs([audit_log_row(evt)])`로 위임(매핑 한 곳 유지).

## 데이터 모델 (Data Model)

### `audit_log` — `src/domains/audit/models.py :: AuditLog`

| 필드 | 타입 | 제약 | 설명 |
|---|---|---|---|
| id | BigInteger | PK, autoincrement | 시퀀스 |
| event_id | Text | NOT NULL | 원본 이벤트 ID |
| subject | Text | NOT NULL | 이벤트 subject(라우팅 키) |
| source | Text | NOT NULL | 발행 서비스 |
| correlation_id | Text | NOT NULL | 상관관계 ID |
| payload | JSONB | NOT NULL | 이벤트 payload 전문 |
| created_at | TIMESTAMP(timezone=True) | NOT NULL, server_default now() | 적재 시각 |

## 이벤트 (Events)

없음 (이 도메인은 이벤트를 정의·발행·구독하지 않는다 — 모든 이벤트의 "기록 대상"이다).

## 동작 (Behavior)

1. 소비 서비스가 이벤트 envelope 수신.
2. `audit_log_row`로 행 매핑 후 `append_audit_logs`(배치) 또는 `append_audit_log`(단건) 호출.
3. INSERT만 존재 — UPDATE/DELETE 경로 없음.

## 불변식·오류 (Invariants & Errors)

- append-only: 리포지토리에 갱신·삭제 메서드가 없다(불변 타임라인).
- 단건 경로는 반드시 벌크 경로로 위임한다(insert 매핑 단일 출처).
- `append_audit_logs([])`는 DB에 접근하지 않는다.

## 설정 (Settings)

없음.
