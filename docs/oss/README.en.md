# Kubernetes Remediation Verification Engine

> **Publication draft - not an adopted public project document.** The repository remains private.
> Public release, project naming, trademark use, licensing, and governance require explicit human
> approval.

This project is a proposed open source Kubernetes verification pipeline and remediation engine in
which every production change - whether initiated by a person or triggered by an incident - passes
through the same evidence, policy, approval, and post-deployment verification path.

## The product is the safety loop

The project is not a Kubernetes IDE, a general-purpose dashboard, or an AI chatbot. Its core promise
is a replayable safety loop:

```text
Alert
  -> collect evidence
  -> identify a cause with falsifiable support
  -> generate a manifest patch and rollback
  -> run dry-run, policy, and blast-radius checks
  -> open an approval-gated pull request
  -> verify normalization after deployment
```

AI may assist analysis, but it is not the trust boundary. Evidence provenance, deterministic policy,
explicit approval, bounded blast radius, rollback, and observed normalization are the trust boundary.
When required evidence is missing, the correct behavior is to stop and report
`insufficient_evidence` rather than guess.

## Three-scene demo narrative

### Scene 1: A remediation PR with its evidence bundle

An incident produces a RemediationBundle containing the selected root-cause candidate, confidence,
supporting evidence references, missing checks, ranked remediation candidates, risk, blast radius,
approval requirements, validation checks, and rollback instructions. The generated pull request links
the proposed patch to that bundle so a reviewer can replay why the change was proposed.

### Scene 2: A change connected to the incident it preceded

The incident timeline joins deployment and RCA events by workload identity and correlation metadata.
Instead of showing two unrelated feeds, it explains that a specific approved change was deployed
shortly before the observed failure and exposes the evidence used to test that relationship.

### Scene 3: Failed verification produces a revert PR

After deployment, the same pipeline checks rollout health and scenario-specific normalization
predicates. If verification fails, it prepares a bounded revert patch against the last approved source
state, includes rollback evidence, and opens another approval-gated pull request. It does not silently
mutate the cluster.

## Public evaluation assets

KubeHealBench is the proposed contribution and evaluation surface. Its v0.1 dataset contains static,
ground-truth Kubernetes failure scenarios tied to the actual cause and recovery catalogs. Each
scenario includes a normal manifest, fault injection, expected root cause, required evidence, allowed
and forbidden remediation, expected patch, rollback, and normalization predicate.

The benchmark defines six public metrics:

- RCA Top-1 accuracy
- insufficient-evidence accuracy
- patch apply success rate
- policy violation proposal rate
- harmful action rate
- normalization success rate

The brand-level safety targets are a **0% harmful action rate** and high
**insufficient-evidence accuracy**. A static, dependency-free validator checks the v0.1 dataset:

```bash
python3 benchmark/score.py
```

See the [benchmark contract](../../benchmark/README.md),
[metric definitions](../../benchmark/METRICS.md), and
[RemediationBundle v1alpha1 draft specification](../spec/remediation-bundle-v1alpha1.md).

## Safety invariants

- No remediation without the evidence required by its catalog candidate.
- No payload-supplied manifest is treated as deployment authority.
- Every proposed action carries risk, blast radius, approval, validation, and rollback metadata.
- Missing authoritative source state results in `unsupported`, not a fabricated patch.
- Policy and dry-run checks happen before approval; normalization checks happen after deployment.
- Audit records retain the decision path without publishing credentials or sensitive payloads.

## Deliberate non-goals

The initial public scope does not attempt to be a cluster administration console, multi-SCM platform,
traffic-splitting engine, cost optimizer, terminal, or generic diff-comment bot. Those features would
dilute the evidence-to-verification loop that makes the project distinct.

## Draft repository workflow

The full repository gate is:

```bash
bash scripts/test.sh
```

The public-repository bootstrap, one-command local environment, release artifacts, and hosted CI are
publication prerequisites, not completed promises in this draft.

## Participate after publication

The smallest proposed contribution is one benchmark scenario. Read the draft
[contribution guide](CONTRIBUTING.md) before preparing one. Community behavior, security reporting,
governance, maintainership, and release history are described in the adjacent draft documents.

No document in `docs/oss/` adopts a license or authorizes publication. Human owners must complete the
[publication checklist](publication-checklist.md) and explicitly approve the public repository first.
