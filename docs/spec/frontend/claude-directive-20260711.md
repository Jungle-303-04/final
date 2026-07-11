---
title: 검토자 결정·상세 지시서 (보고서 codex-plan-report-20260711.md에 대한 회신)
status: active-directive
date: 2026-07-11
reviewed_report: codex-plan-report-20260711.md (evidence_head 40bdea2d7)
verified: 보고서의 백엔드 근거 중 pod 역관계 부재(repository.py:367-435), raw 제거,
  fleet_router 존재는 검토자가 독립적으로 코드에서 재확인했다
---

# 검토자 결정·지시 — 2026-07-11

## 0. 총평과 효력

보고서를 승인한다. Q6.1의 자체 해소 5건(cluster-first 교체, D1-D5 Home 선소비,
`features/home` 경로, v0 inspector 미개방, 동적 cluster ID)은 **전부 승인**한다.
이 문서는 브리핑(§2.5)의 아래 2개 조항을 **개정**한다 — 보고서가 옳았다.

- (구) "열 한도 초과 시 '나머지 {n}개' 집계 블록" → 폐기. §1 결정 1로 대체.
- (구) "`summary`/`raw` passthrough" → "`summary`만 open record(passthrough).
  `raw`는 browser 계약대로 계속 금지" (결정 5).

## 1. Q6.2 결정 12건

| # | 결정 | 부연 |
|---|---|---|
| 1 | **A 채택 + 보완**: logical right collection 전량 유지, 집계 블록 없음 | 보완: related 연결체 영역은 뷰포트에 고정하고 **비연관 영역만 내부 스크롤**한다. connector anchor는 고정 영역에만 붙으므로 스크롤 좌표 재계산 문제가 생기지 않는다. 완전성 등식은 DOM 전량 기준으로 유지 |
| 2 | **A 채택(BE-9 신설)**: backend가 pod detail에 `related.services/workloads` 계산 | BE-9 완료 전 잠정: pod focus의 related는 **D1 `summary.node_name` 기반 placement(node) 하나만** 허용한다 — 이는 서버 제공 필드이므로 클라이언트 추론이 아니다. services/workloads는 BE-9 후 |
| 3 | **A 채택**: `U = node header + pod tile`. service/workload는 별도 relation actor collection + 별도 invariant(`actorCount = non-empty relation group 수` 등 명시) | |
| 4 | **A 단기 + C 근본(BE-10 신설)**: pod parser가 `uid` non-null refine, 위반 payload는 invalid-payload 처리. BE-10 = pod DTO uid required 보장 | |
| 5 | **B 채택**: `raw` 금지 유지, `summary`만 open record | 브리핑 §2.5-3 개정 |
| 6 | **A 채택**: `focus.requested|pending|ready|failed|cancelled` + requestId/revision을 v0 TopoMsg에 추가. `topology-engine-claude.md` §6 union을 같은 커밋에서 개정 | |
| 7 | **A 채택**: `clientRefreshDelayed`(90s)와 backend freshness 분리 표기 | |
| 8 | **A 채택**: `react-router-dom` nested shell. dependency 추가는 도입 커밋에서 명시 | |
| 9 | **B 채택**: Vitest + seeded deterministic property loop. 실패 seed를 로그에 남겨 재현 보장. fast-check는 필요 입증 시 재논의 | |
| 10 | **Home 기간 A / 장기 B**: frontend release registry(구현+실API 연결 완료만 등재)가 메뉴 권위. endpoint 404 probe(C) 금지 확정 | |
| 11 | **A 채택**: 모든 실제 cluster를 selector에 유지, non-online 선택 시 connection/install resume surface. pending/stale/expired 정직 표기 | |
| 12 | **B 채택**: `?cluster=` URL 보존 + 접근 불가 ID는 명시 오류(자동 교정 C 금지). `?focus=`와 함께 URL codec에 넣고 `topology-engine-claude.md` §6 URL 규칙을 같은 커밋에서 개정 | |

## 2. Q6.3 리스크 처리 지시

1. proxy `cookieDomainRewrite` 보강은 **H0에서 수행**. 실제 로그인 세션으로 검증하고,
   불가 시 blocked 보고(우회·fake 금지 유지).
2. 1000 리소스 한도·D5 truncation 무신호는 **BE-11**(inventory cursor/`has_more`/`total` +
   related truncation metadata)로 백엔드 대장에 등재. 그 전 초과 클러스터는 blocked.
3. dirty 작업 트리: H0 첫 커밋들에서 **기능별로 분리 커밋**하되, 이 보고서·지시서 커밋에
   섞지 않는다는 원칙 승인.
4. visual gate: mocked Fleet gate와 Home 실측 gate 분리 승인. Home gate에는
   map/focus·light/dark·390/1024/1440·reduced motion·모프 중간 프레임 + `cluster-1` 실증
   스크린샷을 포함한다.

## 3. H0~H6 계획 승인 (수정 1건 포함) — **[2026-07-11 일정 폐기]**

> 이 절의 2주 일정(H0~H6)은 사용자 지시로 `codex-directive-24h-20260711.md`
> (24시간 압축)로 **대체**됐다. §1 결정 12건, §2 리스크 처리, §4 백엔드 대장은
> 계속 유효하며 24h 지시서가 이를 상속한다.

보고서 Q5의 일정·산출물·게이트를 승인한다. 수정 1건: H3의 "full logical column"은
§1 결정 1·2·3을 반영해 구현한다(비연관 내부 스크롤, pod focus 잠정 placement-only,
U=node+pod). 각 단계 완료 시 커밋 해시와 게이트 로그를
`codex-progress-20260711.md`(append-only)에 기록한다 — 검토자는 이 파일과
HEAD diff로 다음 검증을 수행한다.

## 4. 백엔드 협의 대장 추가분 (브리핑 §2.4에 병합)

| # | 내용 | 프론트 의존 |
|---|---|---|
| BE-9 | pod resource-detail에 `related.services`/`related.workloads` 서버 계산 추가 | pod focus의 network/ownership 연결체 |
| BE-10 | inventory pod DTO `uid` required 보장 | 결정 4의 근본 해소 |
| BE-11 | inventory cursor/`has_more`/`total` + related truncation metadata | 1000+ 클러스터 완전성 증명 |

## 5. 착수 허가

이 지시서 커밋 시점부터 H0을 시작한다. 문서 개정(결정 6·12의 계약 반영, 브리핑 2개 조항
개정 반영)은 H0에 포함하며 코드보다 먼저 커밋한다. Home 게이트(H6) 통과 보고 전에는
Resources 이후 화면을 시작하지 않는다.
