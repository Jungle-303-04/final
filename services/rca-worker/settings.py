from __future__ import annotations

from packages.config.constants import EventSubject

SERVICE_NAME = "rca-worker"
SUBSCRIBE_SUBJECT = EventSubject.CLUSTER_EVIDENCE_RECEIVED

ROOT_CAUSE = "Image rollout introduced failing readiness checks"
RECOMMENDED_ACTION = "Open a safe PR to pin the previous image tag"
PR_TITLE = "Safe rollback proposal for checkout-api"
PR_MODE = "fake_github_api_call"
MISSING_GITHUB_TOKEN_REF = "missing-github-oauth-fallback"
OBJECT_EVIDENCE_PREFIX = "object://evidence"
EVIDENCE_KIND = "rca_bundle"
PR_URL_PREFIX = "https://github.example.local/project/repo/pull"
PR_NUMBER_MODULO = 100000
PR_STATUS_CREATED = "created"
