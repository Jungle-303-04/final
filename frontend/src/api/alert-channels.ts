import { apiRequest, apiRequestNoContent, type ApiPath } from "./client";
import {
  alertChannelListSchema,
  alertChannelSchema,
  alertChannelTestRequestSchema,
  alertChannelTestResponseSchema,
  alertChannelUpsertRequestSchema,
  type AlertChannel,
  type AlertChannelList,
  type AlertChannelTestInput,
  type AlertChannelTestResponse,
  type AlertChannelUpsertInput,
} from "./alert-channels-schemas";
import { encodePathSegment } from "./url";

export const ALERT_CHANNELS_PATH: ApiPath = "/api/alert-channels";
export const ALERT_CHANNEL_TEST_PATH: ApiPath = "/api/alert-channels/test";

export function listAlertChannels(signal?: AbortSignal): Promise<AlertChannelList> {
  return apiRequest(ALERT_CHANNELS_PATH, alertChannelListSchema, { signal });
}

export function saveAlertChannel(
  input: AlertChannelUpsertInput,
  signal?: AbortSignal,
): Promise<AlertChannel> {
  const payload = alertChannelUpsertRequestSchema.parse(input);
  return apiRequest(ALERT_CHANNELS_PATH, alertChannelSchema, jsonRequest(payload, signal));
}

export function deleteAlertChannel(channelId: string, signal?: AbortSignal): Promise<void> {
  if (channelId.trim() === "") throw new TypeError("channelId must not be empty");
  const path = `${ALERT_CHANNELS_PATH}/${encodePathSegment(channelId)}` as ApiPath;
  return apiRequestNoContent(path, { method: "DELETE", signal });
}

export function testAlertChannel(
  input: AlertChannelTestInput,
  signal?: AbortSignal,
): Promise<AlertChannelTestResponse> {
  const payload = alertChannelTestRequestSchema.parse(input);
  return apiRequest(ALERT_CHANNEL_TEST_PATH, alertChannelTestResponseSchema, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

function jsonRequest(payload: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  };
}
