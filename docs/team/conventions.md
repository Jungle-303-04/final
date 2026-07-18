# 팀 컨벤션

이 문서는 민정, 가인, 찬빈이 같은 기준으로 브랜치, 커밋, PR, 테스트를 맞추기 위한 공통 규칙이다.

## 기준 문서

- 실제 코드 기준: 이 repository
- 전체 구조: [아키텍처](../architecture.md)
- event 계약: [이벤트 흐름](../events.md)
- 역할별 시작점: [팀 온보딩 지도](../onboarding/README.md)
- API 수동 확인: [Bruno API 테스트](../api/README.md)
- AWS 확인: [AWS 테스트 기준](../aws-testing-runbook.md)

코드와 문서가 다르면 코드와 테스트가 우선이다. 문서가 틀렸으면 같은 PR에서 문서도 고친다.

## 역할 경계

| 팀원 | 담당 | 주로 보는 코드 | 주 문서 |
| --- | --- | --- | --- |
| 민정 | Command + Target + Evidence | `src/domains/command`, `src/domains/target`, `src/services/target`, `deploy/target` | [민정 온보딩](../onboarding/minjeong-command-target-evidence.md) |
| 가인 | Evidence + RCA + Safe PR | `src/domains/rca`, `src/domains/scm`, `src/services/ai`, `src/services/gitops/scm-worker` | [가인 온보딩](../onboarding/gain-evidence-rca.md) |
| 찬빈 | Frontend + 권한 + Dashboard | `src/domains/identity`, `src/domains/dashboard`, `src/services/projection/dashboard-worker`, Gateway response DTO | [찬빈 온보딩](../onboarding/chanbin-frontend.md) |

공유 계약 파일은 한 명이 마음대로 바꾸지 않는다.

- route: `src/packages/contracts/gateway/routes.py`
- request/response: `src/packages/contracts/gateway/requests.py`, `responses.py`
- event subject/body: `src/packages/contracts/event_bus`, `src/domains/*/events.py`
- DB schema: `src/packages/storage/schema.py`
- 배포/AWS/CI: `deploy`, `scripts`, `.github/workflows`

## 브랜치

```text
feat/<git-id>/<topic>
fix/<git-id>/<topic>
docs/<git-id>/<topic>
ci/<git-id>/<topic>
refactor/<git-id>/<topic>
```

- `dev`에 작업을 모으고, `main`은 보호 브랜치로 둔다.
- 오래된 브랜치는 리뷰 전에 `dev`를 반영한다.
- 한 PR은 한 역할 범위 또는 하나의 end-to-end slice에 집중한다.

## 커밋

커밋 제목은 허용 타입, 한글, 명사형 키워드 둘 이상을 모두 갖춘다. 키워드는
공백 포함 ` / `로 나누며, 스코프·종결 문장부호·`한다`·`했다`·`수정한다`·`추가한다`
같은 서술형 종결을 쓰지 않는다. `Tauri`, `GitOps`, `API` 같은 기술 고유명사는
한국어 키워드와 함께 쓸 수 있다.

```text
type: 키워드 / 키워드 / 키워드
```

예시:

```text
feat: evidence 작업 / Prometheus 범위 / agent debug
fix: 권한 필터 / dashboard 쿼리 / 세션
docs: 온보딩 지도 / Bruno API / AWS 테스트
```

## 구현 규칙

- worker는 `@app.on(BodyType)` 또는 `@app.on_any`로 구독한다.
- 다음 event는 raw NATS publish가 아니라 `yield Body(...)`로 넘긴다.
- API write는 Gateway route에서 session/role/cluster 권한을 먼저 확인한다.
- target agent는 management DB/NATS를 직접 import하지 않는다.
- evidence는 raw telemetry 전체가 아니라 RCA가 먹을 수 있는 summary로 줄인다.
- Safe PR은 `scm-worker`와 `GithubScmProvider`가 담당한다.
- dashboard는 read model/API 권한 필터를 통과한 데이터만 보여준다.

## 테스트

커밋 전 기본 확인:

```bash
make check
```

API를 눈으로 확인할 때:

```bash
# Bruno에서 docs/api collection을 열고 aws-test profile 선택
```

실제 서비스 smoke:

```bash
make smoke
```

PR을 merge하기 전에 `make check`와 필요한 AWS smoke 결과를 남긴다.

## 리뷰에서 막는 경우

- route/event/schema를 바꿨는데 테스트와 문서가 빠진 경우
- worker가 raw NATS, 직접 DB session, 직접 HTTP route를 들고 들어온 경우
- 권한 필터 없이 dashboard/API 데이터를 노출한 경우
- target write 범위가 sandbox/approval 정책 밖으로 넓어진 경우
- secret/token/password가 코드, 문서, 로그, 테스트 레거시 데이터에 들어간 경우
- 새 canonical 문서가 `docs/README.md` 또는 해당 영역 `README.md`에 연결되지 않은 경우
