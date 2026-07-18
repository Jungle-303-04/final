import type {
  AiAssistantAnswer,
  AiAssistantSuggestion,
} from "../features/ai-assistant/aiAssistantContract";

export interface AiTranscriptEntry {
  id: number;
  contextKey: string;
  question: string;
  response: AiAssistantAnswer;
}

export interface AiPendingQuestion {
  contextKey: string;
  question: string;
}

export interface AiContextSuggestions {
  contextKey: string;
  items: AiAssistantSuggestion[];
}
