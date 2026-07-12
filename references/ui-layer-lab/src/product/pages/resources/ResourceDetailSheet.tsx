import { CircleAlert, Link2, ListTree } from "lucide-react";
import type {
  ResourceDetail,
  ResourceFacts,
  ResourceIdentity,
} from "../../features/resources/resourcesContract";
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
  const title = identity ? `${identity.name} 상세` : "리소스 상세 정보 오류";
  return (
    <Sheet onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }} open={open}>
      <SheetContent
        className={full ? "w-full max-w-none sm:max-w-none" : "w-full sm:max-w-2xl"}
        closeLabel="상세 닫기"
        side="right"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {identity
              ? `${identity.kind} · ${identity.namespace ?? "cluster scope"} · 실 API read model`
              : "URL의 리소스 identity를 해석할 수 없습니다."}
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
  if (!identity) {
    return <DetailAlert title="잘못된 상세 주소">kind와 namespace/name identity를 확인하세요.</DetailAlert>;
  }
  if (detail.phase === "idle" || detail.phase === "loading") {
    return <ProductStateScreen kind="loading" placement="content" />;
  }
  if (detail.phase === "failed") {
    if (detail.failure.code === "not-found") {
      return <DetailAlert title="리소스를 찾을 수 없습니다">삭제됐거나 현재 scope에서 사라졌습니다.</DetailAlert>;
    }
    if (detail.failure.code === "forbidden") {
      return <ProductStateScreen issue={{ code: "forbidden" }} kind="forbidden" placement="content" />;
    }
    return <DetailAlert title="상세 정보를 불러오지 못했습니다">목록은 그대로 유지했습니다.</DetailAlert>;
  }
  const resource = detail.data.resource;
  const selectedTab = ["overview", "relations", "events"].includes(tab) ? tab : "overview";
  return (
    <Tabs
      className="pt-4"
      onValueChange={(value) => { if (value) onTabChange(value); }}
      value={selectedTab}
    >
      <TabsList aria-label="리소스 상세 섹션" className="w-full" variant="line">
        <TabsTrigger value="overview">개요</TabsTrigger>
        <TabsTrigger value="relations">관계 {detail.data.related.length}</TabsTrigger>
        <TabsTrigger value="events">이벤트 {detail.data.events.length}</TabsTrigger>
      </TabsList>
      <TabsContent className="grid gap-5 py-4" value="overview">
        {detail.refreshFailure ? (
          <DetailAlert title="상세 정보를 갱신하지 못했습니다">마지막 성공 응답을 표시합니다.</DetailAlert>
        ) : null}
        <section aria-labelledby="resource-status-title" className="grid gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium" id="resource-status-title">상태</h3>
            <StatusMark label={resource.healthStatus} tone={resource.health} />
          </div>
          <DefinitionGrid entries={[
            ["Status", resource.status || "알 수 없음"],
            ["API version", resource.apiVersion || "미제공"],
            ["관측 시각", resource.observedAt ?? "미관측"],
            ["Identity", resource.identityStability === "uid" ? "UID 기반" : "이름 fallback"],
          ]} />
        </section>
        <Facts facts={resource.facts} />
        <MetadataDisclosure />
      </TabsContent>
      <TabsContent className="grid gap-3 py-4" value="relations">
        {detail.data.related.length === 0 ? (
          <EmptySection icon={Link2} text="서버가 계산한 관련 리소스가 없습니다." />
        ) : detail.data.related.map((group) => (
          <section className="rounded-lg border p-4" key={group.name}>
            <h3 className="mb-3 font-medium">{group.name}</h3>
            <ul className="grid gap-2">
              {group.items.map((item) => (
                <li className="flex items-center justify-between gap-3 text-sm" key={item.id}>
                  <span className="truncate">{item.kind} · {item.namespace ?? "cluster"}/{item.name}</span>
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
          <EmptySection icon={ListTree} text="이 리소스에 연결된 이벤트가 없습니다." />
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
            <p className="text-xs text-muted-foreground">{event.observedAt ?? "관측 시각 미제공"}</p>
          </section>
        ))}
        <CompletenessNote />
      </TabsContent>
    </Tabs>
  );
}

function Facts({ facts }: { facts: ResourceFacts }) {
  const entries = factsEntries(facts);
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="resource-facts-title" className="grid gap-3 rounded-lg border p-4">
      <h3 className="font-medium" id="resource-facts-title">관측 요약</h3>
      <DefinitionGrid entries={entries} />
    </section>
  );
}

function MetadataDisclosure() {
  return (
    <section aria-labelledby="resource-metadata-title" className="grid gap-3 rounded-lg border p-4">
      <h3 className="font-medium" id="resource-metadata-title">Metadata</h3>
      <p className="text-sm text-muted-foreground">
        서버의 metadata redaction 계약이 확정되기 전까지 labels와 annotations를 표시하지 않습니다.
      </p>
    </section>
  );
}

function DefinitionGrid({ entries }: { entries: Array<[string, string]> }) {
  return (
    <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
      {entries.map(([label, value]) => (
        <div className="min-w-0" key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="truncate font-medium" title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function factsEntries(facts: ResourceFacts): Array<[string, string]> {
  if (facts.type === "pod") return compact([
    ["Phase", facts.phase], ["Node", facts.nodeName],
    ["Owner", facts.owner ? `${facts.owner.kind}/${facts.owner.name}` : null],
    ["Restarts", numberText(facts.restartCount)],
    ["CPU", unitText(facts.cpuMillicores, "m")],
    ["Memory", unitText(facts.memoryMebibytes, "MiB")],
  ]);
  if (facts.type === "node") return compact([
    ["Ready", facts.ready === null ? null : facts.ready ? "Yes" : "No"],
    ["Pod capacity", numberText(facts.podCapacity)],
    ["CPU", unitText(facts.cpuMillicores, "m")],
    ["Memory", unitText(facts.memoryMebibytes, "MiB")],
  ]);
  if (facts.type === "workload") return compact([
    ["Desired", numberText(facts.desiredReplicas)], ["Ready", numberText(facts.readyReplicas)],
    ["Available", numberText(facts.availableReplicas)], ["Updated", numberText(facts.updatedReplicas)],
  ]);
  if (facts.type === "service") return compact([
    ["Type", facts.serviceType], ["Cluster IP", facts.clusterIp], ["External URL", facts.externalUrl],
  ]);
  if (facts.type === "event") return compact([
    ["Type", facts.eventType], ["Reason", facts.reason],
    ["Count", numberText(facts.occurrenceCount)], ["Reporter", facts.reportingComponent],
  ]);
  return [];
}

function compact(entries: Array<[string, string | null]>): Array<[string, string]> {
  return entries.filter((entry): entry is [string, string] => entry[1] !== null);
}

function numberText(value: number | null): string | null {
  return value === null ? null : value.toLocaleString();
}

function unitText(value: number | null, unit: string): string | null {
  return value === null ? null : `${value.toLocaleString()} ${unit}`;
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
  return <p className="text-xs text-muted-foreground">서버 조회 한도 내 결과이며 전체 수는 확인할 수 없습니다.</p>;
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
