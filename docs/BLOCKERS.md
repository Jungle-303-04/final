# 블로커 로그
2026-07-19 · G0 · tokens.css/상세워크스페이스/매니페스트에디터 리베이스·스태시 충돌 → 해소(토큰=양측 보존, 상세 2파일=커밋본 채택·낡은 스태시 폐기, stash 항목은 안전상 보존)
2026-07-19 · G7 · 최근 dev push 2회(0a53ca1e, 1d98a7ab)가 frontend typecheck·product-brand-boundary에서 게이트 실패하고 로컬 gate-fast도 test_inventory_domain import 정렬에서 실패해 자동 배포 skipped · 해당 회귀 해소 후 게이트→배포 5배치 연속 완주 재측정 · 미해소
2026-07-19 · G1 · main/dev 이력 1438/3262 분기 + gate blocker(test_inventory_domain I001·frontend 회귀) · dev tree 유지 ancestry merge 후 gate 통과·비활성 Deploy 재확인 뒤 dev/main 순차 push · 미해소
2026-07-19 · G1 · 비본선 14개 브랜치는 archive tag 검증 후 삭제했고 원격 head는 main/dev/demo만 남음 · G4 MUST+통합 gate 뒤 demo 삭제·main ancestry·dev/main push 재개 · 부분 완료
2026-07-19 · G4/G7 · 8866399f5 gate-fast Vitest 2,204 pass/60 fail+3 unhandled, host load 180~215에서 다수 timeout·worker 기동 timeout; 결정적 Helm 1건·operation handoff 3건은 C에 반송 · 정상 부하 최종 digest 재검증 · 미해소
2026-07-19 · G4/G7 · final a4eb1d638 gate 2265 pass/15 fail + 2 worker timeout · 결정적 Alert/apiComposition/Filesystem 반송 · 상태 미해소
2026-07-19 · G1/G7 · 870474c44 Dev Gate 29678856691은 main 계보 병합으로 push 범위에 유입된 기존 비준수 커밋을 commit-msg gate가 검사해 실패, Dev Deploy 29678871947은 skipped · 원격 dev 기준점 갱신 후 컨벤션 준수 체크포인트로 동일 검증 tree 재실행 · 해소 진행
2026-07-19 · G4/G7 · 512f967d1 Dev Gate 29679510750은 Frontend 성공·Backend 3,774 pass/1 fail로 종료, 테스트 support 파일이 runtime source로 오인된 경계 1건; Dev Deploy 29679703660은 skipped · support를 명시적 tests 경계로 이동한 165f7f5c3으로 재검증 · 해소 진행
2026-07-19 · STATUS §7 · 사람·오케스트레이터만 해결할 절대 블로커 0건; reference destination 17건·배포·화면 증거는 현재 권한으로 자체 해소 가능, 외부 CPU 포화는 직렬화·worker 2로 우선 회피 · 이관할 사람 필요 항목 없음
2026-07-19 · G5/G7 · 21aa0f2a1 Dev Gate 29679811849는 전체 성공했으나 Dev Deploy 29679991657이 AWS 전 reference-ui-delta unknown destination 17건으로 실패 · 삭제 서피스를 현행 소유자에 재분류한 020d4f078에서 governance 41/41·source-delta 14/14·unknown 0으로 해소
