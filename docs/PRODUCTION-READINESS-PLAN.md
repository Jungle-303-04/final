# 프로덕션 준비 계획 — 인프라·인증·백엔드 구조 (무중단 원칙)

> 지위: `HANDOVER.md` §10 "남은 구조적 과제"를 **현재 라이브 구현 실측에 맞춘 실행 계획**으로 전개한 문서.
> 충돌 시 HANDOVER §1 절대 불변 조건이 우선한다. 프론트 경험 계획은 범위 밖(`frontend/OPSIA-MASTER-SPEC.md`).
> 작성 기준 실측(2026-07-19): management 43 Deployment 46/46 Ready · STS `postgresql/nats/minio` 각 1 replica ·
> `pgbouncer` 존재 · `deploy/management/migration-job.yaml` 존재 · Alembic revision 43개 ·
> `.github/workflows`에 `dev-gate.yml`/`dev-deploy.yml`/`release-flow-*` 존재(Actions 예산 0으로 실행 불가) ·
> 라이브 digest `4618d644…` = 소스 `4d7da88e`.

## 0. 무중단 대원칙 (모든 단계 공통)

1. **4박자 규칙**: 추가(additive) → 검증(verify) → 전환(cutover) → 정리(cleanup). 파괴적 변경을 전환 전에 하지 않는다.
2. **단계별 게이트**(HANDOVER §11 절차 재사용): 백엔드 게이트+Bruno 전체 통과 → 배포 후 5분 관찰에서 DLQ 0 · outbox 미발행 0 · agent warning 신규 0 · open incident 무증가 → 라이브 digest와 소스 commit 일치 기록.
3. **단계별 롤백 정의 필수**: 이전 매니페스트/이미지 digest로 되돌리는 명령을 단계 문서에 함께 적는다. 롤백 불가능한 단계(데이터 이전 컷오버)는 사전 리허설 1회를 게이트로 한다.
4. management 관측 전용·agent token hash·mTLS 경계(§1)는 어떤 단계에서도 완화하지 않는다.

## 1. IN-1 CI/CD 복구 — "커밋→검증→배포"를 예산 제약 안에서

**현재 구현**: 파이프라인 코드는 이미 있다 — `dev-gate.yml`(검증)·`dev-deploy.yml`(배포)·`release-flow-production-gate/smoke`(manual/reusable). 문제는 실행 환경뿐(조직 Actions 예산 0, `prevent_further_usage=true`). 배포는 검증된 수동 경로.

**계획 (기존 워크플로 재사용 — 재작성 금지)**:
- IN-1a *단기*: **AWS CodeBuild를 정식 러너로 승격**. `buildspec-gate.yml`/`buildspec-deploy.yml`을 저장소에 추가하되 내용은 기존 `dev-gate`/`dev-deploy`의 스텝을 호출하는 래퍼로 한정(로직 이중화 금지 — 스크립트는 `scripts/`로 추출해 양쪽이 같은 것을 실행). GitHub webhook→CodeBuild 트리거, ECR push 권한은 기존 `infra/ecr.tf`의 role에 최소 추가.
- IN-1b *중기*: Actions 예산 복구 시 워크플로 재활성화(`disabled_manually` 해제만 — 파일 수정 불요). CodeBuild는 비상 경로로 강등해 유지.
- IN-1c **배포 계약**: 모든 배포는 태그가 아니라 **digest 핀**으로. `dev-deploy`는 게이트 통과 커밋의 digest만 배포하고, HANDOVER의 "완료 정의"(테스트·계약·라이브·E2E가 같은 digest)를 파이프라인 산출물로 자동 기록.
- **게이트**: 파이프라인이 만든 배포 1회가 §0-2를 통과. **롤백**: 수동 경로(§8 운영 절차) 존치.

## 2. IN-2 IaC 완결 — 수동 리소스의 Terraform 흡수 (무변경 import)

**현재 구현**: `infra/`에 VPC·EKS·ECR. agent-api의 ACM/ELB/DNS와 Cloudflare 터널 라우팅은 수동.

**계획**: 리소스를 **재생성하지 않고 `terraform import`로 상태만 흡수**(트래픽 무영향). 순서: ACM 인증서 → ELB/리스너 → Route53/Cloudflare 레코드 → cloudflared 터널 설정의 선언화(`cloudflare-route-reconcile.yml`이 이미 있으므로 그 소스 오브 트루스를 tf 변수로 통일). plan 결과 "no changes"가 될 때까지 코드가 현실을 따라간다(현실을 코드에 맞추지 않는다).
- **게이트**: `terraform plan` 무변경 + agent WebSocket 재연결 무증가. **롤백**: import는 상태 조작뿐이라 `state rm`으로 원복.

## 3. IN-3 HA — 죽어도 되는 것부터, 데이터는 마지막

의존 순서(역순 금지): ③-1 NATS → ③-2 realtime-gateway → ③-3 PostgreSQL → ③-4 Redis 계열 → ③-5 NetworkPolicy/HPA.

- **③-1 NATS 1→3노드, 스트림 R1→R3**: 현재 STS 1 replica + JetStream. outbox relay가 재발행 내구성을 이미 제공하므로(§5 완료 변경) 안전창이 있다. 단계: STS replicas 3(additive) → 클러스터 라우트 검증 → 스트림별 `nats stream update --replicas 3`(claim-check로 페이로드가 작아진 것이 여기서 이득) → consumer 재확인. **롤백**: 스트림 R3→R1 다운그레이드 가능.
- **③-2 realtime-gateway 2+ replicas**: HANDOVER §10-5의 선행조건 그대로 — **shared backplane + sequence 소유권 먼저**. 설계: 브라우저/agent 스트림 sequence의 소유권을 NATS KV lease(TTL)로 이전, 게이트웨이는 stateless 구독자화. 그 후 replicas 2 + PDB + topology spread(agent-api-proxy에 이미 쓰는 패턴 복제).
- **③-3 PostgreSQL Multi-AZ**: 현재 in-cluster STS 1 + PgBouncer. 두 경로 중 결정: (A) RDS Multi-AZ 이전(운영 부담↓, 비용↑) / (B) in-cluster CloudNativePG 3-replica(비용↓, 운영↑). **권고 A** — 이전 절차: RDS 생성(tf) → 논리 복제/스냅샷 동기 → 리허설 1회(스테이징 게이트) → 컷오버 창: janitor·polling 정지 → outbox drain 확인(미발행 0) → PgBouncer 타깃 전환(앱 재시작 불필요 — 이 순간이 PgBouncer의 존재 이유) → `DATABASE_STARTUP_MODE=verify` 재기동 검증 → 구 STS는 7일 보존 후 제거. **롤백**: PgBouncer 타깃 원복.
- **③-4 Redis 계열 failover**: 현 배치 실측 후(단일 Deployment로 추정) ElastiCache 또는 Sentinel 구성 — PgBouncer와 동일한 "프록시 뒤 교체" 패턴 적용.
- **③-5 NetworkPolicy + KEDA**: default-deny + 서비스별 허용(관측 전용 경계를 정책으로도 명문화 — RBAC와 이중 방어), 워커는 NATS consumer lag 기반 KEDA 스케일. 전부 additive.

## 4. IN-4 인증 프로덕션 전환

**현재 구현**: `APP_ENV` 분기는 `src/packages/storage/database.py` 등 한정 지점, 개발 콘솔은 Cloudflare mTLS+내부 프록시 비밀값 이중 통과, 일반 콘솔은 내부 헤더 제거(§1-3). 회원가입/이메일 인증/승인 플로는 코드 존재·프로덕션 모드 E2E 미완.

**계획**: ① bypass 인벤토리 작성(`APP_ENV`·테스트 우회 grep 전수 — 각 지점에 "프로덕션에서 죽는 경로"인지 표기) ② 스테이징에서 `APP_ENV=production` 리허설: 회원가입→이메일(SES를 IN-2 tf에 추가)→관리자 승인→로그인→워크스페이스 진입 Playwright E2E를 **실브라우저 증거**로 ③ 시드: 최초 관리자 계정 부트스트랩 Job(1회성, 기존 `admin-bootstrap-job.yaml` 확장) ④ 컷오버: 일반 콘솔만 production 모드, mTLS 개발 콘솔은 별도 진입으로 존치(§1-3 유지). **게이트**: E2E 녹화+digest 기록. **롤백**: env 원복(코드 변경 없는 전환이 되도록 ①에서 플래그화).

## 5. BE-1 Alembic revision 기반 마이그레이션 (create_all 퇴역)

**현재 구현**: 이미 절반 완료 — revision 43개, `migration-job.yaml` 존재, 앱은 `DATABASE_STARTUP_MODE=verify`로 DDL을 안 한다. 남은 것은 bootstrap Job의 `create_all`/호환 DDL.

**계획(4박자)**: ① 라이브 DB에 `alembic stamp` 정합 확인(현 스키마=head인지 diff — `alembic check`) ② bootstrap Job의 커맨드를 `alembic upgrade head`로 교체(additive — create_all 코드는 아직 유지) ③ 배포 1사이클을 revision 경로로 통과 ④ create_all 경로 삭제 + 앱 verify에 **revision 일치 검증** 추가(HANDOVER §10-1 후속 요구). **롤백**: Job 매니페스트 원복. **주의**: 다운 revision은 작성하지 않는 정책이면 forward-fix 원칙을 문서화.

## 6. BE-2 외부 I/O 핸들러의 effect-intent 분리

**현재 구현**: outbox·claim-check·우선순위 큐는 완료. 남은 것: 외부 I/O(GitHub API, AI 호출, 알림 발송, K8s API)를 긴 DB TX 안에서 하는 핸들러.

**계획**: ① 대상 핸들러 인벤토리(외부 호출이 TX 내부에 있는 consumer 전수 — `ai-*`, `github-poll`, `alert`, `auto-revert` 워커 우선) ② 공통 기반: `effect_claims` 테이블 + `(consumer, event_id, target)` unique(§10-2 명세 그대로) ③ 패턴: 짧은 claim TX(행 선점) → 외부 I/O(TX 밖) → 짧은 result TX(비즈니스 반영+outbox+ledger) ④ 핸들러별 점진 전환 — 이벤트 계약 불변이므로 롤링 혼재 안전, 워커 단위 커밋·배포 ⑤ 각 전환마다 중복 실행 시나리오 테스트(claim unique가 멱등을 보장하는지). **게이트**: 전환 워커의 재시도 폭주/중복 부작용 0 관찰.

## 7. BE-3 이벤트 버저닝 완성

**현재 구현**: envelope `schema_version` + additive-field tolerant dispatch까지. consumer는 구형 inline/신형 reference payload 동시 수용(혼재 내성의 선례 존재).

**계획**: ① payload에 `payload_version` additive 도입(생산자부터 — 소비자는 무시해도 동작) ② upcaster 레지스트리: 소비 직전에 구버전→현행 변환 함수 체인, 이벤트 타입별 등록 ③ **골든 호환성 픽스처**: 라이브에서 실제 발행된 각 이벤트 타입의 payload 스냅샷을 버전별 고정 파일로 저장하고, CI 게이트(IN-1)에서 "모든 골든 픽스처가 현행 consumer로 처리됨"을 상시 검증 ④ 계약: 필드 삭제·의미 변경은 반드시 version 증가+upcaster 동반(리뷰 체크리스트에 추가). **이것이 완료되어야 ③-1/③-3의 롤링 혼재가 계약으로 보호된다.**

## 8. 실행 순서와 의존 (한 줄 로드맵 — 2026-07-19 우선순위 확정)

**결정: 프론트 경험 병합이 전체 1순위다**(사용자 확정 — 프론트 소스 3계보가 병합되지 않은 것이 최대 체감 갭). **IN-4 인증 전환은 임시 보류**(로그인 제외 결정 — 보류일 뿐 삭제 아님, 인프라 안정 후 재개).

```
[1순위·FE 트랙] frontend/OPSIA-MASTER-SPEC.md P0~P6  ← 코덱스 즉시 착수 (아래 §8b)
[병행·BE 트랙] IN-1a CodeBuild ─┬─▶ BE-1 Alembic ─▶ BE-3 버저닝 ─▶ ③-1 NATS R3 ─▶ ③-2 rt-gateway 2rep
                                ├─▶ BE-2 effect-intent (워커 단위)
               IN-2 IaC import ─┴─▶ ③-3 PostgreSQL Multi-AZ ─▶ ③-4 Redis ─▶ ③-5 NetPol/KEDA
[보류] IN-4 인증 전환 — 재개 조건: FE P5 완료 + ③-3 완료
```

### 8b. FE 트랙 — 프론트 소스 3계보 단일화 (실측)

| 계보 | 위치 | 판정 |
|---|---|---|
| 제품 `/` | dev `frontend/src`(13 서피스, 실 API) | **유일한 미래** — OPSIA-MASTER-SPEC의 그릇 |
| 데모 `devpreview-*` | demo 브랜치(더미 데이터, 판매 품질 시각) | 사양 원본 — `demo-freeze-v1` 태그로 동결, P6에서 은퇴 |
| `/console/` | 배포 아카이브(소스 트리에 없음 실측 확인) | 보존 전용 — 소스로 되돌리지 않음(HANDOVER §1-5) |

실행: 코덱스는 **OPSIA-MASTER-SPEC 7장 P0~P6을 순서대로**, 페이즈=커밋 단위, 각 페이즈 게이트(tsc·check:design·i18n·vitest)+8.2 판매 품질 스윕. 현재 코덱스가 진행 중인 `ResourceDetailSheet`/`ResourceManifestEditor` 수정은 P4(상세 축) 소속이므로 **P0~P2(토큰·공용 부품)를 먼저 닫고 그 위에서 계속**할 것 — 부품 없이 표면부터 칠하면 재작업이 된다.

## 9. 완료 정의
HANDOVER §11의 문장을 그대로 상속한다 — 자동 테스트, API 계약, 라이브 상태, 로그, 실브라우저 E2E 증거가 **같은 commit/digest**를 가리킬 때만 각 단계를 닫는다. "버그 0" 선언으로 대신하지 않는다.
