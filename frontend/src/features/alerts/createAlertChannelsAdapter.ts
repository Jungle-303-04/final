import type {
  AlertChannel,
  AlertChannelsPort,
  AlertChannelSeverity,
} from "./alertChannelsContract";
import type {
  AlertChannelEndpoints,
  AlertChannelEndpointValue,
} from "./alertChannelsEndpointContract";

export function createAlertChannelsAdapter(
  endpoints: AlertChannelEndpoints,
): AlertChannelsPort {
  return {
    async list(signal) {
      const response = await endpoints.listAlertChannels(signal);
      return response.channels.map(toChannel);
    },
    async remove(channelId, signal) {
      await endpoints.deleteAlertChannel(channelId, signal);
    },
    async save(input, signal) {
      const response = await endpoints.saveAlertChannel({
        channel_id: input.id ?? "",
        enabled: input.enabled,
        kind: input.kind,
        min_severity: input.minimumSeverity,
        name: input.name,
        url: input.url,
      }, signal);
      return toChannel(response);
    },
    async test(channel, signal) {
      const response = await endpoints.testAlertChannel({
        channel_id: channel.id,
        kind: "webhook",
        message: "Opsia alert channel delivery test",
        min_severity: channel.minimumSeverity,
        name: channel.name,
        severity: channel.minimumSeverity,
        url: channel.url,
      }, signal);
      return {
        delivered: response.delivered,
        detail: response.detail,
        statusCode: response.status_code,
        valid: response.valid,
      };
    },
  };
}

function toChannel(value: AlertChannelEndpointValue): AlertChannel {
  return {
    enabled: value.enabled,
    id: value.channel_id,
    kind: value.kind,
    lastTestDetail: value.last_test_detail,
    lastTestStatus: value.last_test_status,
    lastTestStatusCode: value.last_test_status_code,
    lastTestedAt: value.last_tested_at,
    minimumSeverity: normalizeSeverity(value.min_severity),
    name: value.name,
    url: value.url,
  };
}

function normalizeSeverity(value: string): AlertChannelSeverity {
  if (value === "critical" || value === "info" || value === "warning") return value;
  return "warning";
}
