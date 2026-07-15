export interface AiAssistantContextEndpoint {
  screen: string;
  filters: {
    clusters: string[];
    namespaces: string[];
    applications: string[];
    labels: string[];
    resource_types: string[];
    health: string[];
    query: string;
  };
  selection: { type: "resource"; identity: string } | null;
  time: string | null;
  log_stream_id: string | null;
}

export interface AiChatEndpointResponse {
  answer: string;
  evidence: Array<{ type: string; id: string; label: string; link: string }>;
  action?: AiChatActionEndpoint | null;
  answer_kind?: "capability" | null;
}

export interface AiAlertRulePayloadEndpoint {
  name: string;
  scope: {
    clusters?: readonly string[];
    namespaces?: readonly string[];
    applications?: readonly string[];
    labels?: readonly string[];
  };
  metric: "cpu_pct" | "mem_pct" | "restart_count" | "pod_not_ready";
  comparator: ">" | ">=" | "<" | "<=";
  threshold: number;
  for_seconds: number;
  severity: "critical" | "high" | "medium" | "low";
  channels: readonly string[];
  enabled: boolean;
}

export interface AiChatActionEndpoint {
  type: "create_alert_rule";
  payload: AiAlertRulePayloadEndpoint;
  rationale: string;
}

export interface AiSuggestionsEndpointResponse {
  suggestions: Array<{ id: string; label: string; prompt: string }>;
}

export interface AiAssistantEndpointDependencies {
  postAiChat(
    context: AiAssistantContextEndpoint,
    message: string,
    signal?: AbortSignal,
  ): Promise<AiChatEndpointResponse>;
  getAiSuggestions(
    context: AiAssistantContextEndpoint,
    signal?: AbortSignal,
  ): Promise<AiSuggestionsEndpointResponse>;
  createAlertRule(
    input: AiAlertRulePayloadEndpoint,
    signal?: AbortSignal,
  ): Promise<{ rule_id: string }>;
}
