# Pod terminal operations

Opsia pod terminal sessions use the target agent's existing outbound WebSocket. The browser never connects to a target cluster directly, and the target cluster does not expose a new inbound port.

The production safety boundary is deliberately narrower than the Kubernetes RBAC grant:

- The session must be authenticated as `service_admin` or have the explicit cluster-scoped `pod.exec` permission.
- The Pod and container must exist in the current workspace inventory.
- Both the realtime gateway and target agent require the namespace in `POD_EXEC_ALLOWED_NAMESPACES` (default: `sandbox`).
- Sessions are non-TTY, limited to five minutes, three concurrent sessions per user, four per agent, 64 KiB input, and 256 KiB redacted output.
- Audit rows contain target identity, actor, command SHA-256 and length, duration, byte counts, reason, and exit code. Command text, stdin, and output are never written to audit payloads.

## Existing cluster upgrade

Clusters installed before pod terminal support do not have the required `create` verb on `pods/exec`. Re-run the generated Opsia target install command (or upgrade the Helm release) so the `cluster-agent-read` role and agent capability registration are refreshed. Restarting only the management services is insufficient.

Kubernetes does not allow `resourceNames` to constrain a `create` request, so the generated role cannot narrow `pods/exec` to individual Pods. Keep `POD_EXEC_ALLOWED_NAMESPACES` explicit and minimal; do not use a wildcard namespace value.
