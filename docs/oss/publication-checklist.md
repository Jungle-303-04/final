# Public Repository Publication Checklist (Human Approval Required)

> This checklist does not authorize publication. Every approval box must be completed by accountable
> humans in the clean publication repository. The private development repository must remain private
> until the final go/no-go decision.

## 1. Legal, license, name, and trademark

- [ ] Select and approve the project name after collision and trademark review.
- [ ] Decide whether to adopt Apache License 2.0; obtain legal approval where required.
- [ ] If approved, copy the unmodified license text from `LICENSE.draft` to the public repository's
      `LICENSE` and add only approved copyright notices.
- [ ] Complete an authorship, third-party code, asset, font, model, dataset, and generated-content audit.
- [ ] Decide DCO versus CLA and configure the chosen process.
- [ ] Approve logo, screenshots, demo data, naming, and trademark usage independently of the code license.

## 2. Clean repository and history

- [ ] Create a separate public repository; do not flip the private development repository in place.
- [ ] Build an allowlist of source, tests, deployment examples, benchmark data, and public documentation.
- [ ] Exclude internal automation logs, coordination records, credentials, environment files, private
      fixtures, production exports, and infrastructure state.
- [ ] Rewrite the publication history with a reviewed `git filter-repo` procedure.
- [ ] Have a second person verify the rewritten object database, refs, tags, LFS objects, releases,
      issues, and workflow artifacts.
- [ ] Confirm no deleted or dangling object reachable in the public repository contains restricted data.

## 3. Secret and identity scanning

- [ ] Run at least two independent secret scanners across the full rewritten history.
- [ ] Search for access keys, tokens, passwords, private keys, webhook secrets, certificates, cookies,
      connection strings, account identifiers, and credential-shaped high-entropy values.
- [ ] Search for internal personal names, organization names, email addresses, domains, repository URLs,
      network addresses, account numbers, cluster names, resource identifiers, and private ticket links.
- [ ] Rotate and revoke every credential ever present, even if history rewriting removes it.
- [ ] Review configuration defaults and examples for unsafe authentication, authorization, network, and
      destructive-action settings.

## 4. Documentation and community policy

- [ ] Approve the English README as the canonical public narrative and produce the reviewed Korean
      translation required by the roadmap.
- [ ] Replace every draft notice only after the corresponding policy is adopted.
- [ ] Approve CONTRIBUTING, Code of Conduct, Security, Governance, Maintainers, and Changelog documents.
- [ ] Configure private security and conduct reporting channels and test conflict-free escalation.
- [ ] Obtain consent for every public maintainer identity and publish only approved handles.
- [ ] Verify all links, commands, diagrams, screenshots, and examples against the public repository.

## 5. CI and test restoration

- [ ] Make the default branch protection and required checks reproducible in the public host.
- [ ] Run formatting, lint, import boundaries, unit, integration, migration, manifest, and benchmark gates.
- [ ] Add secret, dependency, license, container, and infrastructure-as-code scanning.
- [ ] Test pull requests from forks without exposing credentials or granting write-capable tokens.
- [ ] Pin third-party workflow actions and dependencies to reviewed immutable versions.
- [ ] Publish test and benchmark methodology without internal endpoints or private fixtures.

## 6. Release and supply chain

- [ ] Define versioning, compatibility, deprecation, support, and vulnerability patch policies.
- [ ] Produce multi-architecture images and an OCI Helm chart in approved public registries.
- [ ] Generate SBOMs and vulnerability reports for source and artifacts.
- [ ] Sign commits or tags as approved, sign artifacts, and publish verifiable provenance.
- [ ] Test fresh install, upgrade, rollback, uninstall, and disaster recovery in an isolated environment.
- [ ] Verify a one-command local demonstration and a short recorded three-scene demo using synthetic data.
- [ ] Draft release notes, checksums, known limitations, and support boundaries.

## 7. Final go/no-go

- [ ] Two independent reviewers confirm the public tree and full history contain no restricted data.
- [ ] Legal/license, security, release, governance, and maintainer owners record approval.
- [ ] The release candidate passes public CI and KubeHealBench from a clean clone.
- [ ] All draft-only filenames and notices are either deliberately retained or replaced by approved text.
- [ ] A rollback plan exists for accidental disclosure, vulnerable artifacts, and publication mistakes.
- [ ] An accountable human gives the explicit publication GO.

