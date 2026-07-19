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
2026-07-19 · G7 · 9407d4ab9 Dev Gate 29680361414는 Frontend 성공 후 STATUS-REPORT의 과거 제품명 토큰 1건을 product-brand-boundary가 차단했고 Dev Deploy 29680556206은 skipped · 실제 제품 결함이 아닌 증거 문서 표기 결함을 fa396d688에서 일반 경계 명칭으로 정정, 재검증 대기 · 해소 진행
2026-07-19 · G7 · 005bdf547 Dev Gate 29680841537은 Frontend 성공 후 Backend 3,772 pass/3 fail로 종료했고 Dev Deploy 29681039922는 skipped · 증거 경로 과심도 2파일, docs README 색인 2개 누락, STATUS 문구 경계 1건을 평탄화·색인·현재 상태 문구로 정정해 test_docs_index 11/11 통과 · 해소
2026-07-19 · G4 D-1 · 라이브 `/deploy` 저장소·동기화 탭에서 저장소 목록·연결 흐름·동기화 상태가 소실되고 플랜 빈 상태만 노출 · GitOps 아카이브 요소를 D19 탭에 중복 없이 이식하고 동일 SHA demo/live 검증 · 미해소
2026-07-19 · G4 D-2 · 애플리케이션 빈 상태의 GitOps 연결 행동이 실행 가능한 연결 흐름으로 이어지지 않음 · `/deploy` 저장소·동기화 탭의 실제 연결 흐름으로 단일화 · 미해소
2026-07-19 · G4 D-3 · 라이브 서피스별 라이트/다크 토큰 문법 혼재 · demo 라이트 기준과 단일 제품 토큰으로 8개 canonical 서피스 순차 통일 · 미해소
2026-07-19 · G4 D-4 · 라이브 홈 카드 수치가 `—`이고 W2~W8 보드가 부재 · 홈 전용 후보 eaa5fdbbb까지 전체 플릿 집계·namespace·exact critical/scope를 구현, 배포·demo 대조 전 · 코드 해소/라이브 미검증
2026-07-19 · G4/G7 · d48f3652a Dev Gate 29686718943의 Backend job 88192169125는 전체 3,773 pass/3 skip/2 fail로 종료; `docs/evidence/g4/home/*` 6파일이 문서 최대 깊이를 초과하고 Markdown 3파일이 docs 루트 색인에서 누락됨 · 제품/백엔드 결함 아님, `docs/evidence/g4/home-*` 평탄화+README 색인 후 동일 저부하 게이트 재검증 · 해소 진행
2026-07-19 · G7 · 프론트 전용 6d3c7bc76 Dev Gate 29686856764와 1d57d4b1b Dev Gate 29686939839는 shallow checkout에 각 `github.event.before` 객체가 없어 `gate-frontend-changed`가 `git cat-file` 단계에서 즉시 실패, Deploy 29686902495 등 skipped · FRONTEND 범위에서 기준 SHA를 명시 fetch하고 객체를 확인한 뒤 영향 게이트를 실행하도록 CI 계약 보강 · 해소 진행
