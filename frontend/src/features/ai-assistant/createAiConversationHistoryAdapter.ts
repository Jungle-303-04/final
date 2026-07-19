import {
  type AiConversationHistoryPage,
  type AiConversationHistoryPort,
} from "./aiConversationHistoryContract";
import {
  hydrateAiConversationHistoryItem,
  mapAiConversationDetail,
  parseAiConversationHistoryItem,
  toAiConversationEndpointContext,
} from "./aiConversationHistoryMapping";
import {
  isAbortError,
  withAiConversationHistoryFailure,
} from "./aiConversationHistoryAdapterFailure";

const DETAIL_HYDRATION_CONCURRENCY = 4;
const DETAIL_MESSAGE_LIMIT = 100;
const PREVIEW_MESSAGE_LIMIT = 20;

interface AiConversationAccepted {
  conversation_id: string;
  message_id: string;
}

interface AiConversationList {
  conversations: Record<string, unknown>[];
}

interface AiConversationDetail {
  conversation: Record<string, unknown>;
  messages: Record<string, unknown>[];
  has_more: boolean;
  messages_completeness: "complete" | "partial";
}

export interface AiConversationHistoryEndpoints {
  list(signal?: AbortSignal): Promise<AiConversationList>;
  get(
    conversationId: string,
    signal?: AbortSignal,
    page?: { limit?: number; cursor?: string },
  ): Promise<AiConversationDetail>;
  create(
    input: {
      message: string;
      title?: string;
      context?: Record<string, unknown>;
    },
    signal?: AbortSignal,
  ): Promise<AiConversationAccepted>;
  append(
    conversationId: string,
    input: { message: string; context?: Record<string, unknown> },
    signal?: AbortSignal,
  ): Promise<AiConversationAccepted>;
}
export function createAiConversationHistoryAdapter(
  endpoints: AiConversationHistoryEndpoints,
): AiConversationHistoryPort {
  return {
    async list(signal) {
      return withAiConversationHistoryFailure(async () => {
        const response = await endpoints.list(signal);
        const baseItems = response.conversations.map(parseAiConversationHistoryItem);
        const hydrated = await mapWithConcurrency(
          baseItems,
          DETAIL_HYDRATION_CONCURRENCY,
          async (item) => {
            try {
              const detail = await endpoints.get(item.id, signal, {
                limit: PREVIEW_MESSAGE_LIMIT,
              });
              return hydrateAiConversationHistoryItem(item, detail);
            } catch (error) {
              if (isAbortError(error)) throw error;
              return { ...item, detailAvailable: false };
            }
          },
        );
        const partialConversationIds = hydrated
          .filter((item) => !item.detailAvailable)
          .map((item) => item.id);
        return {
          items: hydrated,
          completeness: partialConversationIds.length === 0 ? "complete" : "partial",
          partialConversationIds,
        } satisfies AiConversationHistoryPage;
      });
    },

    async load(conversationId, signal) {
      return withAiConversationHistoryFailure(async () => mapAiConversationDetail(
        await endpoints.get(conversationId, signal, { limit: DETAIL_MESSAGE_LIMIT }),
      ));
    },

    async create(message, context, signal) {
      return withAiConversationHistoryFailure(async () => {
        const receipt = await endpoints.create({
          message,
          context: toAiConversationEndpointContext(context),
        }, signal);
        return {
          conversationId: receipt.conversation_id,
          messageId: receipt.message_id,
        };
      });
    },

    async append(conversationId, message, context, signal) {
      return withAiConversationHistoryFailure(async () => {
        const receipt = await endpoints.append(conversationId, {
          message,
          ...(context ? { context: toAiConversationEndpointContext(context) } : {}),
        }, signal);
        return {
          conversationId: receipt.conversation_id,
          messageId: receipt.message_id,
        };
      });
    },
  };
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      if (item !== undefined) results[index] = await operation(item);
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(concurrency, items.length) },
    worker,
  ));
  return results;
}
