"""알림 규칙 지속 시간, 대상별 중복 억제, 해소 전이."""

from __future__ import annotations

import asyncio
import copy
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from domains.alert.evaluation import (
    AlertEvaluationEngine,
    AlertMeasurement,
    compare_alert_value,
)

BASE_TIME = datetime(2026, 7, 15, 1, 0, tzinfo=UTC)
RULE = {
    "rule_id": "alr-1",
    "workspace_id": "workspace-1",
    "name": "파드 CPU 과부하",
    "scope": {
        "clusters": ["cluster-1"],
        "namespaces": ["cluster-1/shop"],
        "applications": [],
        "labels": [],
    },
    "metric": "cpu_pct",
    "comparator": ">",
    "threshold": 80.0,
    "for_seconds": 20,
    "severity": "high",
    "channels": ["chan-ops"],
    "enabled": True,
}


def measurement(
    value: float,
    *,
    name: str = "checkout-0",
    observed_at: datetime = BASE_TIME,
) -> AlertMeasurement:
    subject = {
        "cluster": "cluster-1",
        "namespace": "shop",
        "kind": "Pod",
        "name": name,
    }
    return AlertMeasurement(
        subject=subject,
        observed_value=value,
        observed_at=observed_at,
        evidence=(
            {
                "type": "metric_sample",
                "metric": "cpu_pct",
                "observed_at": observed_at.isoformat(),
                "subject": subject,
                "value": value,
            },
        ),
    )


class StubEvaluationDb:
    def __init__(self) -> None:
        self.rules = [dict(RULE)]
        self.states: dict[tuple[str, str, str], dict[str, Any]] = {}
        self.events: dict[str, dict[str, Any]] = {}
        self.rule_updates: list[tuple[str, str]] = []

    def list_enabled_alert_rules(self) -> list[dict[str, Any]]:
        return [dict(rule) for rule in self.rules if rule["enabled"]]

    def get_alert_rule_target_state(
        self,
        workspace_id: str,
        rule_id: str,
        subject_key: str,
    ) -> dict[str, Any] | None:
        state = self.states.get((workspace_id, rule_id, subject_key))
        return dict(state) if state is not None else None

    def upsert_alert_rule_target_state(self, payload: dict[str, Any]) -> dict[str, Any]:
        key = (payload["workspace_id"], payload["rule_id"], payload["subject_key"])
        previous = self.states.get(key, {})
        self.states[key] = {**previous, **payload}
        return dict(self.states[key])

    def activate_alert_rule_event(
        self,
        state: dict[str, Any],
        event: dict[str, Any],
    ) -> tuple[dict[str, Any], bool]:
        key = (state["workspace_id"], state["rule_id"], state["subject_key"])
        current = self.states.get(key, {})
        active_event_id = current.get("active_event_id")
        if active_event_id:
            return dict(self.events[active_event_id]), False
        self.events[event["event_id"]] = dict(event)
        self.states[key] = {**current, **state, "active_event_id": event["event_id"]}
        self.rule_updates.append((state["workspace_id"], state["rule_id"]))
        return dict(event), True

    def refresh_alert_rule_event(
        self,
        workspace_id: str,
        event_id: str,
        *,
        observed_value: float,
        evidence: list[dict[str, Any]],
        evaluated_at: datetime,
    ) -> None:
        event = self.events[event_id]
        event.update(
            observed_value=observed_value,
            evidence=evidence,
            updated_at=evaluated_at,
        )

    def resolve_alert_rule_event(
        self,
        state: dict[str, Any],
        *,
        observed_value: float,
        evidence: list[dict[str, Any]],
        resolved_at: datetime,
    ) -> dict[str, Any]:
        event = self.events[state["active_event_id"]]
        event.update(
            status="resolved",
            observed_value=observed_value,
            evidence=evidence,
            resolved_at=resolved_at,
            updated_at=resolved_at,
        )
        key = (state["workspace_id"], state["rule_id"], state["subject_key"])
        self.states[key].update(condition_since=None, active_event_id=None)
        return dict(event)


class ConcurrentActivationDb(StubEvaluationDb):
    def __init__(self) -> None:
        super().__init__()
        self.activation_results: list[dict[str, Any]] = []
        self._activation_arrivals = 0
        self._activation_gate: asyncio.Event | None = None
        self._activation_lock: asyncio.Lock | None = None

    async def activate_alert_rule_event(
        self,
        state: dict[str, Any],
        event: dict[str, Any],
    ) -> tuple[dict[str, Any], bool]:
        if self._activation_gate is None:
            self._activation_gate = asyncio.Event()
            self._activation_lock = asyncio.Lock()
        self._activation_arrivals += 1
        if self._activation_arrivals == 2:
            self._activation_gate.set()
        await self._activation_gate.wait()
        assert self._activation_lock is not None
        key = (state["workspace_id"], state["rule_id"], state["subject_key"])
        async with self._activation_lock:
            active_event_id = self.states[key].get("active_event_id")
            if active_event_id:
                saved = dict(self.events[str(active_event_id)])
                created = False
            else:
                saved = dict(event)
                self.events[str(event["event_id"])] = saved
                self.states[key] = {
                    **self.states[key],
                    **state,
                    "active_event_id": event["event_id"],
                }
                created = True
            self.activation_results.append(saved)
            return saved, created


class AtomicEvaluationDb(StubEvaluationDb):
    """In-memory UoW model used to prove notifier failure preserves retry state."""

    def activate_alert_rule_event(
        self,
        state: dict[str, Any],
        event: dict[str, Any],
        *,
        stage_transition=None,
    ) -> tuple[dict[str, Any], bool]:
        snapshot = self._snapshot()
        try:
            saved, created = super().activate_alert_rule_event(state, event)
            if created and stage_transition is not None:
                stage_transition(self, saved)
            return saved, created
        except Exception:
            self._restore(snapshot)
            raise

    def resolve_alert_rule_event(
        self,
        state: dict[str, Any],
        *,
        observed_value: float,
        evidence: list[dict[str, Any]],
        resolved_at: datetime,
        stage_transition=None,
    ) -> dict[str, Any]:
        snapshot = self._snapshot()
        try:
            saved = super().resolve_alert_rule_event(
                state,
                observed_value=observed_value,
                evidence=evidence,
                resolved_at=resolved_at,
            )
            if stage_transition is not None:
                stage_transition(self, saved)
            return saved
        except Exception:
            self._restore(snapshot)
            raise

    def _snapshot(self):
        return copy.deepcopy((self.states, self.events, self.rule_updates))

    def _restore(self, snapshot) -> None:
        self.states, self.events, self.rule_updates = snapshot


class AtomicNotifier:
    def __init__(self) -> None:
        self.fail = False
        self.staged: list[dict[str, Any]] = []

    async def __call__(self, _transition: dict[str, Any]) -> None:
        raise AssertionError("atomic notifier must be staged inside the repository UoW")

    def stage(self, _connection: object, transition: dict[str, Any]) -> None:
        if self.fail:
            raise RuntimeError("outbox unavailable")
        self.staged.append(dict(transition))


def run_once(
    db: StubEvaluationDb,
    value: float,
    now: datetime,
    notifications: list[dict[str, Any]],
) -> None:
    async def load(_rule: dict[str, Any]) -> list[AlertMeasurement]:
        return [measurement(value, observed_at=now)]

    async def notify(transition: dict[str, Any]) -> None:
        notifications.append(transition)

    engine = AlertEvaluationEngine(db, load_measurements=load, notify=notify)
    asyncio.run(engine.evaluate_once(now=now))


def test_alert_rule_waits_for_full_duration_then_fires_once() -> None:
    db = StubEvaluationDb()
    notifications: list[dict[str, Any]] = []

    run_once(db, 90, BASE_TIME, notifications)
    run_once(db, 91, BASE_TIME + timedelta(seconds=19), notifications)
    assert db.events == {}
    assert notifications == []

    run_once(db, 92, BASE_TIME + timedelta(seconds=20), notifications)
    assert len(db.events) == 1
    event = next(iter(db.events.values()))
    assert event["status"] == "firing"
    assert event["observed_value"] == 92
    assert event["threshold"] == 80
    assert event["evidence"]
    assert db.rule_updates == [("workspace-1", "alr-1")]
    assert [item["transition"] for item in notifications] == ["firing"]
    assert notifications[0]["channel_ids"] == ["chan-ops"]

    run_once(db, 95, BASE_TIME + timedelta(seconds=25), notifications)
    assert len(db.events) == 1
    assert next(iter(db.events.values()))["observed_value"] == 95
    assert [item["transition"] for item in notifications] == ["firing"]


def test_concurrent_evaluators_publish_only_the_winning_active_event() -> None:
    db = ConcurrentActivationDb()
    current = measurement(92, observed_at=BASE_TIME + timedelta(seconds=20))
    key = (RULE["workspace_id"], RULE["rule_id"], current.subject_key)
    db.states[key] = {
        "workspace_id": RULE["workspace_id"],
        "rule_id": RULE["rule_id"],
        "subject_key": current.subject_key,
        "subject": current.subject,
        "condition_since": BASE_TIME,
        "active_event_id": None,
        "last_observed_value": 90.0,
        "last_evidence": [
            {
                "type": "metric_sample",
                "observed_at": BASE_TIME.isoformat(),
            }
        ],
        "last_evaluated_at": BASE_TIME,
    }
    notifications: list[dict[str, Any]] = []

    async def load(_rule: dict[str, Any]) -> list[AlertMeasurement]:
        return [current]

    async def run_concurrently() -> list[list[dict[str, Any]]]:
        engines = [
            AlertEvaluationEngine(db, load_measurements=load, notify=notifications.append)
            for _ in range(2)
        ]
        return await asyncio.gather(
            *(engine.evaluate_once(now=current.observed_at) for engine in engines)
        )

    transitions = asyncio.run(run_concurrently())

    assert len(db.events) == 1
    assert len(notifications) == 1
    assert sorted(len(items) for items in transitions) == [0, 1]
    assert len({item["event_id"] for item in db.activation_results}) == 1
    assert notifications[0]["event_id"] == next(iter(db.events))


def test_alert_rule_resets_pending_and_resolves_only_on_observed_recovery() -> None:
    db = StubEvaluationDb()
    notifications: list[dict[str, Any]] = []

    run_once(db, 90, BASE_TIME, notifications)
    run_once(db, 70, BASE_TIME + timedelta(seconds=10), notifications)
    run_once(db, 90, BASE_TIME + timedelta(seconds=15), notifications)
    run_once(db, 90, BASE_TIME + timedelta(seconds=34), notifications)
    assert db.events == {}

    run_once(db, 90, BASE_TIME + timedelta(seconds=35), notifications)
    event_id = next(iter(db.events))
    run_once(db, 60, BASE_TIME + timedelta(seconds=40), notifications)

    assert db.events[event_id]["status"] == "resolved"
    assert db.events[event_id]["resolved_at"] == BASE_TIME + timedelta(seconds=40)
    assert [item["transition"] for item in notifications] == ["firing", "resolved"]
    assert [item["channel_ids"] for item in notifications] == [
        ["chan-ops"],
        ["chan-ops"],
    ]


def test_outbox_failure_rolls_back_rule_transitions_and_same_sample_retries() -> None:
    db = AtomicEvaluationDb()
    notifier = AtomicNotifier()
    current = measurement(90, observed_at=BASE_TIME)

    async def load(_rule: dict[str, Any]) -> list[AlertMeasurement]:
        return [current]

    engine = AlertEvaluationEngine(db, load_measurements=load, notify=notifier)

    asyncio.run(engine.evaluate_once(now=BASE_TIME))
    current = measurement(92, observed_at=BASE_TIME + timedelta(seconds=20))
    notifier.fail = True
    with pytest.raises(RuntimeError, match="outbox unavailable"):
        asyncio.run(engine.evaluate_once(now=current.observed_at))

    assert db.events == {}
    assert next(iter(db.states.values()))["active_event_id"] is None

    notifier.fail = False
    asyncio.run(engine.evaluate_once(now=current.observed_at))
    event_id = next(iter(db.events))
    assert db.events[event_id]["status"] == "firing"
    assert [item["transition"] for item in notifier.staged] == ["firing"]

    current = measurement(60, observed_at=BASE_TIME + timedelta(seconds=25))
    notifier.fail = True
    with pytest.raises(RuntimeError, match="outbox unavailable"):
        asyncio.run(engine.evaluate_once(now=current.observed_at))

    assert db.events[event_id]["status"] == "firing"
    assert next(iter(db.states.values()))["active_event_id"] == event_id

    notifier.fail = False
    asyncio.run(engine.evaluate_once(now=current.observed_at))
    assert db.events[event_id]["status"] == "resolved"
    assert [item["transition"] for item in notifier.staged] == ["firing", "resolved"]


def test_missing_measurement_does_not_manufacture_a_resolution() -> None:
    db = StubEvaluationDb()
    notifications: list[dict[str, Any]] = []

    run_once(db, 90, BASE_TIME, notifications)
    run_once(db, 90, BASE_TIME + timedelta(seconds=20), notifications)

    async def load(_rule: dict[str, Any]) -> list[AlertMeasurement]:
        return []

    engine = AlertEvaluationEngine(db, load_measurements=load, notify=notifications.append)
    asyncio.run(engine.evaluate_once(now=BASE_TIME + timedelta(seconds=30)))

    assert next(iter(db.events.values()))["status"] == "firing"
    assert [item["transition"] for item in notifications] == ["firing"]


def test_repeated_sample_does_not_satisfy_duration_or_resolve() -> None:
    db = StubEvaluationDb()
    notifications: list[dict[str, Any]] = []

    async def load_high(_rule: dict[str, Any]) -> list[AlertMeasurement]:
        return [measurement(90, observed_at=BASE_TIME)]

    engine = AlertEvaluationEngine(db, load_measurements=load_high, notify=notifications.append)
    asyncio.run(engine.evaluate_once(now=BASE_TIME))
    asyncio.run(engine.evaluate_once(now=BASE_TIME + timedelta(seconds=30)))

    assert db.events == {}
    state = next(iter(db.states.values()))
    assert state["condition_since"] == BASE_TIME
    assert state["last_evaluated_at"] == BASE_TIME


def test_duration_uses_real_sample_span_instead_of_worker_clock() -> None:
    db = StubEvaluationDb()
    notifications: list[dict[str, Any]] = []
    samples = iter(
        (
            measurement(90, observed_at=BASE_TIME),
            measurement(91, observed_at=BASE_TIME + timedelta(seconds=19)),
            measurement(92, observed_at=BASE_TIME + timedelta(seconds=20)),
        )
    )

    async def load(_rule: dict[str, Any]) -> list[AlertMeasurement]:
        return [next(samples)]

    engine = AlertEvaluationEngine(db, load_measurements=load, notify=notifications.append)
    asyncio.run(engine.evaluate_once(now=BASE_TIME + timedelta(minutes=1)))
    asyncio.run(engine.evaluate_once(now=BASE_TIME + timedelta(minutes=2)))
    assert db.events == {}
    asyncio.run(engine.evaluate_once(now=BASE_TIME + timedelta(minutes=3)))

    assert len(db.events) == 1
    assert next(iter(db.events.values()))["observed_value"] == 92


@pytest.mark.parametrize(
    ("comparator", "value", "threshold", "expected"),
    (
        (">", 2, 1, True),
        (">", 1, 1, False),
        (">=", 1, 1, True),
        ("<", 0, 1, True),
        ("<", 1, 1, False),
        ("<=", 1, 1, True),
    ),
)
def test_alert_comparators_are_explicit(
    comparator: str,
    value: float,
    threshold: float,
    expected: bool,
) -> None:
    assert compare_alert_value(value, comparator, threshold) is expected


def test_measurement_requires_evidence_and_loop_interval_is_five_to_fifteen_seconds() -> None:
    with pytest.raises(ValueError, match="evidence"):
        AlertMeasurement(
            subject={"cluster": "cluster-1", "namespace": "shop", "kind": "Pod", "name": "p"},
            observed_value=90,
            observed_at=BASE_TIME,
            evidence=(),
        )

    db = StubEvaluationDb()
    with pytest.raises(ValueError, match="5 and 15"):
        AlertEvaluationEngine(db, load_measurements=lambda _rule: [], interval_seconds=4)
    with pytest.raises(ValueError, match="5 and 15"):
        AlertEvaluationEngine(db, load_measurements=lambda _rule: [], interval_seconds=16)
