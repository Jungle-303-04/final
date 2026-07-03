from __future__ import annotations

from dataclasses import dataclass, field

from domains.rca.events import ClusterEvidenceReceivedBody, Evidence
from services.ai.agent.defaults import EvidenceDefaults


@dataclass(frozen=True)
class EvidenceBuilder:
    defaults: EvidenceDefaults = field(default_factory=EvidenceDefaults)

    @property
    def kind(self) -> str:
        return self.defaults.kind

    def build_evidence(self, evt: ClusterEvidenceReceivedBody, correlation_id: str) -> Evidence:
        evidence_ref = f"{self.defaults.object_ref_prefix}/{correlation_id}.json"
        return Evidence(
            cluster_id=evt.cluster_id,
            kubernetes=evt.kubernetes,
            metrics=evt.metrics,
            logs=evt.logs,
            traces=evt.traces,
            object_ref=evidence_ref,
            workspace_id=evt.workspace_id,
        )
