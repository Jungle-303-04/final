# 프로덕션 준비 점검

이벤트 프레임워크의 설계·추상화는 프로덕션급(멱등 ledger·DLQ·retry·graceful
shutdown·구조적 로깅·수평 확장). 아래는 "진짜 프로덕션 규모"에서 보강이 필요한
운영 항목과 결정 사항이다. 우선순위는 P0(차단)→P2(편의).

## 구현 상태

- [x] P0 워커 liveness 하트비트 + exec probe(9개 워커).
- [x] P0 async DB(워커 핸들러 경로): `AsyncDb` 프록시로 sync 메서드를 스레드풀에
  보내고, 핸들러는 `await ctx.db.x(...)`로 통일. 남은 sync 경로(ledger·api-gateway
  라우트)는 실DB smoke 테스트(`make up`) 후 단계적으로.
- [ ] P0 실운영 자동 변경 하드닝: repo checkout/cache, 승인 스냅샷, 실제 manifest
  patch PR, approval evidence, TokenVault, action allowlist. 상세 기준은
  [hardening-roadmap](hardening-roadmap.md)을 따른다.
- [ ] P1 AI/tool guardrail과 control-plane observability: function-calling 수준 schema,
  tool 권한, 비용 한도, DLQ/lag/outbox/trace metrics.
- [ ] P1 KEDA · P2 타입 db · 나중(마이그레이션·스키마버전·메트릭).

## P0 — 실운영 자동 변경 차단 조건

현재 코드는 event runtime과 GitHub PR 생성 경계를 갖고 있지만, production 자동 변경을
말하려면 아래 항목이 모두 닫혀야 한다.

| 항목 | 현재 위험 | 차단 해제 기준 |
| --- | --- | --- |
| 실제 repo source | local-file/dev fallback과 GitHub contents 경로가 섞여 있다. | production route는 commit_sha, repo_ref, artifact digest가 있는 source만 허용한다. |
| 승인 스냅샷 | diff-worker가 previous-approved snapshot demo fallback을 쓴다. | approval_id/policy_id/commit_sha와 연결된 last-approved managed-field snapshot을 저장한다. |
| 정책 route | risk string과 namespace 중심이다. | operation, namespace, resource class, environment, approval state로 `safe_pr`/`approval_required`/`forbidden`/`command`를 결정한다. |
| Safe PR 내용 | GitHub PR 경계는 있지만 실제 manifest patch가 아니라 검토 문서 중심이다. | PR diff에 실제 manifest patch 또는 rollback patch가 포함된다. |
| Agent 실행 | agent action allowlist가 workspace/repo/cluster 정책과 승인 근거까지 확장되지 않았다. | command와 agent가 같은 action catalog, approval_ref, policy_decision_ref를 검증한다. |
| Credential | credential/token broker가 placeholder다. | TokenVault/SecretVault port, token rotation, missing scope, non-leak 테스트가 있다. |
| 부분 실패 | stdout/stderr/status와 per-resource partial failure 보고가 약하다. | sanitized stdout/stderr, retryable flag, applied flag, resource별 result가 command result에 남는다. |

## P0 — 워커 liveness probe (exec 하트비트)

문제: 워커는 HTTP 없는 NATS pull consumer라 k8s가 상태를 물어볼 곳이 없다.
멈춰도(NATS 연결 끊김·데드락·fetch 정지) 감지·재시작이 안 되고 이벤트만 쌓인다.

결정: **HTTP `/healthz`를 워커에 열지 않는다**(게이트웨이 단일 원칙 유지 +
포트/보안 표면 최소화). 대신 **하트비트 파일 + `exec` probe**를 쓴다.

- 워커는 처리 루프마다 `/tmp/heartbeat`의 mtime을 갱신한다.
- liveness는 `exec`로 파일 신선도만 검사한다(예: 30초 내 갱신 없으면 실패).

```yaml
livenessProbe:
  exec:
    command:
      - python
      - -c
      - "import sys,time,os; sys.exit(0 if time.time()-os.path.getmtime('/tmp/heartbeat')<30 else 1)"
  periodSeconds: 10
  failureThreshold: 3
```

보안: probe는 kubelet→pod 내부 점검이다. Service/Ingress에 노출되지 않으므로
인터서비스 API 표면이 아니다. exec 방식은 포트 자체가 없어 노출이 0이다.
워커는 트래픽을 받지 않으므로 readiness보다 liveness가 핵심.

## P0 — async 루프 속 sync DB

문제: 핸들러는 async인데 대부분 `ctx.db.save_*`가 sync(`create_engine`)로
이벤트 루프에서 바로 호출 → 부하 시 루프 블로킹. command-worker만 `await`라
일관성도 깨진다.

결정: **대량 처리 기준이면 async 일원화**(`async_engine`은 이미 있음 →
`ctx.db` 메서드를 async로). `to_thread` 감싸기는 "당장 루프 안 막기" 임시방편.

| | `to_thread` | async 일원화 |
| --- | --- | --- |
| 작업량 | 작음 | 큼 |
| 동시성 | 스레드 수(~40) | 루프에서 수천 동시 I/O |
| 비용 | 스레드 오버헤드 | 없음 |

진짜 처리량은 async DB + fetch 배치 확대 + 워커 수평 확장(아래 KEDA)이 함께 가야
산다.

## P1 — KEDA 오토스케일 (배포 시점, 계획)

문제: `durable=service_name`으로 복제본이 일을 나눠 갖지만, 복제본 수를 부하에
따라 자동 조절하는 장치가 없다(수동).

결정: **KEDA로 NATS 스트림 적체(pending) 기반 오토스케일**(ScaledObject).
이벤트 워커의 부하 신호는 CPU가 아니라 대기 이벤트 수다. 적체가 쌓이면 pod를
늘리고, 빠지면 줄인다(놀면 0까지). 코드가 아닌 deploy 영역이라 배포 시 추가한다.

## P2 — 타입 있는 `ctx.db`

문제: `ctx.db: Any` → 워커가 타입 없는 DB 전체를 받는다. 오타를 타입체커가 못
잡고, 자동완성이 없고, 서비스별 능력 경계가 없다(rca 워커가 DLQ 조회도 호출 가능).

결정: 서비스별 `Protocol` port(예: rca는 `RcaStore`)로 `ctx.db`를 좁히거나
`EventContext[DbT]`로 제네릭화. 자동완성·오타 차단·책임 경계 확보.

## 나중 (마이그레이션과 함께)

- **DB 마이그레이션**: 현재 `db.init()`이 테이블을 직접 생성. Alembic 도입 시
  스키마 진화를 버전 관리.
- **이벤트 스키마 버전**: `EventEnvelope`에 `version` 필드 없음. 계약 진화
  (필드 추가/삭제)에 버전 + 호환 정책 필요. 위 마이그레이션과 함께 추가.
- **메트릭·트레이싱**: 현재 구조적 로그만. Prometheus(처리량·DLQ율·지연·lag) +
  OTel 트레이싱(`correlation_id` 연결)은 추후.
