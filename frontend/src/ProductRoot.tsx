import { useCallback, useMemo, useState } from "react";
import {
  Activity,
  AppWindow,
  Boxes,
  CircleDollarSign,
  Contrast,
  GitBranch,
  Moon,
  Network,
  Settings,
  Sun,
} from "lucide-react";
import { MotionConfig } from "motion/react";

import {
  AppShell,
  type AppShellMessages,
  type AppShellTheme,
  type SidebarNavigationRegistry,
} from "./app";
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
  if (theme === "light") return "high-contrast";
  return "dark";
}

function ThemeIcon({ theme }: { readonly theme: AppShellTheme }) {
  if (theme === "dark") return <Moon aria-hidden="true" />;
  if (theme === "light") return <Sun aria-hidden="true" />;
  return <Contrast aria-hidden="true" />;
}

function initialSidebarExpanded() {
  try {
    const saved = localStorage.getItem("kubeheal.sidebar.expanded");
    return saved === null ? true : saved === "true";
  } catch {
    return true;
  }
}

export function ProductRoot({ gateway }: ProductRootProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(initialSidebarExpanded);
  const [compactSidebarOpen, setCompactSidebarOpen] = useState(false);
  const [theme, setTheme] = useState<AppShellTheme>("light");

  const navigation = useMemo<SidebarNavigationRegistry>(
    () => [
      {
        id: "observe",
        label: "Observe",
        items: [
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
            id: "resources",
            label: "Resources",
            href: "/resources",
            icon: <Boxes />,
            disabled: true,
            disabledReason: "Resource catalog 연결 후 활성화",
          },
          {
            id: "timeline",
            label: "Timeline",
            href: "/timeline",
            icon: <Activity />,
            disabled: true,
            disabledReason: "Timeline port 연결 후 활성화",
          },
        ],
      },
      {
        id: "deliver",
        label: "Deliver",
        items: [
          {
            id: "gitops",
            label: "GitOps",
            href: "/gitops",
            icon: <GitBranch />,
            disabled: true,
            disabledReason: "GitOps capability 연결 후 활성화",
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
        layout: { duration: 0.36, ease: [0.22, 1, 0.36, 1] },
        opacity: { duration: 0.16, ease: "easeOut" },
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
          <span className="product-brand__mark"><Boxes aria-hidden="true" /></span>
          <span className="product-brand__copy"><strong>KubeHeal</strong><small>Control plane</small></span>
        </div>
      }
      sidebarFooter={
        <button className="sidebar-footer-action" type="button" disabled>
          <Settings aria-hidden="true" /> <span>Settings</span>
        </button>
      }
      breadcrumbs={[
        { id: "fleet", label: "Fleet", href: "/" },
        { id: "topology", label: "Topology", current: true },
      ]}
      topbarStatus={
        <span className="connection-indicator" data-origin={gateway.dataOrigin.kind}>
          <i /> {originLabel}
        </span>
      }
      topbarTheme={
        <button
          type="button"
          className="topbar-icon-button"
          aria-label={`현재 ${theme} 테마. 다음 테마로 전환`}
          onClick={() => setTheme((current) => nextTheme(current))}
        >
          <ThemeIcon theme={theme} />
        </button>
      }
      theme={theme}
      >
        <TopologyExperience gateway={gateway} />
      </AppShell>
    </MotionConfig>
  );
}
