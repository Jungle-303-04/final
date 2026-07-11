import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";

import "../styles/shell.css";

import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { AppShellProps } from "./shell.types";

const COMPACT_LAYOUT_QUERY = "(max-width: 63.999rem)";

function subscribeToCompactLayout(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }

  const mediaQuery = window.matchMedia(COMPACT_LAYOUT_QUERY);
  mediaQuery.addEventListener("change", onChange);
  return () => mediaQuery.removeEventListener("change", onChange);
}

function getCompactLayoutSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(COMPACT_LAYOUT_QUERY).matches
  );
}

function getServerCompactLayoutSnapshot(): boolean {
  return false;
}

function useCompactLayout(): boolean {
  return useSyncExternalStore(
    subscribeToCompactLayout,
    getCompactLayoutSnapshot,
    getServerCompactLayoutSnapshot,
  );
}

function normalizeGeneratedId(id: string): string {
  return id.replaceAll(":", "");
}

export function AppShell({
  navigation,
  activeNavigationId,
  sidebarExpanded,
  compactSidebarOpen,
  messages,
  mainLabel,
  children,
  onSidebarExpandedChange,
  onCompactSidebarOpenChange,
  onNavigate,
  onBreadcrumbNavigate,
  sidebarBrand,
  sidebarFooter,
  breadcrumbs,
  topbarSearch,
  topbarStatus,
  topbarTheme,
  topbarActions,
  inspector,
  inspectorLabel,
  focusRestoreKey,
  theme = "light",
  id,
  mainId,
  className,
}: AppShellProps) {
  const generatedId = normalizeGeneratedId(useId());
  const shellId = id ?? `app-shell-${generatedId}`;
  const resolvedMainId = mainId ?? `${shellId}-main`;
  const sidebarId = `${shellId}-navigation`;
  const compact = useCompactLayout();
  const mainRef = useRef<HTMLElement>(null);
  const compactTriggerRef = useRef<HTMLButtonElement>(null);
  const previousCompactOpenRef = useRef(compactSidebarOpen);
  const previousFocusRestoreKeyRef = useRef(focusRestoreKey);

  useEffect(() => {
    if (!compact && compactSidebarOpen) {
      onCompactSidebarOpenChange(false);
    }
  }, [compact, compactSidebarOpen, onCompactSidebarOpenChange]);

  useEffect(() => {
    const wasOpen = previousCompactOpenRef.current;
    previousCompactOpenRef.current = compactSidebarOpen;

    if (compact && wasOpen && !compactSidebarOpen) {
      compactTriggerRef.current?.focus({ preventScroll: true });
    }
  }, [compact, compactSidebarOpen]);

  useEffect(() => {
    const previousKey = previousFocusRestoreKeyRef.current;
    previousFocusRestoreKeyRef.current = focusRestoreKey;

    if (
      focusRestoreKey !== undefined &&
      previousKey !== undefined &&
      previousKey !== focusRestoreKey
    ) {
      mainRef.current?.focus({ preventScroll: true });
    }
  }, [focusRestoreKey]);

  const shellClassName = ["app-shell", className]
    .filter(Boolean)
    .join(" ");
  const modalNavigationOpen = compact && compactSidebarOpen;

  return (
    <div
      id={shellId}
      className={shellClassName}
      data-theme={theme}
      data-sidebar-expanded={sidebarExpanded}
      data-compact={compact}
      data-compact-open={modalNavigationOpen}
      data-shell-region="shell"
    >
      <a className="app-shell__skip-link" href={`#${resolvedMainId}`}>
        {messages.skipToContent}
      </a>

      <Sidebar
        id={sidebarId}
        registry={navigation}
        activeItemId={activeNavigationId}
        expanded={sidebarExpanded}
        compact={compact}
        overlayOpen={compactSidebarOpen}
        brand={sidebarBrand}
        footer={sidebarFooter}
        messages={messages}
        onExpandedChange={onSidebarExpandedChange}
        onOverlayOpenChange={onCompactSidebarOpenChange}
        onNavigate={onNavigate}
      />

      <div
        className="app-shell__stage"
        aria-hidden={modalNavigationOpen || undefined}
        inert={modalNavigationOpen}
      >
        <Topbar
          sidebarId={sidebarId}
          compactSidebarOpen={compactSidebarOpen}
          compactTriggerRef={compactTriggerRef}
          breadcrumbs={breadcrumbs}
          search={topbarSearch}
          status={topbarStatus}
          themeControl={topbarTheme}
          actions={topbarActions}
          messages={messages}
          onCompactSidebarOpenChange={onCompactSidebarOpenChange}
          onBreadcrumbNavigate={onBreadcrumbNavigate}
        />

        <div className="app-shell__workspace">
          <main
            ref={mainRef}
            id={resolvedMainId}
            className="app-shell__main"
            aria-label={mainLabel}
            tabIndex={-1}
            data-shell-region="main"
          >
            {children}
          </main>

          {inspector ? (
            <aside
              className="app-shell__inspector"
              aria-label={inspectorLabel}
              data-shell-region="inspector"
            >
              {inspector}
            </aside>
          ) : null}
        </div>
      </div>

      {modalNavigationOpen ? (
        <button
          className="app-shell__scrim"
          type="button"
          tabIndex={-1}
          aria-label={messages.closeOverlay}
          onClick={() => onCompactSidebarOpenChange(false)}
        />
      ) : null}
    </div>
  );
}
