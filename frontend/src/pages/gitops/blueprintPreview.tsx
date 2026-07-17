import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type {
  ReleaseApplication,
  ReleaseCluster,
  ReleasePlan,
} from "../../features/gitops/gitOpsContract";
import { I18nProvider, useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import "../../styles/tokens.css";
import "../../styles/foundation.css";
import { DeploymentBlueprintEditor } from "./DeploymentBlueprintEditor";

const previewApplications: ReleaseApplication[] = [{
  id: "checkout-api",
  name: "Checkout API",
  repository: "jungle/checkout-api",
  branch: "main",
  clusterId: "prod-seoul",
  manifestPath: "deploy/checkout.yaml",
}, {
  id: "orders-api",
  name: "Orders API",
  repository: "jungle/orders-api",
  branch: "release/2.4",
  clusterId: "staging-seoul",
  manifestPath: "deploy/orders.yaml",
}];

const previewClusters: ReleaseCluster[] = [{
  id: "prod-seoul",
  name: "prod-seoul",
  environment: "production",
  connectionStatus: "online",
}, {
  id: "staging-seoul",
  name: "staging-seoul",
  environment: "staging",
  connectionStatus: "online",
}, {
  id: "edge-busan",
  name: "edge-busan",
  environment: "edge",
  connectionStatus: "degraded",
}];

const previewPlan: ReleasePlan = {
  plan_id: "blueprint-preview",
  name: "Commerce release",
  description: "GitHub source to cluster deployment map",
  status: "draft",
  settings: {},
  steps: previewApplications.map((application, index) => ({
    step_id: `deploy-${application.id}`,
    application_id: application.id,
    name: application.name,
    position: index + 1,
    depends_on: [],
    config: {
      cluster_id: application.clusterId,
      cluster_ids: index === 0 ? ["prod-seoul", "staging-seoul"] : [application.clusterId],
      cluster_environments: {
        "prod-seoul": "production",
        "staging-seoul": "staging",
      },
      environment: index === 0 ? "production" : "staging",
    },
  })),
};

function BlueprintPreview() {
  const { t } = useI18n();
  const [plan, setPlan] = useState(previewPlan);
  const [saved, setSaved] = useState(false);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-10">
      <div className="mx-auto grid w-full max-w-[96rem] gap-5">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge>{t("workflows.blueprint.previewBadge")}</Badge>
              <span className="text-xs text-muted-foreground">GitOps</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              {t("workflows.blueprint.previewTitle")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("workflows.blueprint.previewDescription")}
            </p>
          </div>
          <Button onClick={() => setSaved(true)} type="button">
            {saved
              ? t("workflows.blueprint.previewSaved")
              : t("workflows.blueprint.previewSave")}
          </Button>
        </header>

        <DeploymentBlueprintEditor
          applications={previewApplications}
          clusters={previewClusters}
          onChange={(nextPlan) => {
            setPlan(nextPlan);
            setSaved(false);
          }}
          plan={plan}
        />
      </div>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("blueprint preview root is missing");

createRoot(root).render(
  <I18nProvider>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <BlueprintPreview />
    </ThemeProvider>
  </I18nProvider>,
);
