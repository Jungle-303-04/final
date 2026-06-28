# 303호 4팀 주간 공유 / 멘토링 보고서 원고

작성일: 2026-06-29  
제출 용도: 주간 공유, 멘토링 공유자료, KDT 제출 히스토리 누적  
프로젝트명: AI 기반 Kubernetes 장애 분석 및 복구 자동화 서비스  
팀: 303호 4팀  
팀원: 임가인, 이민정, 전우현, 정찬빈, 최우녕  
멘토: 김시훈 멘토님, Krafton Data Engineering Dept.

## 작성 기준

이 Markdown은 PPTX/PDF로 만들기 전의 기준 원고다.  
슬라이드별 제목, 본문, 표, 발표 메모를 먼저 고정하고, 이후 같은 내용을 PPTX/PDF로 변환한다.

확인한 근거:

- 제출 서식 PDF: `/Users/woonyong/Downloads/303호_4팀_최우녕.pptx.pdf`
- 멘토 이메일 PDF: `/Users/woonyong/Downloads/Gmail - Jungle Mentor Meet_.pdf`
- source repo: `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final`
- WIKI repo: `/Users/woonyong/workspace/Krafton-Jungle/WIKI`
- WBS 산출물: `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final/outputs/final-wbs-20260626/나만무_상세_WBS.xlsx`
- GitHub Issues/PR/branch 상태: 2026-06-29 확인 기준

---

## 슬라이드 1. 표지

### 화면 문구

크래프톤 정글 12기  
303호 4팀

# AI 기반 Kubernetes 장애 분석 및 복구 자동화 서비스

팀원: 임가인, 이민정, 전우현, 정찬빈, 최우녕  
멘토: 김시훈 멘토님  
주간 공유 / 멘토링 자료  
2026-06-29

### 발표 메모

이번 자료는 최종 발표 자료가 아니라, 매주 프로젝트 진행 이력과 멘토링 피드백 반영 내역을 누적하기 위한 자료다.  
첫 주차 자료이므로 프로젝트 목적, 팀 역할, 현재 설계 결정, 실제 브랜치/이슈/문서 진행 상황을 함께 정리한다.

---

## 슬라이드 2. 목차

### 화면 문구

1. 프로젝트 개요
2. 프로젝트 팀 구성 및 역할
3. 프로젝트 수행 절차 및 방법
4. 프로젝트 수행 경과
5. 이번 주 멘토링 피드백 및 반영
6. 자체 평가 의견
7. Appendix. 주차별 멘토링 보고서

### 발표 메모

원본 서식의 5개 장을 유지하되, 주간 보고와 멘토링 추적 목적에 맞춰 `멘토링 피드백 및 반영`을 별도 장으로 분리했다.  
Appendix에는 이메일, WIKI 회의록, 브랜치/PR/이슈, WBS, 문서 근거를 남겨 나중에 KDT 제출 시 히스토리를 추적할 수 있게 한다.

---

## 슬라이드 3. 프로젝트 개요

### 화면 문구

| 항목 | 내용 |
| --- | --- |
| 문제 | Kubernetes 장애가 발생하면 Git 변경, Kubernetes Event, Pod 상태, Log, Metric을 사람이 따로 확인해야 해서 원인 파악과 복구안 작성이 늦어진다. |
| 해결 | 클러스터 증거를 자동 수집하고, AI RCA와 복구 후보를 만든 뒤, 사람이 승인한 조치만 command 또는 Safe PR로 연결한다. |
| 대상 사용자 | Kubernetes 기반 서비스를 운영하는 개발자, SRE, 플랫폼 엔지니어, 팀 리더 |
| 핵심 가치 | 장애 분석 시간 단축, 복구 근거 보존, 운영 명령 승인/감사 기록 유지, GitOps 흐름과 실제 장애 원인 연결 |
| MVP 사용자 흐름 | 장애 징후 수집 -> Evidence 생성 -> RCA 생성 -> 복구안 또는 PR 제안 -> 사람 승인 -> sandbox 명령 실행 또는 Safe PR -> dashboard/audit 확인 |

### 핵심 메시지

이 프로젝트는 단순 모니터링 도구가 아니라, 흩어진 운영 데이터를 하나의 사건 흐름으로 묶고 AI가 원인과 다음 행동을 설명하게 만드는 운영 보조 도구다.

### 발표 메모

멘토링에서 강조된 포인트는 “Prometheus, Loki, Kubernetes API를 붙였다” 자체가 아니라, 그 데이터를 통해 사용자가 어떤 판단을 더 빨리 할 수 있는가였다.  
따라서 프로젝트 정의도 수집 도구 중심이 아니라 `장애 근거 -> RCA -> 승인된 조치 -> 감사` 흐름 중심으로 정리했다.

---

## 슬라이드 4. 프로젝트 선정 배경과 차별점

### 화면 문구

| 구분 | 기존 운영 방식 | 우리 프로젝트 방향 |
| --- | --- | --- |
| 장애 확인 | 사람이 Dashboard, kubectl, log, GitHub를 오가며 확인 | Git 변경, cluster evidence, command, RCA를 correlation_id로 연결 |
| 복구 판단 | 경험 많은 운영자가 로그와 지표를 직접 해석 | AI가 근거와 함께 RCA/복구 후보를 설명 |
| 조치 실행 | 긴급 명령이나 수동 수정이 GitOps desired state와 어긋날 수 있음 | 승인된 sandbox command 또는 GitHub Safe PR로 연결 |
| 감사 | 누가 어떤 판단으로 조치했는지 흩어짐 | event, command, audit timeline으로 보존 |
| 안전성 | 자동 복구가 과하면 위험 | AI는 제안하고, production 쓰기는 사람 승인과 정책 guard를 거침 |

### 차별화 포인트

- Kubernetes 운영 데이터와 Git 변경 이력을 같은 사건 흐름으로 연결한다.
- AI 결과를 단순 문장 답변으로 끝내지 않고 Evidence, RCA, Safe PR, Command 상태와 연결한다.
- 이벤트 버스, retry, DLQ, replay, audit을 포함해 운영 실패까지 관찰 가능한 구조로 설계한다.
- MVP에서는 production 자동 복구가 아니라 sandbox/PR 중심의 안전한 운영 보조를 목표로 한다.

### 발표 메모

멘토님 피드백 중 하나는 “AI가 어떤 운영 인사이트를 주는가”를 명확히 해야 한다는 것이었다.  
그래서 차별점은 AI 사용 자체가 아니라, 장애 근거와 안전한 실행 경계를 함께 제공하는 구조로 정리했다.

---

## 슬라이드 5. 프로젝트 팀 구성 및 역할

### 화면 문구

| 구성원 | 역할 | 주 담당 업무 | 이번 주 진행/준비 상태 |
| --- | --- | --- | --- |
| 임가인 | RCA / Safe PR / Audit | evidence 기반 RCA, Safe PR 요청, audit timeline | `rca-worker`, `audit-timeline-service`, `dashboard-projection-service` 이슈와 브랜치 준비 |
| 이민정 | Target / Telemetry | target agent, node collector, Prometheus/Loki/OTel evidence | Prometheus 학습/데모/쿼리/Node Collector 이슈 11개로 세분화 |
| 전우현 | GitOps / Command | Git polling, manifest render, diff, command 요청/정책 처리 | GitOps polling-first 설계, command worker 이슈와 브랜치 준비 |
| 정찬빈 | Gateway / Auth | API Gateway, login/session, org/project 권한, integration/credential | email/password + Redis session 브랜치 진행, Gateway/Auth 세부 이슈 8개 준비 |
| 최우녕 | Platform / Integration | event runtime, NATS JetStream, contracts, DLQ, docs/WBS/merge 관리 | event-system 브랜치, events/docs/WBS/WIKI/issue/PR 정리 |
| 김시훈 멘토님 | 멘토 | MVP 범위, 실무 관점, 학습 방향, trade-off 피드백 | 2026-06-26 멘토링 진행, 주니어 온보딩 자료 공유 |

### 발표 메모

역할은 프론트/백처럼 단순 기술 레이어로 나누지 않고, 실제 서비스 흐름의 책임 단위로 나눴다.  
각 담당자는 자기 모듈을 구현하지만, event contract, Gateway API, evidence model, command payload 같은 팀 간 계약은 문서와 PR에서 함께 맞춘다.

---

## 슬라이드 6. 프로젝트 수행 절차 및 방법

### 화면 문구

| 구분 | 기간 | 활동 | 산출물/검증 기준 |
| --- | --- | --- | --- |
| 사전 기획 | 2026-06-24 ~ 2026-06-26 | 프로젝트 문제 정의, MVP 흐름, 서비스 분리, WBS 작성 | WIKI MVP 계획, 제품 정의, WBS, 코치 공유용 계획서 |
| 1주차 E2E 기반 | 2026-06-27 ~ 2026-07-01 | event runtime, DLQ, Gateway/Auth skeleton, target telemetry 학습/데모 | `make up`, `make smoke`, DLQ/replay, node collector metrics |
| 2주차 실제 연동 | 2026-07-04 ~ 2026-07-10 | GitHub 연동, Safe PR, Prometheus/Loki adapter 일부, 권한 guard | GitHub OAuth/PR, Evidence pack, 권한 테스트 |
| 3주차 MVP 완성 | 2026-07-11 ~ 2026-07-17 | 장애 주입부터 RCA, 복구안 승인, command/PR 흐름 연결 | end-to-end demo, dashboard/audit 확인 |
| 4~5주차 고도화 | 2026-07-18 ~ 최종 | multi-cluster, AI 품질, backpressure, 운영 안정화 중 선택 | 발표 안정화, 리스크 제거, 문서/테스트 보강 |

### 개발 방법

- 처음부터 분리된 서비스로 구현하고, 서비스 간 직접 함수 호출 대신 NATS JetStream event로 연결한다.
- Target Agent는 관리 클러스터에 직접 붙지 않고 Gateway로 outbound HTTP 요청만 보낸다.
- production write는 금지하고, sandbox namespace와 Safe PR 중심으로 제한한다.
- 각 팀원은 GitHub Issue, branch, member guide, WBS를 기준으로 작은 PR 단위로 작업한다.
- 매주 수요일에는 실행 가능한 데모를 기준으로 진행 상황을 확인한다.

### 발표 메모

처음에는 구조가 커 보였지만, WBS에서는 첫 주 목표를 “전부 완성”이 아니라 “흐름이 끊기지 않게 만드는 것”으로 낮췄다.  
멘토님 피드백대로 MVP에서는 Redis, object storage, 다중 클러스터, 완전 자동 복구 같은 고도화보다 한 사이클 동작과 설명 가능성을 우선한다.

---

## 슬라이드 7. 현재 아키텍처 요약

### 화면 문구

```text
GitHub / UI / CLI
  -> API Gateway
  -> NATS JetStream SERVICE_EVENTS
  -> GitOps Workers
  -> Command Worker
  -> Agent Command Queue
  -> Target Cluster Agent
  -> Kubernetes API / Prometheus / Loki / OTel
  -> Evidence / RCA / Safe PR
  -> Dashboard Projection / Audit Timeline
```

| 영역 | 현재 구현/설계 기준 |
| --- | --- |
| Gateway | 외부 HTTP 경계, session/auth, command/dashboard/DLQ/agent API |
| Event Bus | NATS JetStream, durable pull consumer, at-least-once delivery |
| Worker Runtime | `App`, `EventProcessor`, retry, DLQ, causation/correlation 처리 |
| Storage | PostgreSQL event/audit/read model/command queue, Redis session |
| GitOps | webhook 대신 commit polling을 기본 사이클로 변경 |
| Target | target agent outbound-only, Node Collector, fake/real telemetry adapter |
| AI/RCA | evidence 기반 RCA와 Safe PR 후보 생성 방향 |

### 발표 메모

현재 구조에서 이벤트는 단순 로그가 아니라 서비스 간 계약이다.  
예를 들어 Gateway가 `command.requested`를 발행하면 Command Worker가 정책 검사를 하고, 통과한 command만 agent queue에 넣고, 그 상태가 다시 event로 남는다.  
이 방식은 서비스가 많아져도 흐름을 correlation_id로 추적할 수 있다는 장점이 있다.

---

## 슬라이드 8. 프로젝트 수행 경과 1 - 기획과 멘토링 반영

### 화면 문구

| 날짜 | 진행 내용 | 결과 |
| --- | --- | --- |
| 2026-06-24 ~ 06-25 | AI Kubernetes 운영 자동화 주제 구체화 | MVP 계획, 서비스 분리 방향, WIKI 문서화 |
| 2026-06-26 오전 | 멘토님 Teams 미팅 초대 수신 | MVP 기획, WBS, 각자 역할/목표 준비 요청 확인 |
| 2026-06-26 저녁 | 사전 기획 PPT를 멘토님께 공유 | 멘토링 자료로 활용 |
| 2026-06-26 멘토링 | MVP 범위, 저장소, 인증, AI 인사이트, 협업 방식 논의 | WIKI 회의록/자동 전사 정리 |
| 2026-06-27 | 멘토님 주니어 온보딩 자료 공유 | 팀원 학습 자료로 공유 예정 |

### 멘토링 핵심 피드백

- 시스템을 크게 만드는 것보다 한 사이클이 실제로 돌아가는 MVP가 우선이다.
- OAuth/auth는 프로젝트보다 더 커질 수 있으니 범위를 줄인다.
- PostgreSQL과 Prometheus/metric store 중심으로 저장소를 단순화한다.
- Redis는 명확한 use case가 생기기 전까지 필수로 보지 않는다.
- AI의 핵심은 “무엇을 판단하고 어떤 인사이트를 주는가”다.
- secret, token, kubeconfig는 Git/event/log에 남기지 않는다.
- 팀 질문은 trade-off, 데이터 판단 기준, 설계 선택지처럼 구체적으로 모아 묻는다.

### 반영 조치

- Gateway/Auth 문서를 GitHub OAuth-only가 아니라 내부 로그인 + Redis session + integration credential 구조로 재작성했다.
- Target/Telemetry 문서를 Prometheus/Loki/OTel 개념, 데이터 흐름, Evidence 모델, demo 순서로 분리했다.
- GitOps는 webhook 의존을 줄이고 polling-first 기본 사이클로 설계했다.
- event payload에는 secret이 아니라 ref/id만 전달하는 규칙을 문서화했다.

### 발표 메모

이 슬라이드는 단순 회의 기록이 아니라, 피드백이 실제 설계 변경으로 이어졌다는 점을 보여주는 장표다.  
특히 인증, 저장소, AI 방향, telemetry 학습 문서가 멘토링 이후 구체화되었다.

---

## 슬라이드 9. 프로젝트 수행 경과 2 - Event / Queue 시스템

### 화면 문구

| 항목 | 현재 설계/구현 |
| --- | --- |
| EventEnvelope | `event_id`, `subject`, `source`, `correlation_id`, `causation_id`, `created_at`, `payload` |
| Event Bus | NATS JetStream `SERVICE_EVENTS` |
| Delivery | at-least-once delivery |
| Consumer | durable pull consumer, 기본 durable name은 service name |
| Idempotency | PostgreSQL `event_processing(event_id, consumer)` ledger |
| Retry | 최대 3회 bounded retry |
| DLQ | 실패 이벤트를 dead letter table에 저장하고 `dead_letter.created` 발행 |
| Replay | Gateway replay API로 DLQ 원본 이벤트 재발행 |
| Outbox | 외부 side effect 안정화를 위한 hardening 후보로 정리 |

### 현재 진행 상태

- `docs/events.md`에 event envelope, body, subject, 발행/구독, retry/DLQ 규칙 정리.
- `packages/contracts/event_bus`에 subject/body/envelope/port 계약 정리.
- worker runtime에서 handler 실패 시 retry, DLQ, ack/nak 책임을 workflow 코드에서 분리.
- dashboard/audit 같은 cross-cutting projector는 모든 이벤트(`>`)를 관찰하는 구조로 정리.
- event branch는 origin 기준 최신 커밋 `6018211`, main/dev에는 문서 PR 일부가 merge됨.

### 발표 메모

큐를 쓰는 이유는 단순히 비동기로 만들기 위해서가 아니다.  
장애 분석과 복구 흐름은 여러 서비스가 이어서 처리하므로, 중간 worker가 죽어도 메시지가 보존되고, 실패하면 retry/DLQ로 운영자가 확인할 수 있어야 한다.  
이 구조 덕분에 command, RCA, audit, dashboard가 같은 사건 흐름을 공유할 수 있다.

---

## 슬라이드 10. 프로젝트 수행 경과 3 - Gateway/Auth와 권한 구조

### 화면 문구

| 단계 | 목표 | 현재 작업 방향 |
| --- | --- | --- |
| Phase 1 | email/password 내부 로그인 | Redis server-side session, cookie/header 인증 |
| Phase 2 | 내부 권한 확인 | organization/project role 분리 |
| Phase 3 | 외부 도구 하나 연결 | GitHub integration target + credential ref |
| Phase 4 | 도구 사용 권한 | action 단위 권한: read_repo, create_pr 등 |
| Phase 5 | Token Broker | worker가 secret을 직접 읽지 않고 broker를 통해 발급 |
| Phase 6 | 두 번째 도구 연결 | Prometheus target으로 추상화 검증 |

### 왜 OAuth-only가 아닌가

- GitHub OAuth는 GitHub 계정 연결에는 유용하지만 Prometheus, Loki, DB, Kubernetes, Grafana 권한을 대표하지 못한다.
- 사용자 로그인 계정과 외부 도구 계정은 분리해야 한다.
- 외부 credential은 event payload, browser, log, DB plain column에 넣지 않는다.
- Gateway는 외부 HTTP 경계이므로 auth/policy/event publish 순서를 책임진다.

### 현재 브랜치/이슈

- 원격 브랜치 `origin/feat/jcbbbbbb/api-gateway`: `be7a2ab feat: 이메일/비밀번호 로그인 및 Redis 세션 추가`
- Gateway/Auth 세부 이슈: #519 ~ #526
- 상위 이슈: #501 API Gateway

### 발표 메모

이 장표는 멘토님이 우려한 인증 범위 확대 문제를 반영한 것이다.  
브라우저 로그인은 session으로 작게 시작하고, 외부 도구 credential은 integration/credential/token broker로 분리해 나중에 GitHub 외 도구도 붙일 수 있게 한다.

---

## 슬라이드 11. 프로젝트 수행 경과 4 - GitOps / Command 흐름

### 화면 문구

| 흐름 | 현재 판단 |
| --- | --- |
| Git 변경 감지 | webhook 대신 polling-first로 시작 |
| GitOps 처리 | Git pull -> manifest render -> desired diff -> diff analyze |
| command 요청 | diff 또는 UI/API 요청이 `command.requested`를 만든다 |
| policy | production write 금지, sandbox namespace부터 허용 |
| dispatch | command plan을 만들고 agent command queue에 저장 |
| agent 실행 | target agent가 Gateway에서 command를 poll해서 실행 결과를 보고 |

### 기본 이벤트 흐름

```text
git.changed
-> manifest.rendered
-> desired.diff.detected
-> diff.analyzed
-> command.requested
-> command.dispatch.ready
-> command.dispatched
-> command.queued_for_agent
-> command.completed
```

### 현재 브랜치/이슈

- `origin/feat/jeonwoohyun-hydromel/gitops-sync-worker`: 초기화 상태
- `origin/feat/jeonwoohyun-hydromel/command-worker`: 초기화 상태
- GitOps 이슈: #503
- Command Worker 이슈: #504
- GitOps polling API 설계 문서 PR: #540(dev), #541(main) merge 완료

### 발표 메모

webhook은 쓰지 않기로 방향을 바꿨다.  
이유는 webhook 누락을 보완하기 위해서가 아니라, 프로젝트 기본 사이클 자체를 polling으로 두면 GitHub 설정이 덜 필요하고, demo에서도 commit 상태 확인을 주기적으로 재현하기 쉽기 때문이다.  
다만 나중에 webhook을 추가하더라도 polling과 같은 event contract를 쓰면 구조가 크게 흔들리지 않는다.

---

## 슬라이드 12. 프로젝트 수행 경과 5 - Target / Telemetry / Evidence

### 화면 문구

| 항목 | 내용 |
| --- | --- |
| Target Agent | target cluster 안에서 실행되고 Gateway로만 outbound HTTP 요청 |
| Node Collector | DaemonSet으로 node/runtime 보조 지표와 structured log 제공 |
| Prometheus | metric을 scrape하는 pull 모델. `/metrics` exporter를 읽고 query API로 조회 |
| Loki | log를 수집/저장하는 ingest 모델. promtail/fluent-bit/OTel collector가 push |
| OpenTelemetry | trace/metric/log를 collector로 push하거나 export하는 관측성 표준 |
| Evidence | raw telemetry 전체가 아니라 RCA에 필요한 의미 있는 요약 신호 |

### 현재 작업 방향

1. Prometheus를 Helm 또는 demo compose로 설치한다.
2. 더미 `/metrics` exporter를 만들고 Prometheus가 scrape하게 한다.
3. Prometheus query API로 더미 metric을 직접 조회한다.
4. query client를 코드로 감싼다.
5. Agent debug query API를 만든다.
6. Kubernetes Pod/Event reader fake adapter를 만든다.
7. Prometheus + Kubernetes evidence를 결합한다.
8. Gateway evidence 계약과 연결한다.

### 현재 브랜치/이슈

- `origin/feat/minmings111/target-cluster-agent`: `ec0d1f9 feat: collect pod logs with Alloy`
- `origin/feat/minmings111/node-collector`: 초기화 상태
- Target/Telemetry 세부 이슈: #527 ~ #537
- 상위 이슈: #508, #509

### 발표 메모

Target/Telemetry 담당자는 내부 NATS 구현을 몰라도 된다.  
중요한 것은 Kubernetes/Prometheus/Loki/OTel에서 볼 수 있는 raw data를 바로 Gateway로 보내는 것이 아니라, RCA가 이해할 수 있는 Evidence로 줄이는 것이다.  
그래서 이번 주 문서는 “무엇을 수집할까”보다 “어떤 신호가 의미 있는가”를 먼저 학습하도록 구성했다.

---

## 슬라이드 13. 브랜치 / PR / 이슈 현황

### 화면 문구

#### 브랜치 현황

| 영역 | 브랜치 | 최신 상태 |
| --- | --- | --- |
| main | `origin/main` | `5b0b399` docs: GitOps polling API 설계 PR merge |
| dev | `origin/dev` | `c025a85` docs: GitOps polling API 설계 PR merge |
| Platform/Event | `origin/feat/woonyong-kr/event-system` | `6018211` crash test/rollout wait fix |
| Gateway/Auth | `origin/feat/jcbbbbbb/api-gateway` | `be7a2ab` email/password login + Redis session |
| GitOps | `origin/feat/jeonwoohyun-hydromel/gitops-sync-worker` | 초기 브랜치 |
| Command | `origin/feat/jeonwoohyun-hydromel/command-worker` | 초기 브랜치 |
| RCA/Audit/Projection | `origin/feat/ummfieg/*` | 초기 브랜치 |
| Target Agent | `origin/feat/minmings111/target-cluster-agent` | `ec0d1f9` pod logs with Alloy |
| Node Collector | `origin/feat/minmings111/node-collector` | 초기 브랜치 |

#### PR 현황

| PR | base | 내용 | 상태 |
| --- | --- | --- | --- |
| #538 | dev | Evidence 학습 가이드와 데모 추가 | merged |
| #539 | main | Evidence 학습 가이드와 데모 추가 | merged |
| #540 | dev | GitOps polling API 설계 정리 | merged |
| #541 | main | GitOps polling API 설계 정리 | merged |

#### 주요 open issue

| 번호 | 영역 | 내용 |
| --- | --- | --- |
| #501 | Gateway/Auth | API Gateway 인증/요청 경계와 이벤트 발행 흐름 |
| #502 | Event System | JetStream 계약/구독/DLQ/트랜지션 처리 |
| #503 | GitOps | Git 변경을 desired state 이벤트로 변환 |
| #504 | Command | 정책 검증과 target command 전달 |
| #505~#507 | RCA/Projection/Audit | RCA, dashboard read model, audit timeline |
| #508~#509 | Target/Telemetry | target agent, node collector |
| #519~#526 | Gateway/Auth 상세 | login, RBAC, integration, token broker |
| #527~#537 | Target/Telemetry 상세 | Prometheus 설치, query, evidence, demo |

### 발표 메모

현재는 코드 구현보다 계약/문서/이슈 분해가 많이 진행된 상태다.  
좋은 점은 각 담당자가 무엇부터 해야 하는지 작은 이슈로 쪼갰다는 점이고, 위험한 점은 아직 여러 구현 브랜치가 초기 상태라 수요일 데모까지 통합 리스크가 크다는 점이다.

---

## 슬라이드 14. WBS와 이번 주 데모 목표

### 화면 문구

| 항목 | 값 |
| --- | --- |
| WBS 기준 시작일 | 2026-06-27 |
| 전체 작업 수 | 56 |
| P0 작업 수 | 44 |
| 1차 보고 목표일 | 2026-07-01 |
| 1차 보고 핵심 | Event Runtime / DLQ / Node Collector |

#### 2026-07-01 1차 보고 데모 기준

| 데모 항목 | 확인 방법 |
| --- | --- |
| Event 처리 상태 | event 발행 -> worker 처리 -> DB 기록 확인 |
| DLQ 발생/조회/replay | 실패 이벤트 생성 -> dead letter 저장 -> replay |
| Node Collector `/metrics` | target cluster에서 metrics endpoint 확인 |
| Gateway/Auth skeleton | session 없는 보호 API 실패, 로그인/session 기본 확인 |
| Target telemetry 학습 결과 | dummy metric scrape/query 또는 fake adapter 확인 |

#### 주요 리스크와 대응

| 리스크 | 영향 | 대응 |
| --- | --- | --- |
| 실제 통합 시간이 부족함 | 수요일 데모 실패 | fake adapter와 smoke path를 먼저 고정 |
| 외부 도구 연동 지연 | GitHub/Prometheus 실연 실패 | dry-run/fake provider feature flag 유지 |
| event 중복 처리 | command/RCA 중복 | event_processing ledger와 stable id 사용 |
| secret 노출 | 보안 사고 | token은 event/log/response 금지, ref만 전달 |
| 문서와 코드 불일치 | 팀원 혼란 | PR마다 source docs/WIKI 동시 갱신 |

### 발표 메모

이번 주의 핵심은 완성도가 아니라 “시스템이 살아 움직이는 최소 경로”다.  
멘토링 피드백도 MVP 사이즈를 줄이고, 실제로 설명 가능한 하나의 흐름을 만드는 쪽이었다.  
따라서 1차 보고는 모든 기능을 보여주기보다 event runtime, DLQ, target telemetry의 최소 증거를 보여주는 방향으로 준비한다.

---

## 슬라이드 15. 자체 평가 의견

### 화면 문구

| 구분 | 평가 |
| --- | --- |
| 잘한 점 | 프로젝트 범위를 역할별로 나누고, event/queue/Gateway/Telemetry 같은 핵심 계약을 문서화했다. 멘토링 피드백을 WIKI, issue, member guide에 빠르게 반영했다. |
| 아쉬운 점 | 구조가 크고 초보 팀원이 이해하기 어려운 영역이 많다. 구현 브랜치 일부가 아직 초기 상태이며, 통합 데모까지 남은 시간이 짧다. |
| 보완 계획 | 문서를 더 작고 따라 하기 쉬운 task로 유지한다. fake adapter로 먼저 흐름을 연결하고, 실제 provider는 한 개씩 교체한다. 매주 수요일 데모 전날 integration freeze를 둔다. |
| 학습 성과 | queue, async worker, event-driven architecture, Kubernetes telemetry, OAuth/session, GitOps, RCA/Safe PR의 경계를 실제 코드와 문서로 나누어 이해하기 시작했다. |

### 팀원별 관점

| 팀원 | 현재 학습/성과 | 다음 보완 |
| --- | --- | --- |
| 임가인 | RCA/Safe PR/Audit 역할과 evidence 연계 방향 확보 | event body와 Safe PR request 흐름을 작은 테스트로 구현 |
| 이민정 | Target/Telemetry 개념 문서와 Prometheus demo task 확보 | dummy metric scrape/query부터 직접 확인 |
| 전우현 | GitOps polling과 command policy/dispatcher 흐름 이해 기반 확보 | polling worker와 command event 전이를 작은 단위로 구현 |
| 정찬빈 | 내부 로그인/Redis session 브랜치 진행 | org/project RBAC와 protected route 테스트 추가 |
| 최우녕 | event runtime, DLQ, docs/WIKI/WBS 정리 | 구현 브랜치와 main/dev 정합성, smoke/e2e 검증 강화 |

### 발표 메모

이번 주 자체 평가는 “많이 구현했다”보다 “어려운 프로젝트를 작은 계약과 task로 나누었다”에 초점을 둔다.  
다음 주부터는 문서가 실제 구현과 계속 맞는지, 그리고 각 팀원이 자기 담당 데모를 독립적으로 보여줄 수 있는지가 중요하다.

---

## 슬라이드 16. Appendix - 멘토링 일지

### 화면 문구

| 일시 | 방법 | 피드백/커뮤니케이션 내용 | 조치사항 |
| --- | --- | --- | --- |
| 2026-06-26 09:26 | 이메일 | 김시훈 멘토님이 Teams 미팅 초대. MVP 기획, WBS, 각자 역할/목표 준비 요청. 공부 방향, 실무 질문, 이력서 질문도 가능하다고 안내. | 팀원에게 참가 링크 공유. MVP 기획/WBS/역할/목표를 준비하기로 답변. |
| 2026-06-26 19:49 | 이메일 | 미팅 전 기존 기획 PPT 공유. | 멘토링 참고 자료로 전달. |
| 2026-06-26 20:00 | Teams 멘토링 | MVP 범위, 인증/secret, 저장소, observability, AI 인사이트, 협업 방식 논의. | WIKI 회의록/자동 전사 작성. Gateway/Auth, Target/Telemetry, Event docs에 반영. |
| 2026-06-27 16:11 | 이메일 | 멘토님이 주니어 온보딩 자료 공유. 프로젝트와 직접 관련은 크지 않지만 공부에 도움된다고 안내. | 팀원에게 공유하고 학습 방향 자료로 활용하기로 답변. |

### 멘토링 반영 추적

| 피드백 | 반영 위치 |
| --- | --- |
| MVP는 한 사이클이 실제로 돌아가야 함 | WBS 1차 보고 목표, `docs/coach-one-page-plan.md`, `docs/team/work-allocation.md` |
| OAuth/auth 범위 축소 | `docs/team/member-guides/gateway-auth.md`, issues #519~#526 |
| secret을 Git/event/log에 넣지 않기 | `docs/events.md`, `docs/team/member-guides/gateway-auth.md`, `docs/secrets.md` |
| PostgreSQL/Prometheus 중심으로 단순화 | `docs/architecture.md`, Target/Telemetry 하위 문서 |
| AI는 운영 인사이트를 설명해야 함 | WIKI `projects/final/meetings/2026-06-26-mentoring.md`, RCA/Safe PR 설계 |
| 팀 질문은 구체적인 trade-off로 모으기 | WIKI 회의록 액션 아이템, member guide 구조 |

### 발표 메모

이 Appendix는 매주 누적한다.  
다음 멘토링에서는 이번 주 받은 피드백이 어디에 반영되었고, 무엇이 아직 미해결인지 이 표를 기준으로 설명한다.

---

## 슬라이드 17. Appendix - 확인한 문서와 경로

### Source repo 문서

| 문서 | 경로 | 용도 |
| --- | --- | --- |
| 코치님 공유용 한 장 계획서 | `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final/docs/coach-one-page-plan.md` | 프로젝트 문제, MVP 흐름, 성공 기준 |
| 서비스 구현 구조 | `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final/docs/architecture.md` | 서비스 배치, runtime, 이벤트 흐름 |
| 이벤트 계약과 DLQ 운영 가이드 | `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final/docs/events.md` | event envelope, subject, retry, DLQ |
| 팀 작업 분배 | `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final/docs/team/work-allocation.md` | 5인 역할과 작업 경계 |
| Gateway/Auth 가이드 | `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final/docs/team/member-guides/gateway-auth.md` | login/session/RBAC/integration/token broker |
| Target/Telemetry 가이드 | `/Users/woonyong/workspace/Krafton-Jungle/SW_AI_W17-21-final/docs/team/member-guides/target-telemetry.md` | target agent, Prometheus/Loki/OTel, evidence |

### WIKI 문서

| 문서 | 경로 | 용도 |
| --- | --- | --- |
| 제품 정의 | `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/product-definition.md` | 사용자/문제/제품 범위 |
| 멘토링 회의록 | `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/meetings/2026-06-26-mentoring.md` | 멘토링 요약, 결정, 액션 |
| 멘토링 자동 전사 | `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/meetings/2026-06-26-mentoring-transcript.md` | 회의 원문 추적 |
| WBS | `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/wbs.md` | 일정과 milestone |
| 회의록 색인 | `/Users/woonyong/workspace/Krafton-Jungle/WIKI/projects/final/meetings/README.md` | 회의록 목록 |

### GitHub 근거

| 종류 | 내용 |
| --- | --- |
| merged PR | #538, #539 Evidence 학습 가이드와 데모 추가 |
| merged PR | #540, #541 GitOps polling API 설계 정리 |
| open issues | #501~#509 상위 구현 이슈 |
| open issues | #519~#526 Gateway/Auth 상세 task |
| open issues | #527~#537 Target/Telemetry 상세 task |

### 발표 메모

제출 자료가 단순 요약이 아니라 히스토리 추적용이므로, 어떤 자료를 근거로 작성했는지 마지막에 남긴다.  
PPTX/PDF에서는 이 장을 Appendix로 작게 넣거나, 너무 길면 별도 보조 자료로 분리한다.

---

## PPTX/PDF 변환 시 구성 제안

PPTX는 14~17장으로 구성한다.  
제출 서식이 14페이지였으므로 본문 제출용은 14~15장으로 압축하고, Appendix는 필요 시 뒤에 붙인다.

권장 PPT 구성:

1. 표지
2. 목차
3. 프로젝트 개요
4. 선정 배경과 차별점
5. 팀 구성 및 역할
6. 수행 절차 및 방법
7. 현재 아키텍처
8. 수행 경과: 기획과 멘토링 반영
9. 수행 경과: Event / Queue
10. 수행 경과: Gateway/Auth
11. 수행 경과: GitOps / Command
12. 수행 경과: Target / Telemetry / Evidence
13. 브랜치 / PR / 이슈 현황
14. WBS와 이번 주 데모 목표
15. 자체 평가 의견
16. Appendix: 멘토링 일지
17. Appendix: 확인한 문서와 경로

---

## 다음 작성 단계

- 이 Markdown 원고를 검토한다.
- 문장이 길거나 표가 많은 장표는 PPTX 변환 시 화면용 문구와 발표자 메모로 분리한다.
- PPTX는 원본 서식의 흐름을 유지하되, 16:9 와이드 비율로 만든다.
- PDF는 PPTX를 export한 결과물로 만든다.
