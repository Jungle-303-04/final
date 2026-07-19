import { Link2 } from "lucide-react";

import type {
  ResourceDetail,
  ResourceIdentity,
  ResourceSummary,
} from "../../features/resources/resourcesContract";
import { useI18n } from "../../shared/i18n";
import { OverflowIdentity } from "../../shared/ui/OverflowIdentity";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Button } from "../../shared/ui/primitives/button";

export function RelatedResourcesSection({
  items,
  onNavigateResource,
}: {
  items: ResourceDetail["related"];
  onNavigateResource: (identity: ResourceIdentity) => void;
}) {
  const { t } = useI18n();
  return (
    <section aria-label={t("resources.detail.relatedCount", { count: items.length })} className="grid gap-3">
      {items.length === 0 ? (
        <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center">
          <div className="grid justify-items-center gap-2 text-sm text-muted-foreground">
            <Link2 aria-hidden="true" className="size-6" />
            <p>{t("resources.detail.relatedEmpty")}</p>
          </div>
        </div>
      ) : items.map((group) => (
        <div className="min-w-0 rounded-lg border p-4" key={group.name}>
          <h3 className="mb-3 min-w-0 font-medium [overflow-wrap:anywhere]">{group.name}</h3>
          <ul className="grid gap-2">
            {group.items.map((item) => (
              <li className="flex min-w-0 items-center justify-between gap-3 text-sm" key={item.id}>
                <OverflowIdentity
                  className="h-auto min-w-0 flex-1 justify-start px-0 text-left"
                  render={(
                    <Button
                      data-slot="resource-related-identity"
                      onClick={() => onNavigateResource(resourceIdentity(item))}
                      type="button"
                      variant="link"
                    />
                  )}
                  value={`${item.kind} · ${item.namespace ?? t("resources.detail.clusterScope")}/${item.name}`}
                />
                <StatusMark label={item.healthStatus} tone={item.health} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t("resources.detail.completeness")}</p>
    </section>
  );
}

function resourceIdentity(resource: ResourceSummary): ResourceIdentity {
  return {
    resourceType: resource.resourceType,
    kind: resource.kind,
    namespace: resource.namespace,
    name: resource.name,
  };
}
