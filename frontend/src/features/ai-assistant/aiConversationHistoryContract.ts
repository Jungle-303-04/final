export type AiConversationContextKind =
  | "application"
  | "cluster"
  | "issue"
  | "resource"
  | "workflow"
  | "general";

export type AiConversationDeliveryState =
  | "completed"
  | "failed"
  | "waiting"
  | "unknown";

export interface AiConversationLaunchContext {
  applicationId?: string;
  clusterId?: string;
  locale: "en" | "ko";
}

export interface AiConversationHistoryItem {
  id: string;
  title: string;
  preview: string | null;
  contextKind: AiConversationContextKind;
  contextValue: string | null;
  status: AiConversationDeliveryState;
  updatedAt: string;
  detailAvailable: boolean;
}

export interface AiConversationHistoryPage {
  items: readonly AiConversationHistoryItem[];
  completeness: "complete" | "partial";
  partialConversationIds: readonly string[];
}

export interface AiStoredConversationMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  createdAt: string;
  failure?: {
    code: "rate_limited" | "unavailable";
    retryable: boolean;
  };
}

export interface AiStoredConversation {
  id: string;
  title: string;
  contextKind: AiConversationContextKind;
  contextValue: string | null;
  status: AiConversationDeliveryState;
  updatedAt: string;
  messages: readonly AiStoredConversationMessage[];
  hasMore: boolean;
  messagesCompleteness: "complete" | "partial";
}

export interface AiConversationWriteReceipt {
  conversationId: string;
  messageId: string;
}

export interface AiConversationHistoryPort {
  list(signal?: AbortSignal): Promise<AiConversationHistoryPage>;
  load(conversationId: string, signal?: AbortSignal): Promise<AiStoredConversation>;
  create(
    message: string,
    context: AiConversationLaunchContext,
    signal?: AbortSignal,
  ): Promise<AiConversationWriteReceipt>;
  append(
    conversationId: string,
    message: string,
    context?: AiConversationLaunchContext,
    signal?: AbortSignal,
  ): Promise<AiConversationWriteReceipt>;
}

export const EMPTY_AI_CONVERSATION_HISTORY_PORT: AiConversationHistoryPort = {
  async append() {
    throw new AiConversationHistoryFailure("unavailable");
  },
  async create() {
    throw new AiConversationHistoryFailure("unavailable");
  },
  async list() {
    throw new AiConversationHistoryFailure("unavailable");
  },
  async load() {
    throw new AiConversationHistoryFailure("unavailable");
  },
};

export type AiConversationHistoryFailureCode =
  | "forbidden"
  | "invalid-response"
  | "not-found"
  | "offline"
  | "rate-limited"
  | "unauthorized"
  | "unavailable"
  | "unknown";

export class AiConversationHistoryFailure extends Error {
  constructor(readonly code: AiConversationHistoryFailureCode) {
    super(`AI conversation history failed: ${code}`);
    this.name = "AiConversationHistoryFailure";
  }
}
