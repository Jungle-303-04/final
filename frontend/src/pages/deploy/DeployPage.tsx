import type { ComponentType } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n } from "../../shared/i18n";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "../../shared/ui/primitives/tabs";

type DeployTab = "applications" | "repositories" | "helm";

export function DeployPage({
  Applications,
  GitOps,
  Helm,
}: {
  Applications: ComponentType;
  GitOps: ComponentType;
  Helm: ComponentType;
}) {
  const { t } = useI18n();
  const filter = useUnifiedFilter();
  const tab = isDeployTab(filter.detail.surfaceTab)
    ? filter.detail.surfaceTab
    : "applications";
  const changeTab = (value: string | null) => {
    if (!isDeployTab(value)) return;
    filter.updateDetail(
      (current) => ({ ...current, surfaceTab: value }),
      "surface-tab",
    );
  };

  return (
    <section aria-labelledby="deploy-title" className="grid min-w-0 gap-4">
      <header className="grid gap-3 border-b bg-background px-4 pt-4 sm:px-6 sm:pt-6">
        <div className="grid gap-1">
          <h1 className="text-title1" id="deploy-title">{t("shell.deploy.title")}</h1>
          <p className="text-body text-muted-foreground">{t("shell.deploy.description")}</p>
        </div>
        <Tabs onValueChange={changeTab} value={tab}>
          <TabsList aria-label={t("shell.deploy.tabs")} variant="line">
            <TabsTrigger value="applications">{t("shell.deploy.applications")}</TabsTrigger>
            <TabsTrigger value="repositories">{t("shell.deploy.repositories")}</TabsTrigger>
            <TabsTrigger value="helm">{t("shell.deploy.helm")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>
      {tab === "applications" ? <Applications /> : null}
      {tab === "repositories" ? <GitOps /> : null}
      {tab === "helm" ? <Helm /> : null}
    </section>
  );
}

function isDeployTab(value: string | null | undefined): value is DeployTab {
  return value === "applications" || value === "repositories" || value === "helm";
}
