export interface AiRecoveryPreviewLine {
  kind: "context" | "add" | "remove";
  content: string;
}

export interface AiRecoveryPreview {
  title: string;
  fileName: string;
  lines: readonly AiRecoveryPreviewLine[];
  note?: string;
}

export interface AiRecoveryHandoff {
  id: string;
  prompt: string;
  displayPrompt: string;
  actionTitle: string;
  actionRoute: "auto" | "safe_pr" | "approval_required" | string;
  contextView: string;
  contextScope: string;
  /** 로컬 RCA UI 미리보기에서만 사용하는 AI 검토 완료 응답. */
  previewReviewResponse?: string;
  /** 로컬 RCA UI 미리보기에서만 사용하는 복구 완료 응답과 상태 전환. */
  previewCompletionResponse?: string;
  previewComplete?: () => void;
  preview?: AiRecoveryPreview;
  execute: () => Promise<boolean>;
}
