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
}
