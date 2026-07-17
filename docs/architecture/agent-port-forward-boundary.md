# Agent-backed port-forward boundary

Port forwarding is fail-closed until one typed, audited tunnel spans the
desktop loopback listener, realtime gateway and target cluster agent.

- The browser never renders or copies a direct target-cluster command.
- The desktop must own only a `127.0.0.1` listener. It must not own target
  credentials, target identity resolution, RBAC checks or a target process.
- The Python capability is available only when a connected agent advertises
  `port_forward_stream_v1`.
- The current agent does not advertise that capability. The frontend action is
  therefore omitted, the session adapter rejects without invoking Tauri, and
  the Tauri capability reports `unsupported`.

The remaining implementation must add one shared realtime contract for exact
`ClusterScope` and `ResourceRef` validation, start receipt and immutable audit
identity, bounded connection and byte capacity, backpressure, close,
generation-fenced reconnect, operation events, and agent-side Kubernetes
transport. Only after those tests pass may the capability be advertised.
