G0 · 진행 중 · 오케스트레이터가 1abd1aa9e 배포 발사 · 취소 금지
G0 · 완료 · fba57b25ef837cc3fa329511ebdd7782b5e25425 · Dev Gate 29663702072 + Dev Deploy 29663864101(10m45s) + service 7831bd68/console bb939faa digest + post-deploy/인증 브라우저 smoke 일치
G2 · 완료 · 74ff3c0f12c29281f0af8a8fb2bfd1cb286813a4 · light/dark 토큰·공용 부품 8종·모션 리터럴 guard·tanstack/tabler 제거, typecheck/lint/check:design 1333 통과
G3 · 완료 · 554f82b51 · make gate-backend 3771 passed/3 skipped + E 독립 재감사 60 passed, activity/private repo/inventory/alert 4계약 PASS
E · 라이브 smoke · fba57b25ef837cc3fa329511ebdd7782b5e25425 · 2026-07-19 17:50 KST health ok + 12개 경로 HTTP 200 + JS/console error 0, `docs/evidence/live-smoke-2026-07-19-1750.md`; G4 후보 SHA 증거는 아님
E · 라이브 smoke · fdd75a4f265eb5c7fd4dd769b475677c1f6830c8 · 2026-07-19 21:58 KST health/ready ok + canonical 8경로 H1·로그인·overflow + console error 0, `docs/evidence/live-smoke-2026-07-19-2158.md`; 19:50 누락 회차 보충, G4 후보 SHA 증거는 아님
G7 · 배포 완주 · 333c657345271e5d924fbb9e01983f9142335098 · Dev Gate 29689900163 + Dev Deploy 29690120559 success(10m08s), activity actual-DB read + 인증 canonical 8라우트(`/resources` 포함) smoke 통과, rollback 미실행
E · 라이브 smoke · 333c657345271e5d924fbb9e01983f9142335098 · 2026-07-19 23:24 KST health/ready·bundle SHA·Home W2~W8·1920 overflow 0 확인; fleet/card 숫자 drift와 activity 30초 refresh 회귀를 `docs/evidence/g4/home-visual-comparison.md`에 고정, G4 Home 부분 유지
G7 · 배포 완주 · 07527f0b89da4376fd55bfd549f0be1b0c343285 · Dev Gate 29691325987 + Dev Deploy 29691403364 success(10m52s), post-deploy·인증 browser route smoke 통과, rollback 미실행; 선행 동일 ESLint 실패 2회 해소
G7 · 배포 완주 · 723ab27aa9e4e596cf76d21a5116d10f49b8beaf · Dev Gate 29692859664 + Dev Deploy 29692918077 success(5m50s), console·인증 browser smoke 통과, rollback 미실행; demo-freeze-v3 consumer cutover 감사 기준 G4 부분 유지
G7 · 배포 완주 · fd58268d5210be92896a90f8ecd1a2ee4130fcb5 · Dev Gate 29693357340 + Dev Deploy 29693439823 success, 홈 W2~W8 내부 1:1 콘텐츠 문법 라이브 반영; 동일 SHA demo 1440 검수 전 G4 부분 유지
G7 · 배포 완주 · e84748b06ded3450ca3693efb5863ccbfc30eb68 · Dev Gate 29694437337 + Dev Deploy 29694651904 success; exact demo adcf92130 1440 대조에서 selected scope·헤더 숫자·W2~W8 편집/시각 델타 확인으로 G4 Home 부분 유지
G7 · 배포 완주 · 61deed8340b7d9fe699359a507a84f9b02e201cb · Dev Gate 29712271375 + Dev Deploy 29712347044 success(11m08s), Kyro 전면 서피스 라이브 반영 + post-deploy API/authenticated browser route smoke 통과, rollback 미실행; 동일 SHA 자동 시각 캡처 미완료로 G4 부분 유지
G7 · 배포 완주 · 42369ecf2852df82efdd8d46ed0805f78fa7f9f2 · Dev Gate 29713518047 + Dev Deploy 29713598921 success, RCA 상세 이동·복구 상태 동기화 + post-deploy/authenticated browser route smoke 통과
G7 · 배포 완주 · 993cd2ec2e0c706a7cda12c0c55ef356b7520090 · Dev Gate 29715195803 + Dev Deploy 29715426460 success, AI 대화 내역 상태·클러스터 등록 환경/완료 계약 + post-deploy/authenticated browser route smoke 통과; 최초 등록 실패 retry CTA 후속 회귀 중
