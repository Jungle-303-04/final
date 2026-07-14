# RCA Recovery Action Compatibility

이 문서는 RCA가 선택한 `root_cause`를 어떤 복구 조치로 바꾸고, 그 조치를
`command`, `Safe PR`, `approval_required` 중 어디로 보내는지 현재 코드 기준으로 정리한다.

기준 코드는 다음 파일이다.

- `src/services/ai/agent/recovery/builtin.py`
- `src/services/ai/agent/recovery/select.py`
- `src/services/ai/agent/recovery/dispatch.py`

## 읽는 기준

`route`는 실행 채널이다.

| route | 의미 | 다음 단계 |
| --- | --- | --- |
| `auto` | target agent command로 실행할 수 있는 런타임 조치 | `command.requested` |
| `draft_pr` | GitOps manifest 변경이 필요한 조치 | `safe_pr.requested` |
| `approval_required` | 자동 실행이나 PR 생성 전에 사람 판단이 필요한 조치 | `rca.action_required` |
| `forbidden` | 정책상 자동 조치가 차단된 조치 | `rca.action_required` |

`approval_required`는 자동 실행 가능 여부다.

```text
route=auto + approval_required=false
  -> select-worker가 자동 선택할 수 있다.

route=auto + approval_required=true
  -> command 형태의 조치지만 사람 선택/승인이 필요하다.

route=draft_pr
  -> GitOps source of truth를 바꾸는 PR 조치다.

route=approval_required
  -> 실행 채널을 확정하기 전에 사람이 판단해야 한다.
```

`risk_level`은 운영 위험도이고, `blast_radius`는 영향 범위다.

## 전체 builtin.py Recovery Action 표

아래 표는 `src/services/ai/agent/recovery/builtin.py`의 모든 `RecoveryActionSpec`을
root cause 단위로 펼친 것이다.

| root cause | action_type | title | route | risk | score | approval | blast radius | params |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `oom_killed` | `rollout_restart` | 대상 워크로드 재시작 | `auto` | `low` | `0.58` | `false` | `target_workload` | `command=rollout_restart` |
| `oom_killed` | `oom_memory` | 메모리 request/limit 조정 PR | `draft_pr` | `medium` | `0.56` | `true` | `target_workload` | `strategy=usage_headroom`, `headroom_ratio=1.25`, `max_memory=4Gi` |
| `oom_killed` | `replica_scale` | 임시 replica 증설 PR | `draft_pr` | `medium` | `0.52` | `true` | `target_workload` | `strategy=increment_one`, `max_replicas=10` |
| `application_5xx_spike` | `replica_scale` | GitOps replica 증설 PR | `draft_pr` | `medium` | `0.62` | `true` | `target_workload` | `strategy=increment_one`, `max_replicas=10` |
| `application_5xx_spike` | `gitops_recovery_review` | GitOps 복구 검토 PR | `draft_pr` | `medium` | `0.35` | `true` | `target_workload` | `document_type=recovery_review` |
| `application_5xx_spike` | `deployment_scale` | 임시 replica 증설 | `auto` | `medium` | `0.60` | `true` | `target_workload` | `command=deployment_scale`, `replicas=3` |
| `application_5xx_spike` | `rollout_restart` | 대상 워크로드 재시작 | `auto` | `low` | `0.50` | `false` | `target_workload` | `command=rollout_restart` |
| `backend_readiness_failure` | `rollout_restart` | 대상 워크로드 재시작 | `auto` | `low` | `0.66` | `false` | `target_workload` | `command=rollout_restart` |
| `backend_readiness_failure` | `deployment_scale` | 임시 replica 증설 | `auto` | `medium` | `0.60` | `true` | `target_workload` | `command=deployment_scale`, `replicas=3` |
| `upstream_unavailable` | `rollout_restart` | 대상 워크로드 재시작 | `auto` | `low` | `0.66` | `false` | `target_workload` | `command=rollout_restart` |
| `upstream_unavailable` | `deployment_scale` | 임시 replica 증설 | `auto` | `medium` | `0.60` | `true` | `target_workload` | `command=deployment_scale`, `replicas=3` |
| `bad_image_rollout` | `image_rollback` | 이전 이미지 rollback PR | `draft_pr` | `medium` | `0.74` | `true` | `target_workload` | `strategy=last_approved_snapshot` |
| `app_startup_failure` | `image_rollback` | 이전 이미지 rollback PR | `draft_pr` | `medium` | `0.74` | `true` | `target_workload` | `strategy=last_approved_snapshot` |
| `config_env_error` | `config_fix` | 설정 보정 PR | `draft_pr` | `medium` | `0.68` | `true` | `target_workload` | `strategy=operator_supplied_config_value` |
| `wrong_image_tag` | `image_tag_fix` | 이미지 태그 보정 PR | `draft_pr` | `medium` | `0.70` | `true` | `target_workload` | `strategy=last_approved_snapshot` |
| `missing_image_pull_secret` | `image_pull_secret_fix` | 이미지 pull Secret 보정 | `approval_required` | `medium` | `0.66` | `true` | `target_namespace` | `manual=true`, `fix=image_pull_secret` |
| `registry_unavailable` | `registry_recovery` | Registry 경로 복구 | `approval_required` | `medium` | `0.62` | `true` | `target_namespace` | `manual=true`, `fix=registry_path` |
| `insufficient_cpu` | `resource_request_tuning` | 리소스 요청값 조정 PR | `draft_pr` | `medium` | `0.64` | `true` | `target_workload` | `strategy=fit_node_allocatable` |
| `insufficient_memory` | `resource_request_tuning` | 리소스 요청값 조정 PR | `draft_pr` | `medium` | `0.64` | `true` | `target_workload` | `strategy=fit_node_allocatable` |
| `node_affinity_or_taint_mismatch` | `scheduling_constraint_fix` | 스케줄링 조건 보정 PR | `draft_pr` | `medium` | `0.68` | `true` | `target_workload` | `strategy=match_approved_node_policy` |
| `pvc_pending` | `pvc_binding_fix` | PVC 바인딩 복구 | `approval_required` | `medium` | `0.62` | `true` | `target_namespace` | `manual=true`, `fix=pvc_binding` |
| `probe_path_wrong` | `probe_fix` | Probe 설정 보정 PR | `draft_pr` | `medium` | `0.66` | `true` | `target_workload` | `strategy=approved_value_or_bounded_timeout` |
| `probe_port_wrong` | `probe_fix` | Probe 설정 보정 PR | `draft_pr` | `medium` | `0.66` | `true` | `target_workload` | `strategy=approved_value_or_bounded_timeout` |
| `timeout_too_short` | `probe_fix` | Probe 설정 보정 PR | `draft_pr` | `medium` | `0.66` | `true` | `target_workload` | `strategy=approved_value_or_bounded_timeout` |
| `startup_window_too_short` | `probe_fix` | Probe 설정 보정 PR | `draft_pr` | `medium` | `0.66` | `true` | `target_workload` | `strategy=approved_value_or_bounded_timeout` |
| `selector_label_mismatch` | `selector_fix` | Deployment selector 최소 보정 PR | `draft_pr` | `medium` | `0.68` | `true` | `target_workload` | `strategy=match_template_label`, `max_fields=1` |
| fallback | `manual_analysis` | 수동 RCA 분석 요청 | `approval_required` | `unknown` | `0.00` | `true` | `unknown` | `manual=true` |

## 세부 조건 표

| root cause | action_type | prerequisites | validation_checks | rollback_plan |
| --- | --- | --- | --- | --- |
| `oom_killed` | `rollout_restart` | 대상 워크로드가 단일 namespace에 한정됨 | 재시작 후 ready replica 회복; 재시작 카운트 증가세 완화 | 재시작은 되돌릴 변경이 없으며, 실패 시 수동 조사로 전환합니다. |
| `oom_killed` | `oom_memory` | 수치형 container memory working set 근거; GitOps 승인 snapshot | OOM 재발 없음; 메모리 사용률 안정; pod ready 상태 유지 | 동반된 inverse patch로 이전 request/limit을 복원합니다. |
| `oom_killed` | `replica_scale` | HPA 또는 수동 replica 정책 확인 | 에러율 감소; 메모리 사용률 하락; pod ready 상태 유지 | 동반된 inverse patch로 replica 수를 이전 값으로 되돌립니다. |
| `application_5xx_spike` | `replica_scale` | GitOps 승인 snapshot; replica 상한 10 | Ready replica 증가; 5xx/timeout 감소; 리소스 여유 유지 | 동반된 inverse patch로 이전 replica 수를 복원합니다. |
| `application_5xx_spike` | `gitops_recovery_review` | 대상 워크로드와 연결된 GitOps 레포가 있음; 변경 대상 manifest를 운영자가 확인함 | RCA 근거와 대상 manifest 일치; 변경 전후 Ready replica 회복 기준 확인; 5xx 로그 감소 | 생성된 PR 또는 merge commit을 revert합니다. |
| `application_5xx_spike` | `deployment_scale` | sandbox 워크로드이고 리소스 여유가 있음 | pod 수 증가; Ready replica 3 도달; 5xx/timeout 감소 | replica 수를 기존 값으로 되돌립니다. |
| `application_5xx_spike` | `rollout_restart` | 대상 워크로드가 sandbox namespace에 한정됨 | 5xx/timeout 로그 감소; Ready replica 유지; 요청 성공률 회복 | 재시작은 되돌릴 변경이 없으며, 실패 시 scale 또는 수동 조사로 전환합니다. |
| `backend_readiness_failure` | `rollout_restart` | 대상 워크로드가 sandbox namespace에 한정됨 | 5xx/timeout 로그 감소; Ready replica 유지; 요청 성공률 회복 | 재시작은 되돌릴 변경이 없으며, 실패 시 scale 또는 수동 조사로 전환합니다. |
| `backend_readiness_failure` | `deployment_scale` | sandbox 워크로드이고 리소스 여유가 있음 | pod 수 증가; Ready replica 3 도달; 5xx/timeout 감소 | replica 수를 기존 값으로 되돌립니다. |
| `upstream_unavailable` | `rollout_restart` | 대상 워크로드가 sandbox namespace에 한정됨 | 5xx/timeout 로그 감소; Ready replica 유지; 요청 성공률 회복 | 재시작은 되돌릴 변경이 없으며, 실패 시 scale 또는 수동 조사로 전환합니다. |
| `upstream_unavailable` | `deployment_scale` | sandbox 워크로드이고 리소스 여유가 있음 | pod 수 증가; Ready replica 3 도달; 5xx/timeout 감소 | replica 수를 기존 값으로 되돌립니다. |
| `bad_image_rollout` | `image_rollback` | 이전 정상 revision 확인; rollback 이미지 digest 확인 | 새 pod ready; startup error 소멸; 5xx 감소 | rollback PR revert 또는 원래 이미지 tag 재적용 |
| `app_startup_failure` | `image_rollback` | 이전 정상 revision 확인; rollback 이미지 digest 확인 | 새 pod ready; startup error 소멸; 5xx 감소 | rollback PR revert 또는 원래 이미지 tag 재적용 |
| `config_env_error` | `config_fix` | 누락 key와 기대 value 확인 | config load error 소멸; pod ready; 재시작 루프 중단 | 설정 보정 commit revert |
| `wrong_image_tag` | `image_tag_fix` | 정상 이미지 태그 또는 digest 확인 | 새 pod image pull 성공; Ready 상태 회복; ImagePullBackOff 이벤트 소멸 | 이미지 태그 보정 commit revert |
| `missing_image_pull_secret` | `image_pull_secret_fix` | registry 접근 권한 확인; Secret 이름과 namespace 확인 | image pull 성공; Pod Ready 전환; 인증 실패 이벤트 소멸 | 변경한 Secret 참조 또는 Secret 값을 이전 상태로 되돌립니다. |
| `registry_unavailable` | `registry_recovery` | registry 상태 확인; mirror 또는 캐시 registry 사용 가능 여부 확인 | registry 응답 정상; image pull 재시도 성공; Pending Pod 감소 | mirror 전환 시 원 registry 참조로 되돌립니다. |
| `insufficient_cpu` | `resource_request_tuning` | 현재 request/limit과 노드 allocatable 확인 | Pod Scheduled 전환; Ready 상태 회복; FailedScheduling 이벤트 소멸 | 리소스 request 조정 commit revert |
| `insufficient_memory` | `resource_request_tuning` | 현재 request/limit과 노드 allocatable 확인 | Pod Scheduled 전환; Ready 상태 회복; FailedScheduling 이벤트 소멸 | 리소스 request 조정 commit revert |
| `node_affinity_or_taint_mismatch` | `scheduling_constraint_fix` | 허용 노드 라벨과 taint/toleration 정책 확인 | Pod Scheduled 전환; Ready 상태 회복; affinity/taint 이벤트 소멸 | 스케줄링 조건 보정 commit revert |
| `pvc_pending` | `pvc_binding_fix` | PVC와 StorageClass 상태 확인; 데이터 보존 정책 확인 | PVC Bound 전환; Pod Scheduled 전환; volume binding 이벤트 소멸 | StorageClass/PVC 설정 변경을 이전 값으로 되돌립니다. |
| `probe_path_wrong` | `probe_fix` | GitOps 승인 snapshot; probe 실패 근거 | Probe 성공; Pod Ready 전환; 실제 health 실패 은폐 없음 | 동반된 inverse patch로 이전 probe scalar를 복원합니다. |
| `probe_port_wrong` | `probe_fix` | GitOps 승인 snapshot; probe 실패 근거 | Probe 성공; Pod Ready 전환; 실제 health 실패 은폐 없음 | 동반된 inverse patch로 이전 probe scalar를 복원합니다. |
| `timeout_too_short` | `probe_fix` | GitOps 승인 snapshot; probe 실패 근거 | Probe 성공; Pod Ready 전환; 실제 health 실패 은폐 없음 | 동반된 inverse patch로 이전 probe scalar를 복원합니다. |
| `startup_window_too_short` | `probe_fix` | GitOps 승인 snapshot; probe 실패 근거 | Probe 성공; Pod Ready 전환; 실제 health 실패 은폐 없음 | 동반된 inverse patch로 이전 probe scalar를 복원합니다. |
| `selector_label_mismatch` | `selector_fix` | 단일 selector 불일치; GitOps 승인 snapshot | selector-template 일치; Ready endpoint 회복 | 동반된 inverse patch로 이전 selector를 복원합니다. |
| fallback | `manual_analysis` | 운영자 RCA 검토 | 원인 rule 추가 여부 검토 | 자동 변경 없음 |

## 현재 코드에서 자동 선택되는 조건

`select-worker`는 후보를 정렬한 뒤 1순위 후보가 아래 조건을 만족할 때만
`RecoveryActionSelectedBody`를 자동 발행한다.

```text
selected.route == "auto"
selected.approval_required == false
command_action_spec.requires_approval == false
```

그 외에는 `RecoverySelectionRequestedBody`로 넘어가며, `approval-worker`가
`approval.recommended`를 발행한다.

## dispatch-worker 기준

`dispatch-worker`는 선택된 후보의 `route`를 보고 다음 body를 만든다.

| route | 결과 |
| --- | --- |
| `auto` | `CommandRequestedBody` |
| `draft_pr` | `SafePrRequestedBody` 또는 `RcaActionRequiredBody` |
| `approval_required` | `RcaActionRequiredBody` |
| `forbidden` | `RcaActionRequiredBody` |
| 알 수 없는 route | `RcaActionRequiredBody` |

`draft_pr` route는 GitOps authority context가 필요하다.
context가 없거나 action type이 지원되지 않거나 patch를 만들 수 없으면 PR로 가지 않고
`RcaActionRequiredBody`로 멈춘다.

## 결론

이 문서는 현재 `builtin.py`에 등록된 recovery 후보 전체 목록이다.
route 정책을 바꾸기 전에는 이 표를 기준으로 어떤 root cause/action 조합이 영향을 받는지 먼저 확인한다.
