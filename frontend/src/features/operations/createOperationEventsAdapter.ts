import type { OperationEventsEndpointDependencies } from "./operationEventsEndpointContract";
import type { OperationEventsPort } from "./operationEventsContract";

export function createOperationEventsAdapter(
  endpoints: OperationEventsEndpointDependencies,
): OperationEventsPort {
  return {
    async *subscribeOperationEvents(commandId, signal) {
      for await (const event of endpoints.subscribeCommandOperationEvents(commandId, signal)) {
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
