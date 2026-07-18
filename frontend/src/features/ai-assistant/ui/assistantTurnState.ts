export type AssistantRequestState =
  | { phase: "idle" }
  | { contextKey: string; phase: "pending"; question: string }
  | { contextKey: string; phase: "failed"; question: string };

export type AssistantRequestEvent =
  | { contextKey: string; question: string; type: "submitted" }
  | { type: "settled" }
  | { type: "cancelled" }
  | { contextKey: string; question: string; type: "failed" };

export const INITIAL_ASSISTANT_REQUEST_STATE: AssistantRequestState = { phase: "idle" };

export function assistantRequestReducer(
  state: AssistantRequestState,
  event: AssistantRequestEvent,
): AssistantRequestState {
  switch (event.type) {
    case "submitted":
      return {
        contextKey: event.contextKey,
        phase: "pending",
        question: event.question,
      };
    case "failed":
      return {
        contextKey: event.contextKey,
        phase: "failed",
        question: event.question,
      };
    case "cancelled":
    case "settled":
      return INITIAL_ASSISTANT_REQUEST_STATE;
    default:
      return state;
  }
}
