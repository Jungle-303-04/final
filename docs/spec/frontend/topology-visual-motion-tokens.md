---
title: Topology Visual and Motion Authority Bridge
status: archived — 현재 작업에 참조 금지
date: 2026-07-11
design_authority: 벤치마크 최소선
behavior_authority: reference-feature-inventory.md
---

# 시각·모션 정본 연결

## 0. 범위

이 문서는 자체 색, 치수, density, z-order, layout, motion token이나 철회된 사용자 정의 중앙 뷰
계약을 정의하지 않는다.

- 기능·레이아웃·상호작용 정본: 외부 기준 저장소 실행 인스턴스와 `reference-feature-inventory.md`
- 디자인 정본: 벤치마크 최소선의 CSS variable과 제품 소유 생성 component
- 데이터·접근성 경계: `reference-porting-contract.md`
- 장기 엔진 헌법: `topology-engine.md`이며 현재 외부 기준 저장소 포팅 구현의 화면 정본은 아님

## 1. 구현 규칙

- component 안에 raw hex, 임의 duration, 병렬 theme token 체계를 만들지 않는다.
- 벤치마크 최소선 공식 변수와 제품 소유 semantic alias만 사용한다.
- 외부 기준 저장소에서 확인되지 않은 시각화와 모션을 임의로 추가하지 않는다.
- 대비 4.5:1·3:1, 키보드 동등 조작, visible focus, reduced-motion 의미 보존은
  `reference-porting-contract.md` §7을 따른다.
- 제품 코드 이식 전에는 외부 기준 저장소 Apache-2.0과 벤치마크 최소선 MIT 고지 절차를 확인한다.
