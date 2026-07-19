import type { AiConversationHistoryFailure } from "./aiConversationHistoryContract";

export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && error.name === "AbortError";
}

export function toHistoryFailure(error: unknown): AiConversationHistoryFailure {
  if (
    error instanceof Error
    && error.name === "AiConversationHistoryFailure"
    && "code" in error
  ) {
    return error as AiConversationHistoryFailure;
  }
  return Object.assign(new Error("AI conversation history failed"), {
    code: "unknown" as const,
    name: "AiConversationHistoryFailure",
  }) as AiConversationHistoryFailure;
}
