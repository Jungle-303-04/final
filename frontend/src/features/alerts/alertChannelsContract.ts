export type AlertChannelSeverity = "critical" | "info" | "warning";

export interface AlertChannel {
  enabled: boolean;
  id: string;
  kind: string;
  lastTestDetail: string | null;
  lastTestStatus: string | null;
  lastTestStatusCode: number | null;
  lastTestedAt: string | null;
  minimumSeverity: AlertChannelSeverity;
  name: string;
  url: string;
}

export interface AlertChannelTestResult {
  delivered: boolean;
  detail: string;
  statusCode: number | null;
  valid: boolean;
}

export interface AlertChannelInput {
  enabled: boolean;
  id: string | null;
  kind: "webhook";
  minimumSeverity: AlertChannelSeverity;
  name: string;
  url: string;
}

export interface AlertChannelsPort {
  list(signal?: AbortSignal): Promise<readonly AlertChannel[]>;
  remove(channelId: string, signal?: AbortSignal): Promise<void>;
  save(input: AlertChannelInput, signal?: AbortSignal): Promise<AlertChannel>;
  test(channel: AlertChannel, signal?: AbortSignal): Promise<AlertChannelTestResult>;
}

export const EMPTY_ALERT_CHANNELS_PORT: AlertChannelsPort = {
  async list() {
    return [];
  },
  async remove() {
    throw new Error("Alert channel deletion is unavailable");
  },
  async save() {
    throw new Error("Alert channel persistence is unavailable");
  },
  async test() {
    throw new Error("Alert channel testing is unavailable");
  },
};
