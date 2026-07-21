import {
  BellRing,
  Building2,
  GitBranch,
  Server,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import { presentProductSession } from "../../features/auth/sessionPresentation";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { Badge } from "../../shared/ui/primitives/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";

export function SettingsPage() {
  const session = useOptionalProductSession();
  const scope = useClusterScope();
  const { formatNumber, t } = useI18n();
  if (!session) throw new Error("SettingsPage requires an authenticated product session");
  const profile = presentProductSession(session);
  const clusterSummary = scope.collection.phase === "ready"
    ? t("settings.clusters.visible", {
      count: formatNumber(scope.collection.data.clusters.length),
    })
    : scope.collection.phase === "loading" || scope.collection.phase === "idle"
      ? t("settings.clusters.loading")
      : null;

  return (
    <ProductPageFrame className="gap-6">
      <header className="max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {t("settings.description")}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsCard
          description={t("settings.workspace.description")}
          icon={Building2}
          id="workspace"
          title={t("settings.section.workspace")}
        >
          <Definition label={t("settings.workspace.current")} value={session.workspaceId} />
        </SettingsCard>

        <SettingsCard
          description={t("settings.clusters.description")}
          icon={Server}
          id="clusters"
          title={t("settings.section.clusters")}
          unavailable={scope.collection.phase === "failed"}
        >
          {clusterSummary ? <p className="text-sm font-medium">{clusterSummary}</p> : null}
        </SettingsCard>

        <UnavailableSettingsCard
          descriptionKey="settings.repositories.unavailable"
          icon={GitBranch}
          id="repositories"
          titleKey="settings.section.repositories"
        />

        <SettingsCard
          description={t("settings.members.description")}
          icon={UsersRound}
          id="members"
          title={t("settings.section.members")}
          unavailable
        >
          <div className="grid gap-1" id="profile" title={profile.fullIdentity}>
            <p className="text-xs font-medium text-muted-foreground">
              {t("settings.members.currentSession")}
            </p>
            <p className="truncate text-sm font-medium">{profile.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{profile.secondaryLabel}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("settings.members.roles", { roles: session.roles.join(", ") || "—" })}
            </p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            {t("settings.members.unavailable")}
          </p>
        </SettingsCard>

        <UnavailableSettingsCard
          descriptionKey="settings.alerts.unavailable"
          icon={BellRing}
          id="alerts"
          titleKey="settings.section.alerts"
        />

        <SettingsCard
          description={t("settings.policy.unavailable")}
          icon={ShieldCheck}
          id="policy"
          title={t("settings.section.policy")}
          unavailable
        >
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{t("settings.policy.immediate")}</Badge>
            <Badge variant="outline">{t("settings.policy.approval")}</Badge>
          </div>
        </SettingsCard>
      </div>
    </ProductPageFrame>
  );
}

function UnavailableSettingsCard({
  descriptionKey,
  icon,
  id,
  titleKey,
}: {
  descriptionKey: MessageKey;
  icon: LucideIcon;
  id: string;
  titleKey: MessageKey;
}) {
  const { t } = useI18n();
  return (
    <SettingsCard
      description={t(descriptionKey)}
      icon={icon}
      id={id}
      title={t(titleKey)}
      unavailable
    />
  );
}

function SettingsCard({
  children,
  description,
  icon: Icon,
  id,
  title,
  unavailable = false,
}: {
  children?: ReactNode;
  description: string;
  icon: LucideIcon;
  id: string;
  title: string;
  unavailable?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Card id={id}>
      <CardHeader className="grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3">
        <span className="row-span-2 grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-4" />
        </span>
        <CardTitle>{title}</CardTitle>
        {unavailable ? (
          <Badge className="col-start-3 row-span-2 row-start-1" variant="outline">
            {t("settings.unavailable.badge")}
          </Badge>
        ) : null}
        <CardDescription className="col-start-2">{description}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <dl className="grid gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium" title={value}>{value}</dd>
    </dl>
  );
}
