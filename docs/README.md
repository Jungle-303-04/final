# 프로젝트 문서 읽는 순서

이 문서는 팀원이 문서를 너무 많이 열지 않도록 만든 source repo 문서 진입점이다.
처음에는 아래 "필수 5개"만 읽고, 역할별 작업을 시작할 때 자기 역할 문서만 추가로 본다.

## 필수 5개

| 순서 | 문서 | 목적 |
| --- | --- | --- |
| 1 | [README](../README.md) | 실행 방법과 서비스 목록 |
| 2 | [아키텍처](architecture.md) | 전체 구조와 서비스 경계 |
| 3 | [이벤트 흐름](events.md) | event subject와 end-to-end flow |
| 4 | [팀 컨벤션](team/conventions.md) | 브랜치, PR, 리뷰, 테스트 규칙 |
| 5 | [파일 소유권](team/file-ownership-convention.md) | 내가 관리할 파일과 조율할 파일 |

## 팀원별로 추가로 볼 문서

| 팀원 | 역할 | 먼저 볼 source 문서 | WIKI mirror |
| --- | --- | --- | --- |
| `woonyong-kr` | Platform / Integration | [platform-integration](team/member-guides/platform-integration.md) | `projects/final/member-guides/platform-integration.md` |
| `JCBBBBBB` | Gateway / Auth | [gateway-auth](team/member-guides/gateway-auth.md) | `projects/final/member-guides/gateway-auth.md` |
| `JEONWOOHYUN-hydromel` | GitOps / Command | [gitops-command](team/member-guides/gitops-command.md) | `projects/final/member-guides/gitops-command.md` |
| `ummfieg` | RCA / Safe PR / Audit | [rca-safe-pr](team/member-guides/rca-safe-pr.md) | `projects/final/member-guides/rca-safe-pr.md` |
| `minmings111` | Target / Agent / Telemetry | [target-telemetry](team/member-guides/target-telemetry.md) | `projects/final/member-guides/target-telemetry.md` |

## 작업자 브랜치 정렬

작업자 브랜치는 각 작업자가 직접 `dev`를 반영한다. 다른 사람이 대신 merge, rebase,
force push하지 않는다.

브랜치 이식이 필요하면 [작업자 브랜치 dev 정렬 가이드](team/worker-branch-dev-alignment-guide.md)를 본다.

## 문서 종류

| 종류 | 문서 |
| --- | --- |
| 실행/운영 | [operations-deployment](operations-deployment.md), [production-readiness](production-readiness.md), [secrets](secrets.md) |
| 설계 참고 | [service-split-plan](service-split-plan.md), [domain-architecture-plan](domain-architecture-plan.md), [outbox-design](outbox-design.md), [Plural Console 기술 챌린지](team/plural-console-technical-challenge.md) |
| 팀 운영 | [work-allocation](team/work-allocation.md), [implementation-todo](team/implementation-todo.md), [contract-vs-demo-boundary](team/contract-vs-demo-boundary.md), [codex-automation](team/codex-automation.md) |
| Target 상세 | `docs/team/member-guides/target-telemetry-*.md` |

## WIKI와 source repo 기준

- source repo 문서는 코드와 함께 바뀌는 실행 기준이다.
- WIKI 문서는 프로젝트/운영/회의/팀 가이드의 mirror와 색인이다.
- 두 문서가 다르면 source repo의 실제 코드와 최신 PR 상태를 먼저 확인하고, 양쪽 문서를 함께 갱신한다.
