export interface NamespaceScopeEndpoint {
  cluster_id: string;
  actives: string[];
  accessible_namespaces: string[];
  accessible_namespace_count: number;
  freshness: {
    completeness: "exact" | "partial" | "unavailable";
    reason_codes: string[];
  };
  revision: number;
}

export interface UiPreferencesEndpoint {
  preferences: {
    theme: "system" | "light" | "dark";
    locale: "en" | "ko";
  };
  revision: number;
}

export interface ShellStateEndpointDependencies {
  getNamespaceScope(clusterId: string, signal?: AbortSignal): Promise<NamespaceScopeEndpoint>;
  updateNamespaceScope(
    input: {
      clusterId: string;
      namespaces: readonly string[];
      expectedRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<NamespaceScopeEndpoint>;
  getUiPreferences(signal?: AbortSignal): Promise<UiPreferencesEndpoint>;
  updateUiPreferences(
    input: {
      preferences: UiPreferencesEndpoint["preferences"];
      expectedRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<UiPreferencesEndpoint>;
}
