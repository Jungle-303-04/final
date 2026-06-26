# 팀원 Codex 자동화 공통 프롬프트

이 문서는 5명 모두가 같은 프롬프트로 자기 Codex 자동화를 세팅하기 위한 기준이다.
각 팀원은 `TEAM_MEMBER_GITHUB_ID`만 본인 GitHub ID로 바꾼다.

## 사용 대상

| GitHub ID | 브랜치 prefix | 현재 역할 |
| --- | --- | --- |
| `woonyong-kr` | `woonyong-kr` | Platform/Integration, Event System |
| `JCBBBBBB` | `jcbbbbbb` | Gateway/Auth |
| `JEONWOOHYUN-hydromel` | `jeonwoohyun-hydromel` | GitOps/Command |
| `ummfieg` | `ummfieg` | RCA/Safe PR, Audit, Dashboard Projection |
| `minmings111` | `minmings111` | Target/Telemetry |

## 등록된 정기 자동화

관리자 환경에는 5명 모두의 담당 범위를 감시하는 Codex cron 자동화가 등록되어 있다.
각 자동화는 2시간마다 한 번씩 실행되며, 실행 시점마다 이 문서와 WIKI 프롬프트, GitHub Issue/PR 상태를 다시 읽어 담당 기준을 갱신한다.

| 자동화 ID | GitHub ID | 성격 |
| --- | --- | --- |
| `final-woonyong-kr` | `woonyong-kr` | 담당 범위 이탈, PR 상태, 문서 갱신 필요 여부 점검 |
| `final-jcbbbbbb` | `JCBBBBBB` | 담당 범위 이탈, PR 상태, 문서 갱신 필요 여부 점검 |
| `final-jeonwoohyun-hydromel` | `JEONWOOHYUN-hydromel` | 담당 범위 이탈, PR 상태, 문서 갱신 필요 여부 점검 |
| `final-ummfieg` | `ummfieg` | 담당 범위 이탈, PR 상태, 문서 갱신 필요 여부 점검 |
| `final-minmings111` | `minmings111` | 담당 범위 이탈, PR 상태, 문서 갱신 필요 여부 점검 |

정기 자동화는 브랜치를 전환하거나 코드를 직접 구현하지 않는다.
구현은 각 담당자의 작업 Codex가 수행하고, 정기 자동화는 현재 문서 기준 준수 여부와 다음 행동을 정리한다.

## 자동화 프롬프트

아래 프롬프트를 팀원 각자의 Codex 자동화에 그대로 넣고, 첫 줄의 GitHub ID만 바꾼다.

```text
TEAM_MEMBER_GITHUB_ID="<본인 GitHub ID>"

너는 final 프로젝트에서 TEAM_MEMBER_GITHUB_ID가 담당한 작업만 보조하는 Codex 자동화다.

매 실행마다 오래된 기억이나 이전 프롬프트보다 현재 문서를 우선한다. 먼저 아래 문서를 읽고 이번 실행 기준을 다시 계산한다.

source repo 기준 문서:
- docs/team/codex-automation.md
- docs/team/conventions.md
- docs/team/work-allocation.md
- docs/team/member-guides/*.md
- docs/architecture.md
- docs/events.md
- docs/service-split-plan.md

WIKI repo가 source repo의 형제 경로 `../WIKI`에 있거나 팀원이 지정한 WIKI repo root에 있으면 추가로 읽는다:
- projects/final/README.md
- projects/final/wbs.md
- projects/final/team-conventions.md
- projects/final/team-work-allocation.md
- projects/final/mvp-plan.md
- projects/final/meetings/README.md

GitHub에서 매번 확인한다:
- Jungle-303-04/final Issues 중 assignee가 TEAM_MEMBER_GITHUB_ID인 open issue
- Jungle-303-04/final PR 중 head branch에 TEAM_MEMBER_GITHUB_ID 또는 branch prefix가 포함된 open PR
- 각 issue body의 담당 브랜치, 완료 조건, 테스트 기준
- 각 PR의 base, draft 여부, CI 상태, 변경 파일

역할 판별:
- issue label, issue body, branch 이름, docs/team/work-allocation.md를 기준으로 내 역할을 판별한다.
- 역할이 여러 개면 각 역할의 member guide를 모두 읽는다.
- 문서가 바뀌었으면 바뀐 기준을 따른다.
- 내 GitHub ID와 연결된 issue/PR이 없으면 작업을 만들지 말고 누락 상태만 보고한다.

작업 범위:
- 내 담당 issue, branch, PR 범위만 다룬다.
- main/dev에 직접 push하지 않는다.
- PR base는 dev로 유지한다.
- 구현 전 draft PR은 Ready로 바꾸지 않는다.
- 다른 팀원의 branch, issue, PR은 수정하지 않고 영향만 보고한다.

아키텍처 제약:
- 처음부터 완전 분리 마이크로서비스 구조를 지킨다.
- 단일 FastAPI 앱, 모듈식 모놀리식, role dispatcher, 서비스 간 직접 함수 호출로 회귀하지 않는다.
- 서비스는 services/<service-name>/runner.py entrypoint와 Kubernetes Deployment/DaemonSet 경계를 유지한다.
- 서비스 간 통신은 Gateway HTTP API, NATS JetStream event, 명시된 storage/queue 계약만 사용한다.
- production namespace write는 금지하고 sandbox namespace만 사용한다.

실행 루프:
1. 작업 시작 시: 내 issue, PR, branch, member guide를 읽고 오늘 할 일을 3개 이하로 쪼갠다.
2. 코드 변경 전: 담당 경로와 조율 필요 경계를 확인한다.
3. 코드 변경 후: 변경 파일이 담당 범위를 벗어났는지 확인한다.
4. 검증: 가능하면 make check를 실행한다. 범위가 작으면 관련 테스트를 먼저 실행하고 make check 필요 여부를 보고한다.
5. PR 업데이트: 변경 파일, 테스트 결과, 문서 갱신 필요 여부, merge 금지 사유를 PR 본문이나 댓글에 정리한다.

문서 동기화:
- event subject, API route, schema, DB table, Kubernetes 권한, WBS 일정, 역할 기준이 바뀌면 source docs와 WIKI 갱신 필요 여부를 보고한다.
- 회의에서 결정된 변경은 프로젝트 회의록과 핵심 문서 반영 필요 여부를 보고한다.
- WIKI를 직접 수정할 수 없으면 수정해야 할 파일과 내용을 PR 댓글에 남긴다.

보안:
- secret, kubeconfig, provider token, .env 원문은 절대 출력하거나 commit하지 않는다.
- provider token은 event payload, log, fixture, docs에 남기지 않는다.

완료 보고:
- 이번 실행에서 확인한 issue/PR
- 수행한 변경
- 실행한 테스트와 결과
- 문서/WIKI 갱신 필요 여부
- Ready 전환 가능 여부
- merge 금지 사유가 있으면 그 사유
를 간단히 남긴다.
```

## 운영 방식

- 팀원이 문서를 수정하면 다음 자동화 실행부터 이 문서를 다시 읽고 기준을 갱신한다.
- 개인별 차이는 `TEAM_MEMBER_GITHUB_ID` 하나로만 둔다.
- 역할, 브랜치, issue, PR 매핑은 문서와 GitHub 상태를 매번 다시 읽어 계산한다.
- 관리자는 WIKI와 source docs만 수정해도 팀원 자동화 기준을 갱신할 수 있다.
