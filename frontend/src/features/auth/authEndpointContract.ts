export interface AuthEndpointSession {
  authenticated: true;
  auth_enabled: true;
  auth_mode: "password" | "trusted_proxy";
  display_name?: string | null;
  email?: string | null;
  groups: readonly string[];
  logout: {
    action: "end_session" | "upstream_identity_required";
    supported: boolean;
    reauthentication_expected: boolean;
  };
  roles: readonly string[];
  user_id: string;
  workspace_id: string;
}

export interface AuthEndpointWorkspace {
  workspace_id: string;
  name: string;
  slug: string;
}

export interface AuthEndpointWorkspaceList {
  current_workspace_id: string;
  items: readonly AuthEndpointWorkspace[];
}
