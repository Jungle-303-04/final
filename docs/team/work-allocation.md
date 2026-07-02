# 5인 작업 분배

이 문서는 프로젝트를 5개의 명확한 담당 영역으로 나눈다. 각 팀원은 `docs/team/codex-automation.md`의 공통 프롬프트와 자신의 영역에 맞는 member guide를 Codex 지시 문서로 사용할 수 있다.

대시보드는 이번 5인 분배에서 제외한다. 현재 dashboard projection은 공통 read model로 유지하고, 실제 UI 구현을 시작할 때 별도 담당을 다시 정한다.

## 역할 요약

| 인원 | 역할 | 핵심 목표 | 첫 데모 기여 |
| --- | --- | --- | --- |
| 1번 | Platform/Integration | event runtime, contract, CI, deploy, merge 안정화 | CI gate, DLQ scenario, smoke 자동화 |
| 2번 | Gateway/Auth | 외부 HTTP, session, OAuth, command API, DLQ API 담당 | GitHub OAuth 실제 adapter 연결 경로 |
| 3번 | GitOps/Command | Git polling부터 split worker manifest/diff/command 생성까지 담당 | manifest render와 command.requested 흐름 |
| 4번 | RCA/Safe PR | evidence 기반 RCA, audit, Safe PR request/repo-gateway 흐름 담당 | Safe PR request와 RCA event test |
| 5번 | Target/Telemetry | 대상 cluster agent, Kubernetes/RBAC, telemetry adapter 담당 | 실제 Prometheus/Loki evidence 수집 경로 |

## Codex 자동화

5명 모두 같은 작업 세션 프롬프트를 사용한다.
팀원별 차이는 `TEAM_MEMBER_GITHUB_ID` 값 하나뿐이며, 작업 세션은 GitHub issue,
PR, branch, 이 문서, member guide를 매번 다시 읽어 자기 작업을 계산한다.
2026-06-30 기준 개인별 정기 자동화는 삭제했고, 정기 자동화는 총괄
`final-wbs-issue-sync`와 WIKI 위생 관리 `wiki`만 유지한다.

- 공통 프롬프트: `docs/team/codex-automation.md`
- 파일 소유권 컨벤션: `docs/team/file-ownership-convention.md`
- 역할별 구현 TODO 원장: `docs/team/implementation-todo.md`
- 작업 원장: `Jungle-303-04/final` Issues와 Project WBS
- PR 기준: `dev` base draft PR
- 변경 가능 범위: 아래 작업 경계 표와 각 member guide
- 팀원 작업 세션 권한: 담당 범위 Issue 본문/체크리스트, Project WBS item/status, source/WIKI 문서 정합성은 직접 보정한다. 완료된 issue는 닫지 않고 Project status만 `완료`로 갱신한다.
- 총괄 WBS 자동화 권한: 전체 WBS/Issue/Project/docs/WIKI 정합성을 보정하고, 각 상위 작업이 최소 10개 이상의 하위 task 또는 체크리스트를 유지하도록 부족분을 정의한다.
- 정기 자동화 금지 작업: 제품 코드 구현, commit, push, branch 생성/삭제, PR close/Ready/merge, main/dev 직접 변경.

## 작업 경계

| 역할 | 자유롭게 변경 가능 | 변경 전 조율 필요 |
| --- | --- | --- |
| Platform/Integration | `src/packages/config`, `src/packages/contracts`, `src/packages/events`, `src/packages/storage`, `src/packages/runtime`, `.github`, `deploy`, `scripts` | service workflow 동작, Gateway route |
| Gateway/Auth | `src/services/gateway/api-gateway`, `src/packages/contracts/gateway`, identity/integration/security 계약 | event subject, shared DB schema, target agent protocol |
| GitOps/Command | `src/services/gitops/*`, `src/services/command/command-worker`, manifest/diff/command 생성 | target RBAC, RCA evidence schema, Gateway route |
| RCA/Safe PR | `src/services/ai/rca-worker`, `src/services/gitops/scm-worker`, `src/services/projection/audit-worker`, Safe PR request/repo write logic | GitHub token scope, command payload, dashboard read model |
| Target/Telemetry | `src/services/target/cluster-agent`, `src/services/target/node-collector`, `deploy/target` | command payload schema, evidence schema, metrics storage |

## 현재 코드 경로 기준

2026-06-29 기준 `main`/`dev`에는 서비스 경로 그룹화와 `app.py` entrypoint 기준이 반영되어 있다.
개별 이슈 상태는 경로 병합 여부가 아니라 GitHub Project `WBS` 상태와 최신 검증 증거를 기준으로 판단한다.

| 영역 | 현재 경로 |
| --- | --- |
| GitOps pipeline | `src/services/gitops/git-pull-worker`, `src/services/gitops/github-poll-worker`, `src/services/gitops/workflow-controller`, `src/services/gitops/manifest-render-worker`, `src/services/gitops/diff-worker`, `src/services/gitops/diff-analyze-worker`, `src/services/gitops/scm-worker` |
| Projection | `src/services/projection/dashboard-worker`, `src/services/projection/audit-worker` |
| Target | `src/services/target/cluster-agent`, `src/services/target/node-collector` |

## 2026-06-30 기준 미흡한 부분

| 미흡한 부분 | 담당 | 메모 |
| --- | --- | --- |
| Gateway/Auth 최종 권한 모델 | Gateway/Auth | 일반 로그인, Redis session, org/project role, integration target/credential, Token Broker를 단계별로 구현 |
| manifest render와 desired diff 정교화 | GitOps/Command | GitOps event와 command 생성 테스트 필요 |
| AI 기본 모듈 | RCA/Safe PR | 별도 AI service 분리 전까지 evidence/RCA 질의, command 승인, PR 설명/재생성 입력 경계를 정리 |
| 실제 GitHub PR 생성 | RCA/Safe PR | Safe PR client는 feature flag로 보호 |
| agent 관리 로직 | Target/Telemetry | agent registry/status와 command lease 상태 관리 |
| Prometheus/Loki 실제 adapter | Target/Telemetry | fake adapter는 fallback으로 유지 |
| Outbox relay 운영 하드닝 | Platform/Integration | 실제 provider side effect 전 crash injection, relay source filter, 운영 runbook을 유지 |
| 수요일 demo script | Platform/Integration + 각 담당자 | 매주 수요일은 실행 가능한 demo 필요 |

## 주간 협업 흐름

- 월요일: WBS에서 이번 주 PR 단위 확정
- 화요일: 저녁 전 integration freeze
- 수요일 오전: demo rehearsal과 critical fix만 진행
- 수요일 보고: slide가 아니라 실행 demo를 보여준다
- 목요일/금요일: 기능 구현
- 주말: 문서 정리와 integration risk 감소

## 팀 간 계약 규칙

- 새 API route: Gateway/Auth가 PR을 열고 schema/docs를 수정한다.
- 새 event subject/body: 담당자가 `src/packages/contracts/event_bus/subjects.py`, `src/packages/contracts/event_bus/bodies/`, `docs/events.md`, test를 함께 수정한다.
- 새 DB table: 담당자가 `Database.init`, docs, test coverage를 함께 수정한다.
- 새 Kubernetes permission: Target/Telemetry가 PR에서 RBAC 범위를 설명한다.
- dashboard 의존성이 생기는 API 변경: 현재는 Gateway/Auth와 Platform/Integration이 문서에 먼저 남긴다.
