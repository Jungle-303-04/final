import { lazy, Suspense } from "react";

import { desktopBridge } from "./desktopBridge";

const DesktopLocalTerminalSheet = lazy(async () => ({
  default: (await import("./DesktopLocalTerminalSheet")).DesktopLocalTerminalSheet,
}));

/** Keeps the xterm renderer out of browser builds and loads it only in Tauri. */
export function DesktopLocalTerminalEntry() {
  if (!desktopBridge.isDesktop) return null;
  return (
    <Suspense fallback={null}>
      <DesktopLocalTerminalSheet />
    </Suspense>
  );
}
