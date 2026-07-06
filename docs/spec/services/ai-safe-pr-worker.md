---
source_commit: 1616d295
status: synced
---

# safe-pr-worker — (구현 없음: 빈 디렉터리)

> 소스: `src/services/ai/safe-pr-worker/` · 테스트: 없음

## 책임 (Responsibility)

`source_commit` 기준 `src/services/ai/safe-pr-worker/` 디렉터리는 **비어 있다**
(`app.py` 를 포함해 소스 파일이 하나도 없으며, 실행 가능한 워커가 아니다).
이 페이지는 그 사실 자체를 기록한다 — 스펙에 없는 동작을 이 이름으로 구현하려면
먼저 이 페이지를 `status: spec-ahead` 로 갱신해야 한다.

## 동작 (Behavior)

현재 Safe PR 경로는 다른 워커들이 담당한다:

1. [dispatch-worker](ai-dispatch-worker.md) — `recovery.action_selected` 의 route가
   `draft_pr` 일 때 `safe_pr.requested` 발행(패치 없으면 `rca.action_required` 로 차단).
2. [diff-worker](ai-diff-worker.md) — `safe_pr.patch_prepared` 를 게이트해
   `diff.explained` + `safe_pr.ready_for_creation` / `safe_pr.failed` 발행.
3. 실제 PR 생성(`safe_pr.created`/`safe_pr.failed`)은 ai 서비스 밖의
   [scm 도메인](../domains/scm.md) 소비자(repo/scm gateway) 책임.

## 불변식·오류 (Invariants & Errors)

- 이 디렉터리에 코드를 추가하는 변경은 본 페이지 갱신(spec-first)과 함께 이뤄져야 한다.

## 설정 (Settings)

없음.
