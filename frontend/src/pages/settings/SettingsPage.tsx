import {
  BellRing,
  Building2,
  Check,
  CircleOff,
  GitBranch,
  Languages,
  RefreshCw,
  Server,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useOptionalProductSession } from "../../features/auth/ProductSessionContext";
import { presentProductSession } from "../../features/auth/sessionPresentation";
import { useClusterScope } from "../../features/cluster-scope/ClusterScopeProvider";
import { useUnifiedFilter } from "../../features/filters/UnifiedFilterProvider";
import type {
  NamespaceScopeRecord,
  ShellStatePort,
} from "../../features/shell-state/shellStateContract";
import {
  SettingsPortFailure,
  type SettingsAccessProfile,
  type SettingsPort,
} from "../../features/settings/settingsContract";
import { useI18n, type MessageKey } from "../../shared/i18n";
import { cn } from "../../shared/lib/cn";
import { ProductPageFrame } from "../../shared/ui/ProductPageFrame";
import { ThemeSelectionList } from "../../shared/ui/ThemeToggle";
import { useProductTheme } from "../../shared/ui/useProductTheme";
import { Badge } from "../../shared/ui/primitives/badge";
import { Button } from "../../shared/ui/primitives/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui/primitives/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "../../shared/ui/primitives/select";
import { Spinner } from "../../shared/ui/primitives/spinner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../shared/ui/primitives/tabs";
import { PrometheusIntegrationCard } from "./PrometheusIntegrationCard";

type SettingsSection = "overview" | "access" | "preferences" | "administration";
type LoadState<T> =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; data: T }
  | { phase: "failed"; error: unknown };

const SECTION_HASHES: Record<SettingsSection, string> = {
  overview: "",
  access: "profile",
  preferences: "preferences",
  administration: "administration",
};

export function SettingsPage({
  settingsPort,
  shellStatePort,
}: {
  settingsPort: SettingsPort;
  shellStatePort: ShellStatePort;
}) {
  const session = useOptionalProductSession();
  const scope = useClusterScope();
  const filter = useUnifiedFilter();
  const location = useLocation();
  const navigate = useNavigate();
  const { formatNumber, t } = useI18n();
  if (!session) throw new Error("SettingsPage requires an authenticated product session");
  const profile = presentProductSession(session);
  const section = sectionFromHash(location.hash);
  const clusterSummary = scope.collection.phase === "ready"
    ? t("settings.clusters.visible", {
      count: formatNumber(scope.collection.data.clusters.length),
    })
    : scope.collection.phase === "loading" || scope.collection.phase === "idle"
      ? t("settings.clusters.loading")
      : t("common.state.unavailable");

  const selectSection = (next: SettingsSection) => {
    const hash = SECTION_HASHES[next];
    const path = location.pathname.startsWith("/")
      ? location.pathname as `/${string}`
      : "/settings";
    const href = filter.navigationHref(path);
    void navigate(hash ? `${href}#${hash}` : href, { replace: true });
  };

  return (
    <ProductPageFrame className="gap-4">
      <header className="flex min-w-0 items-center gap-2.5">
        <Building2 aria-hidden="true" className="size-[1.0625rem] shrink-0 text-primary" />
        <h2 className="min-w-0 truncate font-heading text-heading font-extrabold tracking-[-0.02em]">{t("settings.title")}</h2>
        <p className="sr-only">{t("settings.description")}</p>
      </header>

      <Tabs
        className="min-w-0 gap-3"
        onValueChange={(value) => {
          if (isSettingsSection(value)) selectSection(value);
        }}
        value={section}
      >
        <TabsList
          aria-label={t("settings.navigation")}
          className="max-w-full justify-start overflow-x-auto rounded-lg bg-muted/70 p-0.5"
        >
          <TabsTrigger value="overview">{t("settings.section.overview")}</TabsTrigger>
          <TabsTrigger value="access">{t("settings.section.access")}</TabsTrigger>
          <TabsTrigger value="preferences">{t("settings.section.preferences")}</TabsTrigger>
          <TabsTrigger value="administration">{t("settings.section.administration")}</TabsTrigger>
        </TabsList>

        <TabsContent className="min-w-0" value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <NavigationCard
              description={t("settings.workspace.description")}
              icon={Building2}
              onOpen={() => selectSection("access")}
              title={t("settings.section.workspace")}
            >
              <Definition label={t("settings.workspace.current")} value={session.workspaceId} />
            </NavigationCard>
            <NavigationCard
              description={t("settings.clusters.description")}
              icon={Server}
              onOpen={() => selectSection("access")}
              title={t("settings.section.clusters")}
            >
              <p className="text-sm font-medium">{clusterSummary}</p>
            </NavigationCard>
            <NavigationCard
              description={t("settings.members.description")}
              icon={UserRound}
              onOpen={() => selectSection("access")}
              title={t("settings.members.currentSession")}
            >
              <div className="grid min-w-0 gap-1" title={profile.fullIdentity}>
                <p className="truncate text-sm font-medium">{profile.displayName}</p>
                <p className="truncate text-xs text-muted-foreground">{profile.secondaryLabel}</p>
              </div>
            </NavigationCard>
            <NavigationCard
              description={t("settings.preferences.description")}
              icon={Settings2}
              onOpen={() => selectSection("preferences")}
              title={t("settings.section.preferences")}
            >
              <p className="text-sm font-medium">{t("settings.preferences.persisted")}</p>
            </NavigationCard>
          </div>
        </TabsContent>

        <TabsContent className="min-w-0" value="access">
          <AccessPanel settingsPort={settingsPort} shellStatePort={shellStatePort} />
        </TabsContent>

        <TabsContent className="min-w-0" value="preferences">
          <PreferencesPanel />
        </TabsContent>

        <TabsContent className="min-w-0" value="administration">
          <AdministrationPanel settingsPort={settingsPort} />
        </TabsContent>
      </Tabs>
    </ProductPageFrame>
  );
}

function AccessPanel({
  settingsPort,
  shellStatePort,
}: {
  settingsPort: SettingsPort;
  shellStatePort: ShellStatePort;
}) {
  const session = useOptionalProductSession();
  const scope = useClusterScope();
  const { t } = useI18n();
  const [revision, setRevision] = useState(0);
  const [access, setAccess] = useState<LoadState<SettingsAccessProfile>>({ phase: "idle" });
  const [namespaces, setNamespaces] = useState<LoadState<NamespaceScopeRecord>>({ phase: "idle" });
  const [selectedNamespace, setSelectedNamespace] = useState<string | null>(null);
  const userPickedNamespace = useRef(false);
  const clusterId = scope.selection.kind === "selected" ? scope.selection.cluster.id : null;

  useEffect(() => {
    userPickedNamespace.current = false;
    if (clusterId === null) {
      queueMicrotask(() => {
        setSelectedNamespace(null);
        setAccess({ phase: "idle" });
        setNamespaces({ phase: "idle" });
      });
      return;
    }
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setSelectedNamespace(null);
      setAccess({ phase: "idle" });
      setNamespaces({ phase: "loading" });
    });
    void shellStatePort.getNamespaceScope(clusterId, controller.signal).then(
      (data) => {
        if (!active) return;
        setNamespaces({ phase: "ready", data });
        if (!userPickedNamespace.current) {
          const candidates = [...data.activeNamespaces, ...data.accessibleNamespaces];
          setSelectedNamespace(
            candidates.find((namespace) => data.accessibleNamespaces.includes(namespace)) ?? null,
          );
        }
      },
      (error: unknown) => {
        if (active && !isAbortError(error)) setNamespaces({ phase: "failed", error });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [clusterId, revision, shellStatePort]);

  useEffect(() => {
    if (clusterId === null || selectedNamespace === null) return;
    const controller = new AbortController();
    let active = true;
    queueMicrotask(() => {
      if (active) setAccess({ phase: "loading" });
    });
    void settingsPort.getAccessProfile(
      clusterId,
      selectedNamespace,
      controller.signal,
    ).then(
      (data) => {
        if (active) setAccess({ phase: "ready", data });
      },
      (error: unknown) => {
        if (active && !isAbortError(error)) setAccess({ phase: "failed", error });
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [clusterId, revision, selectedNamespace, settingsPort]);

  if (scope.selection.kind !== "selected" || clusterId === null) {
    return (
      <SettingsNotice
        description={t("settings.access.clusterRequired.description")}
        icon={Server}
        title={t("settings.access.clusterRequired.title")}
      />
    );
  }

  if (access.phase === "loading" || access.phase === "idle") {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        {t("settings.access.loading")}
      </div>
    );
  }

  if (access.phase === "failed") {
    const forbidden = access.error instanceof SettingsPortFailure
      && access.error.code === "forbidden";
    return (
      <SettingsNotice
        action={(
          <Button onClick={() => setRevision((current) => current + 1)} variant="outline">
            <RefreshCw aria-hidden="true" />
            {t("common.action.retry")}
          </Button>
        )}
        description={forbidden
          ? t("settings.access.forbidden.description")
          : t("settings.access.failed.description")}
        icon={CircleOff}
        title={forbidden
          ? t("settings.access.forbidden.title")
          : t("settings.access.failed.title")}
      />
    );
  }

  const allowed = access.data.permissions.filter((permission) => permission.allowed);
  const denied = access.data.permissions.filter((permission) => !permission.allowed);
  const visibleNamespaces = namespaces.phase === "ready"
    ? namespaces.data.accessibleNamespaces
    : [];

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="grid-cols-[minmax(0,1fr)_auto] gap-x-3">
          <div className="min-w-0">
            <CardTitle>{t("settings.access.identity.title")}</CardTitle>
            <CardDescription>{t("settings.access.identity.description")}</CardDescription>
          </div>
          <Button
            aria-label={t("common.action.refresh")}
            onClick={() => setRevision((current) => current + 1)}
            size="icon"
            variant="ghost"
          >
            <RefreshCw aria-hidden="true" />
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Definition label={t("settings.access.identity")} value={session?.userId ?? access.data.userId} />
          <Definition label={t("settings.access.cluster")} value={access.data.clusterId} />
          <Definition label={t("settings.access.roles")} value={access.data.roles.join(", ") || "—"} />
          <div className="grid gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              {t("settings.access.namespace")}
            </p>
            {namespaces.phase === "ready" && visibleNamespaces.length > 0 ? (
              <Select
                onValueChange={(value) => {
                  if (typeof value !== "string") return;
                  userPickedNamespace.current = true;
                  setAccess({ phase: "loading" });
                  setSelectedNamespace(value);
                }}
                value={selectedNamespace}
              >
                <SelectTrigger aria-label={t("settings.access.namespace")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false}>
                  <SelectGroup>
                    <SelectLabel>{t("settings.access.namespace")}</SelectLabel>
                    {visibleNamespaces.map((namespace) => (
                      <SelectItem key={namespace} value={namespace}>{namespace}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">
                {namespaces.phase === "failed"
                  ? t("settings.access.namespaceUnavailable")
                  : t("settings.access.namespaceEmpty")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <PermissionCard
          decisions={allowed}
          description={t("settings.access.allowed.description")}
          tone="allowed"
          title={t("settings.access.allowed.title")}
        />
        <PermissionCard
          decisions={denied}
          description={t("settings.access.denied.description")}
          tone="denied"
          title={t("settings.access.denied.title")}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <KubernetesRulesCard
          evidence={access.data.kubernetesRules}
          title={t("settings.access.kubernetes.title")}
        />
        <RestrictedResourceTypesCard
          evidence={access.data.restrictedResourceTypes}
          title={t("settings.access.restricted.title")}
        />
      </div>

      {namespaces.phase === "ready" && namespaces.data.completeness !== "exact" ? (
        <p className="text-xs text-muted-foreground">
          {t("settings.access.namespacePartial", {
            reasons: namespaces.data.reasonCodes.join(", ") || "unknown",
          })}
        </p>
      ) : null}
    </div>
  );
}

function PermissionCard({
  decisions,
  description,
  title,
  tone,
}: {
  decisions: readonly SettingsAccessProfile["permissions"][number][];
  description: string;
  title: string;
  tone: "allowed" | "denied";
}) {
  const byCategory = useMemo(() => {
    const grouped = new Map<string, string[]>();
    for (const decision of decisions) {
      const values = grouped.get(decision.category) ?? [];
      values.push(decision.permission);
      grouped.set(decision.category, values);
    }
    return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [decisions]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {tone === "allowed"
            ? <Check aria-hidden="true" className="size-4 text-success" />
            : <CircleOff aria-hidden="true" className="size-4 text-muted-foreground" />}
          {title}
          <Badge variant="outline">{decisions.length}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid max-h-80 gap-3 overflow-y-auto">
        {byCategory.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : byCategory.map(([category, permissions]) => (
          <div className="grid gap-1.5" key={category}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {category}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {permissions.sort().map((permission) => (
                <Badge
                  className={cn(tone === "denied" && "text-muted-foreground")}
                  key={permission}
                  variant="outline"
                >
                  {permission}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function PreferencesPanel() {
  const theme = useProductTheme();
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.preferences.theme.title")}</CardTitle>
          <CardDescription>{t("settings.preferences.theme.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-1">
          <ThemeSelectionList controller={theme} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.preferences.locale.title")}</CardTitle>
          <CardDescription>{t("settings.preferences.locale.description")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {(["ko", "en"] as const).map((locale) => (
            <Button
              aria-pressed={i18n.locale === locale}
              className="justify-start"
              key={locale}
              onClick={() => i18n.setLocale(locale)}
              variant={i18n.locale === locale ? "secondary" : "ghost"}
            >
              <Languages aria-hidden="true" data-icon="inline-start" />
              {locale === "ko"
                ? t("settings.preferences.locale.ko")
                : t("settings.preferences.locale.en")}
              {i18n.locale === locale ? <Check aria-hidden="true" className="ml-auto" /> : null}
            </Button>
          ))}
          <p className="mt-2 text-xs text-muted-foreground">
            {t("settings.preferences.autoSave")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function AdministrationPanel({ settingsPort }: { settingsPort: SettingsPort }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PrometheusIntegrationCard settingsPort={settingsPort} />
      <UnavailableSettingsCard
        descriptionKey="settings.repositories.unavailable"
        icon={GitBranch}
        titleKey="settings.section.repositories"
      />
      <UnavailableSettingsCard
        descriptionKey="settings.members.unavailable"
        icon={UsersRound}
        titleKey="settings.section.members"
      />
      <UnavailableSettingsCard
        descriptionKey="settings.alerts.unavailable"
        icon={BellRing}
        titleKey="settings.section.alerts"
      />
      <UnavailableSettingsCard
        descriptionKey="settings.policy.unavailable"
        icon={ShieldCheck}
        titleKey="settings.section.policy"
      />
      <SettingsCard
        description={t("settings.hostConfiguration.unavailable")}
        icon={Server}
        title={t("settings.hostConfiguration.title")}
        unavailable
      />
    </div>
  );
}

function NavigationCard({
  children,
  description,
  icon,
  onOpen,
  title,
}: {
  children: ReactNode;
  description: string;
  icon: LucideIcon;
  onOpen: () => void;
  title: string;
}) {
  return (
    <button className="min-w-0 text-left" onClick={onOpen} type="button">
      <SettingsCard description={description} icon={icon} title={title}>
        {children}
      </SettingsCard>
    </button>
  );
}

function UnavailableSettingsCard({
  descriptionKey,
  icon,
  titleKey,
}: {
  descriptionKey: MessageKey;
  icon: LucideIcon;
  titleKey: MessageKey;
}) {
  const { t } = useI18n();
  return (
    <SettingsCard
      description={t(descriptionKey)}
      icon={icon}
      title={t(titleKey)}
      unavailable
    />
  );
}

function SettingsCard({
  children,
  description,
  icon: Icon,
  title,
  unavailable = false,
}: {
  children?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
  unavailable?: boolean;
}) {
  const { t } = useI18n();
  return (
    <Card className="h-full min-w-0">
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

function UnavailableEvidenceCard({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CircleOff aria-hidden="true" className="size-4 text-muted-foreground" />
          {title}
          <Badge variant="outline">{t("common.state.unavailable")}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function KubernetesRulesCard({
  evidence,
  title,
}: {
  evidence: SettingsAccessProfile["kubernetesRules"];
  title: string;
}) {
  const { t } = useI18n();
  if (evidence.status === "unavailable") {
    return <UnavailableEvidenceCard description={evidence.detail} title={title} />;
  }
  const rules = [...evidence.resourceRules, ...evidence.nonResourceRules];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <ShieldCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
          <span className="truncate">{title}</span>
          <Badge className="ml-auto max-w-40 truncate" title={evidence.subject.name} variant="outline">
            {evidence.subject.name}
          </Badge>
        </CardTitle>
        <CardDescription>
          {t("settings.access.kubernetes.agentDescription", {
            namespace: evidence.namespace,
            subject: evidence.subject.name,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid max-h-80 gap-2 overflow-y-auto">
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : rules.map((rule, index) => (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5" key={`${index}-${rule.verbs.join("-")}`}>
            <Badge variant="outline">{rule.verbs.join(", ") || "—"}</Badge>
            <span className="break-all text-xs text-muted-foreground">
              {(rule.resources.length > 0 ? rule.resources : rule.nonResourceUrls).join(", ") || "—"}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RestrictedResourceTypesCard({
  evidence,
  title,
}: {
  evidence: SettingsAccessProfile["restrictedResourceTypes"];
  title: string;
}) {
  const { t } = useI18n();
  if (evidence.status === "unavailable") {
    return <UnavailableEvidenceCard description={evidence.detail} title={title} />;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <CircleOff aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{title}</span>
          <Badge className="ml-auto" variant="outline">{evidence.items.length}</Badge>
        </CardTitle>
        <CardDescription>
          {t("settings.access.restricted.agentDescription", {
            namespace: evidence.namespace,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {evidence.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {evidence.items.map((item) => (
              <Badge
                key={`${item.apiGroup}/${item.version}/${item.resource}`}
                title={`${item.apiGroup || "core"}/${item.version}/${item.resource}`}
                variant="outline"
              >
                {item.kind}
              </Badge>
            ))}
          </div>
        )}
        {evidence.completeness === "partial" ? (
          <p className="break-words text-xs text-muted-foreground">
            {evidence.reasonCodes.join(", ")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SettingsNotice({
  action,
  description,
  icon: Icon,
  title,
}: {
  action?: ReactNode;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <span className="mb-2 grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {action ? <CardContent>{action}</CardContent> : null}
    </Card>
  );
}

function Definition({ label, value }: { label: string; value: string }) {
  return (
    <dl className="grid min-w-0 gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium" title={value}>{value}</dd>
    </dl>
  );
}

function sectionFromHash(hash: string): SettingsSection {
  if (hash === "#profile" || hash === "#access") return "access";
  if (hash === "#preferences") return "preferences";
  if (hash === "#administration") return "administration";
  return "overview";
}

function isSettingsSection(value: string | null): value is SettingsSection {
  return value === "overview"
    || value === "access"
    || value === "preferences"
    || value === "administration";
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
