import type { TranslationFunction } from "../../shared/i18n";

export type ChecksCopy = ReturnType<typeof createChecksCopy>;

const checksCopyCache = new WeakMap<TranslationFunction, ChecksCopy>();

/** Product-owned copy. Check titles, messages, and Kubernetes values remain server evidence. */
export function checksCopy(t: TranslationFunction) {
  const cached = checksCopyCache.get(t);
  if (cached) return cached;
  const copy = createChecksCopy(t);
  checksCopyCache.set(t, copy);
  return copy;
}

function createChecksCopy(t: TranslationFunction) {
  return {
    title: t("checks.title"),
    description: t("checks.description"),
    refresh: t("common.action.refresh"),
    refreshPending: t("checks.refresh.pending"),
    refreshSucceeded: t("checks.refresh.succeeded"),
    refreshReconnecting: t("checks.refresh.reconnecting"),
    refreshCancelled: t("checks.refresh.cancelled"),
    refreshFailed: t("checks.refresh.failed"),
    scope: t("checks.scope.title"),
    scopeUnavailable: t("checks.scope.unavailable"),
    scopeReasonUnavailable: t("checks.scope.reason.unavailable"),
    scopeReasonPartial: t("checks.scope.reason.partial"),
    scopeReasonAuthorization: t("checks.scope.reason.authorization"),
    scopeReasonGeneric: t("checks.scope.reason.generic"),
    scopeSelectionUnavailable: t("checks.scope.selectionUnavailable"),
    noNamespaces: t("checks.scope.allNamespaces"),
    notObserved: t("checks.value.notObserved"),
    resultStatus: t("checks.result.title"),
    resultUnavailable: t("checks.result.unavailable"),
    findingCount: t("checks.result.findingCount"),
    noFindings: t("checks.result.empty"),
    catalogStatus: t("checks.catalog.title"),
    catalogUnavailable: t("checks.catalog.unavailable"),
    visibilityStatus: t("checks.visibility.title"),
    visibilityUnavailable: t("checks.visibility.unavailable"),
    observedNamespaces: t("checks.visibility.observedNamespaces"),
    missingOptionalKinds: t("checks.visibility.missingOptionalKinds"),
    detailStatus: t("checks.detail.title"),
    detailUnavailable: t("checks.detail.unavailable"),
    reasonsLabel: t("checks.reasons.label"),
    settingsAction: t("checks.settings.action"),
  } as const;
}
