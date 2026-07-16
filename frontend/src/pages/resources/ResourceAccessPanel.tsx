import { ShieldCheck } from "lucide-react";

import type {
  KubernetesBindingRef,
  KubernetesBindingRules,
  KubernetesBindingWithSubjects,
  ResourceAccessDetail,
} from "../../features/resources/resourceAccessContract";
import { useI18n } from "../../shared/i18n";
import { Badge } from "../../shared/ui/primitives/badge";

export function ResourceAccessPanel({ access }: { access: ResourceAccessDetail }) {
  const { t } = useI18n();
  if (access.type === "unavailable") {
    return (
      <section className="grid min-w-0 gap-3 rounded-xl border p-4">
        <PanelTitle />
        <p className="text-sm text-muted-foreground">{t("resources.access.unavailable")}</p>
      </section>
    );
  }
  if (access.type === "subject") {
    return (
      <section className="grid min-w-0 gap-4 rounded-xl border p-4">
        <PanelTitle />
        <AccessGroup label={t("resources.access.direct")}>
          {access.direct.map((item) => <BindingRules key={bindingKey(item.binding)} value={item} />)}
        </AccessGroup>
        <AccessGroup label={t("resources.access.inherited")}>
          {access.inheritedFromGroups.map((group) => (
            <div className="grid min-w-0 gap-2" key={group.groupName}>
              <Badge className="w-fit max-w-full truncate" variant="secondary">{group.groupName}</Badge>
              {group.bindings.map((item) => (
                <BindingRules key={bindingKey(item.binding)} value={item} />
              ))}
            </div>
          ))}
        </AccessGroup>
        <AccessGroup label={t("resources.access.pods")}>
          {access.usedByPods.map((pod) => (
            <code className="min-w-0 break-all text-xs" key={`${pod.namespace}/${pod.name}`}>
              {pod.namespace}/{pod.name}
            </code>
          ))}
        </AccessGroup>
        {access.truncated ? (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {t("resources.access.truncated")}
          </p>
        ) : null}
      </section>
    );
  }
  const bindings = access.type === "role"
    ? access.bindings
    : [...access.roleBindings, ...access.clusterRoleBindingsWithLocalSubject];
  return (
    <section className="grid min-w-0 gap-4 rounded-xl border p-4">
      <PanelTitle />
      {access.type === "namespace" ? (
        <p className="text-sm text-muted-foreground">
          {t("resources.access.serviceAccounts", { count: access.serviceAccountCount })}
        </p>
      ) : null}
      <AccessGroup label={t("resources.access.bindings")}>
        {bindings.map((item) => (
          <BindingSubjects key={bindingKey(item.binding)} value={item} />
        ))}
      </AccessGroup>
    </section>
  );
}

function PanelTitle() {
  const { t } = useI18n();
  return (
    <h3 className="flex min-w-0 items-center gap-2 font-heading font-semibold">
      <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-primary" />
      <span className="truncate">{t("resources.access.title")}</span>
    </h3>
  );
}

function AccessGroup({ children, label }: { children: React.ReactNode; label: string }) {
  const { t } = useI18n();
  const populated = Array.isArray(children) ? children.length > 0 : children !== null;
  return (
    <div className="grid min-w-0 gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h4>
      {populated ? children : <p className="text-sm text-muted-foreground">{t("resources.access.empty")}</p>}
    </div>
  );
}

function BindingRules({ value }: { value: KubernetesBindingRules }) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg bg-muted/40 p-3">
      <BindingIdentity value={value.binding} />
      <div className="flex min-w-0 flex-wrap gap-1">
        {value.rules.flatMap((rule, ruleIndex) => rule.verbs.map((verb) => (
          <Badge key={`${ruleIndex}/${verb}`} variant="outline">{verb}</Badge>
        )))}
      </div>
    </div>
  );
}

function BindingSubjects({ value }: { value: KubernetesBindingWithSubjects }) {
  return (
    <div className="grid min-w-0 gap-2 rounded-lg bg-muted/40 p-3">
      <BindingIdentity value={value.binding} />
      <div className="flex min-w-0 flex-wrap gap-1">
        {value.subjects.map((item) => (
          <Badge key={`${item.kind}/${item.namespace}/${item.name}`} variant="secondary">
            {item.kind}/{item.namespace ? `${item.namespace}/` : ""}{item.name}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function BindingIdentity({ value }: { value: KubernetesBindingRef }) {
  return <code className="min-w-0 break-all text-xs">{bindingKey(value)}</code>;
}

function bindingKey(value: KubernetesBindingRef): string {
  return `${value.kind}/${value.namespace ? `${value.namespace}/` : ""}${value.name}`;
}
