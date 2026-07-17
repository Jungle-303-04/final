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
