# Reference migration ledger

`reference-source-ledger.json` is the machine-generated, complete manifest of
the pinned upstream source snapshot. Every source file has a SHA-256 digest, a
disposition, and a verification target.

`reference-feature-ledger.json` is the matching complete manifest for every
table row in the source feature inventory. Each row is mapped to the canonical
Python and TypeScript contracts, lists whether it needs streaming, and names
the verification targets that must remain green.

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
  --output docs/migration/reference-feature-ledger.json
```
