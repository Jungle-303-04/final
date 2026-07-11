import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import type { AuthSession } from "../api";
import { PRODUCT_ROUTES, productRouteForPath } from "./productRoutes";

export interface ProductOutletContext {
  session: AuthSession;
}

interface ProductShellProps {
  session: AuthSession;
  onSignOut: () => Promise<void>;
}

export function ProductShell({ session, onSignOut }: ProductShellProps) {
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const location = useLocation();
  const currentRoute = productRouteForPath(location.pathname);
  const navigationRoutes = PRODUCT_ROUTES.filter((route) => route.showInNavigation);

  return (
    <div className="product-shell" data-sidebar-collapsed={isSidebarCollapsed || undefined}>
      <a className="skip-link" href="#product-main">본문으로 건너뛰기</a>
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-lockup__mark" aria-hidden="true">K</span>
          <span>Operations Control Room</span>
        </div>
        <span className="topbar__route" aria-current="page">
          {currentRoute?.label ?? "제품"}
        </span>
        <div className="topbar__meta">
          <span className="workspace-chip">WORKSPACE <strong>{session.workspace_id}</strong></span>
          <button className="button button--quiet" type="button" onClick={() => void onSignOut()}>
            로그아웃
          </button>
        </div>
      </header>

      <div className="product-shell__body">
        <aside className="product-sidebar" aria-label="제품 메뉴">
          <nav className="product-nav">
            {navigationRoutes.map((route) => (
              <NavLink
                className={({ isActive }) => `product-nav__item${isActive ? " product-nav__item--active" : ""}`}
                end
                key={route.id}
                to={route.path}
              >
                <span className="product-nav__mark" aria-hidden="true">{route.label.slice(0, 1)}</span>
                <span className="product-nav__label">{route.label}</span>
              </NavLink>
            ))}
          </nav>
          <button
            aria-expanded={!isSidebarCollapsed}
            className="product-sidebar__toggle button button--quiet"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            <span aria-hidden="true">{isSidebarCollapsed ? "›" : "‹"}</span>
            <span className="product-nav__label">사이드바 접기</span>
          </button>
        </aside>

        <main className="product-route" id="product-main">
          <Outlet context={{ session } satisfies ProductOutletContext} />
        </main>
      </div>
    </div>
  );
}
