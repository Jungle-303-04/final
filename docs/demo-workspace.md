# Descriptor-backed demo workspace

The demo workspace is a database-backed UI fixture for environments where no target cluster
has reported data yet. It does not call `kubectl`, impersonate a target agent over HTTP, or add
browser-side sample data.

The versioned authority is
[`src/samples/demo-workspace/v1.json`](../src/samples/demo-workspace/v1.json). Extend that
descriptor when another UI read path needs coverage. The seed validates the descriptor through
the public inventory request contract, registers its target through
`IdentityAccessRepository.register_target_cluster`, persists through
`ingest_inventory_snapshot`, and records `InventorySnapshotRecordedBody` through the database
outbox.

Both commands fail closed unless the exact mutation opt-in is present. They verify the existing
database schema and never initialize or migrate it.

```bash
export DATABASE_URL='postgresql://...'
export OPSIA_DEMO_WORKSPACE_MUTATIONS='demo-workspace-v1'

python src/controller/demo_workspace.py seed
python src/controller/demo_workspace.py reset
```

Seeding the same descriptor digest again is a no-op. A changed descriptor produces a new
inventory cut. Reset locks the registered cluster and requires its persisted descriptor marker
to match before deleting the dedicated workspace and its workspace-scoped projections. The user
identity is intentionally retained because it may be shared with another workspace.

For a trusted-proxy development console, point the authenticated session at the descriptor's
identity rather than teaching the frontend about demo IDs:

```bash
export TRUSTED_PROXY_AUTH_USER_ID='opsia-ui-demo-user-v1'
export TRUSTED_PROXY_AUTH_WORKSPACE_ID='opsia-ui-demo-v1'
```

The normal trusted-proxy secret/header configuration is still required.
