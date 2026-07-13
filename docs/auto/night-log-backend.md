# 백엔드 작업 로그

백엔드 세션은 이 파일에 작업 상태와 착륙 증거를 기록한다. 조율·판정 기록은
`night-log.md`, 프론트 기록은 `night-log-frontend.md`에 둔다.

[알림] pre-push를 `gate-fast`로 전환하고 로그 파일을 분리 / 약 15분 /
`Makefile`, `scripts/pre-push-gate.sh`, `.pre-commit-config.yaml`,
`tests/test_dev_gate_contract.py`, `docs/auto/night-log-*.md`를 피한다.

[사이클] 2026-07-14 05:36 KST / pre-push를 2분 상한의 `make gate-fast`로 전환하고
프론트·백엔드 로그를 분리 / `bda18fa12` / 서버 Dev Gate run `29282410523` SUCCESS,
다음 한 걸음은 같은 dev SHA의 서비스·콘솔 이미지 배포다.

[사이클] 2026-07-14 05:36 KST / 서비스와 콘솔을 같은 `SOURCE_SHA`로 ECR에 빌드하고
독립 digest rollout·대칭 rollback을 연결했으며 console manifest의 `latest`를 fail-closed
zero-digest selector로 폐기 / 구현 `47916925c`, 계약 교정 `c0635b007` /
서버 Dev Gate run `29282934238` SUCCESS(1분 48초), 다음 한 걸음은 첫 배포 backup·baseline
사전조건이다.

[사람 게이트] 2026-07-14 05:36 KST / AWS CLI 세션 만료로 live DB catalog,
`alembic_version`, PostgreSQL volume snapshot, restore rehearsal, live `DEV_AUTH_BYPASS=0`을
실측할 수 없다. 필요한 주체는 AWS 접근 권한 보유 운영자이며 `aws login` 재인증, 격리된
versioned target의 이관 보고서, 완료된 encrypted snapshot과 복구 rehearsal, DBA 확인이
재개 조건이다. `AWS_DEV_DEPLOY_ENABLED`는 계속 OFF다.
