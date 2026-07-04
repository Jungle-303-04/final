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
                "containerStatuses.lastState.terminated.reason == OOMKilled 확인",
                "restartCount 증가와 memory usage가 limit 근처인지 확인",
                "로그에 out of memory, heap, allocation failure 흔적 확인",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="bad_image_rollout",
            title="배포 이미지 문제",
            description="최근 배포 이미지가 애플리케이션 시작 실패를 유발했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "logs", "metadata"),
            checks=(
                "image tag/digest 또는 git_sha 변경 이후 crash가 시작됐는지 확인",
                "새 ReplicaSet/revision의 Pod에서만 CrashLoopBackOff 발생하는지 확인",
                "로그에 module/import/startup error 또는 binary mismatch 확인",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="config_env_error",
            title="설정 또는 환경변수 오류",
            description="ConfigMap, Secret, 환경변수 누락으로 컨테이너 시작이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "logs", "metadata"),
            checks=(
                "command/args/env와 ConfigMap/Secret 참조 변경 여부 확인",
                "로그에 missing env, config load failed, file not found 확인",
                "container start 직후 exitCode와 previous container logs 확인",
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
                "로그에 DB/API connection refused, timeout, auth failed 확인",
                "readiness/liveness 실패 시점과 dependency 오류 시점 비교",
                "trace에서 외부 endpoint timeout 또는 dependency span 오류 확인",
            ),
        ),
    ),
)
class CrashLoopBackOffProfile:
    pass
