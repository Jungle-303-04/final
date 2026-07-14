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

export interface AiAlertRulePayloadEndpoint {
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

export interface AiChatActionEndpoint {
  type: "create_alert_rule";
  payload: AiAlertRulePayloadEndpoint;
  rationale: string;
}

export interface AiChatEndpointResponse {
  answer: string;
  evidence: Array<{ type: string; id: string; label: string; link: string }>;
  action?: AiChatActionEndpoint | null;
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
  postAlertRule(
    payload: AiAlertRulePayloadEndpoint,
    signal?: AbortSignal,
  ): Promise<{ ruleId: string }>;
}
