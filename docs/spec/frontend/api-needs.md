---
title: 프론트 API 요청 큐
status: active-coordination-queue
date: 2026-07-11
owners: Codex 요청 / API 연결 작업자 처리
workorder: api-integration-workorder-20260711.md
---

# 프론트 API 요청 큐

이 문서는 골모드 §6b에 따른 단일 조율 큐다. Codex는 필요한 endpoint 함수·Zod schema가
`src/product/api`에 없을 때 직접 구현하지 않고 아래 표에 요청한다. API 작업자는 이 표를 일반
우선순위보다 먼저 처리하고, 완료 사실을 `codex-progress-20260711.md`에
`API 완성: <함수명> (<커밋 해시>)` 형식으로 기록한다.

## 작성 규칙

1. 한 행은 함께 검증·배포되는 함수군 하나다.
2. `routes.py 상수`는 `src/packages/contracts/gateway/routes.py`의 정확한 상수명만 쓴다.
3. 요청 시각은 `YYYY-MM-DD HH:mm KST`다.
4. 상태는 `requested`, `in_progress`, `blocked`만 사용한다. 완료 행은 progress 기록 확인 뒤 이
   표에서 제거하며 git history로 보존한다.
5. 응답 shape를 추측하거나 화면 component에 임시 fetch를 추가하지 않는다.
6. 24시간 미처리 전에는 Codex가 `src/product/api/**` endpoint·schema를 신설하지 않는다.

## 요청

| 함수명 | routes.py 상수 | 필요한 화면 | 요청 시각 | 상태 | 비고 |
|---|---|---|---|---|---|
