---
source_commit: 1616d295
status: synced
---

# registry — 도메인 합성 루트 (테이블/이벤트/도구 자동 발견 + Database 동적 합성)

> 소스: `src/domains/registry.py` · 테스트: `tests/test_event_registry.py`, `tests/test_event_catalog_script.py`

## 책임 (Responsibility)

- 코어 repo(events/dead_letter/outbox) + `domains/*/repository.py`에서 자동 발견한 도메인 repo를 다중 상속으로 합성해 단일 `Database` 클래스를 만든다.
- `domains/*/{models,events,tools}.py`를 일괄 임포트해 각 레지스트리(SQLAlchemy `Base.metadata`, `@event` EventRegistry, `@ai.tool` ToolRegistry)에 자동 등록시키는 로더 3종을 제공한다.
- 목표: 팀원이 `domains/<새도메인>/`에 파일만 추가하면 `packages/` 수정 0으로 자동 포함.

## 의존성 (Dependencies)

| 방향 | 대상 | 스펙 링크 | 용도 |
|---|---|---|---|
| import | `domains` 패키지 전체 | (pkgutil 순회) | 서브패키지 자동 발견 |
| import | `domains.audit` | [./audit.md](./audit.md) | `AuditLogRepository` (TYPE_CHECKING 스텁) |
| import | `domains.command` | [./command.md](./command.md) | `AgentCommandRepository` (TYPE_CHECKING 스텁) |
| import | `domains.identity` | [./identity.md](./identity.md) | `IdentityAccessRepository` (TYPE_CHECKING 스텁) |
| import | `domains.rca` | [./rca.md](./rca.md) | `RcaRepository` (TYPE_CHECKING 스텁) |
| import | `domains.scm` | [./scm.md](./scm.md) | `PullRequestRepository` (TYPE_CHECKING 스텁) |
| import | `domains.target` | [./target.md](./target.md) | `TargetAgentRepository` (TYPE_CHECKING 스텁) |
| import | `packages.storage` | [../packages/storage.md](../packages/storage.md) | `DatabaseConnection`(합성 베이스 판별), `EventRepository`, `DeadLetterRepository`, `OutboxRepository` |

## 공개 인터페이스 (Public API)

| 심볼 | 시그니처 | 앵커 |
|---|---|---|
| `load_domain_tables` | `def load_domain_tables() -> None` | `src/domains/registry.py :: load_domain_tables` |
| `load_domain_events` | `def load_domain_events() -> None` | `src/domains/registry.py :: load_domain_events` |
| `load_domain_tools` | `def load_domain_tools() -> None` | `src/domains/registry.py :: load_domain_tools` |
| `Database` | 클래스 (아래 합성 규칙) | `src/domains/registry.py :: Database` |

- `load_domain_tables()`: `domains/*/models.py` 임포트 → 테이블이 `Base.metadata`에 자동 등록.
- `load_domain_events()`: `domains/*/events.py` 임포트 → `@event` 데코레이터가 EventRegistry에 자동 등록. 이벤트 카탈로그(`make events`)나 전 도메인 계약이 필요한 합성 루트에서 호출.
- `load_domain_tools()`: `domains/*/tools.py` 임포트 → `@ai.tool` 데코레이터가 ToolRegistry에 자동 등록. LLM 도구가 필요한 서비스(chat-worker 등)가 부팅 시 호출.

### 내부 헬퍼 (비공개, 재구성에 필요)

- `_domain_modules(suffix: str) -> list[ModuleType]` — `src/domains/registry.py :: _domain_modules`: `pkgutil.iter_modules(domains.__path__, f"{domains.__name__}.")`로 서브**패키지**만(`info.ispkg`) 순회, `f"{info.name}.{suffix}"`를 `importlib.import_module`. `ModuleNotFoundError`는 `exc.name == module_name`일 때만 무시(그 도메인에 해당 파일이 없는 경우), 다른 모듈 누락(내부 import 오류)은 그대로 raise.
- `_discovered_repositories() -> tuple[type, ...]` — `src/domains/registry.py :: _discovered_repositories`: `_domain_modules("repository")`의 각 모듈에서 `vars(mod)` 순회, ① `isinstance(obj, type)`, ② `issubclass(obj, DatabaseConnection)`, ③ `obj.__module__ == mod.__name__`(그 모듈에서 직접 정의 — re-export 제외), ④ 미중복 — 4조건을 만족하는 클래스 수집.
- `_CORE = (EventRepository, DeadLetterRepository, OutboxRepository)` — `src/domains/registry.py :: _CORE`.

## 데이터 모델 (Data Model)

없음 (테이블 소유 도메인들의 메타데이터를 로드만 한다).

## 이벤트 (Events)

없음 (이벤트 정의 모듈들을 로드만 한다).

## 동작 (Behavior)

### `Database` 합성 규칙

```python
if TYPE_CHECKING:
    class Database(
        EventRepository, DeadLetterRepository, OutboxRepository,
        IdentityAccessRepository, AgentCommandRepository, RcaRepository,
        PullRequestRepository, AuditLogRepository, TargetAgentRepository,
    ): ...
else:
    Database = type("Database", _CORE + _discovered_repositories(), {})
```

- 런타임: `type()` 동적 합성 — 코어 3종 + 자동 발견된 **모든** 도메인 repo (예: `AiConversationRepository`, `CatalogRepository`, `DashboardRepository` 등 `domains/*/repository.py`의 `DatabaseConnection` 하위 클래스 전부).
- 타입 검사 시: 코어 + 명시 6종(identity/command/rca/scm/audit/target)만 선언한 스텁 — `Database` store 메서드의 타입체커 인식용. 자동 발견분은 타입체커에 보이지 않는다.
- 새 도메인 repo 추가 절차: `domains/<도메인>/repository.py`에 `DatabaseConnection` 하위 클래스 정의 → 자동 포함(registry 수정 불필요). 타입체커 인식이 필요하면 TYPE_CHECKING 스텁에 추가.

### 모듈 docstring의 이행 메모

아직 `domains/`로 이전 전인 도메인(rca·command·auth·projection)은 임시로 명시 — 이전되면 `_PENDING`에서 빠지고 자동 발견으로 흡수된다는 취지의 주석이 있으나, 현재 코드에는 `_PENDING` 심볼이 없고 TYPE_CHECKING 스텁의 명시 임포트만 남아 있다.

## 불변식·오류 (Invariants & Errors)

- `_domain_modules`는 해당 suffix 파일이 없는 도메인을 조용히 건너뛰지만, 그 파일 **내부**의 import 실패는 숨기지 않는다(`exc.name != module_name`이면 raise).
- 자동 발견은 모듈에서 직접 정의된 클래스만 포함(`__module__` 검사) — 다른 도메인 repo를 import했다고 중복 합성되지 않음.
- 동일 repo 클래스는 한 번만 합성(`obj not in found`).
- MRO 충돌이 없어야 함: 모든 repo는 공통 베이스 `DatabaseConnection`을 공유하고 메서드 이름이 서로 겹치지 않아야 한다.

## 설정 (Settings)

없음.
