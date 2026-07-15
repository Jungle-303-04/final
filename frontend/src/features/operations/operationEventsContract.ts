import type { OperationEvent, OperationEventsPort } from "../../shared/parity/referenceParity";

export type { OperationEvent, OperationEventsPort };

export const EMPTY_OPERATION_EVENTS_PORT: OperationEventsPort = {
  async *subscribeOperationEvents() {
    yield* [] as OperationEvent[];
  },
};
