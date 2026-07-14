"""Opsia 알림 규칙의 대상별 지속 조건 평가 엔진."""

from __future__ import annotations

import asyncio
import hashlib
import inspect
import json
import math
import uuid
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

JsonObject = dict[str, Any]
TransitionNotifier = Callable[[JsonObject], Any | Awaitable[Any]]


@dataclass(frozen=True)
class AlertMeasurement:
    subject: JsonObject
    observed_value: float
    observed_at: datetime
    evidence: tuple[JsonObject, ...]

    def __post_init__(self) -> None:
        required = {"cluster", "namespace", "kind", "name"}
        if not required <= set(self.subject) or any(not str(self.subject[key]) for key in required):
            raise ValueError("alert measurement subject is incomplete")
        if not math.isfinite(float(self.observed_value)):
            raise ValueError("alert measurement value must be finite")
        if self.observed_at.tzinfo is None:
            raise ValueError("alert measurement time must include a timezone")
        if not self.evidence:
            raise ValueError("alert measurement evidence is required")

    @property
    def subject_key(self) -> str:
        encoded = json.dumps(self.subject, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
        return hashlib.sha256(encoded.encode()).hexdigest()


MeasurementLoader = Callable[
    [JsonObject],
    Sequence[AlertMeasurement] | Awaitable[Sequence[AlertMeasurement]],
]


class AlertEvaluationEngine:
    def __init__(
        self,
        db: Any,
        *,
        load_measurements: MeasurementLoader,
        notify: TransitionNotifier | None = None,
        interval_seconds: float = 10,
    ) -> None:
        if not 5 <= interval_seconds <= 15:
            raise ValueError("alert evaluation interval must be between 5 and 15 seconds")
        self.db = db
        self.load_measurements = load_measurements
        self.notify = notify or _ignore_transition
        self.interval_seconds = interval_seconds

    async def evaluate_once(self, *, now: datetime | None = None) -> list[JsonObject]:
        evaluated_at = now or datetime.now(UTC)
        rules = await _await_if_needed(self.db.list_enabled_alert_rules())
        transitions: list[JsonObject] = []
        for rule in rules or []:
            measurements = await _await_if_needed(self.load_measurements(dict(rule)))
            for measurement in measurements:
                transition = await self._evaluate_measurement(
                    dict(rule),
                    measurement,
                    evaluated_at=evaluated_at,
                )
                if transition is None:
                    continue
                transitions.append(transition)
                await _await_if_needed(self.notify(transition))
        return transitions

    async def run(self, stopping: asyncio.Event) -> None:
        while not stopping.is_set():
            await self.evaluate_once()
            try:
                await asyncio.wait_for(stopping.wait(), timeout=self.interval_seconds)
            except TimeoutError:
                continue

    async def _evaluate_measurement(
        self,
        rule: JsonObject,
        measurement: AlertMeasurement,
        *,
        evaluated_at: datetime,
    ) -> JsonObject | None:
        workspace_id = str(rule["workspace_id"])
        rule_id = str(rule["rule_id"])
        subject_key = measurement.subject_key
        state = await _await_if_needed(
            self.db.get_alert_rule_target_state(workspace_id, rule_id, subject_key)
        )
        state = dict(state or {})
        state_payload = {
            "workspace_id": workspace_id,
            "rule_id": rule_id,
            "subject_key": subject_key,
            "subject": dict(measurement.subject),
            "last_observed_value": float(measurement.observed_value),
            "last_evidence": [dict(item) for item in measurement.evidence],
            "last_evaluated_at": evaluated_at,
        }
        matched = compare_alert_value(
            measurement.observed_value,
            str(rule["comparator"]),
            float(rule["threshold"]),
        )
        if not matched:
            return await self._recover(state, state_payload, measurement, evaluated_at)

        active_event_id = state.get("active_event_id")
        condition_since = _datetime_or_none(state.get("condition_since"))
        if active_event_id:
            await _await_if_needed(
                self.db.refresh_alert_rule_event(
                    workspace_id,
                    str(active_event_id),
                    observed_value=float(measurement.observed_value),
                    evidence=[dict(item) for item in measurement.evidence],
                    evaluated_at=evaluated_at,
                )
            )
            await _await_if_needed(
                self.db.upsert_alert_rule_target_state(
                    {
                        **state_payload,
                        "condition_since": condition_since,
                        "active_event_id": active_event_id,
                    }
                )
            )
            return None

        if condition_since is None:
            await _await_if_needed(
                self.db.upsert_alert_rule_target_state(
                    {**state_payload, "condition_since": evaluated_at, "active_event_id": None}
                )
            )
            return None
        if (evaluated_at - condition_since).total_seconds() < int(rule["for_seconds"]):
            await _await_if_needed(
                self.db.upsert_alert_rule_target_state(
                    {**state_payload, "condition_since": condition_since, "active_event_id": None}
                )
            )
            return None

        event = _firing_event(rule, measurement, evaluated_at=evaluated_at, subject_key=subject_key)
        saved, created = await _await_if_needed(
            self.db.activate_alert_rule_event(
                {**state_payload, "condition_since": condition_since},
                event,
            )
        )
        return {**dict(saved), "transition": "firing"} if created else None

    async def _recover(
        self,
        state: JsonObject,
        state_payload: JsonObject,
        measurement: AlertMeasurement,
        evaluated_at: datetime,
    ) -> JsonObject | None:
        active_event_id = state.get("active_event_id")
        if not active_event_id:
            await _await_if_needed(
                self.db.upsert_alert_rule_target_state(
                    {**state_payload, "condition_since": None, "active_event_id": None}
                )
            )
            return None
        resolved = await _await_if_needed(
            self.db.resolve_alert_rule_event(
                {**state, **state_payload, "active_event_id": active_event_id},
                observed_value=float(measurement.observed_value),
                evidence=[dict(item) for item in measurement.evidence],
                resolved_at=evaluated_at,
            )
        )
        return {**dict(resolved), "transition": "resolved"} if resolved is not None else None


def compare_alert_value(value: float, comparator: str, threshold: float) -> bool:
    comparisons = {
        ">": value > threshold,
        ">=": value >= threshold,
        "<": value < threshold,
        "<=": value <= threshold,
    }
    if comparator not in comparisons:
        raise ValueError("unsupported alert comparator")
    return comparisons[comparator]


def _firing_event(
    rule: Mapping[str, Any],
    measurement: AlertMeasurement,
    *,
    evaluated_at: datetime,
    subject_key: str,
) -> JsonObject:
    return {
        "event_id": f"ale-{uuid.uuid4()}",
        "workspace_id": str(rule["workspace_id"]),
        "rule_id": str(rule["rule_id"]),
        "rule_name": str(rule["name"]),
        "source": "opsia",
        "severity": str(rule["severity"]),
        "subject_key": subject_key,
        "subject": dict(measurement.subject),
        "fired_at": evaluated_at,
        "resolved_at": None,
        "status": "firing",
        "observed_value": float(measurement.observed_value),
        "threshold": float(rule["threshold"]),
        "evidence": [dict(item) for item in measurement.evidence],
        "incident_id": None,
    }


def _datetime_or_none(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return None


async def _await_if_needed(value: Any) -> Any:
    return await value if inspect.isawaitable(value) else value


def _ignore_transition(_transition: JsonObject) -> None:
    return None
