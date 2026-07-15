# Reference migration ledger

`reference-source-ledger.json` is the machine-generated, complete manifest of
the pinned upstream source snapshot. Every source file has a SHA-256 digest, a
disposition, and a verification target.

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
