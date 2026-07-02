#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import subprocess
import textwrap
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
INDEX_PATH = ROOT / "index.html"
DEBUG_NAMESPACE = os.environ.get("DEBUG_LAB_NAMESPACE", "debug-lab")
DEBUG_IMAGE = os.environ.get("DEBUG_LAB_IMAGE", "service:local")
GATEWAY_BASE_URL = os.environ.get("DEBUG_LAB_GATEWAY_URL", "http://localhost:18080")
STATE_CACHE_TTL_SECONDS = 4.0
COLLECT_TOP = os.environ.get("DEBUG_LAB_COLLECT_TOP", "0") == "1"
KUBECTL_REQUEST_TIMEOUT = os.environ.get("DEBUG_LAB_KUBECTL_REQUEST_TIMEOUT", "4s")

CLUSTERS = {
    "management": {
        "context": "kind-management",
        "namespaces": {"debug-lab", "management", "kube-system", "local-path-storage"},
    },
    "target": {
        "context": "kind-target",
        "namespaces": {"debug-lab", "target", "sandbox", "kube-system", "local-path-storage"},
    },
}
WORKLOADS = ("demo-checkout", "demo-payments")

_state_cache: tuple[float, dict[str, Any]] | None = None
_state_lock = threading.Lock()


WORKLOAD_APP = r"""
from __future__ import annotations

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

WORKLOAD_NAME = os.environ.get("WORKLOAD_NAME", "debug-workload")
IMAGE_VERSION = os.environ.get("IMAGE_VERSION", "v1")
PORT = int(os.environ.get("PORT", "8080"))
state = {
    "readiness_fail": os.environ.get("READINESS_FAIL", "0") == "1",
    "cpu_load": os.environ.get("CPU_LOAD", "0") == "1",
    "delay_ms": int(os.environ.get("DELAY_MS", "0") or "0"),
    "memory_mb": int(os.environ.get("MEMORY_MB", "0") or "0"),
    "started_at": time.time(),
}
memory_holder = bytearray(max(state["memory_mb"], 0) * 1024 * 1024)


def cpu_burner() -> None:
    while True:
        if state["cpu_load"]:
            end = time.time() + 0.05
            value = 0
            while time.time() < end:
                value = (value + 1) % 1000003
        else:
            time.sleep(0.1)


def set_memory(mb: int) -> None:
    global memory_holder
    state["memory_mb"] = max(mb, 0)
    memory_holder = bytearray(state["memory_mb"] * 1024 * 1024)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args: object) -> None:
        return

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def _delay(self) -> None:
        if state["delay_ms"] > 0:
            time.sleep(state["delay_ms"] / 1000)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/ready":
            self._delay()
            if state["readiness_fail"]:
                self._send_json(503, {"ready": False, "workload": WORKLOAD_NAME})
                return
            self._send_json(200, {"ready": True, "workload": WORKLOAD_NAME})
            return
        if parsed.path == "/live":
            self._send_json(200, {"live": True, "workload": WORKLOAD_NAME})
            return
        if parsed.path == "/cpu/start":
            state["cpu_load"] = True
        elif parsed.path == "/cpu/stop":
            state["cpu_load"] = False
        elif parsed.path == "/memory/start":
            set_memory(int(query.get("mb", ["128"])[0] or "128"))
        elif parsed.path == "/memory/stop":
            set_memory(0)
        elif parsed.path == "/readiness/fail":
            state["readiness_fail"] = True
        elif parsed.path == "/readiness/ok":
            state["readiness_fail"] = False
        elif parsed.path == "/delay":
            state["delay_ms"] = int(query.get("ms", ["500"])[0] or "500")
        elif parsed.path == "/delay/stop":
            state["delay_ms"] = 0
        elif parsed.path == "/crash":
            self._send_json(200, {"crashing": True, "workload": WORKLOAD_NAME})
            os._exit(42)
        self._delay()
        self._send_json(
            200,
            {
                "workload": WORKLOAD_NAME,
                "imageVersion": IMAGE_VERSION,
                "state": state,
                "pid": os.getpid(),
                "uptimeSeconds": round(time.time() - state["started_at"], 1),
            },
        )


if os.environ.get("CRASH_LOOP", "0") == "1":
    time.sleep(3)
    os._exit(42)

threading.Thread(target=cpu_burner, daemon=True).start()
ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
"""


def run_command(
    args: list[str],
    input_text: str | None = None,
    timeout: int = 15,
) -> dict[str, Any]:
    started = time.time()
    try:
        completed = subprocess.run(
            args,
            input=input_text,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
        return {
            "ok": completed.returncode == 0,
            "code": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
            "cmd": args,
            "elapsedMs": int((time.time() - started) * 1000),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "ok": False,
            "code": 124,
            "stdout": exc.stdout or "",
            "stderr": f"timeout after {timeout}s",
            "cmd": args,
            "elapsedMs": int((time.time() - started) * 1000),
        }
    except FileNotFoundError as exc:
        return {
            "ok": False,
            "code": 127,
            "stdout": "",
            "stderr": str(exc),
            "cmd": args,
            "elapsedMs": int((time.time() - started) * 1000),
        }


def kubectl(cluster: str, args: list[str], **kwargs: Any) -> dict[str, Any]:
    context = CLUSTERS[cluster]["context"]
    return run_command(
        ["kubectl", f"--request-timeout={KUBECTL_REQUEST_TIMEOUT}", "--context", context, *args],
        **kwargs,
    )


def kubectl_json(cluster: str, args: list[str], timeout: int = 5) -> tuple[Any, dict[str, Any]]:
    result = kubectl(cluster, [*args, "-o", "json"], timeout=timeout)
    if not result["ok"]:
        return None, result
    try:
        return json.loads(result["stdout"] or "{}"), result
    except json.JSONDecodeError as exc:
        result["ok"] = False
        result["stderr"] = f"json decode failed: {exc}"
        return None, result


def condition_status(item: dict[str, Any], condition_type: str) -> str:
    for condition in item.get("status", {}).get("conditions", []) or []:
        if condition.get("type") == condition_type:
            return str(condition.get("status") or "")
    return ""


def owner_name(item: dict[str, Any], kind: str | None = None) -> str:
    for owner in item.get("metadata", {}).get("ownerReferences", []) or []:
        if kind is None or owner.get("kind") == kind:
            return str(owner.get("name") or "")
    return ""


def first_container_image(item: dict[str, Any]) -> str:
    containers = item.get("spec", {}).get("template", {}).get("spec", {}).get("containers", [])
    if containers:
        return str(containers[0].get("image") or "")
    return ""


def pod_ready(item: dict[str, Any]) -> bool:
    statuses = item.get("status", {}).get("containerStatuses", []) or []
    return bool(statuses) and all(status.get("ready") is True for status in statuses)


def pod_reason(item: dict[str, Any]) -> str:
    statuses = item.get("status", {}).get("containerStatuses", []) or []
    for status in statuses:
        state = status.get("state", {}) or {}
        for key in ("waiting", "terminated"):
            if key in state:
                return str(state[key].get("reason") or key)
    return str(item.get("status", {}).get("reason") or "")


def summarize_node(item: dict[str, Any]) -> dict[str, Any]:
    metadata = item.get("metadata", {})
    status = item.get("status", {})
    allocatable = status.get("allocatable", {}) or {}
    return {
        "name": metadata.get("name", ""),
        "ready": condition_status(item, "Ready") == "True",
        "cpu": allocatable.get("cpu", ""),
        "memory": allocatable.get("memory", ""),
        "pods": allocatable.get("pods", ""),
        "version": status.get("nodeInfo", {}).get("kubeletVersion", ""),
    }


def summarize_deployment(item: dict[str, Any]) -> dict[str, Any]:
    metadata = item.get("metadata", {})
    spec = item.get("spec", {})
    status = item.get("status", {})
    desired = int(spec.get("replicas") or 0)
    ready = int(status.get("readyReplicas") or 0)
    available = int(status.get("availableReplicas") or 0)
    return {
        "namespace": metadata.get("namespace", ""),
        "name": metadata.get("name", ""),
        "app": (metadata.get("labels") or {}).get("app", ""),
        "desired": desired,
        "ready": ready,
        "available": available,
        "updated": int(status.get("updatedReplicas") or 0),
        "image": first_container_image(item),
        "availableCondition": condition_status(item, "Available"),
        "progressingCondition": condition_status(item, "Progressing"),
        "debugLab": metadata.get("namespace") == DEBUG_NAMESPACE,
    }


def summarize_replicaset(item: dict[str, Any]) -> dict[str, Any]:
    metadata = item.get("metadata", {})
    spec = item.get("spec", {})
    status = item.get("status", {})
    return {
        "namespace": metadata.get("namespace", ""),
        "name": metadata.get("name", ""),
        "app": (metadata.get("labels") or {}).get("app", ""),
        "deployment": owner_name(item, "Deployment"),
        "desired": int(spec.get("replicas") or 0),
        "ready": int(status.get("readyReplicas") or 0),
        "available": int(status.get("availableReplicas") or 0),
    }


def summarize_pod(item: dict[str, Any]) -> dict[str, Any]:
    metadata = item.get("metadata", {})
    status = item.get("status", {})
    container_statuses = status.get("containerStatuses", []) or []
    return {
        "namespace": metadata.get("namespace", ""),
        "name": metadata.get("name", ""),
        "app": (metadata.get("labels") or {}).get("app", ""),
        "phase": status.get("phase", ""),
        "ready": pod_ready(item),
        "reason": pod_reason(item),
        "restarts": sum(
            int(container.get("restartCount") or 0) for container in container_statuses
        ),
        "podIP": status.get("podIP", ""),
        "node": item.get("spec", {}).get("nodeName", ""),
        "ownerReplicaSet": owner_name(item, "ReplicaSet"),
        "createdAt": metadata.get("creationTimestamp", ""),
        "deleting": bool(metadata.get("deletionTimestamp")),
    }


def summarize_job(item: dict[str, Any]) -> dict[str, Any]:
    metadata = item.get("metadata", {})
    status = item.get("status", {})
    spec = item.get("spec", {})
    return {
        "namespace": metadata.get("namespace", ""),
        "name": metadata.get("name", ""),
        "active": int(status.get("active") or 0),
        "succeeded": int(status.get("succeeded") or 0),
        "failed": int(status.get("failed") or 0),
        "completions": spec.get("completions", ""),
        "complete": condition_status(item, "Complete") == "True",
        "failedCondition": condition_status(item, "Failed") == "True",
    }


def summarize_endpoint(item: dict[str, Any]) -> dict[str, Any]:
    metadata = item.get("metadata", {})
    subsets = item.get("subsets", []) or []
    ready = 0
    not_ready = 0
    ports: list[str] = []
    for subset in subsets:
        ready += len(subset.get("addresses", []) or [])
        not_ready += len(subset.get("notReadyAddresses", []) or [])
        for port in subset.get("ports", []) or []:
            ports.append(str(port.get("port", "")))
    return {
        "namespace": metadata.get("namespace", ""),
        "name": metadata.get("name", ""),
        "ready": ready,
        "notReady": not_ready,
        "ports": ports,
    }


def parse_top_rows(output: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in output.splitlines():
        parts = line.split()
        if len(parts) >= 3:
            rows.append({"name": parts[0], "cpu": parts[1], "memory": parts[2]})
    return rows


def collect_top(cluster: str, target: str) -> dict[str, Any]:
    if not COLLECT_TOP:
        return {
            "ok": False,
            "rows": [],
            "error": "disabled: set DEBUG_LAB_COLLECT_TOP=1 when metrics-server is available",
        }
    args = ["top", target]
    if target == "pods":
        args.append("-A")
    args.append("--no-headers")
    result = kubectl(cluster, args, timeout=2)
    return {
        "ok": result["ok"],
        "rows": parse_top_rows(result["stdout"]) if result["ok"] else [],
        "error": "" if result["ok"] else (result["stderr"] or result["stdout"]).strip(),
    }


def empty_cluster_state(cluster: str, error: str) -> dict[str, Any]:
    return {
        "name": cluster,
        "context": CLUSTERS[cluster]["context"],
        "namespaces": sorted(allowed_namespaces(cluster)),
        "summary": {
            "nodes": 0,
            "readyNodes": 0,
            "deployments": 0,
            "readyDeployments": 0,
            "pods": 0,
            "readyPods": 0,
            "runningPods": 0,
            "failedJobs": 0,
            "readyEndpoints": 0,
            "notReadyEndpoints": 0,
        },
        "nodes": [],
        "deployments": [],
        "replicasets": [],
        "pods": [],
        "jobs": [],
        "endpoints": [],
        "top": {
            "nodes": {"ok": False, "rows": [], "error": error},
            "pods": {"ok": False, "rows": [], "error": error},
        },
        "errors": [{"resource": "collector", "error": error}],
    }


def allowed_namespaces(cluster: str) -> set[str]:
    return set(CLUSTERS[cluster]["namespaces"])


def in_scope(cluster: str, item: dict[str, Any]) -> bool:
    namespace = item.get("metadata", {}).get("namespace", "")
    return namespace in allowed_namespaces(cluster)


def collect_cluster(cluster: str) -> dict[str, Any]:
    nodes_doc, nodes_result = kubectl_json(cluster, ["get", "nodes"])
    mixed_doc, mixed_result = kubectl_json(
        cluster,
        ["get", "deployments,replicasets,pods,jobs,endpoints", "-A"],
    )
    errors = []
    if not nodes_result["ok"]:
        errors.append(
            {"resource": "nodes", "error": nodes_result["stderr"] or nodes_result["stdout"]}
        )
    if not mixed_result["ok"]:
        errors.append(
            {
                "resource": "workloads",
                "error": mixed_result["stderr"] or mixed_result["stdout"],
            }
        )
    items = mixed_doc.get("items", []) if isinstance(mixed_doc, dict) else []
    deployments = [
        summarize_deployment(item)
        for item in items
        if item.get("kind") == "Deployment" and in_scope(cluster, item)
    ]
    replicasets = [
        summarize_replicaset(item)
        for item in items
        if item.get("kind") == "ReplicaSet" and in_scope(cluster, item)
    ]
    pods = [
        summarize_pod(item)
        for item in items
        if item.get("kind") == "Pod" and in_scope(cluster, item)
    ]
    jobs = [
        summarize_job(item)
        for item in items
        if item.get("kind") == "Job" and in_scope(cluster, item)
    ]
    endpoints = [
        summarize_endpoint(item)
        for item in items
        if item.get("kind") == "Endpoints" and in_scope(cluster, item)
    ]
    nodes = (
        [summarize_node(item) for item in nodes_doc.get("items", [])]
        if isinstance(nodes_doc, dict)
        else []
    )
    summary = {
        "nodes": len(nodes),
        "readyNodes": sum(1 for node in nodes if node["ready"]),
        "deployments": len(deployments),
        "readyDeployments": sum(
            1
            for deployment in deployments
            if deployment["desired"] == deployment["ready"] and deployment["desired"] > 0
        ),
        "pods": len(pods),
        "readyPods": sum(1 for pod in pods if pod["ready"]),
        "runningPods": sum(1 for pod in pods if pod["phase"] == "Running"),
        "failedJobs": sum(1 for job in jobs if job["failed"] > 0 or job["failedCondition"]),
        "readyEndpoints": sum(endpoint["ready"] for endpoint in endpoints),
        "notReadyEndpoints": sum(endpoint["notReady"] for endpoint in endpoints),
    }
    return {
        "name": cluster,
        "context": CLUSTERS[cluster]["context"],
        "namespaces": sorted(allowed_namespaces(cluster)),
        "summary": summary,
        "nodes": nodes,
        "deployments": deployments,
        "replicasets": replicasets,
        "pods": pods,
        "jobs": jobs,
        "endpoints": endpoints,
        "top": {
            "nodes": collect_top(cluster, "nodes"),
            "pods": collect_top(cluster, "pods"),
        },
        "errors": errors,
    }


def http_check(path: str) -> dict[str, Any]:
    url = f"{GATEWAY_BASE_URL}{path}"
    started = time.time()
    try:
        with urllib.request.urlopen(url, timeout=1.0) as response:
            body = response.read(400).decode("utf-8", "replace")
            return {
                "ok": 200 <= response.status < 300,
                "status": response.status,
                "body": body,
                "url": url,
                "elapsedMs": int((time.time() - started) * 1000),
            }
    except urllib.error.HTTPError as exc:
        return {
            "ok": False,
            "status": exc.code,
            "body": exc.read(400).decode("utf-8", "replace"),
            "url": url,
            "elapsedMs": int((time.time() - started) * 1000),
        }
    except Exception as exc:
        return {
            "ok": False,
            "status": 0,
            "body": str(exc),
            "url": url,
            "elapsedMs": int((time.time() - started) * 1000),
        }


def collect_state(force: bool = False) -> dict[str, Any]:
    global _state_cache
    now = time.time()
    if not force and _state_cache and now - _state_cache[0] < STATE_CACHE_TTL_SECONDS:
        return _state_cache[1]
    locked = _state_lock.acquire(blocking=False)
    if not locked:
        if _state_cache:
            return _state_cache[1]
        _state_lock.acquire()
    try:
        now = time.time()
        if not force and _state_cache and now - _state_cache[0] < STATE_CACHE_TTL_SECONDS:
            return _state_cache[1]
        state = {
            "generatedAt": now,
            "debugNamespace": DEBUG_NAMESPACE,
            "image": DEBUG_IMAGE,
            "gateway": {
                "healthz": http_check("/healthz"),
                "readyz": http_check("/readyz"),
            },
            "clusters": {},
        }
        for name in CLUSTERS:
            try:
                state["clusters"][name] = collect_cluster(name)
            except Exception as exc:
                state["clusters"][name] = empty_cluster_state(name, str(exc))
        _state_cache = (now, state)
        return state
    finally:
        _state_lock.release()


def workload_yaml(cluster: str) -> str:
    script = textwrap.indent(WORKLOAD_APP.strip() + "\n", "    ")
    docs = [
        f"""
apiVersion: v1
kind: Namespace
metadata:
  name: {DEBUG_NAMESPACE}
""",
        f"""
apiVersion: v1
kind: ConfigMap
metadata:
  name: debug-workload-code
  namespace: {DEBUG_NAMESPACE}
data:
  app.py: |
{script.rstrip()}
""",
    ]
    for index, workload in enumerate(WORKLOADS):
        replicas = 2 if cluster == "target" and index == 0 else 1
        docs.append(
            f"""
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {workload}
  namespace: {DEBUG_NAMESPACE}
  labels:
    app: {workload}
    debug-lab.krafton.io/workload: "true"
spec:
  replicas: {replicas}
  selector:
    matchLabels:
      app: {workload}
  template:
    metadata:
      labels:
        app: {workload}
        debug-lab.krafton.io/workload: "true"
    spec:
      containers:
        - name: {workload}
          image: {DEBUG_IMAGE}
          imagePullPolicy: IfNotPresent
          command: ["python", "/debug/app.py"]
          env:
            - name: WORKLOAD_NAME
              value: {workload}
            - name: IMAGE_VERSION
              value: v1
            - name: READINESS_FAIL
              value: "0"
            - name: CRASH_LOOP
              value: "0"
            - name: DELAY_MS
              value: "0"
            - name: CPU_LOAD
              value: "0"
            - name: MEMORY_MB
              value: "0"
          ports:
            - name: http
              containerPort: 8080
          readinessProbe:
            httpGet:
              path: /ready
              port: http
            initialDelaySeconds: 2
            periodSeconds: 2
            timeoutSeconds: 3
            failureThreshold: 2
          livenessProbe:
            httpGet:
              path: /live
              port: http
            initialDelaySeconds: 5
            periodSeconds: 5
            timeoutSeconds: 3
            failureThreshold: 3
          volumeMounts:
            - name: debug-code
              mountPath: /debug
      volumes:
        - name: debug-code
          configMap:
            name: debug-workload-code
---
apiVersion: v1
kind: Service
metadata:
  name: {workload}
  namespace: {DEBUG_NAMESPACE}
  labels:
    app: {workload}
spec:
  selector:
    app: {workload}
  ports:
    - name: http
      port: 8080
      targetPort: http
"""
        )
    return "\n---\n".join(doc.strip() for doc in docs) + "\n"


def bootstrap(cluster: str | None = None) -> dict[str, Any]:
    targets = [cluster] if cluster else list(CLUSTERS)
    results = {}
    for target in targets:
        results[target] = kubectl(
            target, ["apply", "-f", "-"], input_text=workload_yaml(target), timeout=30
        )
    global _state_cache
    _state_cache = None
    return {"ok": all(result["ok"] for result in results.values()), "results": results}


def require_cluster(value: str) -> str:
    if value not in CLUSTERS:
        raise ValueError(f"unknown cluster: {value}")
    return value


def require_workload(value: str) -> str:
    if value not in WORKLOADS:
        raise ValueError(f"unknown workload: {value}")
    return value


def set_env(cluster: str, workload: str, values: dict[str, str]) -> dict[str, Any]:
    pairs = [f"{key}={value}" for key, value in values.items()]
    return kubectl(
        cluster,
        ["-n", DEBUG_NAMESPACE, "set", "env", f"deployment/{workload}", *pairs],
        timeout=20,
    )


def annotate_rollout(cluster: str, workload: str, key: str) -> dict[str, Any]:
    stamp = str(int(time.time()))
    return kubectl(
        cluster,
        [
            "-n",
            DEBUG_NAMESPACE,
            "annotate",
            f"deployment/{workload}",
            f"debug-lab.krafton.io/{key}={stamp}",
            "--overwrite",
        ],
        timeout=15,
    )


def delete_one_pod(cluster: str, workload: str) -> dict[str, Any]:
    data, result = kubectl_json(
        cluster,
        ["-n", DEBUG_NAMESPACE, "get", "pods", "-l", f"app={workload}"],
    )
    if not result["ok"]:
        return result
    items = data.get("items", []) if isinstance(data, dict) else []
    if not items:
        return {"ok": False, "code": 1, "stdout": "", "stderr": "no pod found", "cmd": []}
    pod_name = items[0]["metadata"]["name"]
    return kubectl(cluster, ["-n", DEBUG_NAMESPACE, "delete", "pod", pod_name], timeout=20)


def handle_action(payload: dict[str, Any]) -> dict[str, Any]:
    cluster = require_cluster(str(payload.get("cluster", "")))
    workload = require_workload(str(payload.get("workload", "")))
    action = str(payload.get("action", ""))
    value = payload.get("value")
    if action == "scale":
        replicas = int(value)
        result = kubectl(
            cluster,
            ["-n", DEBUG_NAMESPACE, "scale", f"deployment/{workload}", f"--replicas={replicas}"],
            timeout=20,
        )
    elif action == "rollout":
        result = kubectl(
            cluster,
            ["-n", DEBUG_NAMESPACE, "rollout", "restart", f"deployment/{workload}"],
            timeout=20,
        )
    elif action == "delete-pod":
        result = delete_one_pod(cluster, workload)
    elif action == "image":
        result = set_env(cluster, workload, {"IMAGE_VERSION": f"v{int(time.time())}"})
        second = annotate_rollout(cluster, workload, "image-revision")
        result = {"ok": result["ok"] and second["ok"], "results": [result, second]}
    elif action == "readiness-fail":
        result = set_env(cluster, workload, {"READINESS_FAIL": "1"})
    elif action == "readiness-ok":
        result = set_env(cluster, workload, {"READINESS_FAIL": "0"})
    elif action == "crash-on":
        result = set_env(cluster, workload, {"CRASH_LOOP": "1"})
    elif action == "crash-off":
        result = set_env(cluster, workload, {"CRASH_LOOP": "0"})
    elif action == "delay-on":
        result = set_env(cluster, workload, {"DELAY_MS": str(value or 800)})
    elif action == "delay-off":
        result = set_env(cluster, workload, {"DELAY_MS": "0"})
    elif action == "cpu-on":
        result = set_env(cluster, workload, {"CPU_LOAD": "1"})
    elif action == "cpu-off":
        result = set_env(cluster, workload, {"CPU_LOAD": "0"})
    elif action == "memory-on":
        result = set_env(cluster, workload, {"MEMORY_MB": str(value or 128)})
    elif action == "memory-off":
        result = set_env(cluster, workload, {"MEMORY_MB": "0"})
    elif action == "reset":
        result = set_env(
            cluster,
            workload,
            {
                "READINESS_FAIL": "0",
                "CRASH_LOOP": "0",
                "DELAY_MS": "0",
                "CPU_LOAD": "0",
                "MEMORY_MB": "0",
            },
        )
    else:
        raise ValueError(f"unknown action: {action}")
    global _state_cache
    _state_cache = None
    return {
        "ok": bool(result.get("ok")),
        "action": action,
        "cluster": cluster,
        "workload": workload,
        "result": result,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "DebugLab/0.1"

    def log_message(self, fmt: str, *args: object) -> None:
        print(f"{self.address_string()} - {fmt % args}")

    def send_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        try:
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except BrokenPipeError:
            pass

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("content-length") or "0")
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self) -> None:
        if self.path == "/" or self.path.startswith("/index.html"):
            body = INDEX_PATH.read_bytes()
            self.send_response(200)
            self.send_header("content-type", "text/html; charset=utf-8")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/state"):
            force = "force=1" in self.path
            self.send_json(200, collect_state(force=force))
            return
        self.send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        try:
            payload = self.read_json()
            if self.path == "/api/bootstrap":
                cluster = payload.get("cluster")
                result = bootstrap(str(cluster) if cluster else None)
                self.send_json(200 if result["ok"] else 500, result)
                return
            if self.path == "/api/action":
                result = handle_action(payload)
                self.send_json(200 if result["ok"] else 500, result)
                return
            self.send_json(404, {"ok": False, "error": "not found"})
        except Exception as exc:
            self.send_json(400, {"ok": False, "error": str(exc)})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=19090)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Debug Lab: http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
