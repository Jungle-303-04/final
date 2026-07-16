export type HeaderNotificationAttentionTone =
  | "critical"
  | "warning"
  | "info"
  | "progress"
  | "success";

export interface HeaderNotificationAttentionInput {
  id: string;
  title: string;
  description: string;
  tone: HeaderNotificationAttentionTone;
}

export interface HeaderNotificationAttention extends HeaderNotificationAttentionInput {
  sequence: number;
}

export type HeaderNotificationAttentionHandler = (
  attention: HeaderNotificationAttentionInput,
) => void;
