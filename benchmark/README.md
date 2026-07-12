# KubeHealBench v0.1

KubeHealBench는 실제 RCA cause/recovery 카탈로그에 고정된 정답 장애 시나리오다. v0.1은
클러스터 실행기가 아니라 정적 계약과 gold patch를 공개한다. 모든 파일은 표준 JSON이며
`python3 benchmark/score.py`만으로 외부 패키지 없이 검증할 수 있다.

## 시나리오 계약

`benchmark/scenarios/<category>/<id>/scenario.json`은 다음 필드를 모두 가져야 한다.

| 필드 | 의미 |
| --- | --- |
| `schema_version`, `id`, `category`, `title` | 버전과 안정적인 식별자 |
| `rule_id`, `symptom`, `expected_root_cause` | cause rule, rule의 symptom, 실제 candidate ID |
| `required_evidence` | candidate의 `source:name` evidence key 전체 목록 |
| `allowed_remediations` | recovery catalog가 허용하는 action, route, blast radius |
| `forbidden_remediations` | 절대 제안하면 안 되는 action과 `cluster`/`fleet` blast radius |
| `normal_manifest` | 장애 전 정상 Kubernetes 리소스 |
| `fault_injection_patch` | 정상 manifest에 장애를 만드는 merge patch |
| `expected_git_patch` | 원인 확정 후 사람이 승인할 gold merge patch |
| `rollback_patch` | gold patch를 되돌리는 merge patch |
| `normalization_predicate` | 복구 성공을 판정할 기계 판독 가능한 조건 목록 |

위 표의 마지막 아홉 의미 필드가 [D-013]의 9항목이다. `expected_root_cause`는 문자열 하나이며
Top-1 정답으로 사용한다. evidence는 source 존재만이 아니라 이름까지 일치해야 한다.

probe와 service-selector의 후보에는 현재 전용 recovery action이 없다. 이 경우 공식 recovery
fallback인 `manual_analysis`만 허용하며 `auto_apply`는 `false`다. gold patch는 운영자 검토가
끝났을 때의 정답이지 자동 실행 허가가 아니다.

## 검증

```bash
python3 benchmark/score.py
```

채점기는 `benchmark/catalog-snapshot.json`과 모든 시나리오를 읽어 필수 필드와 타입, 카테고리별
2~4개/전체 10~20개, rule/symptom/candidate/evidence의 정확한 일치, recovery action 일치,
금지 remediation의 위험 blast-radius 태그, Kubernetes 객체와 normalization 조건을 검사한다.
snapshot은 아래 원본을 2026-07-13에 실측한 공개 고정점이다.

- `src/services/ai/agent/causes/catalog/crashloop.yaml`
- `src/services/ai/agent/causes/catalog/image_pull.yaml`
- `src/services/ai/agent/causes/catalog/readiness.yaml`
- `src/services/ai/agent/recovery/builtin.py`

카탈로그가 바뀌면 snapshot과 해당 gold 정답을 함께 재검토해야 한다. scorer를 느슨하게 만들어
불일치를 숨기면 안 된다.

