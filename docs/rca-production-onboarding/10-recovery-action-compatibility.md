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
| `app_port_bind_failed` | `container_port_review` | 컨테이너 포트 충돌 검토 | `approval_required` | `medium` | `0.62` | `true` | `target_workload` | `manual=true`, `fix=container_port` |
| `permission_denied_startup` | `startup_security_context_review` | Startup 권한/보안 컨텍스트 확인 | `approval_required` | `medium` | `0.62` | `true` | `target_workload` | `manual=true`, `fix=startup_permission` |
| `config_key_missing` | `config_key_review` | ConfigMap key 누락 확인 | `approval_required` | `medium` | `0.64` | `true` | `target_workload` | `manual=true`, `fix=config_key` |
| `missing_secret_reference` | `secret_reference_fix` | Secret 참조 누락 확인 | `approval_required` | `medium` | `0.64` | `true` | `target_namespace` | `manual=true`, `fix=secret_reference` |
| `service_name_or_namespace_mismatch` | `service_reference_review` | Service 이름/namespace 참조 확인 | `approval_required` | `medium` | `0.62` | `true` | `target_workload` | `manual=true`, `fix=service_reference` |
| `network_policy_denied` | `network_policy_review` | NetworkPolicy 차단 확인 | `approval_required` | `medium` | `0.62` | `true` | `target_namespace` | `manual=true`, `fix=network_policy` |
| `metrics_server_unavailable` | `autoscaling_metrics_recovery` | Autoscaling metrics 경로 복구 | `approval_required` | `medium` | `0.62` | `true` | `target_namespace` | `manual=true`, `fix=autoscaling_metrics` |
| `missing_resource_requests` | `resource_request_tuning` | HPA resource request 보정 PR | `draft_pr` | `medium` | `0.64` | `true` | `target_workload` | `strategy=hpa_required_requests` |
| `max_replica_limit_reached` | `replica_scale` | HPA maxReplicas 상한 검토 PR | `draft_pr` | `medium` | `0.62` | `true` | `target_workload` | `strategy=hpa_max_replicas_review`, `max_replicas=10` |
| `database_connectivity_failure` | `dependency_connection_review` | DB 연결 경로 복구 검토 | `approval_required` | `medium` | `0.62` | `true` | `target_workload` | `manual=true`, `fix=db_connectivity` |
| `database_connection_pool_exhausted` | `dependency_connection_review` | DB 연결 경로 복구 검토 | `approval_required` | `medium` | `0.62` | `true` | `target_workload` | `manual=true`, `fix=db_connectivity` |
| `database_credential_or_config_error` | `dependency_config_review` | DB 인증/설정 참조 확인 | `approval_required` | `medium` | `0.62` | `true` | `target_workload` | `manual=true`, `fix=db_config` |
| `fallback` | `manual_analysis` | 수동 RCA 분석 요청 | `approval_required` | `unknown` | `0.00` | `true` | `unknown` | `manual=true` |

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
| `app_port_bind_failed` | `container_port_review` | startup log의 port bind 실패 근거; 컨테이너 port와 service targetPort 확인 | pod 재시작 루프 중단; 프로세스 listen 성공; Ready 상태 회복 | 포트 설정 변경이 있었다면 manifest 변경 commit을 revert합니다. |
| `permission_denied_startup` | `startup_security_context_review` | startup log의 permission denied 근거; securityContext와 mount permission 확인 | permission denied 로그 소멸; pod Ready 회복; 보안 정책 위반 없음 | securityContext 또는 mount 권한 변경 commit을 revert합니다. |
| `config_key_missing` | `config_key_review` | 누락 key 이름 확인; ConfigMap 참조 namespace 확인 | config load error 소멸; pod Ready 회복; 잘못된 기본값 주입 없음 | ConfigMap key 보정 또는 참조 변경 commit을 revert합니다. |
| `missing_secret_reference` | `secret_reference_fix` | Secret 이름과 key reference 확인; 대상 namespace 확인 | secret not found 이벤트 소멸; pod Ready 회복; 민감값 노출 없음 | Secret 참조 변경 commit을 revert하거나 이전 참조로 되돌립니다. |
| `service_name_or_namespace_mismatch` | `service_reference_review` | 오류 로그의 service host 확인; 실제 Service name/namespace 확인 | DNS lookup 실패 소멸; 대상 service 연결 성공; 5xx/timeout 감소 | service 참조 설정 변경 commit을 revert합니다. |
| `network_policy_denied` | `network_policy_review` | 차단된 source/destination 확인; 적용 중인 NetworkPolicy 확인 | 허용 후 연결 성공; 불필요한 namespace 노출 없음; 5xx/timeout 감소 | NetworkPolicy 변경 commit을 revert합니다. |
| `metrics_server_unavailable` | `autoscaling_metrics_recovery` | HPA FailedGetResourceMetric 근거; metrics API 또는 adapter 상태 확인 | HPA metric 조회 성공; ScalingActive 회복; replica 계산 재개 | metrics adapter 또는 HPA 설정 변경 commit을 revert합니다. |
| `missing_resource_requests` | `resource_request_tuning` | 누락된 resource request 확인; GitOps 승인 snapshot | HPA metric 계산 성공; Pod Ready 유지; 리소스 사용률 안정 | resource request 보정 commit을 revert합니다. |
| `max_replica_limit_reached` | `replica_scale` | ScalingLimited=True 근거; GitOps 승인 snapshot; 리소스 여유 확인 | Ready replica 증가; ScalingLimited 완화; 5xx/latency 감소 | 동반된 inverse patch로 replica 상한 또는 replica 수를 이전 값으로 되돌립니다. |
| `database_connectivity_failure` | `dependency_connection_review` | DB connection error 로그 또는 trace 근거; DB endpoint와 pool 설정 확인 | DB 연결 성공; pool exhausted 로그 감소; 요청 성공률 회복 | DB connection 설정 변경 commit을 revert합니다. |
| `database_connection_pool_exhausted` | `dependency_connection_review` | DB connection error 로그 또는 trace 근거; DB endpoint와 pool 설정 확인 | DB 연결 성공; pool exhausted 로그 감소; 요청 성공률 회복 | DB connection 설정 변경 commit을 revert합니다. |
| `database_credential_or_config_error` | `dependency_config_review` | DB credential/config error 근거; Secret/ConfigMap reference 확인 | DB 인증 성공; 설정 오류 로그 소멸; 민감값 노출 없음 | DB 설정 참조 변경 commit을 revert합니다. |
| `fallback` | `manual_analysis` | 운영자 RCA 검토 | 원인 rule 추가 여부 검토 | 자동 변경 없음 |

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

## approval_required route 이유 분류

`approval_required`는 단순히 "위험하니까 사람에게 넘김"이 아니다.
현재 코드에서는 아래처럼 사람이 판단해야 하는 이유를 구분한다.

| root cause | action_type | reason_code | 의미 | 왜 자동 실행하지 않는가 |
| --- | --- | --- | --- | --- |
| `missing_image_pull_secret` | `image_pull_secret_fix` | `security_boundary` | 보안 경계 확인 | registry 인증 정보나 Secret 참조 변경은 보안 권한과 연결되므로 자동 변경하지 않는다. |
| `registry_unavailable` | `registry_recovery` | `external_dependency` | 외부 의존성 확인 | registry 장애, mirror 전환, 네트워크 경로 변경은 플랫폼 밖 상태 확인이 필요하다. |
| `pvc_pending` | `pvc_binding_fix` | `data_safety` | 데이터 안전성 확인 | PVC와 StorageClass 변경은 데이터 보존, 바인딩, 삭제 정책에 영향을 줄 수 있다. |
| `app_port_bind_failed` | `container_port_review` | `configuration_boundary` | 설정 경계 확인 | 포트 충돌은 manifest, service, probe, 애플리케이션 listen 설정을 함께 봐야 하므로 자동 수정하지 않는다. |
| `permission_denied_startup` | `startup_security_context_review` | `security_boundary` | 보안 경계 확인 | securityContext, 실행 사용자, mount 권한은 보안 정책에 영향을 주므로 운영자 확인이 필요하다. |
| `config_key_missing` | `config_key_review` | `configuration_boundary` | 설정 경계 확인 | ConfigMap key 보정은 기대값을 플랫폼이 임의로 만들 수 없으므로 참조와 값을 사람이 확인해야 한다. |
| `missing_secret_reference` | `secret_reference_fix` | `security_boundary` | 보안 경계 확인 | Secret 참조는 민감 정보 경계와 연결되므로 이름/key reference만 확인하고 값은 자동 생성하지 않는다. |
| `service_name_or_namespace_mismatch` | `service_reference_review` | `traffic_routing` | 트래픽 경로 확인 | service DNS 이름과 namespace 변경은 호출 경로를 바꾸므로 대상 service 확인이 필요하다. |
| `network_policy_denied` | `network_policy_review` | `traffic_routing` | 트래픽 경로 확인 | NetworkPolicy 변경은 namespace 간 통신 허용 범위를 넓힐 수 있어 자동 적용하지 않는다. |
| `metrics_server_unavailable` | `autoscaling_metrics_recovery` | `platform_dependency` | 플랫폼 의존성 확인 | metrics-server나 adapter는 공용 autoscaling 경로라 대상 workload 근거만으로 재구성하지 않는다. |
| `database_connectivity_failure` | `dependency_connection_review` | `external_dependency` | 외부 의존성 확인 | DB endpoint, 네트워크, pool 상태는 플랫폼 밖 서비스 상태 확인이 필요하다. |
| `database_connection_pool_exhausted` | `dependency_connection_review` | `external_dependency` | 외부 의존성 확인 | pool exhausted는 앱 설정과 DB 용량 양쪽을 봐야 하므로 자동 변경하지 않는다. |
| `database_credential_or_config_error` | `dependency_config_review` | `external_dependency` | 외부 의존성 확인 | DB 인증/설정 문제는 Secret/ConfigMap 참조와 외부 DB 권한을 함께 확인해야 한다. |
| fallback | `manual_analysis` | `manual_only` | 수동 분석 필요 | 자동 복구 후보가 충분하지 않거나 rule로 설명 가능한 조치가 없다. |
| 기타 `approval_required` | 기타 | `manual_review_required` | 운영자 승인 필요 | 선택된 복구 조치가 자동 실행 조건을 충족하지 않는다. |

이 값은 `dispatch-worker`가 `RcaActionRequiredBody`의 `reason_code`, `next_actions`,
`diagnostics`에 담아 projection/dashboard가 바로 읽을 수 있게 한다.

## Safe PR Patch Compatibility

`route=draft_pr`라고 해서 모두 실제 설정 변경 PR인 것은 아니다.
`dispatch-worker`는 `pr_kind`로 PR 성격을 나눈다.

```text
route=draft_pr
  -> pr_kind=safe_pr_patch
     실제 GitOps manifest 값을 바꾸는 PR이다.
     GitOps authority context와 구조화 patch 생성이 필요하다.

  -> pr_kind=safe_pr_review_doc
     실제 설정값을 바꾸지 않는 복구 검토 문서 PR이다.
     RCA 근거, 권장 조치, 검증 기준을 repository에 남긴다.
```

`dispatch-worker`는 현재 아래 action만 구조화된 manifest patch로 만들 수 있다.

| action_type | pr_kind | route source | dispatch 지원 | 필요한 context | 실패 reason_code | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| `oom_memory` | `safe_pr_patch` | `draft_pr` | GitOps authority 기반 scalar patch | GitOps authority context, container resource field | `gitops_authority_unavailable`, `gitops_authority_mismatch`, `safe_pr_patch_unsupported`, `safe_pr_patch_missing` | 지원 |
| `replica_scale` | `safe_pr_patch` | `draft_pr` | GitOps authority 기반 scalar patch | GitOps authority context, `spec.replicas` | `gitops_authority_unavailable`, `gitops_authority_mismatch`, `safe_pr_patch_unsupported`, `safe_pr_patch_missing` | 지원 |
| `image_rollback` | `safe_pr_patch` | `draft_pr` | GitOps authority 기반 scalar patch | GitOps authority context, 이전 image snapshot | `gitops_authority_unavailable`, `gitops_authority_mismatch`, `safe_pr_patch_unsupported`, `safe_pr_patch_missing` | 지원 |
| `image_tag_fix` | `safe_pr_patch` | `draft_pr` | GitOps authority 기반 scalar patch | GitOps authority context, 보정할 image tag/digest | `gitops_authority_unavailable`, `gitops_authority_mismatch`, `safe_pr_patch_unsupported`, `safe_pr_patch_missing` | 지원 |
| `probe_fix` | `safe_pr_patch` | `draft_pr` | GitOps authority 기반 scalar patch | GitOps authority context, probe path/port/timeout field | `gitops_authority_unavailable`, `gitops_authority_mismatch`, `safe_pr_patch_unsupported`, `safe_pr_patch_missing` | 지원 |
| `selector_fix` | `safe_pr_patch` | `draft_pr` | GitOps authority 기반 scalar patch | GitOps authority context, selector/template label mismatch | `gitops_authority_unavailable`, `gitops_authority_mismatch`, `safe_pr_patch_unsupported`, `safe_pr_patch_missing` | 지원 |
| `gitops_recovery_review` | `safe_pr_review_doc` | `draft_pr` | 복구 검토 문서 PR | GitOps authority context 없이도 review patch 생성 | 없음 | 지원 |
| `resource_request_tuning` | `safe_pr_review_doc` | `draft_pr` | HPA request 보정 검토 문서 PR | CPU/memory request 누락 근거, 운영자 capacity 확인 | 없음 | 검토 문서 지원 |
| `config_fix` | `safe_pr_patch` | `draft_pr` | 아직 구조화 patch 없음 | config key/value와 patch 정책 필요 | `safe_pr_patch_unsupported` | 미지원 |
| `scheduling_constraint_fix` | `safe_pr_patch` | `draft_pr` | 아직 구조화 patch 없음 | node selector, affinity, toleration patch 정책 필요 | `safe_pr_patch_unsupported` | 미지원 |

`resource_request_tuning`은 현재 구조화 manifest patch를 만들지 않는다.

```text
이유:
- 현재 Safe PR patch 계약은 없는 필드를 새로 만들지 않고, 이미 있는 scalar만 정확히 교체한다.
- resources.requests.cpu 또는 memory가 없는 경우는 값 교체가 아니라 manifest key 추가다.
- key 추가는 workload scheduling, HPA 계산, quota 사용량을 바꿀 수 있어 운영자 판단이 필요하다.

처리:
- safe_pr_review_doc으로 복구 검토 문서를 생성한다.
- 참고 제안값은 cpu=100m, memory=256Mi로 표시한다.
- 이 값은 자동 적용값이 아니라 운영자가 workload 부하와 node capacity를 확인하기 위한 출발점이다.
```

따라서 recovery 후보를 추가할 때는 먼저 아래를 확인한다.

```text
1. 이 조치가 runtime command인가, GitOps manifest 변경인가, 수동 판단인가?
2. draft_pr라면 실제 설정 변경 PR인지 검토 문서 PR인지 pr_kind를 먼저 정한다.
3. safe_pr_patch라면 dispatch-worker가 실제 patch를 만들 수 있는 action_type인지 확인한다.
4. patch를 만들 수 없다면 safe_pr_patch로 위장하지 말고 approval_required나 safe_pr_review_doc으로 분리한다.
```

## 결론

이 문서는 현재 `builtin.py`에 등록된 recovery 후보 전체 목록이다.
route 정책을 바꾸기 전에는 이 표를 기준으로 어떤 root cause/action 조합이 영향을 받는지 먼저 확인한다.
