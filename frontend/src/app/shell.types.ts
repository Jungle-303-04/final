import type { MouseEvent, ReactNode, RefObject } from "react";

export type AppShellTheme = "light" | "dark" | "high-contrast";

type EnabledNavigationItem = {
  readonly disabled?: false;
  readonly disabledReason?: never;
};

type DisabledNavigationItem = {
  readonly disabled: true;
  readonly disabledReason: string;
};

export type SidebarNavigationItem = {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ReactNode;
  readonly description?: string;
  readonly badge?: ReactNode;
  readonly external?: boolean;
} & (EnabledNavigationItem | DisabledNavigationItem);

export interface SidebarNavigationSection {
  readonly id: string;
  readonly label?: string;
  readonly items: readonly SidebarNavigationItem[];
}

export type SidebarNavigationRegistry = readonly SidebarNavigationSection[];

export interface ScopeBreadcrumb {
  readonly id: string;
  readonly label: string;
  readonly href?: string;
  readonly current?: boolean;
}

export interface AppShellMessages {
  readonly skipToContent: string;
  readonly navigation: string;
  readonly openNavigation: string;
  readonly closeNavigation: string;
  readonly expandNavigation: string;
  readonly collapseNavigation: string;
  readonly breadcrumbs: string;
  readonly search: string;
  readonly status: string;
  readonly theme: string;
  readonly actions: string;
  readonly closeOverlay: string;
}

export interface SidebarProps {
  readonly id: string;
  readonly registry: SidebarNavigationRegistry;
  readonly activeItemId?: string | undefined;
  readonly expanded: boolean;
  readonly compact: boolean;
  readonly overlayOpen: boolean;
  readonly brand?: ReactNode | undefined;
  readonly footer?: ReactNode | undefined;
  readonly messages: AppShellMessages;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly onOverlayOpenChange: (open: boolean) => void;
  readonly onNavigate?:
    | ((
        item: SidebarNavigationItem,
        event: MouseEvent<HTMLAnchorElement>,
      ) => void)
    | undefined;
}

export interface TopbarProps {
  readonly sidebarId: string;
  readonly compactSidebarOpen: boolean;
  readonly compactTriggerRef: RefObject<HTMLButtonElement | null>;
  readonly breadcrumbs?: readonly ScopeBreadcrumb[] | undefined;
  readonly search?: ReactNode | undefined;
  readonly status?: ReactNode | undefined;
  readonly themeControl?: ReactNode | undefined;
  readonly actions?: ReactNode | undefined;
  readonly messages: AppShellMessages;
  readonly onCompactSidebarOpenChange: (open: boolean) => void;
  readonly onBreadcrumbNavigate?:
    | ((
        breadcrumb: ScopeBreadcrumb,
        event: MouseEvent<HTMLAnchorElement>,
      ) => void)
    | undefined;
}

interface AppShellBaseProps {
  readonly navigation: SidebarNavigationRegistry;
  readonly activeNavigationId?: string;
  readonly sidebarExpanded: boolean;
  readonly compactSidebarOpen: boolean;
  readonly messages: AppShellMessages;
  readonly mainLabel: string;
  readonly children: ReactNode;
  readonly onSidebarExpandedChange: (expanded: boolean) => void;
  readonly onCompactSidebarOpenChange: (open: boolean) => void;
  readonly onNavigate?: (
    item: SidebarNavigationItem,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
  readonly onBreadcrumbNavigate?: (
    breadcrumb: ScopeBreadcrumb,
    event: MouseEvent<HTMLAnchorElement>,
  ) => void;
  readonly sidebarBrand?: ReactNode;
  readonly sidebarFooter?: ReactNode;
  readonly breadcrumbs?: readonly ScopeBreadcrumb[];
  readonly topbarSearch?: ReactNode;
  readonly topbarStatus?: ReactNode;
  readonly topbarTheme?: ReactNode;
  readonly topbarActions?: ReactNode;
  readonly focusRestoreKey?: string | number;
  readonly theme?: AppShellTheme;
  readonly id?: string;
  readonly mainId?: string;
  readonly className?: string;
}

type AppShellWithoutInspector = {
  readonly inspector?: undefined;
  readonly inspectorLabel?: never;
};

type AppShellWithInspector = {
  readonly inspector: ReactNode;
  readonly inspectorLabel: string;
};

export type AppShellProps = AppShellBaseProps &
  (AppShellWithoutInspector | AppShellWithInspector);
