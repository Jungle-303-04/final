import type { CommandOperationEventEndpoint } from "../../api/operation-events";
import type { OperationEventsPort } from "./operationEventsContract";

interface OperationEventsEndpointDependencies {
  subscribeCommandOperationEvents(
    commandId: string,
    signal?: AbortSignal,
  ): AsyncIterable<CommandOperationEventEndpoint>;
}

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
