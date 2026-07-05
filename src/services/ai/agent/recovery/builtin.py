from __future__ import annotations

from services.ai.agent.defaults import ActionRoutes
from services.ai.agent.playbooks import RecoveryActionSpec, rca

routes = ActionRoutes()


@rca.recovery(
    root_causes=("oom_killed",),
    actions=(
        RecoveryActionSpec(
            action_type="rollout_restart",
            title="대상 워크로드 재시작",
            description="낮은 위험도의 임시 완화 조치로 대상 워크로드를 재시작합니다.",
            route=routes.auto,
            risk_level="low",
            score=0.58,
            blast_radius="target_workload",
            approval_required=True,
            prerequisites=("대상 워크로드가 단일 namespace에 한정됨",),
            validation_checks=("재시작 후 ready replica 회복", "재시작 카운트 증가세 완화"),
            rollback_plan="재시작은 되돌릴 변경이 없으며, 실패 시 수동 조사로 전환합니다.",
            params={"command": "rollout_restart"},
        ),
        RecoveryActionSpec(
            action_type="scale",
            title="임시 replica 증설 PR",
            description="메모리 압박 완화를 위해 replica 증설 패치를 Safe PR로 제안합니다.",
            route=routes.safe_pr,
            risk_level="medium",
            score=0.52,
            blast_radius="target_workload",
            approval_required=True,
            prerequisites=("HPA 또는 수동 replica 정책 확인",),
            validation_checks=("에러율 감소", "메모리 사용률 하락", "pod ready 상태 유지"),
            rollback_plan="replica 수를 이전 값으로 되돌립니다.",
            params={"scale": "increase_replicas"},
        ),
    ),
)
class OomKilledRecoveryActions:
    pass


@rca.recovery(
    root_causes=("bad_image_rollout", "app_startup_failure"),
    actions=(
        RecoveryActionSpec(
            action_type="rollback",
            title="이전 이미지 rollback PR",
            description="최근 이미지 변경이 원인일 가능성이 높아 이전 태그로 되돌리는 PR을 제안합니다.",
            route=routes.safe_pr,
            risk_level="medium",
            score=0.74,
            blast_radius="target_workload",
            approval_required=True,
            prerequisites=("이전 정상 revision 확인", "rollback 이미지 digest 확인"),
            validation_checks=("새 pod ready", "startup error 소멸", "5xx 감소"),
            rollback_plan="rollback PR revert 또는 원래 이미지 tag 재적용",
            params={"patch": "previous_image"},
        ),
    ),
)
class RolloutRecoveryActions:
    pass


@rca.recovery(
    root_causes=("config_env_error",),
    actions=(
        RecoveryActionSpec(
            action_type="config_fix",
            title="설정 보정 PR",
            description="누락된 환경변수나 설정 키를 보정하는 Safe PR을 제안합니다.",
            route=routes.safe_pr,
            risk_level="medium",
            score=0.68,
            blast_radius="target_workload",
            approval_required=True,
            prerequisites=("누락 key와 기대 value 확인",),
            validation_checks=("config load error 소멸", "pod ready", "재시작 루프 중단"),
            rollback_plan="설정 보정 commit revert",
            params={"patch": "config"},
        ),
    ),
)
class ConfigRecoveryActions:
    pass


@rca.fallback(
    actions=(
        RecoveryActionSpec(
            action_type="manual_analysis",
            title="수동 RCA 분석 요청",
            description="자동 복구 후보가 충분하지 않아 운영자 검토가 필요합니다.",
            route=routes.approval_required,
            risk_level="unknown",
            score=0.0,
            blast_radius="unknown",
            approval_required=True,
            prerequisites=("운영자 RCA 검토",),
            validation_checks=("원인 rule 추가 여부 검토",),
            rollback_plan="자동 변경 없음",
            params={"manual": True},
        ),
    ),
)
class FallbackRecoveryActions:
    pass
