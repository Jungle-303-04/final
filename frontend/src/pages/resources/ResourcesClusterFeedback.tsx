import { ArrowRight, CircleAlert } from "lucide-react";
import { Link } from "react-router-dom";

import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import { useI18n } from "../../shared/i18n";
import { Surface } from "../../shared/ui/Surface";
import { buttonVariants } from "../../shared/ui/primitives/button";

export function UnknownSelection({
  value,
  variant,
}: {
  value: string | null;
  variant: "cluster" | "resource";
}) {
  const { t } = useI18n();
  const title = variant === "cluster"
    ? t("resources.selection.cluster.title")
    : t("resources.selection.resource.title");
  return (
    <Surface aria-labelledby="unknown-selection-title" className="grid min-h-72 place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <CircleAlert aria-hidden="true" className="size-8 text-muted-foreground" />
        <h3 className="text-lg font-semibold" id="unknown-selection-title">{title}</h3>
        <p className="text-sm text-muted-foreground">
          {t("resources.selection.description", {
            value: value ?? t("resources.selection.urlScope"),
          })}
        </p>
        {variant === "cluster" ? <ClusterAction /> : null}
      </div>
    </Surface>
  );
}

export function ResourcesClusterBoundary({
  variant,
}: {
  variant: "catalog-unconfirmed" | "multiple" | "required";
}) {
  const { t } = useI18n();
  const key = variant === "catalog-unconfirmed" ? "catalogUnconfirmed" : variant;
  return (
    <Surface aria-labelledby="resources-cluster-boundary-title" className="grid min-h-72 place-items-center p-6">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        <CircleAlert aria-hidden="true" className="size-8 text-muted-foreground" />
        <h2 className="text-lg font-semibold" id="resources-cluster-boundary-title">
          {t(`resources.selection.${key}.title`)}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t(`resources.selection.${key}.description`)}
        </p>
        <ClusterAction />
      </div>
    </Surface>
  );
}

function ClusterAction() {
  const { t } = useI18n();
  const filter = useUnifiedFilter();
  return (
    <Link className={buttonVariants()} to={filter.navigationHref("/clusters")}>
      {t("resources.selection.clustersAction")}
      <ArrowRight aria-hidden="true" data-icon="inline-end" />
    </Link>
  );
}
