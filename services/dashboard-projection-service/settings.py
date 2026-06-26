from __future__ import annotations

from packages.config.constants import EventSubject

SERVICE_NAME = "dashboard-projection-service"
SUBSCRIBE_SUBJECT = ">"

TERMINAL_SUCCESS_SUBJECTS = {EventSubject.SAFE_PR_CREATED, EventSubject.COMMAND_COMPLETED}
REJECTED_SUBJECT_SUFFIX = "rejected"
FAILED_SUBJECT_SUFFIX = "failed"
