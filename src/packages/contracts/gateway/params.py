"""Shared Gateway query parameter names."""

from __future__ import annotations

TIME_RANGE_FROM_QUERY = "from"
TIME_RANGE_TO_QUERY = "to"

APPLICATIONS_ENVIRONMENT_QUERY = "applications.environment"
APPLICATIONS_STATUS_QUERY = "applications.status"
APPLICATIONS_PENDING_PROMOTION_QUERY = "applications.pendingPromotion"
APPLICATIONS_SEARCH_QUERY = "applications.q"

GITOPS_ENVIRONMENT_QUERY = "gitops.environment"
GITOPS_APPROVAL_QUERY = "gitops.approval"
GITOPS_CHANGE_TYPE_QUERY = "gitops.changeType"
GITOPS_SEARCH_QUERY = "gitops.q"

RESOURCE_TYPES_QUERY = "resources.types"
RESOURCE_HEALTH_QUERY = "resources.health"
RESOURCE_SEARCH_QUERY = "resources.q"
RESOURCE_INCLUDE_DELETED_QUERY = "resources.includeDeleted"

CHANGE_BUCKET_QUERY = "bucket"
