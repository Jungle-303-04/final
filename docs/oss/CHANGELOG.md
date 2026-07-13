# Opsia Changelog (Publication Draft)

> This is a draft release-history structure. No public version or release is declared by this file.
> Human owners must reconstruct a disclosure-safe history and approve versioning before publication.

The proposed format groups notable user-visible changes under Added, Changed, Deprecated, Removed,
Fixed, and Security. Versions should follow the versioning policy selected before the first public
release. Private development commits must not be copied blindly into a public changelog.

## Unreleased

### Added

- OpsiaBench v0.1 static ground-truth scenarios and dependency-free contract validator.
- Six benchmark metric definitions covering diagnosis, evidence abstention, patching, policy, harm,
  and normalization.
- RemediationBundle v1alpha1 draft public specification.
- Draft community, governance, security, contribution, and publication-readiness documents.

### Publication blockers

- License, Opsia trademark, governance, maintainers, and reporting channels are not adopted.
- Clean public repository history and disclosure review are not complete.
- Public CI, signed artifacts, release automation, installation path, and end-to-end demo require human
  verification.

## First public release - not scheduled

Before adding a version heading, maintainers must:

1. define the supported API and upgrade boundary;
2. link reproducible test and benchmark results;
3. document security-relevant fixes without exposing reporters or exploit details prematurely;
4. identify signed source, image, chart, SBOM, and provenance artifacts; and
5. record the release date and compare link in the public repository.
