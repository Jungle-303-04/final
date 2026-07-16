import type {
  OperationEvent,
  OperationEventsPort,
  OperationEventsSubscription,
  OperationStreamFailure,
  OperationStreamLifecycle,
} from "../../shared/parity/referenceParity";

export type {
  OperationEvent,
  OperationEventsPort,
  OperationEventsSubscription,
  OperationStreamFailure,
  OperationStreamLifecycle,
};

export const EMPTY_OPERATION_EVENTS_PORT: OperationEventsPort = {
  async *subscribeOperationEvents() {
    yield* [] as OperationEvent[];
  },
};
