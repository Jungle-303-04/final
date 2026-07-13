# OpsiaBench v0.1

OpsiaBench는 실제 RCA cause/recovery 카탈로그에 고정된 정답 장애 시나리오다. v0.1은
클러스터 실행기가 아니라 정적 계약과 gold patch를 공개한다. 모든 파일은 표준 JSON이며
`python3 benchmark/score.py`만으로 외부 패키지 없이 검증할 수 있다.
기존 소비자 호환을 위해 scenario의 안정적인 `schema_version`은 `kubehealbench/v0.1`을
유지한다. 공개 제품명 변경과 저장 계약 변경을 섞지 않는다.

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

probe path/port/timeout과 service `selector_label_mismatch`는 각각 catalog의 `probe_fix`,
`selector_fix`만 허용한다. `node_selector_mismatch`, `pvc_not_bound`, `pods_not_ready`처럼
전용 recovery action이 없는 후보는 공식 fallback인
`manual_analysis`만 허용하며 `auto_apply`는 `false`다. gold patch는 운영자 검토가 끝났을
때의 정답이지 실행 허가가 아니다.

## 후보 안전 계약

`candidate-contract-index.json`은 cause catalog 15개 파일의 SHA-256과 실제 loader 순서
(파일 경로 → YAML rule → candidate)에 따른 87개 후보를 고정한다. 각 index 항목은
`required_evidence`와 실제 `supporting_signals` predicate까지 보존한다. CI 테스트는 PyYAML로
live YAML을 다시 읽어 index 전체와 대조하지만, 공개 채점기는 index와 source hash를 사용하므로
site-packages 없이 실행된다.

`candidate-contracts.json`은 index 앞에서부터 완결된 10개 단위 배치를 누적한다. 현재 범위는
1~87번 전체이며 마지막 81~87번은 7개 terminal 배치다. 전체 loader 순서를 완결했으므로
`next_ordinal`은 `null`이다. 후보 계약은 다음 경계를 분리한다.

- `required_evidence`: 수집돼야 하는 `source:name` key. 이것만으로 후보가 지지됐다는 뜻은 아니다.
- `supporting_signals`: 근거 내용에서 모두 충족돼야 하는 catalog signal group.
- `contradicting_signals`, `contradiction_policy`: 현재 runtime에 반증 모델이 없음을 빈 배열과
  `not_modeled_v0.1`로 명시한다. 반증이 없다고 추정하지 않는다.
- `missing_evidence_policy`: required evidence 또는 signal group이 빠지면 RCA completion을 막는
  현행 `all_required_evidence_and_supporting_signal_groups` 정책.
- `patch_capabilities`: route 이름이 아니라 실제 command alias와 Safe PR patch allowlist로
  계산한 실행 가능 범위. 예를 들어 `config_fix`는 `draft_pr` route를 선언하지만 현재 dispatcher가
  patch를 지원하지 않아 capability가 비어 있다.
- `allowed_remediations`: live recovery와 fallback의 route, 승인, blast radius, rollback,
  post-verification 원문.
- `forbidden_remediations`: 후보 범위를 넘어서는 cluster/fleet 조치와 차단 이유.
- `benchmark_fixtures`: 같은 rule/candidate를 검증하는 정식 scenario. 빈 배열은 해당 후보의
  공개 coverage gap이며 가짜 fixture로 채우지 않는다.

완료된 10개 단위 배치는 canonical JSON SHA-256을 scorer에 고정한다. 새 배치를 추가하면서
기존 계약의 fixture·금지 조치·정책 주석을 조용히 바꾸면 digest 검증이 실패한다. 복수 fallback
recovery 선언은 소스 선언 순서대로 모두 누적한다.

87개 후보의 안전 계약은 모두 완결됐다. 계약 완성은 recovery나 fixture coverage가 모두 구현됐다는
뜻이 아니다. 7번 `app_port_bind_failed`는 한 프로세스가 같은 실제 포트를 두 번 bind해
`address already in use` 신호와 CrashLoopBackOff를 만드는 exact fixture를 연결한다. 임의 가용
포트로 같은 명령을 실행하는 테스트가 외부 인프라 없이 실패 로그와 exit code 1을 검증한다.
실제 patch capability는 비어 있으므로 허용 경로는 승인형 `manual_analysis`뿐이고, gold patch는
운영자 검토용 정답이지 Safe PR 실행 가능성의 주장이 아니다. 11~20번은 모두 명시 recovery가 없는
`manual_analysis` fallback이며 실제 patch
capability와 기존 exact fixture도 없다. 21~30번 중
25번 `wrong_image_tag`만 `safe_pr` capability가 있고, 26번 `missing_image_pull_secret`과 27번
`registry_unavailable`은 승인형 recovery만 있어 capability가 비어 있다. 기존 exact fixture는
25번과 26번에만 연결한다. 31~40번 중 36번 `upstream_unavailable`과 37번
`backend_readiness_failure`는 실제 command alias와 교차해 `command` capability가 있고, 38번
`application_5xx_spike`는 command와 Safe PR 양쪽을 지원한다. 31~40번에 exact fixture는 없다.
41~49번은 `manual_analysis` fallback-only이고, 50번 `probe_path_wrong`만 `safe_pr` capability와
exact probe fixture를 가진다. 51·52·55번도 `safe_pr` capability가 있고, exact fixture는
51·52·53·55·56번에 연결한다. 53번 `startup_window_too_short`는 recovery가 `probe_fix`를
선언하지만 현재 producer가 readiness/liveness replacement만 생성하므로 patch capability는 비어
있고 scenario도 `manual_analysis` 승인 경로만 허용한다. 52번 timeout과 53번 startup window
fixture 추가는 각각 여섯 번째 batch 전체를 재감사하고 canonical digest를 갱신한 명시적 coverage
보강이다. startup fixture는 5초 초기화에 정상 8초·장애 4초 window를 사용해 외부 인프라 없이
실패 경계를 고정하며, gold patch는 실행 허가가 아닌 운영자 검토용 정답이다.
54번은 실제 health 실패라 probe 수정
대상이 아니며, 56번은 fixture가
있어도 fallback-only, 60번은 OOM 계열 이름이어도 live `oom_memory` recovery가 없다. 61~70번도
resource pressure·runtime config 이름과 무관하게 전부 fallback-only이며 exact fixture가 없다.
71~72번과 76~77번, 79~80번은 fallback-only다. 73~74번 `resource_request_tuning`과 75번
`scheduling_constraint_fix`는 `draft_pr` route를 선언하지만 dispatcher Safe PR allowlist에 없으므로
실제 capability는 비어 있다. 78번 `pvc_binding_fix`도 승인형 수동 action이어서 patch capability가
없다. exact fixture는 73번 CPU 부족, 75번 affinity 불일치, 76번 node selector 불일치,
78번 PVC pending에만 연결한다. 76번 fixture 추가는 여덟 번째 batch 전체를 재감사하고
canonical digest를 갱신한 명시적 coverage 보강이다.
81~87번도 모두 fallback-only이고 capability가 비어 있다. 82번 `pvc_not_bound`에만 exact PVC
fixture가 있으며, 이름이 유사한 78번의 `pvc_binding_fix`를 82번에 추론해 연결하지 않는다.
`oom_memory`, `image_rollback`, `config_fix`를 의미만 보고 연결하지 않는다. 이 빈 값은 coverage gap을
드러내는 것이고 실행 가능성이나 fixture를 추측해 채우지 않는다. source hash나 loader 순서가
달라지면 완료된 9개 배치 전체를 다시 감사한다.

## 검증

```bash
python3 benchmark/score.py
python3 benchmark/score.py --candidate-contracts
```

채점기는 `benchmark/catalog-snapshot.json`과 모든 시나리오를 읽어 필수 필드와 타입, 카테고리별
2~4개/전체 14~28개, rule/symptom/candidate/evidence의 정확한 일치, recovery action 일치,
금지 remediation의 위험 blast-radius 태그, Kubernetes 객체와 normalization 조건을 검사한다.
snapshot은 아래 원본을 2026-07-13에 실측한 공개 고정점이다.

후보 계약 모드는 87개 index의 연속 순서·source hash·signal schema, 완료 batch cursor,
live recovery/dispatch capability, 허용·금지 action 분리, rollback·post-verification,
fixture 경로 containment와 scenario 계약을 함께 검사한다.

- `src/services/ai/agent/causes/catalog/crashloop.yaml`
- `src/services/ai/agent/causes/catalog/image_pull.yaml`
- `src/services/ai/agent/causes/catalog/readiness.yaml`
- `src/services/ai/agent/causes/catalog/scheduling.yaml`
- `src/services/ai/agent/causes/catalog/storage_volume.yaml`
- `src/services/ai/agent/recovery/builtin.py`

카탈로그가 바뀌면 snapshot과 해당 gold 정답을 함께 재검토해야 한다. scorer를 느슨하게 만들어
불일치를 숨기면 안 된다.
