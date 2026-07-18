# 블로커 로그
2026-07-19 · G0 · tokens.css/상세워크스페이스/매니페스트에디터 리베이스·스태시 충돌 → 해소(토큰=양측 보존, 상세 2파일=커밋본 채택·낡은 스태시 폐기, stash 항목은 안전상 보존)
2026-07-19 · G7 · 최근 dev push 2회(0a53ca1e, 1d98a7ab)가 frontend typecheck·product-brand-boundary에서 게이트 실패하고 로컬 gate-fast도 test_inventory_domain import 정렬에서 실패해 자동 배포 skipped · 해당 회귀 해소 후 게이트→배포 5배치 연속 완주 재측정 · 미해소
2026-07-19 · G1 · main/dev 이력 1438/3262 분기 + gate blocker(test_inventory_domain I001·frontend 회귀) · dev tree 유지 ancestry merge 후 gate 통과·비활성 Deploy 재확인 뒤 dev/main 순차 push · 미해소
2026-07-19 · G1 · 비본선 14개 브랜치는 archive tag 검증 후 삭제했고 원격 head는 main/dev/demo만 남음 · G4 MUST+통합 gate 뒤 demo 삭제·main ancestry·dev/main push 재개 · 부분 완료
