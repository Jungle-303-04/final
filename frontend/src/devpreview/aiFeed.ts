import { useEffect, useState } from "react";

import { getAiSuggestions, postAiChat } from "../api/ai-assistant";
import type {
  AiAssistantContextEndpoint,
  AiChatResponseEndpoint,
} from "../api/ai-assistant-schemas";
import { getAiConversation, listAiConversations } from "../api/ai-conversations";
import { createAlertRule } from "../api/alert-rules";
import type { AlertRuleCreateInput } from "../api/alert-rules-schemas";
import type {
  AiAlertRuleActionPayload,
} from "../features/ai-assistant/aiAssistantContract";
import type {
  AiMessagePart,
  AiTurn,
} from "../features/ai-assistant/aiConversationContract";

// UI-PHASE2-001 AI-02/03/04/05/06/07 and §2 "AI dock / standalone AI
// interactions" + "AI history": typed live adapters for the demo AI dock.
//
// Rules (mirrors rcaIssuesFeed.ts / checksFeed.ts):
//   * hooks report `loading | ready | unavailable`, never fabricate data;
//   * no synchronous setState at the top of useEffect (react-hooks rule);
//   * a context change aborts the obsolete request so a stale response cannot
//     overwrite the current scope; no backfill.
//
// Only server-returned fields render. `/api/ai/chat` returns `answer`,
// optional `evidence`, and an optional `create_alert_rule` action — it returns
// NO reasoning steps and NO related links, so the transform never manufactures
// them. The chat call is a mutation: it is issued on an explicit user send
// only, never on mount or a timer.

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error
    && (error as { name?: unknown }).name === "AbortError";
}

// ── context ────────────────────────────────────────────────────────────────

/**
 * Projects the dock's current screen/scope chips into the canonical assistant
 * context. `/api/ai/suggestions` returns 422 without a valid context, so the
 * current view and cluster scope are always supplied.
 */
export function buildAiContext(view: string, scope: string): AiAssistantContextEndpoint {
  const screen = view.trim() || "resources";
  const cluster = scope.trim();
  return {
    screen,
    filters: {
      clusters: cluster ? [cluster] : [],
      namespaces: [],
      applications: [],
      labels: [],
      resource_types: [],
      health: [],
      query: "",
    },
    selection: null,
    time: null,
    log_stream_id: null,
  };
}

// ── suggestions ──────────────────────────────────────────────────────────────

export type AiSuggestionsStatus = "loading" | "ready" | "unavailable";

export interface AiSuggestionView {
  id: string;
  label: string;
  prompt: string;
}

export interface AiSuggestionsFeed {
  status: AiSuggestionsStatus;
  items: AiSuggestionView[];
}

/**
 * Reads context-aware prompt suggestions from `GET /api/ai/suggestions`. A
 * scope/view change aborts the obsolete request. A load failure is an honest
 * `unavailable` (the dock hides the suggestion row), never a fabricated list.
 */
export function useAiSuggestions(view: string, scope: string): AiSuggestionsFeed {
  const [feed, setFeed] = useState<AiSuggestionsFeed>({ status: "loading", items: [] });
  useEffect(() => {
    const controller = new AbortController();
    void getAiSuggestions(buildAiContext(view, scope), controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setFeed({
          status: "ready",
          items: response.suggestions.map((suggestion) => ({
            id: suggestion.id,
            label: suggestion.label,
            prompt: suggestion.prompt,
          })),
        });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setFeed({ status: "unavailable", items: [] });
      });
    return () => controller.abort();
  }, [view, scope]);
  return feed;
}

// ── chat (mutation, explicit send only) ──────────────────────────────────────

const now = (): string => new Date().toISOString();

function toActionPayload(
  payload: NonNullable<AiChatResponseEndpoint["action"]>["payload"],
): AiAlertRuleActionPayload {
  return {
    name: payload.name,
    scope: {
      clusters: [...payload.scope.clusters],
      namespaces: [...payload.scope.namespaces],
      applications: [...payload.scope.applications],
      labels: [...payload.scope.labels],
    },
    metric: payload.metric,
    comparator: payload.comparator,
    threshold: payload.threshold,
    forSeconds: payload.for_seconds,
    severity: payload.severity,
    channels: [...payload.channels],
    enabled: payload.enabled,
  };
}

/**
 * Pure transform: an `/api/ai/chat` response into a renderable assistant turn.
 * Emits a text part only when the server returned an answer, an evidence part
 * only from server evidence, and an action part only from a server action.
 * No steps or links are ever synthesized — the response carries neither.
 */
export function toAssistantTurn(response: AiChatResponseEndpoint, id: string): AiTurn {
  const parts: AiMessagePart[] = [];
  if (response.answer) {
    parts.push({ kind: "text", markdown: response.answer });
  }
  if (response.evidence.length > 0) {
    parts.push({
      kind: "evidence",
      items: response.evidence.map((item) => ({
        type: item.type,
        id: item.id,
        label: item.label,
        link: item.link as `/${string}`,
      })),
    });
  }
  if (response.action) {
    parts.push({
      kind: "action",
      proposal: {
        type: "create_alert_rule",
        rationale: response.action.rationale,
        payload: toActionPayload(response.action.payload),
      },
    });
  }
  return {
    id,
    role: "assistant",
    collapsed: false,
    createdAt: now(),
    parts,
    // 되묻기 표시 — 무상태 챗 엔드포인트에 대해 패널이 보류 문장을 누적한다.
    ...(response.answer_kind === "clarification" ? { clarification: true } : {}),
  };
}

/**
 * Issues the chat mutation for one explicit user message and projects the
 * server response into a turn. Never called on mount or a timer.
 */
export async function sendAiChatTurn(
  context: AiAssistantContextEndpoint,
  message: string,
  id: string,
  signal?: AbortSignal,
): Promise<AiTurn> {
  const response = await postAiChat(context, message, signal);
  return toAssistantTurn(response, id);
}

// ── alert-rule action (AI-06, explicit user action only) ─────────────────────

function toAlertRuleCreateInput(payload: AiAlertRuleActionPayload): AlertRuleCreateInput {
  return {
    name: payload.name,
    scope: {
      clusters: [...payload.scope.clusters],
      namespaces: [...payload.scope.namespaces],
      applications: [...payload.scope.applications],
      labels: [...payload.scope.labels],
    },
    metric: payload.metric,
    comparator: payload.comparator,
    threshold: payload.threshold,
    for_seconds: payload.forSeconds,
    severity: payload.severity,
    channels: [...payload.channels],
    enabled: payload.enabled,
  };
}

/**
 * Delegates the AI-proposed alert rule to the real alert-rule mutation
 * (`POST /api/alert-rules`) and returns the server-issued rule id. The result
 * is the backend's, never a timer-faked event.
 */
export async function createAiAlertRule(
  payload: AiAlertRuleActionPayload,
  signal?: AbortSignal,
): Promise<{ ruleId: string }> {
  const created = await createAlertRule(toAlertRuleCreateInput(payload), signal);
  return { ruleId: created.rule_id };
}

// ── conversation history ─────────────────────────────────────────────────────

export type AiConversationsStatus = "loading" | "ready" | "unavailable";

export interface AiConversationListItem {
  id: string;
  title: string;
  updatedAt: string | null;
}

export interface AiConversationsFeed {
  status: AiConversationsStatus;
  items: AiConversationListItem[];
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function projectConversation(record: Record<string, unknown>): AiConversationListItem | null {
  const id = readString(record, "conversation_id") ?? readString(record, "id");
  if (id === null) return null;
  return {
    id,
    title: readString(record, "title") ?? "대화",
    updatedAt: readString(record, "updated_at"),
  };
}

/**
 * Reads the signed-in user's AI conversation history from
 * `GET /api/ai/conversations`. Only server-returned conversation identities
 * render; a failure is an honest `unavailable`.
 */
export function useAiConversations(): AiConversationsFeed {
  const [feed, setFeed] = useState<AiConversationsFeed>({ status: "loading", items: [] });
  useEffect(() => {
    const controller = new AbortController();
    void listAiConversations(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        const items = response.conversations
          .map(projectConversation)
          .filter((item): item is AiConversationListItem => item !== null);
        setFeed({ status: "ready", items });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setFeed({ status: "unavailable", items: [] });
      });
    return () => controller.abort();
  }, []);
  return feed;
}

function projectMessageTurn(record: Record<string, unknown>, index: number): AiTurn | null {
  const id = readString(record, "message_id") ?? `m${index}`;
  const content = typeof record.content === "string" ? record.content : "";
  const createdAt = readString(record, "created_at") ?? now();
  const role = record.role === "user" ? "user" : "assistant";
  if (role === "user") {
    if (!content) return null;
    return { id, role: "user", question: content, collapsed: false, createdAt };
  }
  // Assistant history renders only the stored text content. Evidence/action
  // live in message metadata whose shape is not part of the typed contract, so
  // they are not reconstructed here rather than risk fabrication.
  const parts: AiMessagePart[] = content ? [{ kind: "text", markdown: content }] : [];
  return { id, role: "assistant", collapsed: false, createdAt, parts };
}

/**
 * Loads one stored conversation and projects its messages into turns. Only the
 * server-returned role and text content are used.
 */
export async function loadConversationTurns(
  conversationId: string,
  signal?: AbortSignal,
): Promise<AiTurn[]> {
  const detail = await getAiConversation(conversationId, signal);
  return detail.messages
    .map((message, index) => projectMessageTurn(message, index))
    .filter((turn): turn is AiTurn => turn !== null);
}

// ── conversation detail (selected history, read only) ─────────────────────────

export type AiConversationDetailStatus =
  | "idle"
  | "loading"
  | "ready"
  | "unavailable";

export interface AiConversationDetailFeed {
  status: AiConversationDetailStatus;
  turns: AiTurn[];
}

interface DetailState {
  forId: string | null;
  failed: boolean;
  turns: AiTurn[];
}

/**
 * Reads the selected conversation's stored messages as renderable turns from
 * `GET /api/ai/conversations/{id}`. A `null` id is `idle` (no conversation
 * open); a load failure is an honest `unavailable`. Selecting another
 * conversation aborts the obsolete request so a stale detail cannot overwrite
 * the current one. Only server role/content render — nothing is fabricated.
 *
 * `loading` and `idle` are derived from the requested id versus the id the last
 * settled result belongs to, so the effect only ever calls setState inside
 * `.then`/`.catch` (never synchronously at the top).
 */
export function useConversationDetail(
  conversationId: string | null,
): AiConversationDetailFeed {
  const [state, setState] = useState<DetailState>({
    forId: null,
    failed: false,
    turns: [],
  });
  useEffect(() => {
    if (conversationId === null) return;
    const controller = new AbortController();
    void loadConversationTurns(conversationId, controller.signal)
      .then((turns) => {
        if (controller.signal.aborted) return;
        setState({ forId: conversationId, failed: false, turns });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || isAbortError(cause)) return;
        setState({ forId: conversationId, failed: true, turns: [] });
      });
    return () => controller.abort();
  }, [conversationId]);

  if (conversationId === null) return { status: "idle", turns: [] };
  if (state.forId !== conversationId) return { status: "loading", turns: [] };
  if (state.failed) return { status: "unavailable", turns: [] };
  return { status: "ready", turns: state.turns };
}
