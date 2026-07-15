import type { OperationEventsEndpointDependencies } from "./operationEventsEndpointContract";
import type { OperationEventsPort } from "./operationEventsContract";

export function createOperationEventsAdapter(
  endpoints: OperationEventsEndpointDependencies,
): OperationEventsPort {
  return {
    async *subscribeOperationEvents(commandId, subscription) {
      for await (const event of endpoints.subscribeCommandOperationEvents(commandId, subscription)) {
        yield {
          commandId: event.command_id,
          sequence: event.sequence,
          kind: event.kind,
          payload: event.payload,
          occurredAt: event.occurred_at,
        };
      }
    },
  };
}
