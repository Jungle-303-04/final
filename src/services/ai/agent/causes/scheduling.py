from __future__ import annotations

from services.ai.agent.playbooks import CauseCandidateSpec, rca


@rca.cause(
    symptoms=("FailedScheduling", "Pending"),
    required_sources=("kubernetes", "metrics", "metadata"),
    candidates=(
        CauseCandidateSpec(
            candidate_id="insufficient_cpu",
            title="노드 CPU 부족",
            description="요청한 CPU request를 만족하는 노드가 없어 스케줄링이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "metrics"),
            checks=(
                "events.reason/message에 Insufficient cpu가 있는지 확인",
                "Pod.spec.resources.requests.cpu와 Node.status.allocatable 비교",
                "cluster/node CPU allocatable 대비 requested CPU 포화 여부 확인",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="insufficient_memory",
            title="노드 메모리 부족",
            description="요청한 memory request를 만족하는 노드가 없어 스케줄링이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "metrics"),
            checks=(
                "events.reason/message에 Insufficient memory가 있는지 확인",
                "Pod.spec.resources.requests.memory와 Node.status.allocatable 비교",
                "cluster/node memory allocatable 대비 requested memory 포화 여부 확인",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="node_affinity_or_taint_mismatch",
            title="노드 affinity 또는 taint/toleration 불일치",
            description="nodeSelector, affinity, taint/toleration 조건이 맞지 않아 스케줄링이 실패했을 가능성이 있습니다.",
            expected_evidence=("kubernetes", "metadata"),
            checks=(
                "events.reason/message에 node affinity 또는 taint 관련 실패가 있는지 확인",
                "Pod.spec.nodeSelector/affinity와 Node.labels 비교",
                "Pod.spec.tolerations와 Node.spec.taints 비교",
            ),
        ),
        CauseCandidateSpec(
            candidate_id="pvc_pending",
            title="PVC 바인딩 대기",
            description="PVC가 바인딩되지 않아 Pod가 Pending 상태에 머무를 가능성이 있습니다.",
            expected_evidence=("kubernetes", "metadata"),
            checks=(
                "events.reason/message에 unbound immediate PersistentVolumeClaims 확인",
                "PersistentVolumeClaim.status.phase가 Pending인지 확인",
                "StorageClass, zone, volume binding mode 변경 여부 확인",
            ),
        ),
    ),
)
class SchedulingProfile:
    pass
