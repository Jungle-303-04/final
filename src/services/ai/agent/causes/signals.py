"""RCA 판별 신호(signal) 평가 — 근거 번들 내용으로 원인 후보를 실제로 구별한다.

배경: 기존 점수는 "근거 소스가 존재하는가"만 봐서, kubernetes/metrics/logs 가 다 있으면
아무 후보나(예: exit code 1 크래시에 oom_killed) 1.0 으로 완결되는 오판이 있었다.
이 모듈은 카탈로그 후보의 `signals` 그룹을 근거 번들 **내용**과 대조한다.

DSL(카탈로그 YAML `signals`) — 그룹 목록이며, 그룹마다 `any_of` matcher 중 하나라도
매칭되면 충족. 선언된 그룹이 모두 충족돼야 후보가 완결 점수(1.0)에 도달할 수 있다.

matcher 종류(정확히 하나의 키만 사용):
- `fact`: kubernetes snapshot 에서 뽑은 정규화 토큰과 일치.
  토큰 어휘: `waiting_reason=<r>`, `terminated_reason=<r>`, `event_reason=<r>`,
  `exit_code=<n>`, `pod_label:<key>=<value>`, 그리고 파생 토큰
  `exit_code=non_oom`(0/137 이 아닌 종료 코드 관측).
- `log_pattern`: 수집 로그 라인(단순 line + Loki streams.values.line) 대소문자 무시 부분일치.
- `event_pattern`: warning 이벤트 "reason message" 문자열 대소문자 무시 부분일치.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from domains.rca.events import EvidenceBundle
from packages.contracts.event_bus.bodies import JsonObject

# matcher 키 어휘 — 로더(causes/loader.py) 스키마 검증과 평가가 같은 표를 쓴다.
MATCHER_KEYS = ("fact", "log_pattern", "event_pattern")

FACT_WAITING_REASON = "waiting_reason"
FACT_TERMINATED_REASON = "terminated_reason"
FACT_EVENT_REASON = "event_reason"
FACT_EXIT_CODE = "exit_code"
# Alertmanager firing 알림 — Prometheus 가 실제 평가한 관측 결과를 fact 로 승격한다.
# 토큰 어휘: `alert_name=<alertname>`.
FACT_ALERT_NAME = "alert_name"
FACT_POD_LABEL_PREFIX = "pod_label:"
# OOM(137)도 정상 종료(0)도 아닌 종료 코드 — 일반 앱/설정 크래시(exit 1 등) 판별용.
FACT_EXIT_CODE_NON_OOM = "exit_code=non_oom"
OOM_EXIT_CODE = 137


@dataclass(frozen=True)
class BundleSignals:
    """근거 번들에서 추출한 매칭 대상 — facts + 로그 라인 + 이벤트 문자열."""

    facts: frozenset[str] = frozenset()
    log_lines: tuple[str, ...] = ()
    event_texts: tuple[str, ...] = ()


@dataclass
class _SignalCollector:
    facts: set[str] = field(default_factory=set)
    log_lines: list[str] = field(default_factory=list)
    event_texts: list[str] = field(default_factory=list)


def extract_bundle_signals(evidence_bundle: EvidenceBundle) -> BundleSignals:
    """근거 번들 items 를 순회하며 fact 토큰·로그 라인·이벤트 문자열을 추출한다."""
    collector = _SignalCollector()
    for item in evidence_bundle.items:
        if item.source == "kubernetes":
            collect_kubernetes_signals(item.value, collector)
        elif item.source == "logs":
            collect_log_lines(item.value, collector)
        elif item.source == "metrics":
            collect_alert_facts(item.value, collector)
    return BundleSignals(
        facts=frozenset(collector.facts),
        log_lines=tuple(collector.log_lines),
        event_texts=tuple(collector.event_texts),
    )


def collect_kubernetes_signals(value: JsonObject, collector: _SignalCollector) -> None:
    for pod in dict_items(value.get("pods")):
        collect_pod_label_facts(pod, collector)
        for reason in text_items(pod.get("waiting_reasons")):
            collector.facts.add(f"{FACT_WAITING_REASON}={reason}")
        for reason in text_items(pod.get("terminated_reasons")):
            collector.facts.add(f"{FACT_TERMINATED_REASON}={reason}")
        for container in dict_items(pod.get("containers")):
            add_exit_code_facts(container, collector)
    for event in dict_items(value.get("events")):
        reason = str(event.get("reason") or "").strip()
        message = str(event.get("message") or "").strip()
        if reason:
            collector.facts.add(f"{FACT_EVENT_REASON}={reason}")
        if reason or message:
            collector.event_texts.append(f"{reason} {message}".strip())


def collect_pod_label_facts(pod: JsonObject, collector: _SignalCollector) -> None:
    """Promote bounded, non-secret Pod labels into exact-match RCA facts."""
    labels = pod.get("labels")
    if not isinstance(labels, dict):
        return
    for raw_key, raw_value in labels.items():
        key = str(raw_key).strip()
        value = str(raw_value).strip()
        if key and value:
            collector.facts.add(f"{FACT_POD_LABEL_PREFIX}{key}={value}")


def add_exit_code_facts(container: JsonObject, collector: _SignalCollector) -> None:
    """현재 상태(exit_code)와 직전 상태(last_exit_code) 종료 코드를 fact 로 승격."""
    for key in ("exit_code", "last_exit_code"):
        raw = container.get(key)
        if raw is None or isinstance(raw, bool):
            continue
        try:
            code = int(raw)
        except (TypeError, ValueError):
            continue
        collector.facts.add(f"{FACT_EXIT_CODE}={code}")
        if code not in (0, OOM_EXIT_CODE):
            collector.facts.add(FACT_EXIT_CODE_NON_OOM)


def collect_alert_facts(value: JsonObject, collector: _SignalCollector) -> None:
    """metrics["alertmanager"] 의 firing 알림 이름을 fact 토큰으로 추출한다."""
    alertmanager = value.get("alertmanager")
    if not isinstance(alertmanager, dict):
        return
    for alert in dict_items(alertmanager.get("alerts")):
        if str(alert.get("status") or "firing") != "firing":
            continue
        labels = alert.get("labels")
        if not isinstance(labels, dict):
            continue
        name = str(labels.get("alertname") or "").strip()
        if name:
            collector.facts.add(f"{FACT_ALERT_NAME}={name}")


def collect_log_lines(value: JsonObject, collector: _SignalCollector) -> None:
    """단순 {"line": ...} 항목과 Loki 정규화 payload(streams[].values[].line) 모두 지원."""
    for entry in dict_items(value.get("entries")):
        line = entry.get("line")
        if isinstance(line, str) and line:
            collector.log_lines.append(line)
        for stream in dict_items(entry.get("streams")):
            for sample in dict_items(stream.get("values")):
                sample_line = sample.get("line")
                if isinstance(sample_line, str) and sample_line:
                    collector.log_lines.append(sample_line)


def match_signal_group(group: JsonObject, signals: BundleSignals) -> bool:
    """그룹 충족 여부 — any_of matcher 중 하나라도 매칭되면 True."""
    matchers = group.get("any_of")
    if not isinstance(matchers, list) or not matchers:
        return False
    return any(isinstance(matcher, dict) and match_one(matcher, signals) for matcher in matchers)


def match_one(matcher: JsonObject, signals: BundleSignals) -> bool:
    fact = matcher.get("fact")
    if isinstance(fact, str):
        return fact in signals.facts
    log_pattern = matcher.get("log_pattern")
    if isinstance(log_pattern, str):
        needle = log_pattern.casefold()
        return any(needle in line.casefold() for line in signals.log_lines)
    event_pattern = matcher.get("event_pattern")
    if isinstance(event_pattern, str):
        needle = event_pattern.casefold()
        return any(needle in text.casefold() for text in signals.event_texts)
    return False


def split_signal_groups(
    candidate_signals: list[JsonObject],
    signals: BundleSignals,
) -> tuple[list[JsonObject], list[JsonObject]]:
    """후보 signals 를 (matched, unmatched) 로 분리한다(순서 보존)."""
    matched: list[JsonObject] = []
    unmatched: list[JsonObject] = []
    for group in candidate_signals:
        if match_signal_group(group, signals):
            matched.append(group)
        else:
            unmatched.append(group)
    return matched, unmatched


def signal_group_id(group: JsonObject) -> str:
    return str(group.get("id") or "unnamed")


def signal_missing_token(group: JsonObject) -> str:
    """미충족 그룹의 missing_evidence 토큰 — `signal:<group id>`."""
    return f"signal:{signal_group_id(group)}"


def describe_signal_group(group: JsonObject) -> str:
    """미충족 사유 문구용 — any_of matcher 를 사람이 읽을 요약으로 변환."""
    parts: list[str] = []
    for matcher in group.get("any_of") or []:
        if not isinstance(matcher, dict):
            continue
        for key in MATCHER_KEYS:
            value = matcher.get(key)
            if isinstance(value, str):
                parts.append(f"{key}:{value}")
    return " | ".join(parts) if parts else "정의된 matcher 없음"


def dict_items(value: object) -> list[JsonObject]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def text_items(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item]
