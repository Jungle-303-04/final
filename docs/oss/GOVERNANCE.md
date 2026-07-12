# Governance (Publication Draft)

> This governance model is a proposal, not an adopted delegation of authority. Human owners retain all
> decisions while the repository is private and must approve the public model before launch.

## Principles

- Safety claims require reproducible evidence.
- Technical authority follows sustained, reviewable contribution rather than employment or title.
- Decisions and conflicts of interest are recorded in public project channels after publication.
- No single vendor, organization, or implementation path should control the project.
- Security, privacy, licensing, trademark, and release decisions receive explicit human review.

## Proposed roles

### Contributor

Anyone whose accepted work improves code, documentation, scenarios, testing, design, or community
operations. The preferred first contribution is one KubeHealBench scenario.

### Reviewer

A contributor trusted to review a defined area. Reviewers may approve within that area but do not merge
their own changes without an independent approval.

### Maintainer

A reviewer with sustained project-wide responsibility for quality, releases, security coordination,
and community health. Maintainers are stewards, not owners of community contributions.

### Security responder

A maintainer or delegated reviewer with access to private vulnerability reports. Access is least
privilege, auditable, and removable. This role does not bypass normal disclosure or release review.

## Proposed decision process

- Routine changes: lazy consensus plus approval from an authorized reviewer.
- Catalog, benchmark, or wire-contract changes: approval from the responsible area and evidence that
  compatibility and ground truth remain valid.
- Security fixes: restricted review followed by coordinated advisory and release.
- Governance, license, trademark, or major compatibility changes: written proposal, public comment
  period, conflict disclosure, and explicit maintainer vote.

If consensus fails, maintainers should document alternatives and vote. The final publication draft must
define quorum, voting period, tie handling, abstention, and appeal rules; none are adopted here.

## Becoming or leaving a role

Role changes should be proposed from public contribution history, reviewed for conflicts, approved by
existing maintainers, and recorded in `MAINTAINERS.md`. Inactivity should lead to an emeritus or inactive
status rather than silent permanent authority. Removal for conduct or security reasons follows the
approved Code of Conduct and a conflict-free process.

## Project assets

Repository administration, package publication, image signing, domain or trademark control, security
advisories, and release credentials require at least two accountable human stewards and recoverable
access. The final public governance must document where authority lives without publishing secrets.

## Changes to governance

This draft can change freely while private. After adoption, governance changes should use the major
decision process, preserve a public rationale, and include an effective date.

