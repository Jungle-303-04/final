import type {
  AiConversationContextKind,
  AiConversationDeliveryState,
  AiConversationHistoryItem,
  AiConversationLaunchContext,
  AiStoredConversation,
  AiStoredConversationMessage,
} from "./aiConversationHistoryContract";

interface AiConversationDetailRecord {
  conversation: Record<string, unknown>;
  messages: Record<string, unknown>[];
  has_more: boolean;
  messages_completeness: "complete" | "partial";
}

export function parseAiConversationHistoryItem(
  value: Record<string, unknown>,
): AiConversationHistoryItem {
  return {
    id: requiredString(value, "conversation_id"),
    title: requiredString(value, "title"),
    preview: null,
    contextKind: "general",
    contextValue: null,
    status: parseStatus(value.status),
    updatedAt: requiredTimestamp(value, "updated_at"),
    detailAvailable: true,
  };
}

export function hydrateAiConversationHistoryItem(
  item: AiConversationHistoryItem,
  detail: AiConversationDetailRecord,
): AiConversationHistoryItem {
  const conversation = parseConversationRecord(detail.conversation);
  const messages = detail.messages.map(parseMessage);
  const latestMessage = messages[messages.length - 1];
  const preview = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.content
    ?? latestMessage?.content
    ?? null;
  return {
    ...item,
    title: conversation.title,
    preview,
    contextKind: conversation.contextKind,
    contextValue: conversation.contextValue,
    status: conversation.status,
    updatedAt: conversation.updatedAt,
    detailAvailable: true,
  };
}

export function mapAiConversationDetail(
  detail: AiConversationDetailRecord,
): AiStoredConversation {
  const conversation = parseConversationRecord(detail.conversation);
  return {
    ...conversation,
    messages: detail.messages.map(parseMessage),
    hasMore: detail.has_more,
    messagesCompleteness: detail.messages_completeness,
  };
}

export function toAiConversationEndpointContext(
  context: AiConversationLaunchContext,
): Record<string, string> {
  return {
    ...(context.clusterId ? { cluster_id: context.clusterId } : {}),
    ...(context.applicationId ? { application_id: context.applicationId } : {}),
    locale: context.locale,
  };
}

function parseConversationRecord(value: Record<string, unknown>): Omit<
  AiStoredConversation,
  "hasMore" | "messages" | "messagesCompleteness"
> {
  const context = isRecord(value.context) ? value.context : {};
  const contextIdentity = contextKindAndValue(context);
  return {
    id: requiredString(value, "conversation_id"),
    title: requiredString(value, "title"),
    status: parseStatus(value.status),
    updatedAt: requiredTimestamp(value, "updated_at"),
    ...contextIdentity,
  };
}

function parseMessage(value: Record<string, unknown>): AiStoredConversationMessage {
  const role = value.role;
  if (role !== "assistant" && role !== "user") {
    throw new TypeError("AI conversation message role is invalid");
  }
  return {
    id: requiredString(value, "message_id"),
    role,
    content: requiredString(value, "content"),
    createdAt: requiredTimestamp(value, "created_at"),
  };
}

function parseStatus(value: unknown): AiConversationDeliveryState {
  if (value === "completed" || value === "failed" || value === "waiting") return value;
  return "unknown";
}

function contextKindAndValue(context: Record<string, unknown>): {
  contextKind: AiConversationContextKind;
  contextValue: string | null;
} {
  const incident = optionalString(context.incident_id);
  if (incident) return { contextKind: "issue", contextValue: incident };
  const workflow = optionalString(context.workflow_run_id)
    ?? optionalString(context.approval_id)
    ?? optionalString(context.diff_source);
  if (workflow) return { contextKind: "workflow", contextValue: workflow };
  const resource = optionalString(context.name);
  if (resource) return { contextKind: "resource", contextValue: resource };
  const application = optionalString(context.application_id);
  if (application) return { contextKind: "application", contextValue: application };
  const cluster = optionalString(context.cluster_id);
  if (cluster) return { contextKind: "cluster", contextValue: cluster };
  return { contextKind: "general", contextValue: null };
}

function requiredString(value: Record<string, unknown>, key: string): string {
  const parsed = optionalString(value[key]);
  if (parsed === null) throw new TypeError(`AI conversation ${key} is missing`);
  return parsed;
}

function requiredTimestamp(value: Record<string, unknown>, key: string): string {
  const parsed = requiredString(value, key);
  if (!Number.isFinite(Date.parse(parsed))) {
    throw new TypeError(`AI conversation ${key} is invalid`);
  }
  return parsed;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
