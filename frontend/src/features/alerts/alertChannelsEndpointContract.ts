export interface AlertChannelEndpointValue {
  channel_id: string;
  enabled: boolean;
  kind: string;
  last_test_detail: string | null;
  last_test_status: string | null;
  last_test_status_code: number | null;
  last_tested_at: string | null;
  min_severity: string;
  name: string;
  url: string;
  workspace_id: string;
}

export interface AlertChannelTestEndpointInput {
  channel_id: string;
  kind: "webhook";
  message: string;
  min_severity: "critical" | "info" | "warning";
  name: string;
  severity: "critical" | "info" | "warning";
  url: string;
}

export interface AlertChannelTestEndpointValue {
  code: string | null;
  delivered: boolean;
  detail: string;
  status_code: number | null;
  valid: boolean;
}

export interface AlertChannelUpsertEndpointInput {
  channel_id: string;
  enabled: boolean;
  kind: "webhook";
  min_severity: "critical" | "info" | "warning";
  name: string;
  url: string;
}

export interface AlertChannelEndpoints {
  deleteAlertChannel(channelId: string, signal?: AbortSignal): Promise<void>;
  listAlertChannels(signal?: AbortSignal): Promise<{
    channels: readonly AlertChannelEndpointValue[];
  }>;
  saveAlertChannel(
    input: AlertChannelUpsertEndpointInput,
    signal?: AbortSignal,
  ): Promise<AlertChannelEndpointValue>;
  testAlertChannel(
    input: AlertChannelTestEndpointInput,
    signal?: AbortSignal,
  ): Promise<AlertChannelTestEndpointValue>;
}
