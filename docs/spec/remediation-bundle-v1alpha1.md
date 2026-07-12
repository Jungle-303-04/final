# RemediationBundle v1alpha1 공개 규격

RemediationBundle은 저장된 RCA report와 선택적인 recovery plan을 하나의 읽기 전용 응답으로
투영한다. 이 문서는 착륙된 BQ-003 wire 계약을 설명하며 새 필드나 동작을 정의하지 않는다.
기계 판독 정본은 [`remediation-bundle.schema.json`](./remediation-bundle.schema.json)이다.

## 안정성 및 전송

- 규격 이름: `RemediationBundle v1alpha1`
- HTTP: `GET /rca/bundles/{correlation_id}`
- 응답: JSON, 최상위 `meta`, `diagnosis`, `remediation` 세 필드
- 객체는 strict schema다. 명시되지 않은 추가 필드는 허용하지 않는다.
- payload에 별도 `apiVersion` 또는 `kind` 필드는 없다. `v1alpha1`은 이 공개 문서의 규격
  버전이며 기존 wire schema에 필드를 추가하지 않는다.

요청자는 로그인 세션, 같은 workspace, report가 가리키는 cluster의 `rca:read` 권한을 모두
가져야 한다. report 부재, workspace 불일치, cluster 식별자 부재, cluster 권한 거부는 모두
`404 Remediation bundle not found`로 수렴해 리소스 존재 여부를 누출하지 않는다.

## 최상위 구조

| 필드 | 타입 | 필수 | 의미 |
| --- | --- | --- | --- |
| `meta` | object | 예 | incident와 tenant 상관관계 |
| `diagnosis` | object | 예 | RCA 결과와 사용/결손 evidence |
| `remediation` | object 또는 null | 예 | recovery plan 투영; plan이 없으면 null |

### `meta`

| 필드 | 타입 | null 허용 | 의미 |
| --- | --- | --- | --- |
| `correlation_id` | string | 아니요 | report와 plan을 연결하는 ID |
| `incident_id` | string | 예 | 연결된 incident ID |
| `cluster_id` | string | 아니요 | 권한 확인과 대상 식별에 쓰는 cluster ID |
| `workspace_id` | string | 아니요 | tenant workspace ID |
| `created_at` | string | 예 | report 생성 시각 |

### `diagnosis`

| 필드 | 타입 | null 허용 | 의미 |
| --- | --- | --- | --- |
| `root_cause` | string | 아니요 | 보고용 원인 설명 |
| `confidence` | number | 예 | RCA 신뢰도 |
| `supporting_evidence` | array[string] | 아니요 | 기존 요약 evidence |
| `missing_evidence` | array[string] | 아니요 | 기존 결손 evidence 요약 |
| `supporting_evidence_refs` | array[object] | 아니요 | 구조화된 evidence provenance |
| `missing_evidence_checks` | array[object] | 아니요 | 미충족 수집 check |
| `selected_candidate_id` | string | 예 | cause catalog candidate ID |

`supporting_evidence_refs` 항목은 `source`, `name`이 필수다. `check_id`, `summary`, `query`,
`evidence_ref`, `schema_version`, `source_version`, `collector`, `collector_version`,
`query_version`, `collected_at`, `evidence_key`, `source_id`, `agent_id`, `window_start`는 각각
null 가능한 provenance 필드다.

`missing_evidence_checks` 항목은 `check_id`가 필수이며 `source`, `status`, `reason`은 null 가능하다.

### `remediation`

Recovery plan이 없으면 `null`이다. 존재하면 다음 필드가 모두 필수다.

| 필드 | 타입 | null 허용 | 의미 |
| --- | --- | --- | --- |
| `status` | string | 아니요 | plan 상태 |
| `selected_action_id` | string | 예 | 선택된 candidate action ID |
| `selected_by` | string | 예 | 선택 주체 |
| `candidates` | array[object] | 아니요 | 순위가 매겨진 recovery 후보 |
| `evidence_ref` | string | 아니요 | plan이 참조한 evidence ID |

각 candidate는 `action_id`, `title`, `description`, `draft`, `route`, `rank`, `score`,
`risk_level`, `blast_radius`, `approval_required`, `prerequisites`, `validation_checks`,
`rollback_plan`, `evidence_refs`를 모두 가진다. `draft`는 아래 필드를 모두 가진 strict object다.

| draft 필드 | 타입 | 의미 |
| --- | --- | --- |
| `action_type` | string | 실행/patch action 종류 |
| `namespace` | string | 대상 namespace |
| `resource_kind` | string | 대상 Kubernetes kind |
| `resource_name` | string | 대상 리소스 이름 |
| `reason` | string | 제안 근거 |
| `risk_level` | string | 위험도 |
| `dry_run` | boolean | dry-run 여부 |
| `source_evidence` | array[string] | action을 뒷받침하는 evidence |
| `params` | object | action별 parameter |

## 예시

```json
{
  "meta": {
    "correlation_id": "corr-01",
    "incident_id": "inc-01",
    "cluster_id": "cluster-01",
    "workspace_id": "workspace-01",
    "created_at": "2026-07-13T00:00:00Z"
  },
  "diagnosis": {
    "root_cause": "Container exceeded its memory limit",
    "confidence": 0.94,
    "supporting_evidence": ["terminated_reason=OOMKilled"],
    "missing_evidence": [],
    "supporting_evidence_refs": [
      {"source": "kubernetes", "name": "cluster_resource_state", "evidence_ref": "ev-01"}
    ],
    "missing_evidence_checks": [],
    "selected_candidate_id": "oom_killed"
  },
  "remediation": null
}
```

## 생산자·소비자 규칙

- 생산자는 최신 report 하나와 동일 correlation/workspace의 recovery plan을 저장 없이 조합한다.
- `cluster_id`, recovery `status`, recovery `evidence_ref`는 비어 있으면 serialization 오류다.
- 소비자는 `remediation: null`을 정상적인 “아직 recovery plan 없음” 상태로 처리해야 한다.
- `route`, `risk_level`, `blast_radius`, `approval_required`, rollback/evidence 필드는 안전 경계이므로
  action 표시나 실행 전에 보존해야 한다.
- alpha 규격의 호환성 판단은 JSON Schema를 기준으로 한다. 필드 제거·타입 변경·필수성 변경은
  새 규격 버전 없이 허용되지 않는다.
