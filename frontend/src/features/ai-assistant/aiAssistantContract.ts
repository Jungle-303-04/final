export interface AiAssistantFilters {
  clusters: string[];
  namespaces: string[];
  applications: string[];
  labels: string[];
  resourceTypes: string[];
  health: string[];
  query: string;
}

export interface AiAssistantContext {
  screen: string;
  filters: AiAssistantFilters;
  selection: { type: "resource"; identity: string } | null;
  time: string | null;
  logStreamId: string | null;
}

export interface AiEvidenceLink {
  type: string;
  id: string;
  label: string;
  link: `/${string}`;
}

export interface AiAlertRulePayload {
  name: string;
  metric: string;
  comparator: string;
  threshold: number;
  for_seconds: number;
  severity: string;
  scope: {
    clusters: string[];
    namespaces: string[];
    applications: string[];
    labels: string[];
  };
  channels: string[];
  enabled: boolean;
}

export interface AiChatActionProposal {
  type: "create_alert_rule";
  payload: AiAlertRulePayload;
  rationale: string;
}

export interface AiAssistantAnswer {
  answer: string;
  evidence: AiEvidenceLink[];
  /** AI가 제안한 실행 후보(사람이 한 번 눌러 실행). 지금은 알림 규칙 생성뿐. */
  action?: AiChatActionProposal | null;
}

export interface AiAssistantSuggestion {
  id: string;
  label: string;
  prompt: string;
}

export type AiAssistantFailureCode =
  | "unauthorized"
  | "forbidden"
  | "offline"
  | "rate-limited"
  | "unavailable"
  | "invalid-request"
  | "invalid-response"
  | "error";

export class AiAssistantPortFailure extends Error {
  constructor(readonly code: AiAssistantFailureCode) {
    super(`AI assistant failed: ${code}`);
    this.name = "AiAssistantPortFailure";
  }
}

export interface AiAssistantPort {
  ask(
    context: AiAssistantContext,
    message: string,
    signal?: AbortSignal,
  ): Promise<AiAssistantAnswer>;
  loadSuggestions(
    context: AiAssistantContext,
    signal?: AbortSignal,
  ): Promise<AiAssistantSuggestion[]>;
  /** AI 제안 액션을 사람이 확정할 때 실행한다. 화이트리스트: 알림 규칙 생성. */
  createAlertRule(
    payload: AiAlertRulePayload,
    signal?: AbortSignal,
  ): Promise<{ ruleId: string }>;
}

export const EMPTY_AI_ASSISTANT_PORT: AiAssistantPort = {
  ask: async () => { throw new AiAssistantPortFailure("unavailable"); },
  loadSuggestions: async () => [],
  createAlertRule: async () => { throw new AiAssistantPortFailure("unavailable"); },
};
