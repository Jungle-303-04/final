import type { AlertRulesPort } from "../../features/alerts/alertRulesContract";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type { IssuesPort } from "../../features/issues/issuesContract";
import { useI18n } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "../../shared/ui/primitives/tabs";
import { AlertRulesPanel } from "../alerts/AlertRulesPanel";
import { IssuesPage } from "./IssuesPage";

type IncidentsTab = "incidents" | "rules";

export function IncidentsPage({
  issuesPort,
  rulesPort,
}: {
  issuesPort: IssuesPort;
  rulesPort: AlertRulesPort;
}) {
  const { t } = useI18n();
  const filter = useUnifiedFilter();
  const tab: IncidentsTab = filter.detail.surfaceTab === "rules" ? "rules" : "incidents";
  const changeTab = (value: string | null) => {
    if (value !== "incidents" && value !== "rules") return;
    filter.updateDetail(
      (current) => ({ ...current, surfaceTab: value }),
      "surface-tab",
    );
  };

  return (
    <section aria-label={t("shell.nav.issues")} className="grid min-w-0 gap-4">
      <div className="border-b bg-background px-4 pt-3 sm:px-6">
        <Tabs onValueChange={changeTab} value={tab}>
          <TabsList aria-label={t("alerts.tabs.label")} variant="line">
            <TabsTrigger value="incidents">{t("shell.nav.issues")}</TabsTrigger>
            <TabsTrigger value="rules">{t("alerts.tabs.rules")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === "incidents" ? <IssuesPage port={issuesPort} /> : null}
      {tab === "rules" ? (
        <ProductPageFrame>
          <AlertRulesPanel focusRuleId={filter.detail.detail} port={rulesPort} />
        </ProductPageFrame>
      ) : null}
    </section>
  );
}
