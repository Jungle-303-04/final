# 프론트 작업 로그

프론트 세션은 이 파일에 작업 상태와 착륙 증거를 기록한다. 조율·판정 기록은
`night-log.md`, 백엔드 기록은 `night-log-backend.md`에 둔다.

[사이클] 2026-07-14 05:24 KST / Resources mutation 알림을 legacy `useToast`에서 canonical Sonner로 이관하고 API·query invalidation·오류 의미를 보존; 회귀 가드 `@/ui` 상한 43 → 35(실제 36 → 35) / `fec70983d` (`make gate-fast`: ruff·format·import contract·compile·dev-gate contract 6·frontend typecheck/lint/test 31 PASS, T1=T2, origin/dev push 완료; CI Dev Gate run `29282235443` SUCCESS, 1분 50초) / 다음 한 걸음: ClusterDetailView의 서버 미제공 값 위조 2건을 먼저 회귀 테스트로 차단한 뒤 원자적 shadcn 이관

[사이클] 2026-07-14 05:36 KST / Cluster 상세에서 미제공 수치의 `0` 위조, 가짜 kubectl 해제 명령, CPU 기반 Pod 면적을 제거하고 각각 unavailable·서버 명령 전용·균등 면적으로 고정 / `d0679ec4d` (`gate-fast`와 frontend 32 PASS; 최초 Dev Gate `29282758567`은 백엔드 배포 계약 1건으로 RED되어 백엔드 세션에 직접 인계, 보정 `c0635b007` 후 run `29282934238` SUCCESS) / 다음 한 걸음: Issues 목록을 화면 단위로 shadcn 이관

[사이클] 2026-07-14 05:48 KST / Issues 목록을 shadcn Card·Badge·Button·ToggleGroup으로 전면 이관하고 실제 Link, 필터 화이트리스트, live region 분리, 시각 의미 토큰을 적용; `@/ui` 사용 파일 상한 35 → 34 / `779e7182f` (`make gate-fast`: frontend 33 PASS, T1=T2; CI Dev Gate run `29283682674` SUCCESS, 2분 11초) / 다음 한 걸음: notifications API의 legacy `useToast` 8개를 Sonner로 의미 보존 이관하고 상한 34 → 33
