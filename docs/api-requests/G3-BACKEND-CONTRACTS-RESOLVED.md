# G3 백엔드 계약 확정본

상태: **resolved in code**

범위: OPSIA Master Spec §7.2b / CODEX-DIRECTIVE G3

확정일: 2026-07-19 KST

이 문서는 프론트엔드가 추측으로 채우면 안 되는 G3의 네 계약을 백엔드 응답 기준으로
확정한다. 예시 값은 스키마 설명용이며 라이브 수치가 아니다.

## 1. W4 기간별 활동 집계

`GET /activity/overview?from={epoch_ms}&to={epoch_ms}&bucket={milliseconds}`

- 인증: 세션 필수.
- 범위: `to - from`은 0초 초과, 최대 30일. 버킷은 최소 60초이며 최대 366개다.
- 집계: 서버가 PostgreSQL에서 배포·알림·critical 장애를 버킷별로 집계하고 빈
  버킷을 0으로 채운다. 브라우저가 raw timeline을 30일 집계하지 않는다.
- 권한: 배포는 `DEPLOYMENT_READ` 애플리케이션, 알림은 `INVENTORY_READ` 클러스터,
  장애는 `RCA_READ` 클러스터로 각각 제한한다. `RCA_READ`만 가진 클러스터가 알림
  집계에 섞이지 않으며 source 권한을 서로 확대하지 않는다.
- 캐시: `Cache-Control: no-store`.

```json
{
  "from_ms": 0,
  "to_ms": 86400000,
  "bucket_ms": 86400000,
  "buckets": [
    {
      "from_ms": 0,
      "to_ms": 86400000,
      "deployments": 0,
      "alerts": 0,
      "critical": 0
    }
  ]
}
```

구현 기준: `domains.activity.router`, `domains.activity.repository`,
`ActivityOverviewResponse`.

## 2. W5 inventory-summary 네임스페이스 분해

`GET /clusters/{cluster_id}/inventory/summary`

기존 `counts`와 `counts_evidence`는 유지한다. 새 `namespaces`는 live inventory의
네임스페이스별 제품 resource projection이며, `total`은 모든 `counts[].count`의 합과
항상 같다. `?namespaces=shop,system`을 주면 기존 summary와 동일한 namespace scope를
적용한다.

```json
{
  "namespaces": [
    {
      "namespace": "shop",
      "total": 2,
      "counts": [
        {
          "resource_type": "deployment",
          "health": "degraded",
          "count": 2
        }
      ]
    }
  ]
}
```

`resource_type`은 inventory의 기존 workload projection을 재사용한다. 따라서 raw
Kubernetes kind를 프론트에서 다시 분류하지 않는다.

namespace projection reader가 런타임 Database에 없으면 빈 배열을 정상값처럼 반환하지
않고 HTTP 503 `inventory namespace summary is unavailable`로 닫는다. cluster
`INVENTORY_READ` 거부와 잘못된 namespace scope는 어떤 count query보다 먼저 각각
403/422로 종료한다.

구현 기준: `InventoryRepository.inventory_namespace_resource_counts`,
`InventoryNamespaceSummary`, `InventorySummaryResponse.namespaces`.

## 3. D7 연결 진행 상태

SSE가 없는 현재 계약에서는 **서버가 주는 상태와 polling interval**만 사용한다.
프론트 고정 타이머로 단계나 완료를 진행시키지 않는다.

### 클러스터

`GET /clusters/{cluster_id}/connection-status`

단계는 다음 실데이터로 파생된다.

1. `awaiting_install`: 등록은 존재하나 현재 agent가 없다.
2. `agent_connected`: 현재 agent heartbeat가 있으나 현재 등록 epoch의 snapshot이 없다.
3. `snapshot_received`: 현재 agent snapshot은 있으나 snapshot 이후 heartbeat가 아직 없다.
4. `ready`: snapshot 이후 heartbeat까지 확인됨. terminal이며 polling을 중단한다.
5. `expired` 또는 `error`: terminal이며 polling을 중단한다.

비terminal 응답만 `refresh_after_seconds`를 제공한다. `ready`, `expired`, `error`는
`refresh_after_seconds: null`이다.

### 저장소

실제 위저드 요청은 다음 순서다.

1. `POST /repositories/discovery/probe`
2. `GET /repositories/discovery/branches`
3. `POST /repositories/discovery/manifests`
4. `POST /repositories/discovery/validate`
5. `POST /applications/connect`
6. `GET /repositories/connection-status?repo_ref={owner/repo}`

모든 `/repositories/discovery/*` 호출은 세션 외에도 하나 이상의 concrete target에
대한 `DEPLOY_RUN` 권한을 요구한다. private repository token은 첫 probe body의
write-only `token`으로만 받고 Pydantic 표현·JSON에서 redacted된다. probe 성공 뒤
workspace와 파생 repository ID에 한정된 credential scope로 즉시 암호화하며, 이후
branches/manifests/validate/connect는 그 암호문을 복호화해 재사용한다. token 원문과
credential 암호문은 어떤 응답에도 포함하지 않는다. 중복 관리자 전용
`/repos/validate|branches|manifests` endpoint는 제거됐다.

각 discovery/connect 응답 성공이 위저드의 실제 단계 전환 근거다. 마지막 polling
응답은 persisted repository 상태를 아래처럼 투영한다.

| repository_status | connection_stage | terminal | refresh_after_seconds |
|---|---|---:|---:|
| `unregistered` | `awaiting_validation` | `false` | `1` |
| `active` | `ready` | `true` | `null` |
| `invalid_credential`, `disabled`, `unknown` | `error` | `true` | `null` |

등록된 저장소의 상태 조회에는 기존 repository manage 권한을 그대로 적용한다.

## 4. 알림 event_id 멱등

새 타이머나 클라이언트 중복 제거에 의존하지 않는다.

- `alert_events.event_id`는 DB primary key다.
- 같은 규칙·대상의 active 알림은
  `uq_alert_events_active_subject(rule_id, subject_key) WHERE status IN
  ('firing', 'acked')`로 한 건만 허용한다.
- agent/Alertmanager evidence 재수신은 stable `evidence_key`를 사용한다.
- `record_evidence_event_once`는 `evidence_windows.evidence_key`에
  `ON CONFLICT DO NOTHING`을 적용하고, 충돌 시 기존 `event_id`와 `correlation_id`를
  반환한다.
- 충돌 경로는 새 event ledger나 outbox row를 만들지 않는다. event/outbox에도
  `event_id` conflict guard가 있다.
- Opsia rule의 최초 동시 activation은 active partial unique index를 conflict target으로
  사용해 `INSERT ... ON CONFLICT DO NOTHING`으로 경쟁한다. loser는 같은 트랜잭션에서
  winning active event를 다시 읽고 target state를 그 `event_id`로 upsert한다. 따라서
  occurrence count와 firing notification은 winner 한 번만 증가·발화한다.

## 검증 증거와 라이브 간극

- 계약 테스트:
  `test_activity_overview_contract.py`,
  `test_inventory_namespace_contract.py`,
  `test_connection_progress_contract.py`,
  `test_alert_event_idempotency_contract.py`.
- 기존 회귀:
  target registration, application router, inventory domain, Alertmanager webhook,
  alert event/rule evaluation 테스트와 함께 실행한다.
- 라이브 읽기 전용 확인은 2026-07-19에 시도했으나 로컬 AWS 세션 만료로 EKS API
  인증 전에 중단됐다. 재인증이나 배포 변경은 무감독 범위를 넓히므로 수행하지 않았다.
  따라서 이 커밋의 새 endpoint 응답은 배포 후 같은 source digest의 mTLS/API 실측을
  별도로 기록해야 한다.
