import type { ComponentType } from "react";

import type { AiConversationHistoryPort } from "../../../features/ai-assistant/aiConversationHistoryContract";
import { createAiHistorySurface } from "../../../pages/ai/createAiHistorySurface";

export function loadAiHistorySurface(port: AiConversationHistoryPort): ComponentType {
  return createAiHistorySurface(port);
}
