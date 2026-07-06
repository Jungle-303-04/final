# 스펙 작성 컨벤션 (Spec-Driven Development)

> 이 폴더(`docs/spec/`)는 실제 구현을 팀원이 따라 읽을 수 있게 풀어 쓴 명세다.
> 현재 프로젝트에서는 실제 코드와 테스트가 기준이다. 스펙과 코드가 다르면 코드를 먼저 확인하고 문서를 갱신한다.
> 새 설계가 문서에 먼저 적히는 경우에도, 이미 동작하는 것처럼 쓰지 않고 구현 단계와 검증 방법을 분리해서 적는다.

## 1. 폴더 구조

```
docs/spec/
├── README.md            # 전체 인덱스 (여기서 모든 페이지로 진입)
├── _conventions.md      # 이 문서
├── packages/            # src/packages/* — 공유 커널 (계약·이벤트·스토리지·런타임)
├── domains/             # src/domains/*  — 도메인 모델·이벤트·리포지토리·라우터
├── services/            # src/services/* — 워커·게이트웨이 (프로세스 단위)
└── frontend/            # frontend/src/* — 앱 셸·피처·공유 모듈
```

스펙 폴더 구조는 루트 기준 3레벨 제한을 지키면서 소스 트리와 대응한다.
`src/domains/rca/` ↔ `docs/spec/domains/rca.md`, `src/services/ai/rca-worker/` ↔ `docs/spec/services/ai-rca-worker.md`.

## 2. 코드 앵커(Code Anchor) 표기

스펙의 모든 항목은 소스 위치를 아래 형식으로 명시한다.

| 대상 | 형식 | 예시 |
|---|---|---|
| 모듈 | `` `src/…/file.py` `` | `src/domains/rca/models.py` |
| 클래스/함수 | `` `src/…/file.py :: Symbol` `` | `src/domains/rca/models.py :: RcaSession` |
| 메서드 | `` `src/…/file.py :: Class.method` `` | `src/domains/rca/repository.py :: RcaRepository.save` |
| 프론트엔드 | 동일 규칙 | `frontend/src/app/router.tsx :: AppRouter` |

- 앵커는 리포지토리 루트 기준 상대 경로.
- 라인 번호는 사용하지 않는다(코드 변경에 취약). 심볼 이름이 좌표다.
- 심볼을 리네임하면 스펙의 앵커도 같은 커밋에서 갱신한다.

## 3. 페이지 간 링크

- 스펙 페이지끼리는 **상대경로 마크다운 링크**로 연결한다: `[rca 도메인](domains/rca.md)`.
- 다른 페이지의 특정 섹션은 헤딩 앵커로: `[RcaSession](domains/rca.md#rcasession)`.
- import 관계가 있으면 링크 관계도 있어야 한다. 코드가 `domains.rca`를 import하면 그 서비스 스펙은 `domains/rca.md`를 링크한다.

## 4. 페이지 템플릿

모든 스펙 페이지는 아래 섹션 순서를 따른다. 해당 없는 섹션은 생략 가능.

```markdown
# <이름> — <한 줄 요약>

> 소스: `src/...` · 테스트: `tests/...`

## 책임 (Responsibility)
무엇을 하고, 무엇을 하지 않는지.

## 의존성 (Dependencies)
| 방향 | 대상 | 스펙 링크 | 용도 |
(import하는 domains/packages, 발행/구독 이벤트, 외부 시스템)

## 공개 인터페이스 (Public API)
클래스·함수 시그니처를 코드 그대로. 각 항목에 코드 앵커.

## 데이터 모델 (Data Model)
필드명 | 타입 | 제약 | 설명. DB 테이블이면 테이블명·인덱스 포함.

## 이벤트 (Events)
발행(Publishes) / 구독(Consumes) 각각: 이벤트명, body 스키마, 라우팅 키.

## 동작 (Behavior)
핵심 흐름을 단계별로. 상태 머신이 있으면 상태 전이 명시.

## 불변식·오류 (Invariants & Errors)
지켜야 할 규칙, 발생 가능한 예외와 처리 방식.

## 설정 (Settings)
환경변수·설정 키 | 타입 | 기본값 | 의미.
```

## 5. 동기화 상태 추적 (기준 커밋 + status)

모든 스펙 페이지는 맨 위에 front matter를 갖는다.

```markdown
---
source_commit: <스펙이 반영하는 코드의 커밋 SHA (짧은 형식 가능)>
status: synced | spec-ahead
---
```

| status | 의미 | 전이 |
|---|---|---|
| `synced` | 스펙 = 코드. `source_commit` 시점의 코드와 100% 일치 | 코드 반영 커밋에서 `source_commit` 갱신 |
| `spec-ahead` | **스펙은 수정됐지만 코드가 아직 미반영** (설계 선행) | 구현 완료 후 `synced`로 변경 + `source_commit` 갱신 |
| `code-ahead` | 코드가 스펙보다 앞섬 (스펙 미갱신) — **직접 쓰지 않는다.** 검증 스크립트가 자동 탐지 | 스펙 갱신 후 `synced` |

탐지 원리 (`scripts/verify_spec_links.py`):
- 페이지의 코드 앵커 경로들을 수집해 `git log {source_commit}..HEAD -- <경로들>` 실행.
- 커밋이 존재하면 그 페이지는 **code-ahead(스펙 뒤처짐)** 로 보고되고 해당 커밋 목록을 출력한다.
- `status: spec-ahead` 페이지는 "구현 대기" 목록으로 별도 보고한다.
- docs만 바꾼 커밋은 소스 경로 필터에 걸리지 않으므로 오탐이 없다.

## 6. 100% 동기화 규칙

1. **코드 기준 동기화**: 구현이 이미 있으면 코드를 기준으로 스펙을 맞춘다. 새 설계가 먼저 필요하면 `status: spec-ahead`로 두고 구현 단계와 테스트를 분리해서 적는다.
2. **커버리지**: 모듈의 모든 public 심볼(밑줄로 시작하지 않는 클래스·함수·상수)은 스펙에 존재해야 한다.
3. **아키텍처 경계**: `services → domains → packages` 단방향 의존([.importlinter](../../.importlinter)로 CI 강제). 스펙의 의존성 표도 이 방향을 위반할 수 없다.
4. **검증**: `python scripts/verify_spec_links.py` 로 (a) 상대링크 존재, (b) 코드 앵커 경로·심볼 존재, (c) front matter 존재, (d) code-ahead/spec-ahead 동기화 상태를 검사한다.

## 7. AI 에이전트 사용법

- 새 기능: `README.md` 인덱스 → 관련 도메인/서비스 스펙 → 링크를 따라 의존 스펙 순으로 읽는다.
- 코드 생성 시 스펙의 시그니처·이벤트 스키마·불변식을 그대로 구현한다. 스펙에 없는 public 심볼을 만들면 스펙에 추가한다.
- 스펙과 코드 불일치 발견 시: 코드를 임의로 "고치지" 말고 불일치를 보고한 뒤 어느 쪽이 진실인지 확인받는다.
