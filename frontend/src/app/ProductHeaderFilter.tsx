import { forwardRef } from "react";

import { useUnifiedFilter } from "../features/filters/UnifiedFilterProvider";
import {
  UnifiedFilterBar,
  type UnifiedFilterBarHandle,
} from "../features/global-filter/UnifiedFilterBar";
import type { GlobalFilterPort } from "../features/global-filter/globalFilterContract";
import { useI18n } from "../shared/i18n";

export type ProductHeaderFilterHandle = UnifiedFilterBarHandle;

export const ProductHeaderFilter = forwardRef<
  ProductHeaderFilterHandle,
  { activeSurfaceId: string; port: GlobalFilterPort }
>(function ProductHeaderFilter({ activeSurfaceId, port }, ref) {
  const filter = useUnifiedFilter();
  const { t } = useI18n();
  if (
    activeSurfaceId === "resources" &&
    filter.detail.resourceSurfaceView === "flow"
  ) {
    return (
      <p
        className="truncate text-sm text-muted-foreground"
        data-slot="resources-flow-scope"
      >
        {t("resources.surface.flow.scope")}
      </p>
    );
  }
  return <UnifiedFilterBar port={port} ref={ref} />;
});
