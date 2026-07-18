import type { MessageKey } from "@/shared/i18n";
import type { StatusTone } from "../StatusMark";

export type { StatusTone };

export const statusLabelKeys: Readonly<Record<StatusTone, MessageKey>> = {
  healthy: "status.tone.healthy",
  warning: "status.tone.warning",
  critical: "status.tone.critical",
  stale: "status.tone.stale",
  unknown: "status.tone.unknown",
};
