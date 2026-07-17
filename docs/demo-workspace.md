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
outbox. The same descriptor also attaches the public
[`Jungle-303-04/yaml-demo`](https://github.com/Jungle-303-04/yaml-demo) repository. Before any
database write, the seed reuses `RepositoryDiscoveryService` to confirm that the repository is
public and reachable, `main` is its default branch at descriptor-pinned revision
`3bc4084ee8a0bff5bbee54cd6a826b1ecd10dbef`, and the declared raw YAML, parent/sibling Kustomize,
component Kustomize, Helm, and Helm values override sources are discoverable and renderable. The
descriptor records the repository's 17-scenario catalog count. The seed then persists the
repository, applications,
poll targets, and deployment bindings through the existing GitOps repositories in the same
transaction as the inventory cut.

The public demo repository has no credential row or stored secret. Its canonical repository row
keeps `credential_ref` null. Discovery uses anonymous GitHub access by default; the deployment Job
may read the existing optional `GITHUB_TOKEN` key from `management-runtime-secret` into process
environment only to avoid GitHub's anonymous NAT rate limit. The token is never copied to the
descriptor, application metadata, GitOps repository row, log, or database credential table. If
the optional key is absent or access is rate-limited, validation fails closed before a database
write. Validation counts and warnings are stored as application evidence; source identities
remain descriptor-owned rather than frontend constants.

Both commands fail closed unless the exact mutation opt-in is present. They verify the existing
database schema and never initialize or migrate it.

```bash
export DATABASE_URL='postgresql://...'
export OPSIA_DEMO_WORKSPACE_MUTATIONS='demo-workspace-v1'

PYTHONPATH=src python -m controller.demo_workspace seed
PYTHONPATH=src python -m controller.demo_workspace reset
```

Seeding the same descriptor digest again is a no-op. A changed descriptor produces a new
inventory cut. Reset locks the registered cluster and requires its persisted descriptor marker
to match before deleting the dedicated workspace and its workspace-scoped projections. The user
identity is intentionally retained because it may be shared with another workspace.

An owner can be supplied at execution time without editing the versioned fixture. The value is
revalidated as part of the effective descriptor and therefore changes both its digest and seed
marker. A manual reset of that seed must use the same override so the persisted marker still
matches.

```bash
PYTHONPATH=src python -m controller.demo_workspace seed --owner-user-id 'user-<uuid>'
PYTHONPATH=src python -m controller.demo_workspace reset --owner-user-id 'user-<uuid>'
```

The FULL dev deployment seeds real database-backed demo data after the versioned migration and
fixed administrator bootstrap. The workflow derives the owner UUID from the existing
`PROJECT_SLUG` and normalized `AUTH_EMAIL`, validates it, and renders it into the standalone
`deploy/management/demo-workspace-seed-job.yaml`. That Job is deliberately excluded from the
management kustomization so an ordinary workload apply cannot run a mutation. It uses the exact
`OPSIA_DEMO_WORKSPACE_MUTATIONS=demo-workspace-v1` opt-in and the runtime database secret, runs the
new immutable service digest without a service-account token or root privileges, and has bounded
deadline, resources, retries, and post-run cleanup. Its read-only root filesystem exposes only a
bounded 64 MiB `emptyDir` at `/tmp` for repository export and Kustomize/Helm rendering. A failure
emits bounded Job logs and a
description before failing the deployment. Deployment automation only invokes `seed`; it never
invokes `reset`.

For a trusted-proxy development console, point the authenticated session at the descriptor's
identity rather than teaching the frontend about demo IDs:

```bash
export TRUSTED_PROXY_AUTH_USER_ID='opsia-ui-demo-user-v1'
export TRUSTED_PROXY_AUTH_WORKSPACE_ID='opsia-ui-demo-v1'
```

The normal trusted-proxy secret/header configuration is still required.
