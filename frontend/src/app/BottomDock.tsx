import { ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";

import { useBottomDock } from "../features/bottom-dock/BottomDockProvider";
import type { BottomDockTab } from "../features/bottom-dock/bottomDockState";
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
  const { t } = useI18n();
  if (dock.tabs.length === 0 || dock.activeTabId === null) return null;
  const activeTab = dock.tabs.find((tab) => tab.id === dock.activeTabId) ?? dock.tabs[0]!;
  return (
    <section
      aria-label={t("shell.dock.title")}
      className="motion-bottom-dock relative z-30 shrink-0 border-t bg-background"
      data-collapsed={dock.collapsed || undefined}
      data-height={dock.height}
      data-slot="bottom-dock"
    >
      {!dock.collapsed ? (
        <BottomDockResizeHandle height={dock.height} onHeightChange={dock.setHeight} />
      ) : null}
      <Tabs
        className="h-full min-h-0 gap-0"
        onValueChange={(value) => value && dock.selectTab(value)}
        value={dock.activeTabId}
      >
        <header className="flex min-w-0 items-center gap-2 border-b px-2 py-1">
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
          <Badge variant="outline">{t(statusLabel(activeTab))}</Badge>
          {activeTab.streamId ? (
            <Button
              aria-label={t("shell.dock.askAi")}
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
            onClick={() => dock.setCollapsed(!dock.collapsed)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {dock.collapsed ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
          </Button>
          <Button
            aria-label={t("shell.dock.closeTab", {
              name: activeTab.target.name,
            })}
            onClick={() => dock.closeTab(dock.activeTabId!)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>
        {!dock.collapsed ? dock.tabs.map((tab) => (
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
