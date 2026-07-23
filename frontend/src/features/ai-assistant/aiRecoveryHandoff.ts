export interface AiRecoveryHandoff {
  id: string;
  prompt: string;
  actionTitle: string;
  actionRoute: "auto" | "safe_pr" | "approval_required" | string;
  contextView: string;
  contextScope: string;
  execute: () => Promise<boolean>;
}
