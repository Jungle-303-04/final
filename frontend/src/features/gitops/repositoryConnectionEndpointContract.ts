export interface RepositoryProbeEndpoint {
  repo_ref: string;
  normalized_repo_ref: string;
  valid: boolean;
  reachable: boolean;
  default_branch: string | null;
  private: boolean | null;
  html_url: string | null;
  warnings: string[];
  errors: string[];
}

export interface RepositoryBranchListEndpoint {
  repo_ref: string;
  default_branch: string | null;
  branches: { name: string; protected: boolean; default: boolean }[];
  warnings: string[];
}

export interface RepositoryManifestCatalogEndpoint {
  repo_ref: string;
  branch: string;
  candidates: {
    path: string;
    source_type: string;
    display_name: string;
    reason: string;
  }[];
  warnings: string[];
}

export interface RepositoryManifestValidationEndpoint {
  repo_ref: string;
  branch: string;
  manifest_path: string;
  valid: boolean;
  status: string;
  validation_mode: string;
  resource_count: number;
  resources: {
    api_version: string;
    kind: string;
    namespace: string | null;
    name: string;
  }[];
  warnings: string[];
  errors: string[];
}

export interface RepositoryConnectionStatusEndpoint {
  repo_ref: string;
  repository_id: string | null;
  repository_status:
    | "unregistered"
    | "active"
    | "invalid_credential"
    | "disabled"
    | "unknown";
  connection_stage: "awaiting_validation" | "ready" | "error";
  terminal: boolean;
  refresh_after_seconds: number | null;
}
