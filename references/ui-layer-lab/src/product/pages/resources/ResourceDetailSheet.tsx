import { CircleAlert, Link2, ListTree } from "lucide-react";
import type {
  ResourceDetail,
  ResourceIdentity,
} from "../../features/resources/resourcesContract";
import {
  useI18n,
  type I18nController,
  type TranslationFunction,
} from "../../shared/i18n";
import { ProductStateScreen } from "../../shared/ui/ProductStateScreen";
import { StatusMark } from "../../shared/ui/StatusMark";
import { Alert, AlertDescription, AlertTitle } from "../../shared/ui/primitives/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../shared/ui/primitives/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../shared/ui/primitives/tabs";
import { DefinitionGrid, ResourceFactsPanel } from "./ResourceFactsPanel";
import { ResourceDetailLoadingPreview } from "./ResourcesLoadingPreview";
import type { ResourcesResourceState } from "./resourcesPageStateModel";

export function ResourceDetailSheet({
  detail,
  full,
  identity,
  onClose,
  onTabChange,
  open,
  tab,
}: {
  detail: ResourcesResourceState<ResourceDetail>;
  full: boolean;
  identity: ResourceIdentity | null;
  onClose: () => void;
  onTabChange: (tab: string) => void;
  open: boolean;
  tab: string;
}) {
  const { t } = useI18n();
  const title = identity
    ? t("resources.detail.title", { name: identity.name })
    : t("resources.detail.errorTitle");
  return (
    <Sheet onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} open={open}>
      <SheetContent
        className={full ? "w-full max-w-none sm:max-w-none" : "w-full sm:max-w-2xl"}
        closeLabel={t("resources.detail.close")}
        side="right"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {identity
              ? `${identity.kind} · ${identity.namespace ?? t("resources.detail.clusterScope")}`
              : t("resources.detail.identityDescription")}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
          <DetailBody detail={detail} identity={identity} onTabChange={onTabChange} tab={tab} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  detail,
  identity,
  onTabChange,
  tab,
}: {
  detail: ResourcesResourceState<ResourceDetail>;
  identity: ResourceIdentity | null;
  onTabChange: (tab: string) => void;
  tab: string;
}) {
  const { formatDate, t } = useI18n();
  if (!identity) {
    return (
      <DetailAlert title={t("resources.detail.invalid.title")}>
        {t("resources.detail.invalid.description")}
      </DetailAlert>
    );
  }
  if (detail.phase === "idle" || detail.phase === "loading") {
    return (
      <ProductStateScreen
        kind="loading"
        loadingPreview={<ResourceDetailLoadingPreview />}
        placement="content"
      />
    );
  }
  if (detail.phase === "failed") {
    if (detail.failure.code === "not-found") {
      return (
        <DetailAlert title={t("resources.detail.notFound.title")}>
          {t("resources.detail.notFound.description")}
        </DetailAlert>
      );
    }
    if (detail.failure.code === "forbidden") {
      return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
    }
    return (
      <DetailAlert title={t("resources.detail.failed.title")}>
        {t("resources.detail.failed.description")}
      </DetailAlert>
    );
  }
  const resource = detail.data.resource;
  const selectedTab = ["overview", "relations", "events"].includes(tab) ? tab : "overview";
  return (
    <Tabs
      className="pt-4"
      onValueChange={(value) => { if (value) onTabChange(value); }}
      value={selectedTab}
    >
      <TabsList aria-label={t("resources.detail.tabs.aria")} className="w-full" variant="line">
        <TabsTrigger value="overview">{t("resources.detail.overview")}</TabsTrigger>
        <TabsTrigger value="relations">
          {t("resources.detail.relatedCount", { count: detail.data.related.length })}
        </TabsTrigger>
        <TabsTrigger value="events">
          {t("resources.detail.eventsCount", { count: detail.data.events.length })}
        </TabsTrigger>
      </TabsList>
      <TabsContent className="grid gap-5 py-4" value="overview">
        {detail.refreshFailure ? (
          <DetailAlert title={t("resources.detail.refreshFailed.title")}>
            {t("resources.detail.refreshFailed.description")}
          </DetailAlert>
        ) : null}
        <section aria-labelledby="resource-status-title" className="grid gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium" id="resource-status-title">
              {t("resources.detail.status")}
            </h3>
            <StatusMark label={resource.healthStatus} tone={resource.health} />
          </div>
          <DefinitionGrid entries={[
            [t("resources.detail.status"), resource.status || t("common.state.unknown")],
            [t("resources.detail.apiVersion"), resource.apiVersion || t("resources.detail.notProvided")],
            [t("resources.detail.observedAt"), formatObservedAt(resource.observedAt, formatDate, t)],
            [
              t("resources.detail.identity"),
              resource.identityStability === "uid"
                ? t("resources.detail.identity.uid")
                : t("resources.detail.identity.nameFallback"),
            ],
          ]} />
        </section>
        <ResourceFactsPanel facts={resource.facts} />
      </TabsContent>
      <TabsContent className="grid gap-3 py-4" value="relations">
        {detail.data.related.length === 0 ? (
          <EmptySection icon={Link2} text={t("resources.detail.relatedEmpty")} />
        ) : detail.data.related.map((group) => (
          <section className="rounded-lg border p-4" key={group.name}>
            <h3 className="mb-3 font-medium">{group.name}</h3>
            <ul className="grid gap-2">
              {group.items.map((item) => (
                <li className="flex items-center justify-between gap-3 text-sm" key={item.id}>
                  <span className="truncate">
                    {item.kind} · {item.namespace ?? t("resources.detail.clusterScope")}/{item.name}
                  </span>
                  <StatusMark label={item.healthStatus} tone={item.health} />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <CompletenessNote />
      </TabsContent>
      <TabsContent className="grid gap-3 py-4" value="events">
        {detail.data.events.length === 0 ? (
          <EmptySection icon={ListTree} text={t("resources.detail.eventsEmpty")} />
        ) : detail.data.events.map((event) => (
          <section className="grid gap-2 rounded-lg border p-4" key={event.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">{event.facts.type === "event" && event.facts.reason
                ? event.facts.reason
                : event.name}</h3>
              <StatusMark label={event.healthStatus} tone={event.health} />
            </div>
            {event.facts.type === "event" && event.facts.message ? (
              <p className="text-sm text-muted-foreground">{event.facts.message}</p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              {formatObservedAt(event.observedAt, formatDate, t)}
            </p>
          </section>
        ))}
        <CompletenessNote />
      </TabsContent>
    </Tabs>
  );
}

function EmptySection({ icon: Icon, text }: { icon: typeof Link2; text: string }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-lg border border-dashed p-6 text-center">
      <div className="grid justify-items-center gap-2 text-sm text-muted-foreground">
        <Icon aria-hidden="true" className="size-6" />
        <p>{text}</p>
      </div>
    </div>
  );
}

function CompletenessNote() {
  const { t } = useI18n();
  return <p className="text-xs text-muted-foreground">{t("resources.detail.completeness")}</p>;
}

function DetailAlert({ children, title }: { children: string; title: string }) {
  return (
    <Alert className="mt-4">
      <CircleAlert aria-hidden="true" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function formatObservedAt(
  value: string | null,
  formatDate: I18nController["formatDate"],
  t: TranslationFunction,
): string {
  if (!value) return t("resources.detail.observedAtMissing");
  return formatDate(new Date(value), { dateStyle: "short", timeStyle: "short" });
}
