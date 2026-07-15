import type { ResourceCatalogItem } from "../../features/resources/resourcesContract";
import { ListTree } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../../shared/ui/primitives/sheet";
import { ResourcesCatalog } from "./ResourcesCatalogCore";

export function ResourcesCatalogMobile({
  items,
  onSelect,
  selectedResourceType,
}: {
  items: ResourceCatalogItem[];
  onSelect: (resourceType: string) => void;
  selectedResourceType: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { formatNumber, t } = useI18n();
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="flex min-w-0 lg:hidden" data-slot="resources-catalog-mobile">
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetTrigger render={<Button className="w-full justify-between" variant="outline" />}>
          <span className="flex min-w-0 items-center gap-2">
            <ListTree aria-hidden="true" className="size-4" />
            <span className="truncate">{t("resources.catalog.mobileOpen")}</span>
          </span>
          <Badge title={t("resources.catalog.typeCount", { count: formatNumber(items.length) })} variant="secondary">
            {formatNumber(total)}
          </Badge>
        </SheetTrigger>
        <SheetContent className="gap-0 overflow-hidden p-0" side="left">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>{t("resources.catalog.title")}</SheetTitle>
            <SheetDescription>{t("resources.catalog.description")}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-hidden p-3">
            <ResourcesCatalog
              items={items}
              onSelect={(resourceType) => {
                onSelect(resourceType);
                setOpen(false);
              }}
              selectedResourceType={selectedResourceType}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
