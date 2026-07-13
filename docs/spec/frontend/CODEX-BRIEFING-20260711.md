---
title: 프론트 작업 조율 브리핑
status: archived — 현재 작업에 참조 금지
date: 2026-07-11
verified_against: HEAD e20376321
subordinate_to: codex-directive-reference-pivot-20260711.md
---

# 코덱스 브리핑 — 2026-07-11

## 0. 현재 효력

이 문서는 이전 작업의 검증 근거만 보존한다. 현재 작업 순서, 화면, 정보 구조, 상호작용의 정본은
`codex-directive-reference-pivot-20260711.md`와 P1 `reference-feature-inventory.md`다.

참조 순서는 다음과 같다.

1. 외부 기준 저장소 피벗 지시
2. P1 외부 기준 저장소 기능 전수표
3. P2 계약 매핑표
4. `reference-porting-contract.md`
5. 실제 코드와 통과한 테스트

`topology-engine.md`는 장기 헌법으로 이번 피벗에서 수정하지 않으며, 현재 포팅 화면의 정본으로
사용하지 않는다.

## 1. 재작업 금지 검증 근거

| 항목 | 증거 |
|---|---|
| 구 `frontend/` 완전 제거 | 커밋 `e20376321` |
| 실 클러스터 inventory API 계층 | 커밋 `8dbcfde9c`, `src/product/api/inventory.ts`, `inventory-schemas.ts` |
| Vite `/api` proxy | `references/ui-layer-lab/vite.config.ts` |
| 제품 코드 소유 경로 | `references/ui-layer-lab/src/product/` |

위 기반, `src/product/api/**`, proxy, gate, metrics, RCA, recovery, registration 데이터 경로는
피벗 이후에도 보존한다.

## 2. 현재 IA 경계

| 상태 | 내용 |
|---|---|
| 클러스터 미연결 | provider catalog → preflight → register → bootstrap → connection-status |
| 클러스터 연결 | 연결 후 중앙 뷰(미정) |
| 전체 route·menu·shell | P1에서 외부 기준 저장소 runtime과 source를 전수 조사해 확정 |
| 기능 노출 | 실제 backend capability와 권한이 있을 때만 노출 |

외부 기준 저장소에서 관찰하지 않은 중앙 뷰를 임의로 설계하지 않는다. 외부 기준 저장소의 시각 스타일과 브랜드는
가져오지 않고 벤치마크 최소선으로 표현한다.

## 3. 보존된 뷰-비의존 규칙

1. synthetic/replay gateway, fake count, 가짜 리소스 이름, 자동 demo fallback 금지.
2. 모든 외부 payload는 `unknown`에서 Zod로 검증한다.
3. 최상위 DTO는 엄격하게 닫고, `summary` 등 명시된 projection만 open record로 둔다.
4. `raw` Kubernetes object를 브라우저 계약에 추가하지 않는다.
5. cluster ID는 `GET /api/clusters`가 권위이며 `?cluster=`를 보존한다.
6. 접근 불가 cluster ID를 첫 cluster로 자동 교정하지 않는다.
7. proxy는 session cookie를 보존한다. 401을 fake session이나 우회 코드로 숨기지 않는다.
8. route와 menu는 frontend release registry, canonical capability, 현재 권한으로 결정한다.
9. P1은 관찰·소스 확인만 수행하고, P2 검토 승인 전 제품 화면 포팅을 시작하지 않는다.

## 4. 다음 산출물

- P1: `reference-feature-inventory.md`
- P2: `reference-contract-map.md`
- 구현 경계: `reference-porting-contract.md`
- 진행 증거: `codex-progress-20260711.md`
