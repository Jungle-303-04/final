import { checksCopy, type ChecksCopy } from "../../features/checks/checksCopy";
import { useI18n } from "../../shared/i18n";

export function ChecksAvailabilityReasons({ reasons }: { reasons: readonly string[] }) {
  const copy = checksCopy(useI18n().t);
  if (reasons.length === 0) return null;
  return (
    <ul className="grid gap-1 pt-1 text-xs text-muted-foreground" aria-label={copy.reasonsLabel}>
      {humanAvailabilityReasons(reasons, copy).map((reason) => <li key={reason}>{reason}</li>)}
    </ul>
  );
}

function humanAvailabilityReasons(reasons: readonly string[], copy: ChecksCopy): readonly string[] {
  const messages = new Set<string>();
  for (const reason of reasons) {
    if (reason === "authorization_scope_empty") messages.add(copy.scopeReasonAuthorization);
    else if (reason.startsWith("inventory_snapshot_unavailable:")) messages.add(copy.scopeReasonUnavailable);
    else if (reason.startsWith("inventory_snapshot_incomplete:") || reason === "agent_snapshot_truncated") messages.add(copy.scopeReasonPartial);
    else if (reason !== "checks_result_projection_not_integrated" && reason !== "checks_catalog_not_integrated") messages.add(copy.scopeReasonGeneric);
  }
  return [...messages];
}
