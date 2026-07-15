import type {
  OperationEvent,
  OperationEventsSubscription,
} from "./operationEventsContract";

export interface OperationEventsEndpointEvent {
  command_id: OperationEvent["commandId"];
  sequence: OperationEvent["sequence"];
  kind: OperationEvent["kind"];
  payload: OperationEvent["payload"];
  occurred_at: OperationEvent["occurredAt"];
}

export interface OperationEventsEndpointDependencies {
  subscribeCommandOperationEvents(
    commandId: string,
    subscription?: OperationEventsSubscription,
  ): AsyncIterable<OperationEventsEndpointEvent>;
}
