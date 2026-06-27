from __future__ import annotations

from packages.contracts.event_bus.interfaces import Event
from packages.contracts.event_bus.processing import EventProcessingStatus
from packages.contracts.interfaces import (
    EventProcessingRecord,
    EventProcessingStore,
)


class Ledger:
    def __init__(self, store: EventProcessingStore, consumer: str) -> None:
        self.store = store
        self.consumer = consumer

    def begin(self, evt: Event) -> EventProcessingRecord:
        self.store.record_event(evt)
        return self.store.begin_event_processing(evt, self.consumer)

    def finish(self, evt: Event) -> None:
        self.store.finish_event_processing(evt, self.consumer)

    def retry(self, evt: Event, error: Exception) -> None:
        self.store.fail_event_processing(
            evt,
            self.consumer,
            str(error),
            EventProcessingStatus.RETRYING,
        )

    def dead_letter(self, evt: Event, error: Exception) -> None:
        self.store.fail_event_processing(
            evt,
            self.consumer,
            str(error),
            EventProcessingStatus.DEAD_LETTERED,
        )
