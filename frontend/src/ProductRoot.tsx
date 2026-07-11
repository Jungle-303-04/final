import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import {
  Activity,
  AppWindow,
  Boxes,
  ChevronDown,
  CircleHelp,
  CircleDollarSign,
  Clock3,
  GitBranch,
  Globe2,
  House,
  List,
  Moon,
  Network,
  Package,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { MotionConfig } from "motion/react";

import {
  AppShell,
  type AppShellMessages,
  type AppShellTheme,
  type SidebarNavigationRegistry,
} from "./app";
import { Badge, Button, MOTION_RECIPE } from "./design-system";
import type { TopologyHierarchyGateway } from "./features/topology/contracts";
import { TopologyExperience } from "./features/topology/TopologyExperience";
import "./styles/global.css";
import "./styles/topology.css";

type ProductRootProps = {
  readonly gateway: TopologyHierarchyGateway;
};

const messages: AppShellMessages = {
  skipToContent: "본문으로 건너뛰기",
  navigation: "제품 탐색",
  openNavigation: "탐색 메뉴 열기",
  closeNavigation: "탐색 메뉴 닫기",
  expandNavigation: "사이드바 펼치기",
  collapseNavigation: "사이드바 접기",
  breadcrumbs: "현재 위치",
  search: "검색",
  status: "연결 상태",
  theme: "테마",
  actions: "화면 작업",
  closeOverlay: "탐색 메뉴 바깥 영역 닫기",
};

function nextTheme(theme: AppShellTheme): AppShellTheme {
  if (theme === "dark") return "light";
  return "dark";
}

function ThemeIcon({ theme }: { readonly theme: AppShellTheme }) {
  if (theme === "dark") return <Moon aria-hidden="true" />;
  return <Sun aria-hidden="true" />;
}

function initialSidebarExpanded() {
  try {
    const saved = localStorage.getItem("kubeheal.sidebar.expanded");
    return saved === null ? true : saved === "true";
  } catch {
    return true;
  }
}

function initialTheme(): AppShellTheme {
  if (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(forced-colors: active)").matches ||
      window.matchMedia?.("(prefers-contrast: more)").matches)
  ) {
    return "high-contrast";
  }

  try {
    const saved = localStorage.getItem("kubeheal.theme");
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // Continue with the system preference.
  }

  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ProductRoot({ gateway }: ProductRootProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(initialSidebarExpanded);
  const [compactSidebarOpen, setCompactSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<AppShellTheme>(initialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("kubeheal.theme", theme);
    } catch {
      // Theme persistence is optional; the resolved root theme remains authoritative.
    }
  }, [theme]);

  const navigation = useMemo<SidebarNavigationRegistry>(
    () => [
      {
        id: "primary",
        items: [
          {
            id: "home",
            label: "Home",
            href: "/home",
            icon: <House />,
            disabled: true,
            disabledReason: "Home port 연결 후 활성화",
          },
          {
            id: "resources",
            label: "Resources",
            href: "/resources",
            icon: <List />,
            disabled: true,
            disabledReason: "Resource catalog 연결 후 활성화",
          },
          {
            id: "issues",
            label: "Issues",
            href: "/issues",
            icon: <TriangleAlert />,
            disabled: true,
            disabledReason: "Issue port 연결 후 활성화",
          },
          { id: "topology", label: "Topology", href: "/", icon: <Network /> },
          {
            id: "applications",
            label: "Applications",
            href: "/applications",
            icon: <AppWindow />,
            disabled: true,
            disabledReason: "Applications port 연결 후 활성화",
          },
          {
            id: "timeline",
            label: "Timeline",
            href: "/timeline",
            icon: <Clock3 />,
            disabled: true,
            disabledReason: "Timeline port 연결 후 활성화",
          },
          {
            id: "live-traffic",
            label: "Live Traffic",
            href: "/live-traffic",
            icon: <Activity />,
            disabled: true,
            disabledReason: "Traffic stream 연결 후 활성화",
          },
          {
            id: "helm",
            label: "Helm",
            href: "/helm",
            icon: <Package />,
            disabled: true,
            disabledReason: "Helm capability 연결 후 활성화",
          },
          {
            id: "gitops",
            label: "GitOps",
            href: "/gitops",
            icon: <GitBranch />,
            disabled: true,
            disabledReason: "GitOps capability 연결 후 활성화",
          },
          {
            id: "checks",
            label: "Checks",
            href: "/checks",
            icon: <ShieldCheck />,
            disabled: true,
            disabledReason: "Checks capability 연결 후 활성화",
          },
          {
            id: "cost",
            label: "Cost",
            href: "/cost",
            icon: <CircleDollarSign />,
            disabled: true,
            disabledReason: "Cost metric catalog 연결 후 활성화",
          },
        ],
      },
    ],
    [],
  );

  const updateSidebarExpanded = useCallback((expanded: boolean) => {
    setSidebarExpanded(expanded);
    try {
      localStorage.setItem("kubeheal.sidebar.expanded", String(expanded));
    } catch {
      // Persistence is an enhancement; controlled UI state remains authoritative.
    }
  }, []);

  const originLabel =
    gateway.dataOrigin.kind === "live" ? "Live adapter" : "Demo adapter";

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{
        layout: MOTION_RECIPE.hierarchyMorph,
        opacity: MOTION_RECIPE.standard,
      }}
    >
      <AppShell
        navigation={navigation}
        activeNavigationId="topology"
        sidebarExpanded={sidebarExpanded}
        compactSidebarOpen={compactSidebarOpen}
        messages={messages}
        mainLabel="Kubernetes Topology"
        onSidebarExpandedChange={updateSidebarExpanded}
        onCompactSidebarOpenChange={setCompactSidebarOpen}
        onNavigate={(item, event) => {
          if (!item.external) event.preventDefault();
        }}
        sidebarBrand={
          <div className="product-brand" aria-label="KubeHeal">
            <span className="product-brand__mark">
              <Boxes aria-hidden="true" />
            </span>
            <span className="product-brand__copy">
              <strong>KubeHeal</strong>
              <small>Control plane</small>
            </span>
          </div>
        }
        sidebarFooter={
          <Button className="sidebar-footer-action" variant="ghost" disabled>
            <Settings aria-hidden="true" data-icon="inline-start" />
            <span>Settings</span>
          </Button>
        }
        topbarScope={
          <div
            className="product-scope-selectors"
            role="group"
            aria-label="Resource scope"
          >
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Cluster scope port 연결 후 선택할 수 있습니다"
            >
              <Server aria-hidden="true" data-icon="inline-start" />
              Unknown
              <ChevronDown aria-hidden="true" data-icon="inline-end" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled
              title="Namespace catalog 연결 후 선택할 수 있습니다"
            >
              <Globe2 aria-hidden="true" data-icon="inline-start" />
              All namespaces
              <ChevronDown aria-hidden="true" data-icon="inline-end" />
            </Button>
            <Badge
              className="connection-indicator"
              variant="ghost"
              data-origin={gateway.dataOrigin.kind}
              aria-label={originLabel}
              title={originLabel}
            >
              <i />
            </Badge>
          </div>
        }
        topbarSearch={
          <Button
            className="product-command-search"
            variant="secondary"
            disabled
            aria-label="Search resources and commands. Search port 연결 후 활성화"
          >
            <Search aria-hidden="true" data-icon="inline-start" />
            <span>Search resources &amp; commands...</span>
            <kbd>⌘K</kbd>
          </Button>
        }
        topbarTheme={
          <Button
            className="topbar-icon-button"
            size="icon"
            variant="outline"
            aria-label={`현재 ${theme} 테마. 다음 테마로 전환`}
            onClick={() => setTheme((current) => nextTheme(current))}
          >
            <ThemeIcon theme={theme} />
          </Button>
        }
        topbarActions={
          <Button
            className="topbar-icon-button"
            size="icon"
            variant="ghost"
            disabled
            aria-label="Help. Help center 연결 후 활성화"
          >
            <CircleHelp aria-hidden="true" />
          </Button>
        }
        theme={theme}
      >
        <TopologyExperience gateway={gateway} />
      </AppShell>
    </MotionConfig>
  );
}
