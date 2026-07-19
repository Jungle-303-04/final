import { createEmptyProductDetailQuery } from "../features/filters/filterContract";
import { useUnifiedFilter } from "../features/filters/UnifiedFilterProvider";
import { useOptionalProductNotifications } from "../features/notifications/ProductNotificationsProvider";
import { useI18n } from "../shared/i18n";
import { toast } from "../shared/ui/primitives/sonner";

export function useAiAlertRuleCompletion() {
  const filter = useUnifiedFilter();
  const notifications = useOptionalProductNotifications();
  const { t } = useI18n();
  const href = filter.navigationHref("/issues", {
    ...createEmptyProductDetailQuery(),
    surfaceTab: "rules",
  });
  return {
    href,
    publish(ruleId: string, ruleName: string) {
      const id = `alert-rule-created:${ruleId}`;
      const title = t("alerts.rules.created");
      notifications?.publish({
        description: ruleName,
        href,
        id,
        occurredAt: new Date().toISOString(),
        title,
        tone: "healthy",
      });
      toast.success(title, { description: ruleName, id });
    },
  };
}
