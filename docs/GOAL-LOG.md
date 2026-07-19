G0 · 진행 중 · 오케스트레이터가 1abd1aa9e 배포 발사 · 취소 금지
G0 · 완료 · fba57b25ef837cc3fa329511ebdd7782b5e25425 · Dev Gate 29663702072 + Dev Deploy 29663864101(10m45s) + service 7831bd68/console bb939faa digest + post-deploy/인증 브라우저 smoke 일치
G2 · 완료 · 74ff3c0f12c29281f0af8a8fb2bfd1cb286813a4 · light/dark 토큰·공용 부품 8종·모션 리터럴 guard·tanstack/tabler 제거, typecheck/lint/check:design 1333 통과
G3 · 완료 · 554f82b51 · make gate-backend 3771 passed/3 skipped + E 독립 재감사 60 passed, activity/private repo/inventory/alert 4계약 PASS
E · 라이브 smoke · fba57b25ef837cc3fa329511ebdd7782b5e25425 · 2026-07-19 17:50 KST health ok + 12개 경로 HTTP 200 + JS/console error 0, `docs/evidence/live-smoke-2026-07-19-1750.md`; G4 후보 SHA 증거는 아님
E · 라이브 smoke · fdd75a4f265eb5c7fd4dd769b475677c1f6830c8 · 2026-07-19 21:58 KST health/ready ok + canonical 8경로 H1·로그인·overflow + console error 0, `docs/evidence/live-smoke-2026-07-19-2158.md`; 19:50 누락 회차 보충, G4 후보 SHA 증거는 아님
G7 · 배포 완주 · 333c657345271e5d924fbb9e01983f9142335098 · Dev Gate 29689900163 + Dev Deploy 29690120559 success(10m08s), activity actual-DB read + 인증 canonical 8라우트(`/resources` 포함) smoke 통과, rollback 미실행
E · 라이브 smoke · 333c657345271e5d924fbb9e01983f9142335098 · 2026-07-19 23:24 KST health/ready·bundle SHA·Home W2~W8·1920 overflow 0 확인; fleet/card 숫자 drift와 activity 30초 refresh 회귀를 `docs/evidence/g4/home-visual-comparison.md`에 고정, G4 Home 부분 유지
G7 · 배포 완주 · 07527f0b89da4376fd55bfd549f0be1b0c343285 · Dev Gate 29691325987 + Dev Deploy 29691403364 success(10m52s), post-deploy·인증 browser route smoke 통과, rollback 미실행; 선행 동일 ESLint 실패 2회 해소
