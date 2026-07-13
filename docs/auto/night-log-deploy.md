# AWS dev 배포 설정 로그

시크릿은 이름과 설정 여부만 기록한다. 값, 토큰, 액세스 키는 기록하지 않는다.

## 2026-07-14

- [06:00 KST] [설정] GitHub Environment `dev-deploy` 생성. custom deployment branch
  policy는 `dev` 한 개만 허용했다.
- [06:00 KST] [설정] IAM 역할 `opsia-dev-deploy` 생성. OIDC 신뢰 조건은
  `aud=sts.amazonaws.com`,
  `sub=repo:Jungle-303-04/final:environment:dev-deploy`의 `StringEquals`만 사용한다.
  ECR 권한은 `kubernetes-ops-service`와 `kubernetes-ops-console`, EKS 권한은
  `kubernetes-ops`, snapshot 생성 권한은 승인된 PostgreSQL·NATS 볼륨으로 제한했다.
  정책 시뮬레이션에서 승인 ECR/EKS 리소스는 `allowed`, 구 `kubeheal-service`와 다른
  EKS 클러스터는 `implicitDeny`였다.
- [06:00 KST] [설정] EKS `API_AND_CONFIG_MAP` 인증에서 역할 access entry를 생성했다.
  `AmazonEKSEditPolicy`는 `management` 네임스페이스로 제한하고, 첫 배포 backup
  검증기가 요구하는 cluster-scoped PV 조회는 `persistentvolumes/get` 한 동작만 가진
  `opsia-dev-deploy-pv-reader` RBAC 그룹으로 보완했다. ClusterAdmin은 사용하지 않았다.
- [06:01 KST] [설정] Environment 변수 5개(`AWS_DEV_REGION`,
  `AWS_DEV_ECR_REPOSITORY`, `AWS_DEV_CONSOLE_ECR_REPOSITORY`,
  `AWS_DEV_EKS_CLUSTER`, `AWS_DEV_BASE_URL`)와 역할·인증·smoke 시크릿 6개를 설정했다.
  `AWS_DEV_DEPLOY_ENABLED`는 설정하지 않았다. 인증 값은 Secrets Manager에서
  출력 없이 전달했다.
- [06:03 KST] [smoke fixture] default workspace의 등록 상태 `cluster-1`과 최신 RCA
  보고서 `63eddb6c-275b-48c3-9980-b52e19d7c918`을 correlation/incident fixture로
  선택했다. DB 실재 행과 cluster registration을 함께 조회한 결과다.
- [06:04 KST] [BLOCKED] 현재 live `c704729c1b`에는 새 strict RCA bundle API가 없어
  read smoke가 HTTP 404다. 백엔드 세션에 `dev-deploy` Environment 선언, digest 매니페스트,
  drift 감사, Alembic baseline/cutover와 함께 이관했다.
- [06:05 KST] [설정] 저장소 기본 브랜치를 실제 배포 트렁크인 `dev`로 맞췄다.
  기본 브랜치가 `main`일 때 404였던 `.github/workflows/dev-deploy.yml`이 Actions에서
  active workflow로 등록됐다.
- [06:08 KST] [게이트] `Dev Gate` run `29285055146`은 성공했다. 이어진 `Dev Deploy`
  run `29285201878`은 자동 배포 스위치가 없어서 의도대로 `skipped`됐다.
- [06:10 KST] [BLOCKED] PostgreSQL snapshot `snap-0bebb31ef7c909f9c`은 AWS 실측
  `pending` 72%다. `completed` 전에는 복구 볼륨을 만들지 않는다. 완료되면 임시 EBS
  볼륨과 임시 Pod에서 `workspaces`, `audit_log`, `outbox` row count를 검증하고 전부
  회수한다.
- [06:10 KST] [키 보존] 사람 지시에 따라 기존 키는 삭제·회전·교체하지 않았다.
  배포 작업에서도 키 값을 출력하거나 기록하지 않는다.
- [06:21 KST] [복구 리허설] `snap-0bebb31ef7c909f9c`이 `completed` 100%가 된 뒤
  `ap-northeast-2b`에 임시 EBS 볼륨을 복원했다. 첫 시도는 이미지 entrypoint를 우회해
  PostgreSQL이 root 실행을 거부했고, 두 번째 시도는 실제 DB role이 기본값 `postgres`가
  아니라 `service`여서 종료됐다. 두 시도 모두 Pod·PVC·PV·EBS 볼륨을 즉시 삭제했다.
  세 번째 시도는 live에서 읽은 `service/service`와 이미지 entrypoint를 사용했다.
  복원본은 `default_transaction_read_only=on`, `workspaces=1`, `audit_log=41490`,
  `outbox=13160`이었다. snapshot에 restore rehearsal·backup kind·PostgreSQL PVC 증거
  태그를 기록하고 임시 Pod·PVC·PV·EBS 볼륨을 모두 삭제했다. 운영 DB는 변경하지 않았다.
  최종 배포 SHA가 아직 이동 중이므로 `opsia:source-sha` 태그는 첫 수동 배포 대상 SHA를
  확정할 때 기록한다.
- [06:27 KST] [NATS 복구 리허설] `snap-0cd67361e50445185`에서 5GiB 임시 EBS
  볼륨을 복원하고 live와 같은 `nats:2.10-alpine`·JetStream 설정으로 기동했다.
  복원본 `/jsz`는 `streams=1`, `messages=44134`, `bytes=77025734`를 반환했다.
  snapshot에 restore rehearsal·backup kind·`data-nats-0` source PVC 증거 태그를
  기록한 뒤 임시 Pod·PVC·PV·EBS 볼륨을 모두 삭제했다. PostgreSQL snapshot의
  source PVC 태그도 정본 키 `opsia:source-pvc=data-postgresql-0`으로 확인했다.
- [06:27 KST] [BLOCKED] 첫 배포 전 live `DEV_AUTH_BYPASS` 미설정과 live에 없는
  desired worker의 rollback capture 거부가 남아 있다. 검증을 완화하지 않고 workflow
  내부의 명시적 `0` 주입과 existing workload digest 경계로 해소하도록 백엔드 세션에
  재요청했다.
