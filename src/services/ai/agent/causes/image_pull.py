from __future__ import annotations

from services.ai.agent.playbooks import CauseCandidateSpec, rca


@rca.cause(
    symptoms=("ImagePullBackOff", "ErrImagePull"),
    required_sources=("kubernetes", "metrics", "logs", "metadata"),
    candidates=(
        CauseCandidateSpec(
            candidate_id="wrong_image_tag",
            title="잘못된 이미지 태그",
            description="존재하지 않는 이미지 태그 또는 digest로 인해 image pull이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "logs", "metadata"),
            checks=(
                "container image field와 image tag/digest가 registry에 존재하는지 확인",
                "events.reason/message에 manifest unknown 또는 not found가 있는지 확인",
                "최근 image tag/name 변경 이후 ImagePullBackOff가 시작됐는지 확인",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="missing_image_pull_secret",
            title="이미지 pull Secret 누락",
            description="Private registry 인증 Secret 누락 또는 잘못된 참조로 image pull이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "logs", "metadata"),
            checks=(
                "imagePullSecrets 참조가 같은 namespace에 존재하는지 확인",
                "events.reason/message에 unauthorized 또는 authentication required 확인",
                "Secret 생성/권한 변경이 누락됐는지 확인",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="registry_unavailable",
            title="이미지 registry 장애",
            description="Registry 또는 registry 앞단 LB 장애로 image pull이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "metrics", "logs"),
            checks=(
                "registry API/status 또는 registry/LB availability metric 확인",
                "여러 workload에서 같은 registry pull 실패가 발생하는지 확인",
                "events.reason/message에 timeout, connection refused, 5xx 확인",
            ),
        ),
    ),
)
class ImagePullProfile:
    pass
