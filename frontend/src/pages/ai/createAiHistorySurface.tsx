import type { ComponentType } from "react";

import type { AiConversationHistoryPort } from "../../features/ai-assistant/aiConversationHistoryContract";
import { AiHistoryPage } from "./AiHistoryPage";

export function createAiHistorySurface(
  port: AiConversationHistoryPort,
): ComponentType {
  return function AiHistorySurface() {
    return <AiHistoryPage port={port} />;
  };
}
