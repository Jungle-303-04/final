from __future__ import annotations

from services.ai.agent.playbooks import CauseCandidateSpec, rca


@rca.cause(
    symptoms=("CrashLoopBackOff", "pod_restart_loop"),
    required_sources=("kubernetes", "metrics", "logs"),
    candidates=(
        CauseCandidateSpec(
            candidate_id="oom_killed",
            title="컨테이너 OOMKilled",
            description="컨테이너가 메모리 제한을 초과해 재시작됐을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "metrics", "logs"),
            checks=(
                "last_state.reason == OOMKilled",
                "memory usage가 limit에 가까움",
                "로그에 memory 관련 종료 흔적",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="bad_image_rollout",
            title="배포 이미지 문제",
            description="최근 배포 이미지가 애플리케이션 시작 실패를 유발했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "logs"),
            checks=(
                "최근 image tag 변경",
                "새 revision 이후부터 crash 발생",
                "로그에 module/import/startup error",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="config_env_error",
            title="설정 또는 환경변수 오류",
            description="ConfigMap, Secret, 환경변수 누락으로 컨테이너 시작이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "logs"),
            checks=(
                "최근 ConfigMap/Secret 변경",
                "로그에 missing env 또는 config load failed",
                "container start 직후 종료",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="app_startup_failure",
            title="애플리케이션 시작 실패",
            description="애플리케이션 초기화 코드나 런타임 오류로 프로세스가 종료됐을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "logs"),
            checks=(
                "로그에 startup error",
                "프로세스가 readiness 이전에 종료",
                "container start 직후 반복 재시작",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="dependency_connection_failure",
            title="의존성 연결 실패",
            description="DB, 외부 API, 네트워크 endpoint 연결 실패로 기동 또는 헬스체크가 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "logs", "traces"),
            checks=(
                "로그에 DB/API connection refused",
                "readiness/liveness 실패",
                "외부 endpoint timeout",
            ),
        ),
    ),
)
class CrashLoopBackOffProfile:
    pass
