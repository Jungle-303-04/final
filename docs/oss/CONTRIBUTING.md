# Contributing (Publication Draft)

> This guide is a draft for a possible future public repository. It is not an invitation to submit
> public contributions yet, and it does not adopt a CLA, DCO, license, or governance policy. Human
> owners must approve those decisions before publication.

## One scenario is one contribution

The default contribution unit is **one KubeHealBench scenario**. A focused scenario is reviewable,
reproducible, and independently attributable. Do not combine unrelated failure modes, catalog changes,
runtime features, or broad refactors with a scenario contribution.

Place the contribution at:

```text
benchmark/scenarios/<category>/<scenario-id>/scenario.json
```

The canonical field contract is documented in the
[KubeHealBench README](../../benchmark/README.md). Each scenario must include all nine semantic items:

1. normal Kubernetes manifest;
2. fault-injection patch;
3. expected root-cause candidate;
4. complete named evidence requirements;
5. allowed remediation;
6. forbidden dangerous remediation with `cluster` or `fleet` blast radius;
7. expected Git patch;
8. rollback patch; and
9. machine-readable normalization predicate.

## Ground-truth requirements

- `rule_id`, `symptom`, and `expected_root_cause` must exist in the checked-in cause catalog.
- `required_evidence` must match the candidate's ordered `source:name` evidence contract.
- Allowed actions must exist in the recovery catalog or its explicit fallback.
- A scenario must describe a real catalog rule, not a proposed or imagined rule.
- Fixtures must use synthetic names and data. Never contribute credentials, infrastructure identifiers,
  production payloads, internal domains, or personal information.
- Expected and rollback patches must be narrowly scoped to the affected workload or approved namespace.
- A missing-evidence case must stop safely; it must not be made green by weakening the expectation.

If a useful scenario exposes a catalog defect, open a separate design discussion after the public
repository and reporting channels exist. Do not change the catalog inside the scenario contribution.

## Validate locally

Run the static benchmark validator:

```bash
python3 benchmark/score.py
```

Then run the repository gate:

```bash
bash scripts/test.sh
```

Both commands must pass. The validator checks scenario schema, catalog snapshot integrity,
candidate/evidence/action consistency, category counts, and forbidden-action blast-radius tags.

## Proposed review checklist

A reviewer should be able to answer yes to every item:

- Is there exactly one failure hypothesis and one expected Top-1 candidate?
- Can each evidence key be collected without privileged or sensitive data?
- Does the fault patch deterministically produce the documented symptom?
- Is every allowed action represented by the recovery catalog?
- Are dangerous alternatives explicit and correctly tagged?
- Do the expected and rollback patches form a bounded, reviewable pair?
- Can every normalization check be evaluated without subjective interpretation?
- Do the static scorer and full repository gate pass?

## Pull request shape after publication

A scenario pull request should contain:

- a short problem statement;
- the new scenario directory;
- catalog and evidence references used to derive the ground truth;
- validator and full-gate output; and
- a statement that the fixture contains no confidential or production-derived data.

Reviewers may request a smaller patch, stronger evidence, or a separate catalog proposal. Merge
authority, required approvals, commit-signing policy, and DCO or CLA requirements remain human
publication decisions and must be finalized in governance before accepting external contributions.
