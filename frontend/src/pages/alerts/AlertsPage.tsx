import { Bell } from "lucide-react";
import { useMemo } from "react";

import {
  EMPTY_ALERT_CHANNELS_PORT,
  type AlertChannelsPort,
} from "../../features/alerts/alertChannelsContract";
import { useAlertEvents } from "../../features/alerts/AlertEventsProvider";
import {
  EMPTY_ALERT_RULES_PORT,
  type AlertRulesPort,
} from "../../features/alerts/alertRulesContract";
import { buildAlertSurfaceData } from "../../features/alerts/alertSurfaceModel";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useOptionalProductNotifications } from "../../features/notifications/ProductNotificationsProvider";
import { useOptionalOperationStatusSnapshots } from "../../features/operations/OperationStatusStore";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ProductSurfaceTitle } from "../../shared/ui/ProductSurfaceTitle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../shared/ui/primitives/tabs";
import { AlertChannelsPanel } from "./AlertChannelsPanel";
import { AlertEventsPanel } from "./AlertEventsPanel";
import { AlertRulesPanel } from "./AlertRulesPanel";

type AlertsTab = "channels" | "events" | "rules";

export function AlertsPage({
  channelsPort = EMPTY_ALERT_CHANNELS_PORT,
  rulesPort = EMPTY_ALERT_RULES_PORT,
}: {
  channelsPort?: AlertChannelsPort;
  rulesPort?: AlertRulesPort;
}) {
  const alerts = useAlertEvents();
  const filter = useUnifiedFilter();
  const localNotifications = useOptionalProductNotifications()?.notifications;
  const operations = useOptionalOperationStatusSnapshots();
  const { t } = useI18n();
  const selectedTab = normalizeTab(filter.detail.tab);
  const data = useMemo(() => buildAlertSurfaceData(
    alerts.events,
    operations,
    localNotifications ?? [],
  ), [alerts.events, localNotifications, operations]);
  const selectTab = (next: string | null) => {
    if (next !== "events" && next !== "rules" && next !== "channels") return;
    filter.updateDetail((current) => ({
      ...current,
      detail: next === "rules" ? current.detail : null,
      tab: next === "events" ? null : next,
    }), "detail-tab");
  };

  return (
    <ProductPageFrame>
      <Tabs onValueChange={selectTab} value={selectedTab}>
        <header className="min-w-0">
          <ProductSurfaceTitle icon={Bell} title={t("alerts.title")} />
        </header>
        <div className="mt-4 min-w-0 overflow-x-auto">
          <TabsList aria-label={t("alerts.tabs.label")} className="h-[2.55859375rem] w-max min-w-full justify-start gap-[0.15625rem] rounded-[0.703125rem] p-[0.15625rem] sm:min-w-0" variant="default">
            <TabsTrigger className="h-[2.24609375rem] shrink-0 whitespace-nowrap rounded-[0.546875rem] px-5 [font-size:var(--type-label-2)] [line-height:1.46484375rem] font-bold" value="events">{t("alerts.tabs.events")}</TabsTrigger>
            <TabsTrigger className="h-[2.24609375rem] shrink-0 whitespace-nowrap rounded-[0.546875rem] px-5 [font-size:var(--type-label-2)] [line-height:1.46484375rem] font-bold" data-alert-tab="rules" value="rules">{t("alerts.tabs.rules")}</TabsTrigger>
            <TabsTrigger className="h-[2.24609375rem] shrink-0 whitespace-nowrap rounded-[0.546875rem] px-5 [font-size:var(--type-label-2)] [line-height:1.46484375rem] font-bold" value="channels">{t("alerts.tabs.channels")}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="mt-3 min-w-0" value="events">
          <AlertEventsPanel
            acknowledge={alerts.acknowledge}
            data={data}
            error={alerts.error}
            events={alerts.events}
            loading={alerts.initialLoading}
            onRulesSelect={() => selectTab("rules")}
            pending={alerts.pending}
            promote={alerts.promote}
            refresh={alerts.refresh}
          />
        </TabsContent>
        <TabsContent className="mt-3 min-w-0" value="rules">
          <AlertRulesPanel channelsPort={channelsPort} focusRuleId={filter.detail.detail} port={rulesPort} />
        </TabsContent>
        <TabsContent className="mt-3 min-w-0" value="channels">
          <AlertChannelsPanel lastInAppDeliveryAt={data.rows[0]?.occurredAt ?? null} port={channelsPort} />
        </TabsContent>
      </Tabs>
    </ProductPageFrame>
  );
}

function normalizeTab(value: string | null): AlertsTab {
  if (value === "rules" || value === "channels") return value;
  return "events";
}
