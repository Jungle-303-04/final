# Opsia Security Policy (Publication Draft)

> This policy is not yet operational or adopted. There is no public release and no public security
> reporting channel. Human owners must configure and test a private reporting path before publication.

## Supported versions

No version is currently supported as a public release. Before the first release, maintainers must add
a version-support table, patch policy, end-of-life rules, and release-signing expectations.

## Reporting a vulnerability after publication

Do not file a public issue for a suspected vulnerability. Use the private vulnerability-reporting
feature selected and documented by the maintainers. That channel must be configured before this policy
is activated.

A useful report should include:

- affected version or commit;
- affected component and trust boundary;
- reproducible steps using synthetic data;
- expected and observed behavior;
- realistic impact and required privileges;
- suggested mitigation, if known; and
- whether details have been shared elsewhere.

Never include live credentials, tokens, private keys, customer data, production evidence, internal
network locations, or infrastructure identifiers. Maintainers should provide a secure follow-up method
if sensitive artifacts are required.

## Proposed response process

After activation, the security team should:

1. acknowledge receipt through the private channel;
2. reproduce and classify severity;
3. identify affected versions and containment options;
4. prepare a minimal fix and regression test in a restricted workspace;
5. coordinate release, advisory, and credit with the reporter; and
6. publish remediation guidance only after patched artifacts are available.

Response targets, embargo periods, severity mapping, and disclosure deadlines are not commitments until
human owners approve and publish them.

## Security-sensitive areas

Reports are especially valuable when they concern:

- tenant, workspace, cluster, or repository authorization boundaries;
- evidence provenance, integrity, retention, or unintended disclosure;
- patch authority, source revision pinning, or SCM confusion;
- policy, approval, dry-run, blast-radius, or rollback bypass;
- command execution, webhook authenticity, or event replay;
- credential handling, build provenance, images, charts, or dependencies; and
- actions that mutate resources when evidence is insufficient.

## Safe research expectations

Use only systems and data you own or are explicitly authorized to test. Avoid privacy violations,
service disruption, persistence, lateral movement, and data destruction. Stop when a test could affect
another party. A formal safe-harbor statement requires legal review and is intentionally not adopted by
this draft.
