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

[배포 설정 문서 착륙] 2026-07-14 06:16 KST / OIDC subject를
`repo:Jungle-303-04/final:environment:dev-deploy`로 고정하고 PostgreSQL·NATS 이중 EBS
snapshot의 state·암호화·live volume·source SHA·PVC·복구 리허설·24시간 경계를 검증했다.
service와 console manifest는 실측 ECR digest로 고정했고 legacy ECR 이름과 `latest`를 배포
경로에서 제거했다. 전 workload image/env/replicas/resources 감사와 사람 실행 런북은
`docs/auto/deploy-drift-audit.md`, `docs/auto/deploy-setup.md`에 있다. 구현 SHA
`3c27b9edd8127fd5af646e237dea3973b50e69ba`는 canonical `df48d5fb6`의 ancestor exit 0이며,
Dev Gate run `29285547280`은 SUCCESS(1분 54초)다.

[BLOCKED] 2026-07-14 06:16 KST / `AWS_DEV_DEPLOY_ENABLED`는 OFF를 유지한다. PostgreSQL
snapshot `snap-0bebb31ef7c909f9c`은 마지막 실측에서 `pending` 72%이고 NATS snapshot과 두
restore 리허설이 남았다. 또한 unversioned create-all DB의 data-only blue/green cutover와
live에 없는 `auto-revert-worker`·`change-correlation-worker`, live-only `cluster-agent`를
다루는 rollback plan이 첫 수동 배포 전 필요하다.

[사이클] 2026-07-14 06:48 KST / pre-deploy smoke를 legacy-safe health·frontend·DB 연결로
제한하고 post-deploy에서만 login·strict RCA Bundle·Alembic head·digest를 검증한다. 첫 수동
배포는 live에 존재하는 관리 workload만 대상으로 삼고 `cluster-agent`는 보존하며, 기존
`api-gateway`에 `DEV_AUTH_BYPASS=0`을 주입·rollout·live 검증한다. 구현은 canonical
`6d5e941516f8a8375b09969bfabe6c0c49c74b3b`의 ancestor이고 Dev Gate run `29286627642`가
SUCCESS다.

[사이클] 2026-07-14 06:48 KST / unversioned source를 직접 stamp하지 않고 run attempt별 격리
DB bootstrap → 모든 runtime secret 소비자와 live-only `cluster-agent`·`pgbouncer` replica
동결 → data-only copy → notify URL·PgBouncer mapping 전환 → image rollout → 원 replica 복원을
배선했다. 실패 handler는 한 복구 명령이 실패해도 source routing·이전 digest·원 replica 복구를
끝까지 시도한다. live에만 남은 `workspace_members` 1행과 `resource_access_grants` 0행은 역할
의미를 추정하지 않고 revision `20260714_0345`의 migration-only table로 원형 보존한다. 구현
`0fc520285`, canonical `3af9fe9a449d5157d203dfe049b1578861b039c6`, 집중 검증 54 passed,
Dev Gate run `29287592346` SUCCESS(1분 47초)다.

[BLOCKED] 2026-07-14 06:48 KST / PostgreSQL·NATS snapshot과 restore rehearsal은 완료됐지만,
새 head `20260714_0345`를 사용한 snapshot clone의 62-table data-only copy가 row count·checksum·
FK·sequence·catalog까지 통과했다는 실환경 증거는 아직 없다. 배포 설정 세션의 clone 재실증이
재개 조건이며 그 전에는 `FIRST_DEPLOY`와 `AWS_DEV_DEPLOY_ENABLED=1`을 실행하지 않는다.
