from __future__ import annotations

from services.ai.agent.playbooks import CauseCandidateSpec, rca


@rca.cause(
    symptoms=("DB connection failed",),
    required_sources=("kubernetes", "metrics", "logs", "traces", "metadata"),
    candidates=(
        CauseCandidateSpec(
            candidate_id="database_connectivity_failure",
            title="DB 연결 실패",
            description="DB endpoint, credential, network 경로 문제로 애플리케이션 DB 연결이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "metrics", "logs", "traces", "metadata"),
            checks=(
                "Secret/ConfigMap의 DB connection ref와 최근 변경 여부 확인",
                "로그에 DB connection refused, timeout, authentication failed 확인",
                "trace에서 DB client span error 또는 latency 증가 확인",
                "DB connection error metric 또는 pool exhausted metric 확인",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="database_credential_or_config_error",
            title="DB 인증 또는 설정 오류",
            description="DB credential, host, port, database name 설정 오류로 연결이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "logs", "metadata"),
            checks=(
                "Secret/ConfigMap 참조와 실제 key 존재 여부 확인",
                "로그에 password authentication failed, unknown host, database not found 확인",
                "최근 Secret/ConfigMap/Helm values 변경 이후 발생했는지 확인",
            ),
        ),
    ),
)
class DbConnectionFailedProfile:
    pass
