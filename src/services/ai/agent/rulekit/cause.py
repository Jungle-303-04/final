from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Protocol

from domains.rca.events import CauseCandidate, EvidenceBundle, IncidentRecord


class EvidenceRequirementRule(Protocol):
    def matches(self, incident: IncidentRecord) -> bool: ...

    def required_sources(self, incident: IncidentRecord) -> list[str]: ...


class CauseRule(Protocol):
    def matches(self, incident: IncidentRecord, evidence_bundle: EvidenceBundle) -> bool: ...

    def candidates(
        self,
        incident: IncidentRecord,
        evidence_bundle: EvidenceBundle,
    ) -> list[CauseCandidate]: ...


@dataclass(frozen=True)
class CauseCandidateSpec:
    candidate_id: str
    title: str
    description: str
    expected_evidence: tuple[str, ...]
    checks: tuple[str, ...]

    def to_candidate(self) -> CauseCandidate:
        return CauseCandidate(
            candidate_id=self.candidate_id,
            title=self.title,
            description=self.description,
            expected_evidence=list(self.expected_evidence),
            checks=list(self.checks),
        )


@dataclass(frozen=True)
class SymptomEvidenceRequirementRule:
    symptoms: tuple[str, ...]
    sources: tuple[str, ...]

    def matches(self, incident: IncidentRecord) -> bool:
        return incident.symptom in self.symptoms

    def required_sources(self, incident: IncidentRecord) -> list[str]:
        return list(self.sources)


@dataclass(frozen=True)
class SymptomCauseRule:
    symptoms: tuple[str, ...]
    candidate_specs: tuple[CauseCandidateSpec, ...]

    def matches(self, incident: IncidentRecord, evidence_bundle: EvidenceBundle) -> bool:
        return incident.symptom in self.symptoms

    def candidates(
        self,
        incident: IncidentRecord,
        evidence_bundle: EvidenceBundle,
    ) -> list[CauseCandidate]:
        return [candidate.to_candidate() for candidate in self.candidate_specs]


@dataclass(frozen=True)
class CauseProfile:
    symptoms: tuple[str, ...]
    required_sources: tuple[str, ...]
    candidate_specs: tuple[CauseCandidateSpec, ...]

    def evidence_rule(self) -> SymptomEvidenceRequirementRule:
        return SymptomEvidenceRequirementRule(self.symptoms, self.required_sources)

    def cause_rule(self) -> SymptomCauseRule:
        return SymptomCauseRule(self.symptoms, self.candidate_specs)


CAUSE_PROFILES: list[CauseProfile] = []


def causes_for(
    *,
    symptoms: tuple[str, ...],
    required_sources: tuple[str, ...],
    candidates: tuple[CauseCandidateSpec, ...],
) -> Callable[[type], type]:
    def decorator(marker: type) -> type:
        CAUSE_PROFILES.append(CauseProfile(symptoms, required_sources, candidates))
        return marker

    return decorator


def registered_cause_profiles() -> tuple[CauseProfile, ...]:
    import services.ai.agent.causes.catalog  # noqa: F401

    return tuple(CAUSE_PROFILES)


def evidence_rules(
    profiles: tuple[CauseProfile, ...] | None = None,
) -> tuple[EvidenceRequirementRule, ...]:
    active_profiles = registered_cause_profiles() if profiles is None else profiles
    return tuple(profile.evidence_rule() for profile in active_profiles)


def cause_rules(
    profiles: tuple[CauseProfile, ...] | None = None,
) -> tuple[CauseRule, ...]:
    active_profiles = registered_cause_profiles() if profiles is None else profiles
    return tuple(profile.cause_rule() for profile in active_profiles)
