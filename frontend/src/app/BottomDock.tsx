import { ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { useState } from "react";

import { useBottomDock } from "../features/bottom-dock/BottomDockProvider";
import type { BottomDockTab } from "../features/bottom-dock/bottomDockState";
import { OperationStatusCenter } from "../features/operations/OperationStatusCenter";
import { useOptionalOperationStatusSnapshots } from "../features/operations/OperationStatusStore";
import { summarizeOperationStatuses } from "../features/operations/operationPresentation";
import { useI18n } from "../shared/i18n";
import { Badge } from "../shared/ui/primitives/badge";
import { Button } from "../shared/ui/primitives/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../shared/ui/primitives/tabs";
import { BottomDockResizeHandle } from "./BottomDockResizeHandle";
import { LogStreamTab } from "./LogStreamTab";

export function BottomDock({ onAskAi }: { onAskAi: () => void }) {
  const dock = useBottomDock();
  const operations = useOptionalOperationStatusSnapshots();
  const { t } = useI18n();
  const hasLogs = dock.tabs.length > 0 && dock.activeTabId !== null;
  const [operationCenterOpen, setOperationCenterOpen] = useState(!hasLogs);
  if (!hasLogs && operations.length === 0) return null;
  const operationSummary = summarizeOperationStatuses(operations);
  const operationSummaryLabel = t("shell.dock.operationSummary", {
    attention: operationSummary.attention,
    count: operationSummary.total,
  });
  const activeTab = hasLogs
    ? dock.tabs.find((tab) => tab.id === dock.activeTabId) ?? dock.tabs[0]!
    : null;
  const showingOperations = operations.length > 0 && (!hasLogs || operationCenterOpen);
  return (
    <section
      aria-label={hasLogs ? t("shell.dock.title") : t("shell.dock.operationCenter")}
      className="motion-bottom-dock relative z-30 min-w-0 shrink-0 border-t bg-background"
      data-collapsed={dock.collapsed || undefined}
      data-height={dock.height}
      data-slot="bottom-dock"
    >
      {!dock.collapsed ? (
        <BottomDockResizeHandle height={dock.height} onHeightChange={dock.setHeight} />
      ) : null}
      <Tabs
        className="h-full min-h-0 gap-0"
        onValueChange={(value) => {
          if (!value) return;
          setOperationCenterOpen(false);
          dock.selectTab(value);
        }}
        value={activeTab?.id ?? "operations"}
      >
        <header className="flex min-w-0 flex-wrap items-center gap-2 border-b px-2 py-1 sm:flex-nowrap">
          {hasLogs ? (
            <TabsList
              aria-label={t("shell.dock.tabs")}
              className="min-w-0 flex-1 justify-start overflow-x-auto"
              variant="line"
            >
              {dock.tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id}>
                  <span className="max-w-40 truncate">
                    {t("shell.dock.tab", { name: tab.target.name })}
                  </span>
                  {tab.unseen > 0 ? <Badge variant="secondary">{tab.unseen}</Badge> : null}
                </TabsTrigger>
              ))}
            </TabsList>
          ) : <h2 className="min-w-0 flex-1 truncate text-sm font-medium">{t("shell.dock.operationCenter")}</h2>}
          {operations.length > 0 && hasLogs ? (
            <Button
              aria-label={operationCenterOpen ? t("shell.dock.openLogs") : t("shell.dock.openOperationCenter")}
              className="shrink-0"
              onClick={() => setOperationCenterOpen((open) => !open)}
              size="sm"
              type="button"
              variant="ghost"
            >
              {operationCenterOpen ? t("shell.dock.openLogs") : t("shell.dock.operationCenter")}
            </Button>
          ) : null}
          {dock.collapsed && operations.length > 0 ? (
            <output
              aria-atomic="true"
              aria-live="polite"
              className="min-w-0 max-w-full shrink"
              data-slot="operation-summary"
            >
              <Badge className="max-w-full truncate" variant="outline">{operationSummaryLabel}</Badge>
            </output>
          ) : null}
          {dock.collapsed && operations.length > 0 ? (
            <Button
              aria-label={t("shell.dock.reopenOperationCenter")}
              className="shrink-0"
              onClick={() => {
                setOperationCenterOpen(true);
                dock.setCollapsed(false);
              }}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("shell.dock.reopenOperationCenter")}
            </Button>
          ) : null}
          {activeTab ? <Badge variant="outline">{t(statusLabel(activeTab))}</Badge> : null}
          {activeTab?.streamId ? (
            <Button
              aria-label={t("shell.dock.askAi")}
              className="shrink-0"
              onClick={onAskAi}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <Sparkles aria-hidden="true" />
            </Button>
          ) : null}
          <Button
            aria-label={dock.collapsed ? t("shell.dock.expand") : t("shell.dock.collapse")}
            className="shrink-0"
            onClick={() => dock.setCollapsed(!dock.collapsed)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {dock.collapsed ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </Button>
          {activeTab ? (
            <Button
              aria-label={t("shell.dock.closeTab", { name: activeTab.target.name })}
              className="shrink-0"
              onClick={() => dock.closeTab(activeTab.id)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </header>
        {!dock.collapsed && showingOperations ? <OperationStatusCenter /> : null}
        {!dock.collapsed && !showingOperations ? dock.tabs.map((tab) => (
          <TabsContent className="min-h-0 overflow-hidden" key={tab.id} value={tab.id}>
            <LogStreamTab onRetry={() => dock.retryTab(tab.id)} tab={tab} />
          </TabsContent>
        )) : null}
      </Tabs>
    </section>
  );
}

function statusLabel(tab: BottomDockTab) {
  const keys = {
    connecting: "shell.dock.connecting",
    streaming: "shell.dock.streaming",
    ended: "shell.dock.ended",
    failed: "shell.dock.failed",
  } as const;
  return keys[tab.status];
}
