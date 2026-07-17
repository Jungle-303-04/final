# Reference migration ledger

`reference-source-ledger.json` is the machine-generated, complete manifest of
the pinned upstream source snapshot. It records the isolated provenance pointer
and immutable revision; every source file has a SHA-256 digest, size, detected language,
purpose/disposition, product target, and verification target.

`reference-feature-ledger.json` is the matching complete manifest for every
table row in the source feature inventory. Every row is mapped to one product
area, Python and TypeScript boundaries, an optional desktop boundary, a delivery
state, streaming need, and verification targets. `in_progress` and `planned`
are deliberately visible runtime states; neither is treated as completed
feature parity.

`reference-feature-port-map.json` is the only editable mapping source. It maps
each inventory section once; the generator expands that definition to every
feature row and rejects a newly added source section until it has a product
boundary. This keeps the mapping structured without copying action lists into
Python or the browser.

`reference-ui-delta-ledger.json` is a separate schema-v3 immutable-evidence
ledger for the latest UI rebaseline. It enumerates every A/M/D/R path between the observed
inventory revision and the frozen target revision, including source blob IDs and
SHA-256 values. A row begins as explicit `pending`; it cannot be counted as
ported or complete and its `interactions` array must be empty. A classified file
must instead declare a non-empty `interactions` array: every independent source
event, API, keyboard flow, state update, or motion item records its immutable,
globally unique semantic `sourceKey`, source symbol, semantic interaction,
legacy aliases, transport, realtime merge policy, and, when motion exists,
reduced-motion evidence. Source identity is therefore one-to-many per file,
not a lossy file-level field. Styles and assets use the same structure with an
explicit noninteractive semantic interaction (for example, `noninteractive
asset: provider logo`) and `transport: none`/`realtime: null`. File-level
interaction fields are rejected so an analysis cannot collapse several source
behaviors into one row.

`reference-ui-delta-classifications.json` is the editable, generator-owned
classification input for the delta ledger. Every classified interaction maps to
one or more current Opsia destinations, required Python contracts, a declared
test plan ID, an `in_progress` or `blocked` state, and a rationale. A blocked
interaction must name its concrete blocker. The checker rejects unknown
tracked destinations, undeclared test IDs, missing contracts, missing reasons,
or drift between this input and the generated ledger; it never permits manual
classification edits in the generated JSON.

`reference-feature-source-aliases.json` is the compatibility bridge for the
old positional `reference.feature.NNN` IDs. Those IDs remain aliases for
existing consumers, but are not authoritative source proof. Until an alias is
bound to a semantic `sourceKey`, the generated feature catalog reports
`identityStatus: legacy-unmapped`; it does not promote the row to implemented.

`reference-feature-source-identities.json` is the canonical semantic identity
source for frozen snapshot interactions that are not present in the A/M/D/R UI
delta. Each row binds one source key and legacy contract ID to the frozen
revision, semantic interaction, and exact source path, SHA-256, and symbol
evidence. An alias source key must resolve to exactly one authority: either one
delta-classification interaction or one full-snapshot identity, never both.
Generation fails when authority is missing or duplicated, when a full-snapshot
path or hash differs from the source ledger or frozen file, or when an
implemented feature lacks source identity.

When an individual product feature becomes `implemented`, add its contract ID
to the map's `features` object with independent `coverage` evidence. Backend
evidence names its route, handler, and test; frontend evidence names its
consumer and test; desktop evidence names its bridge and test; a streaming row
also names its transport, replay policy, and test. The release gate rejects an
`implemented` product row without this per-feature proof.

`make reference-feature-parity-check` is the release-only completion gate. It
fails until every product feature is `implemented`; reference evidence and
intentionally non-product server surfaces are the only excluded statuses.

The generator also writes
`src/packages/contracts/reference_feature_catalog.json`. This is the runtime
catalog: every feature receives a unique contract ID, so browser and desktop
clients discover capabilities from the Python API instead of carrying a copied
feature list.

The regular deterministic checks intentionally differ from the release
rebaseline gate:

- `make gate` is the PR diagnostic gate. It verifies the frozen source and
  feature ledgers, then runs the repository's Python, manifest, and frontend
  diagnostics; it deliberately does not claim latest-source release parity.
- `make release-governance` is the strict deployment prerequisite. It runs the
  source ledger check, UI delta rebaseline check, and feature parity check. A
  classified interaction may use no legacy alias when it is new, but any alias
  it does declare must be a unique known feature contract; the sourceKey alias
  manifest must also declare the same revision as the release target.
- `make reference-ui-delta-ledger-check` verifies that the generated A/M/D/R
  path, blob and hash evidence exactly matches the approved read-only upstream
  Git tree. It does not require manual classification, so snapshot verification
  remains deterministic while analysis is underway.
- `make reference-ui-delta-rebaseline-check` additionally requires the feature
  inventory's declared source revision to equal the target and requires every
  delta row to be classified.
- `make reference-feature-parity-check` depends on that rebaseline gate and
  requires every product feature row to have complete implementation evidence.
  It remains the final all-surface parity certification.
- `make release-governance-web` is the final Python/React baseline parity
  certification. It excludes deferred OS packaging but still requires every
  baseline web feature row to be complete.

The `Dev Deploy` workflow is the only live patch entry point. It accepts only
the exact SHA that passed `Dev Gate`, prepares the approved upstream Git
objects, and runs `make release-governance-web-patch` before building either
service or console images. The patch gate verifies the frozen source ledger,
the fully classified latest UI delta and the complete feature-ledger structure
without falsely marking unfinished parity rows as complete. Final parity
certification remains separately blocked by `make release-governance-web`
until all baseline rows are implemented.

Regenerate it only after replacing `references/upstream` with the approved
snapshot:

```bash
node scripts/reference-ledger.mjs \
  --source references/upstream \
  --revision cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc \
  --output docs/migration/reference-source-ledger.json
```

CI uses the same command with `--check`; a missing file, altered source file,
or stale revision fails the check. The source snapshot is not part of a product
build. Product ports must be recorded in the ledger and tested at their listed
verification target.

Regenerate the feature ledger after changing the inventory:

```bash
node scripts/reference-feature-ledger.mjs \
  --source docs/spec/frontend/reference-feature-inventory.md \
  --revision cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc \
  --output docs/migration/reference-feature-ledger.json \
  --contracts-output src/packages/contracts/reference_feature_catalog.json \
  --port-map docs/migration/reference-feature-port-map.json
```

Regenerate the UI delta ledger only from the approved read-only upstream Git
repository; it is evidence tooling and never a product build dependency:

```bash
node scripts/reference-source-delta-ledger.mjs \
  --repository /tmp/opsia-upstream-verify \
  --base 3ff2b1095151c690bf536e8e6ca685c2703fcd70 \
  --target cf643dfee93a5ae8dfcd3c2a982620b793b2b4cc \
  --inventory docs/spec/frontend/reference-feature-inventory.md \
  --classification-input docs/migration/reference-ui-delta-classifications.json \
  --output docs/migration/reference-ui-delta-ledger.json
```
