import { Rocket } from "lucide-react";
import type { ComponentType } from "react";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n } from "../../shared/i18n";
import { ProductSurfaceTitle } from "../../shared/ui/ProductSurfaceTitle";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "../../shared/ui/primitives/tabs";

type DeployTab = "applications" | "repositories" | "workflows" | "helm";

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
    requestAnimationFrame(() => document.querySelector("main")?.scrollTo(0, 0));
  };

  return (
    <section aria-labelledby="deploy-title" className="relative grid min-w-0 gap-5">
      <header className="grid min-w-0 gap-[1.375rem] bg-background px-(--product-page-inline) pt-(--product-page-block-start)">
        <ProductSurfaceTitle icon={Rocket} id="deploy-title" title={t("shell.deploy.title")} />
        <Tabs className="min-w-0 overflow-x-auto pb-px" onValueChange={changeTab} value={tab}>
          <TabsList
            aria-label={t("shell.deploy.tabs")}
            className="gap-[0.15625rem] rounded-[0.703125rem] bg-muted p-[0.15625rem] data-[orientation=horizontal]:h-[2.55859375rem]"
          >
            <TabsTrigger className="h-[2.24609375rem] flex-none rounded-[0.546875rem] px-[1.1875rem] py-[0.390625rem] [font-size:var(--type-label-2)] [line-height:1.46484375rem] font-bold" value="applications">
              {t("shell.deploy.applications")}
            </TabsTrigger>
            <TabsTrigger className="h-[2.24609375rem] flex-none rounded-[0.546875rem] px-[1.1875rem] py-[0.390625rem] [font-size:var(--type-label-2)] [line-height:1.46484375rem] font-bold" value="repositories">
              {t("shell.deploy.repositories")}
            </TabsTrigger>
            <TabsTrigger className="h-[2.24609375rem] flex-none rounded-[0.546875rem] px-[1.1875rem] py-[0.390625rem] [font-size:var(--type-label-2)] [line-height:1.46484375rem] font-bold" value="workflows">
              {t("workflows.detail.workflow")}
            </TabsTrigger>
            <TabsTrigger className="h-[2.24609375rem] flex-none rounded-[0.546875rem] px-[1.1875rem] py-[0.390625rem] [font-size:var(--type-label-2)] [line-height:1.46484375rem] font-bold" value="helm">
              {t("shell.deploy.helm")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>
      <GitOps />
      {tab === "applications" ? <Applications /> : null}
      {tab === "helm" ? <Helm /> : null}
    </section>
  );
}

function isDeployTab(value: string | null | undefined): value is DeployTab {
  return value === "applications" || value === "repositories" || value === "workflows" || value === "helm";
}
