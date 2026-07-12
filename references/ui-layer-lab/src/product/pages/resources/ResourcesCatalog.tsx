import type { ResourceCatalogItem } from "../../features/resources/resourcesContract";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../shared/ui/primitives/accordion";
import { ScrollArea } from "../../shared/ui/primitives/scroll-area";
import { Surface } from "../../shared/ui/Surface";
import {
  resourceTypePresentation,
  type ResourceCategoryPresentation,
} from "./resourcePresentation";

interface CatalogGroup {
  category: ResourceCategoryPresentation;
  items: ResourceCatalogItem[];
}

export function ResourcesCatalog({
  items,
  onSelect,
  selectedResourceType,
}: {
  items: ResourceCatalogItem[];
  onSelect: (resourceType: string) => void;
  selectedResourceType: string | null;
}) {
  const groups = groupCatalog(items);
  const selectedCategory = groups.find((group) => group.items.some(
    (item) => item.resourceType === selectedResourceType,
  ))?.category.id ?? groups[0]?.category.id;
  return (
    <Surface aria-labelledby="resource-catalog-title" className="min-w-0 overflow-hidden">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-medium" id="resource-catalog-title">Resource types</h3>
        <p className="mt-1 text-xs text-muted-foreground">실제 inventory snapshot에서 관측된 종류</p>
      </div>
      <ScrollArea
        aria-label="리소스 유형 목록"
        className="max-h-[calc(100svh-13rem)]"
        orientation="vertical"
      >
        <Accordion
          className="px-2 py-2"
          defaultValue={selectedCategory ? [selectedCategory] : []}
          key={selectedCategory ?? "empty"}
          multiple
        >
          {groups.map(({ category, items: groupItems }) => {
            const Icon = category.icon;
            return (
              <AccordionItem key={category.id} value={category.id}>
                <AccordionTrigger className="px-2">
                  <span className="flex items-center gap-2">
                    <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                    {category.label}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="grid gap-1 px-1">
                  {groupItems.map((item) => {
                    const presentation = resourceTypePresentation(item.resourceType);
                    const selected = item.resourceType === selectedResourceType;
                    return (
                      <Button
                        aria-current={selected ? "page" : undefined}
                        className="w-full justify-between"
                        key={item.resourceType}
                        onClick={() => onSelect(item.resourceType)}
                        size="sm"
                        type="button"
                        variant={selected ? "secondary" : "ghost"}
                      >
                        <span className="truncate">{presentation.label}</span>
                        <Badge variant="secondary">{item.count.toLocaleString()}</Badge>
                      </Button>
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </ScrollArea>
    </Surface>
  );
}

function groupCatalog(items: ResourceCatalogItem[]): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>();
  for (const item of items) {
    const category = resourceTypePresentation(item.resourceType).category;
    const group = groups.get(category.id) ?? { category, items: [] };
    group.items.push(item);
    groups.set(category.id, group);
  }
  return [...groups.values()].sort((left, right) => (
    left.category.order - right.category.order
  ));
}
