import { isAbortError } from "./aiConversationFailure";
import { AiConversationHistoryFailure } from "./aiConversationHistoryContract";

export { isAbortError };

export async function withAiConversationHistoryFailure<T>(
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isAbortError(error) || error instanceof AiConversationHistoryFailure) throw error;
    const kind = transportString(error, "kind");
    const status = transportNumber(error, "status");
    if (kind === "invalid-payload") {
      throw new AiConversationHistoryFailure("invalid-response");
    }
    if (kind === "network") throw new AiConversationHistoryFailure("offline");
    if (status === 401) throw new AiConversationHistoryFailure("unauthorized");
    if (status === 403) throw new AiConversationHistoryFailure("forbidden");
    if (status === 404) throw new AiConversationHistoryFailure("not-found");
    if (status === 429) throw new AiConversationHistoryFailure("rate-limited");
    if (status === 502 || status === 503 || status === 504) {
      throw new AiConversationHistoryFailure("unavailable");
    }
    if (error instanceof TypeError) {
      throw new AiConversationHistoryFailure("invalid-response");
    }
    throw new AiConversationHistoryFailure("unknown");
  }
}

function transportString(error: unknown, key: string): string | null {
  if (!isRecord(error)) return null;
  const value = error[key];
  return typeof value === "string" ? value : null;
}

function transportNumber(error: unknown, key: string): number | null {
  if (!isRecord(error)) return null;
  const value = error[key];
  return typeof value === "number" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
