"""RCA 원인 룰 YAML 카탈로그 로더 — 룰을 코드가 아닌 데이터(YAML)로 관리한다.

카탈로그 위치: `src/services/ai/agent/causes/catalog/*.yaml` (파일명 정렬 순서로 로딩).
잘못된 YAML·스키마 위반·중복 rule id 는 기동(카탈로그 임포트) 시점에
`CauseCatalogError` 로 즉시 실패시켜, 잘못된 룰이 조용히 무시되는 일을 막는다.
"""

from __future__ import annotations

from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from services.ai.agent.playbooks.cause import (
    CAUSE_PROFILES,
    CauseCandidateSpec,
    CauseProfile,
)

CATALOG_DIR = Path(__file__).resolve().parent / "catalog"
CATALOG_PATTERNS = ("*.yaml", "*.yml")


class CauseCatalogError(RuntimeError):
    """RCA 룰 카탈로그 로딩 실패 — 기동 시점에 즉시 중단시키는 오류."""


class CatalogCandidateModel(BaseModel):
    """YAML 원인 후보 스키마 — `CauseCandidateSpec` 과 1:1 대응."""

    model_config = ConfigDict(extra="forbid")

    candidate_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    expected_evidence: list[str] = Field(min_length=1)
    checks: list[str] = Field(min_length=1)

    def to_spec(self) -> CauseCandidateSpec:
        return CauseCandidateSpec(
            candidate_id=self.candidate_id,
            title=self.title,
            description=self.description,
            expected_evidence=tuple(self.expected_evidence),
            checks=tuple(self.checks),
        )


class CatalogRuleModel(BaseModel):
    """YAML 룰 스키마 — 증상 매칭 조건 + 필수 근거 소스 + 원인 후보 목록."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    symptoms: list[str] = Field(min_length=1)
    required_sources: list[str] = Field(min_length=1)
    candidates: list[CatalogCandidateModel] = Field(min_length=1)

    def to_profile(self) -> CauseProfile:
        return CauseProfile(
            symptoms=tuple(self.symptoms),
            required_sources=tuple(self.required_sources),
            candidate_specs=tuple(candidate.to_spec() for candidate in self.candidates),
            rule_id=self.id,
        )


class CatalogFileModel(BaseModel):
    """카탈로그 파일 루트 스키마 — `rules` 목록 하나."""

    model_config = ConfigDict(extra="forbid")

    rules: list[CatalogRuleModel] = Field(min_length=1)


def parse_catalog_file(path: Path) -> tuple[CauseProfile, ...]:
    """카탈로그 파일 1개를 파싱·검증해 프로파일 튜플로 변환한다."""
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as error:
        raise CauseCatalogError(f"RCA 룰 카탈로그 YAML 파싱 실패: {path.name} — {error}") from error
    try:
        model = CatalogFileModel.model_validate(raw)
    except ValidationError as error:
        raise CauseCatalogError(f"RCA 룰 카탈로그 스키마 위반: {path.name} — {error}") from error
    return tuple(rule.to_profile() for rule in model.rules)


def load_catalog_profiles(catalog_dir: Path | None = None) -> tuple[CauseProfile, ...]:
    """카탈로그 디렉터리의 모든 YAML 룰을 로딩한다(순수 함수, 파일명 정렬 순서).

    카탈로그 안에서 rule id 가 중복되면 `CauseCatalogError` 를 던진다.
    """
    directory = CATALOG_DIR if catalog_dir is None else catalog_dir
    paths = sorted(path for pattern in CATALOG_PATTERNS for path in directory.glob(pattern))
    profiles: list[CauseProfile] = []
    seen_ids: dict[str, str] = {}
    for path in paths:
        for profile in parse_catalog_file(path):
            assert profile.rule_id is not None  # CatalogRuleModel.id 가 보장
            owner = seen_ids.get(profile.rule_id)
            if owner is not None:
                raise CauseCatalogError(
                    f"RCA 룰 id 중복: '{profile.rule_id}' ({owner} ↔ {path.name}) — "
                    "카탈로그 룰 id 는 고유해야 합니다."
                )
            seen_ids[profile.rule_id] = path.name
            profiles.append(profile)
    return tuple(profiles)


def register_catalog_profiles(catalog_dir: Path | None = None) -> None:
    """카탈로그 룰을 룰 레지스트리(`CAUSE_PROFILES`)에 병합한다.

    이미 등록된 코드/카탈로그 룰과 rule id 가 겹치면 `CauseCatalogError` 로 즉시 실패한다.
    """
    profiles = load_catalog_profiles(catalog_dir)
    existing_ids = {p.rule_id for p in CAUSE_PROFILES if p.rule_id is not None}
    for profile in profiles:
        if profile.rule_id in existing_ids:
            raise CauseCatalogError(
                f"RCA 룰 id 중복: '{profile.rule_id}' — 이미 등록된 룰과 겹칩니다."
            )
    CAUSE_PROFILES.extend(profiles)
