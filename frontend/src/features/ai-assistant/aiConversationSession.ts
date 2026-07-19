import { useSyncExternalStore } from "react";

import type { AiConversationLaunchContext } from "./aiConversationHistoryContract";

export type AiConversationSession =
  | { mode: "idle"; revision: number }
  | {
      mode: "new";
      context: AiConversationLaunchContext;
      revision: number;
    }
  | {
      mode: "resume";
      conversationId: string;
      revision: number;
    };

type SessionListener = () => void;

let session: AiConversationSession = { mode: "idle", revision: 0 };
const listeners = new Set<SessionListener>();

export function startAiConversation(context: AiConversationLaunchContext): void {
  publish({ mode: "new", context, revision: session.revision + 1 });
}

export function resumeAiConversation(conversationId: string): void {
  const normalizedId = conversationId.trim();
  if (!normalizedId) throw new TypeError("conversationId must not be empty");
  publish({
    mode: "resume",
    conversationId: normalizedId,
    revision: session.revision + 1,
  });
}

export function closeAiConversation(): void {
  if (session.mode === "idle") return;
  publish({ mode: "idle", revision: session.revision + 1 });
}

export function currentAiConversationSession(): AiConversationSession {
  return session;
}

export function subscribeAiConversationSession(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAiConversationSession(): AiConversationSession {
  return useSyncExternalStore(
    subscribeAiConversationSession,
    currentAiConversationSession,
    currentAiConversationSession,
  );
}

function publish(next: AiConversationSession): void {
  session = next;
  for (const listener of listeners) listener();
}
