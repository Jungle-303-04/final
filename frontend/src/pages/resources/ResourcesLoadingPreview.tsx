import { Skeleton } from "../../shared/ui/primitives/skeleton";

export function ResourcesCatalogLoadingPreview() {
  return (
    <div
      className="grid min-w-0 items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]"
      data-slot="resources-catalog-loading"
    >
      <Skeleton className="h-[32rem] rounded-xl" />
      <div className="grid min-w-0 gap-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-[28rem] rounded-xl" />
      </div>
    </div>
  );
}

export function ResourcesSurfaceLoadingPreview() {
  return (
    <div className="grid min-w-0 gap-4 p-4 sm:p-6" data-slot="resources-surface-loading">
      <div className="flex justify-end">
        <Skeleton className="size-8" />
      </div>
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-(--product-graph-height-mobile) rounded-xl sm:h-(--product-graph-height)" />
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

export function ResourcesListLoadingPreview() {
  return (
    <div
      className="grid min-w-0 gap-px bg-border"
      data-slot="resources-list-loading"
    >
      <Skeleton className="h-9 rounded-none bg-muted/50" />
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton className="h-12 rounded-none bg-card" key={index} />
      ))}
    </div>
  );
}

export function ResourceDetailLoadingPreview() {
  return (
    <div className="grid min-w-0 gap-4 py-4" data-slot="resource-detail-loading">
      <Skeleton className="h-8" />
      <Skeleton className="h-36 rounded-xl" />
      <Skeleton className="h-56 rounded-xl" />
    </div>
  );
}
