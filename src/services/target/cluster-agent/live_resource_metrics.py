"""Kubelet stats 기반 실시간 Pod 자원 측정.

기존 15초 evidence 수집 경로와 상태를 공유하지 않는다. Kubelet 접근이 실패한
노드만 metrics.k8s.io의 실측값으로 폴백하며, 누락값은 추정하지 않고 ``None``으로
유지한다.
"""

from __future__ import annotations

import asyncio
import math
from collections.abc import Mapping
from typing import Any
from urllib.parse import quote

import httpx
from providers.kubernetes_providers import parse_cpu_mcores, parse_memory_mib

KUBELET_SOURCE = "kubelet_stats_summary"
FALLBACK_SOURCE = "metrics_server_fallback"
UNAVAILABLE_SOURCE = "unavailable"
DEFAULT_NODE_CONCURRENCY = 8
MIB = 1024 * 1024


def collection_interval_for_pods(pod_count: int) -> float:
    """클러스터 크기에 맞춘 수집 간격(초)."""
    if pod_count < 200:
        return 1.0
    if pod_count < 800:
        return 2.0
    if pod_count < 2000:
        return 5.0
    return 10.0


def _positive(value: float | None) -> float | None:
    if value is None or not math.isfinite(value) or value <= 0:
        return None
    return value


def _complete_total(
    containers: list[dict[str, Any]],
    bucket: str,
    resource: str,
) -> float | None:
    if not containers:
        return None
    parser = parse_cpu_mcores if resource == "cpu" else parse_memory_mib
    total = 0.0
    for container in containers:
        resources = container.get("resources")
        values = resources.get(bucket) if isinstance(resources, dict) else None
        value = parser(values.get(resource)) if isinstance(values, dict) else None
        value = _positive(value)
        if value is None:
            return None
        total += value
    return total


def _finite_nonnegative(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(parsed) or parsed < 0:
        return None
    return parsed


def _ratio_percent(actual: float | None, denominator: float | None) -> float | None:
    if actual is None or denominator is None or denominator <= 0:
        return None
    return actual / denominator * 100


def _joined_reason(*reasons: str | None) -> str | None:
    unique = [reason for reason in dict.fromkeys(reasons) if reason]
    return ",".join(unique) or None


class PodResourceMetricsCollector:
    """노드별 kubelet summary를 제한된 병렬도로 수집하고 Pod spec과 결합한다."""

    def __init__(self, node_concurrency: int = DEFAULT_NODE_CONCURRENCY) -> None:
        self.node_concurrency = max(1, min(int(node_concurrency), 32))

    async def collect(
        self,
        client: Any,
        *,
        base_url: str,
        headers: dict[str, str],
        pods: list[dict[str, Any]],
        actual_interval_seconds: float,
    ) -> dict[str, dict[str, Any]]:
        desired: dict[str, dict[str, Any]] = {}
        for pod in pods:
            key = self._pod_key(pod)
            if key is not None:
                desired[key] = pod
        nodes = sorted(
            {
                str(pod.get("spec", {}).get("nodeName") or "")
                for pod in desired.values()
                if pod.get("spec", {}).get("nodeName")
            }
        )
        semaphore = asyncio.Semaphore(self.node_concurrency)

        async def fetch_node(
            node_name: str,
        ) -> tuple[str, dict[tuple[str, str], dict[str, Any]], str | None]:
            async with semaphore:
                measured, reason = await self._fetch_node_stats(
                    client, base_url, headers, node_name
                )
                return node_name, measured, reason

        node_results = {
            node_name: (measured, reason)
            for node_name, measured, reason in await asyncio.gather(
                *(fetch_node(node_name) for node_name in nodes)
            )
        }
        fallback_namespaces = {
            str(pod.get("metadata", {}).get("namespace") or "")
            for pod in desired.values()
            if node_results.get(str(pod.get("spec", {}).get("nodeName") or ""), ({}, None))[1]
        }
        fallback_by_key: dict[tuple[str, str], dict[str, Any]] = {}
        fallback_failures: dict[str, str] = {}
        for namespace in sorted(fallback_namespaces):
            measured, reason = await self._fetch_metrics_namespace(
                client, base_url, headers, namespace, desired
            )
            fallback_by_key.update(measured)
            if reason:
                fallback_failures[namespace] = reason

        result: dict[str, dict[str, Any]] = {}
        for display_key, pod in desired.items():
            metadata = pod.get("metadata", {})
            namespace = str(metadata.get("namespace") or "")
            name = str(metadata.get("name") or "")
            node_name = str(pod.get("spec", {}).get("nodeName") or "")
            source = KUBELET_SOURCE
            reason: str | None = None
            raw: dict[str, Any] | None = None

            if not node_name:
                source = UNAVAILABLE_SOURCE
                reason = "pod_node_unassigned"
            else:
                direct, node_reason = node_results.get(node_name, ({}, "kubelet_stats_unavailable"))
                raw = direct.get((namespace, name))
                if node_reason:
                    source = FALLBACK_SOURCE
                    reason = node_reason
                    raw = fallback_by_key.get((namespace, name))
                    if raw is None:
                        source = UNAVAILABLE_SOURCE
                        reason = _joined_reason(
                            node_reason,
                            fallback_failures.get(namespace),
                            "metrics_server_measurement_unavailable",
                        )
                elif raw is None:
                    source = UNAVAILABLE_SOURCE
                    reason = "kubelet_measurement_missing"
                elif (
                    metadata.get("uid") and raw.get("uid") and metadata.get("uid") != raw.get("uid")
                ):
                    source = UNAVAILABLE_SOURCE
                    reason = "kubelet_pod_uid_mismatch"
                    raw = None

            measurement = self._measurement(
                pod,
                raw,
                source=source,
                actual_interval_seconds=actual_interval_seconds,
                degraded_reason=reason,
            )
            result[display_key] = measurement
        return result

    async def _fetch_node_stats(
        self,
        client: Any,
        base_url: str,
        headers: dict[str, str],
        node_name: str,
    ) -> tuple[dict[tuple[str, str], dict[str, Any]], str | None]:
        url = f"{base_url.rstrip('/')}/api/v1/nodes/{quote(node_name, safe='')}/proxy/stats/summary"
        try:
            response = await client.get(url, headers=headers)
        except httpx.HTTPError:
            return {}, "kubelet_stats_request_failed"
        if response.status_code == 401:
            return {}, "kubelet_stats_unauthorized"
        if response.status_code == 403:
            return {}, "kubelet_stats_forbidden"
        if response.status_code == 404:
            return {}, "kubelet_stats_not_found"
        if response.is_error:
            return {}, f"kubelet_stats_http_{response.status_code}"
        try:
            payload = response.json()
        except ValueError:
            return {}, "kubelet_stats_invalid_payload"
        items = payload.get("pods") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            return {}, "kubelet_stats_invalid_payload"
        measured: dict[tuple[str, str], dict[str, Any]] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            ref = item.get("podRef") if isinstance(item.get("podRef"), dict) else {}
            namespace = str(ref.get("namespace") or "")
            name = str(ref.get("name") or "")
            if not namespace or not name:
                continue
            cpu = item.get("cpu") if isinstance(item.get("cpu"), dict) else {}
            memory = item.get("memory") if isinstance(item.get("memory"), dict) else {}
            nano_cores = _finite_nonnegative(cpu.get("usageNanoCores"))
            working_set = _finite_nonnegative(memory.get("workingSetBytes"))
            measured[(namespace, name)] = {
                "uid": str(ref.get("uid") or ""),
                "cpu_mcores": nano_cores / 1_000_000 if nano_cores is not None else None,
                "mem_bytes": int(working_set) if working_set is not None else None,
                "observed_at": cpu.get("time") or memory.get("time"),
            }
        return measured, None

    async def _fetch_metrics_namespace(
        self,
        client: Any,
        base_url: str,
        headers: dict[str, str],
        namespace: str,
        desired: Mapping[str, dict[str, Any]],
    ) -> tuple[dict[tuple[str, str], dict[str, Any]], str | None]:
        url = (
            f"{base_url.rstrip('/')}/apis/metrics.k8s.io/v1beta1/namespaces/"
            f"{quote(namespace, safe='')}/pods"
        )
        try:
            response = await client.get(url, headers=headers)
        except httpx.HTTPError:
            return {}, "metrics_server_request_failed"
        if response.is_error:
            return {}, f"metrics_server_http_{response.status_code}"
        try:
            payload = response.json()
        except ValueError:
            return {}, "metrics_server_invalid_payload"
        items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(items, list):
            return {}, "metrics_server_invalid_payload"
        specs = {
            (
                str(pod.get("metadata", {}).get("namespace") or ""),
                str(pod.get("metadata", {}).get("name") or ""),
            ): pod
            for pod in desired.values()
        }
        measured: dict[tuple[str, str], dict[str, Any]] = {}
        for item in items:
            if not isinstance(item, dict):
                continue
            metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
            key = (str(metadata.get("namespace") or namespace), str(metadata.get("name") or ""))
            pod = specs.get(key)
            if pod is None:
                continue
            expected = {
                str(container.get("name") or "")
                for container in pod.get("spec", {}).get("containers", [])
                if container.get("name")
            }
            actual = {
                str(container.get("name") or ""): container
                for container in item.get("containers", [])
                if isinstance(container, dict) and container.get("name")
            }
            cpu_values = [
                self._metric_usage(actual[name], "cpu") for name in expected if name in actual
            ]
            mem_values = [
                self._metric_usage(actual[name], "memory") for name in expected if name in actual
            ]
            cpu_mcores = (
                sum(value for value in cpu_values if value is not None)
                if expected
                and len(cpu_values) == len(expected)
                and all(value is not None for value in cpu_values)
                else None
            )
            mem_mib = (
                sum(value for value in mem_values if value is not None)
                if expected
                and len(mem_values) == len(expected)
                and all(value is not None for value in mem_values)
                else None
            )
            measured[key] = {
                "cpu_mcores": cpu_mcores,
                "mem_bytes": int(mem_mib * MIB) if mem_mib is not None else None,
                "observed_at": item.get("timestamp"),
            }
        return measured, None

    def _measurement(
        self,
        pod: dict[str, Any],
        raw: dict[str, Any] | None,
        *,
        source: str,
        actual_interval_seconds: float,
        degraded_reason: str | None,
    ) -> dict[str, Any]:
        raw = raw or {}
        cpu_mcores = _finite_nonnegative(raw.get("cpu_mcores"))
        mem_bytes_value = _finite_nonnegative(raw.get("mem_bytes"))
        mem_bytes = int(mem_bytes_value) if mem_bytes_value is not None else None
        mem_mib = mem_bytes / MIB if mem_bytes is not None else None
        containers = [
            container
            for container in pod.get("spec", {}).get("containers", [])
            if isinstance(container, dict)
        ]
        cpu_request = _complete_total(containers, "requests", "cpu")
        cpu_limit = _complete_total(containers, "limits", "cpu")
        mem_request = _complete_total(containers, "requests", "memory")
        mem_limit = _complete_total(containers, "limits", "memory")
        ratios = {
            "cpu_request_pct": _ratio_percent(cpu_mcores, cpu_request),
            "cpu_limit_pct": _ratio_percent(cpu_mcores, cpu_limit),
            "mem_request_pct": _ratio_percent(mem_mib, mem_request),
            "mem_limit_pct": _ratio_percent(mem_mib, mem_limit),
        }
        if source == KUBELET_SOURCE and (
            cpu_mcores is None
            or mem_bytes is None
            or any(value is None for value in ratios.values())
        ):
            degraded_reason = _joined_reason(degraded_reason, "kubelet_measurement_partial")
        if source == FALLBACK_SOURCE and (cpu_mcores is None or mem_bytes is None):
            degraded_reason = _joined_reason(degraded_reason, "metrics_server_measurement_partial")
        return {
            "cpu_mcores": cpu_mcores,
            "cpu_request_mcores": cpu_request,
            "mem_bytes": mem_bytes,
            "mem_mib": mem_mib,
            "mem_request_mib": mem_request,
            **ratios,
            "observed_at": raw.get("observed_at"),
            "metrics_metadata": {
                "source": source,
                "actual_interval_seconds": actual_interval_seconds,
                "degraded_reason": degraded_reason,
            },
        }

    @staticmethod
    def _pod_key(pod: dict[str, Any]) -> str | None:
        metadata = pod.get("metadata") if isinstance(pod.get("metadata"), dict) else {}
        namespace = str(metadata.get("namespace") or "")
        name = str(metadata.get("name") or "")
        return f"{namespace}/{name}" if namespace and name else None

    @staticmethod
    def _metric_usage(container: dict[str, Any], resource: str) -> float | None:
        usage = container.get("usage") if isinstance(container.get("usage"), dict) else {}
        parser = parse_cpu_mcores if resource == "cpu" else parse_memory_mib
        return _finite_nonnegative(parser(usage.get(resource)))
