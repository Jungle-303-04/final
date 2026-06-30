# 아키텍처 경계와 폴더 규칙

팀 작업 기준. 의존 방향은 **import-linter(`.importlinter`)로 코드에서 강제**되며 CI에서 검사한다.

## 1. 3계층

| 레이어 | 위치 | 역할 | 의존 |
| --- | --- | --- | --- |
| services | `src/services/` | 실행되는 프로세스 entrypoint | domains·packages 사용 |
| domains | `src/domains/` | 업무 도메인 로직(events·models·repository·router) | packages 사용, 서로(아래 그래프) |
| packages | `src/packages/` | 공유 커널(contracts·runtime·storage·events·config) | 도메인/서비스를 모름 |

**규칙: services → domains → packages (안쪽으로만).** 역방향 금지. import-linter가 강제한다.

의도적 예외 2곳(`.importlinter`에 명시, 후속 정리 후보):
- `packages.contracts.event_bus.bodies → domains.*.events` — 도메인이 소유한 이벤트 바디를 packages가 집계(facade).
- `packages.storage.{database,engine} → domains.registry` — 도메인 자동 발견 합성 루트.

## 2. 도메인 간 의존 그래프(허용)

```
identity  ◀── command, projection, rca, target   (인증/세션 토대 — 누구나 의존 OK)
gitops    ◀── command                            (공유 Diff 계약)
command   ◀── alert
```

규칙: **identity는 토대라 누구나 의존 가능.** 그 외 형제 도메인 의존은 *명확한 이유*(공유 계약)만 허용하고
새로 추가 시 이 문서에 엣지를 적는다. 임의 cross-domain 의존 금지.

## 3. 도메인은 성격이 달라 파일이 다르다(정상)

"모든 도메인이 repository·router·model을 갖는" 게 아니다. 성격별로 필요한 것만 둔다:

| 성격 | 파일 | 예 |
| --- | --- | --- |
| 이벤트 계약형 | `events.py` | alert, mail |
| 저장형 | `models.py`·`repository.py` | audit, scm |
| 풀(HTTP) | `events·models·repository·router·dependencies` | gitops, identity, projection, rca, target |

파일 *이름*은 역할별로 통일: `events.py`·`models.py`·`repository.py`·`router.py`·`dependencies.py`.

## 4. 서비스 폴더·네이밍 규칙

- **단일 워커 도메인**: `services/<도메인>/worker/` (예: `command/worker`, `alert/worker`, `mail/worker`).
- **다중 워커 도메인**: `services/<도메인>/<구체명>/` (예: `gitops/git-pull-worker`, `projection/audit-worker`, `target/cluster-agent`).
- **AI 에이전트**: `services/ai/<agent>/` (예: `ai/rca`). 많이 생기므로 전용 그룹.
- **게이트웨이**: `services/api-gateway/`(단일 HTTP 진입, 워커 아님).
- k8s Deployment 이름은 기존 유지(예: `command-worker`) — 폴더 경로와 다를 수 있고, 매니페스트 `command:` 가 경로를 가리킨다.

## 5. AI 에이전트(많이 생길 예정)

3계층에 그대로 매핑한다:
- `services/ai/<agent>/` — 에이전트 프로세스 entrypoint.
- `packages/ai/` — 공유 LLM 인프라(클라이언트·프롬프트·비용/토큰 가드·구조화 출력). 모든 에이전트가 재사용.
- `domains/<capability>/` — 각 능력의 로직(events·정책). 예: `domains/rca`.

## 6. 검사 실행

```
PYTHONPATH=src uv run lint-imports --config .importlinter
```
CI(`.github/workflows/ci.yml`)의 "Import boundaries" 단계에서 자동 실행된다.
