# Event Contract And DLQ Guide

This document is the working rule for writing, publishing, subscribing, retrying, and replaying events.

## Event Envelope

All events use the same envelope.

```json
{
  "event_id": "uuid",
  "subject": "command.requested",
  "source": "management-api-gateway",
  "correlation_id": "uuid-or-business-flow-id",
  "timestamp": "2026-06-26T00:00:00Z",
  "payload": {}
}
```

Rules:

- `subject` is the routing contract.
- `source` is the service that produced the event.
- `correlation_id` connects one business flow across services.
- `payload` must be a JSON object, not a raw string or array.
- Do not put provider tokens, session tokens, kubeconfig, or `.env` values in an event.

## Subject Naming

Use `<domain>.<thing>.<verb>` when possible.

| Domain | Current subjects |
| --- | --- |
| OAuth | `oauth.start.requested`, `oauth.connected` |
| GitOps | `git.webhook.received`, `git.changed`, `manifest.rendered`, `desired.diff.detected` |
| Agent | `agent.connected`, `cluster.evidence.received` |
| Command | `command.requested`, `command.rejected`, `command.dispatch.ready`, `command.dispatched`, `command.queued_for_agent`, `command.completed` |
| RCA | `evidence.built`, `rca.completed`, `safe_pr.created` |
| Dashboard | `dashboard.updated` |
| DLQ | `dead_letter.created` |

Add a new subject only after deciding:

- who publishes it
- who subscribes to it
- whether it is a command request, state fact, or projection notification
- whether it contains enough data for retry/replay without hidden local state

## Publishing

Services should use `EventClient`, not raw NATS.

```python
await self.events.publish(
    EventSubject.COMMAND_REQUESTED,
    SERVICE_NAME,
    {"cluster_id": "target-cluster-01", "namespace": "sandbox"},
    correlation_id,
)
```

`RecordedEventClient` publishes to JetStream and stores the envelope in PostgreSQL `events`.

Gateway code may still use `publish_and_record(...)` as a compatibility wrapper. New worker code should prefer `EventClient`.

## Subscribing

Worker runners define their subscription through `EventHandlerSpec`.

```python
spec = EventHandlerSpec(
    service_name="command-worker",
    subject=EventSubject.COMMAND_REQUESTED,
    handler_factory=lambda events, db: CommandWorkflow(events, db).handle,
)
await WorkerRuntime(spec).run()
```

The durable consumer name defaults to `service_name`. If a service needs multiple independent consumers, set `durable_name` explicitly.

## Processing State

Every consumed event gets a row in `event_processing`.

| Status | Meaning |
| --- | --- |
| `processing` | handler is currently executing or about to execute |
| `retrying` | handler failed and the message was `nak`ed |
| `processed` | handler completed and the message was `ack`ed |
| `dead_lettered` | max attempts were exhausted and DLQ captured the failure |

Runtime order:

```text
decode message
-> record event envelope
-> begin event_processing
-> run workflow handler
-> finish event_processing
-> ack
```

Failure order:

```text
handler error
-> fail event_processing as retrying
-> nak with delay
```

Final failure order:

```text
handler error at max attempts
-> fail event_processing as dead_lettered
-> insert event_dead_letters
-> publish dead_letter.created
-> ack original message
```

## Dead Letter Management

Dead letters are stored in PostgreSQL and also emitted as events.

| Storage | Purpose |
| --- | --- |
| `event_dead_letters` | operator-visible failure queue |
| `dead_letter.created` | event stream notification for dashboard/audit |

Gateway endpoints:

```text
GET  /dead-letters
POST /dead-letters/{dead_letter_id}/replay
```

Both endpoints require a valid session. Replay republishes the original payload to the original subject with a new `event_id`, then marks the dead letter row as `replayed`.

## Transaction And Ordering Policy

This project uses at-least-once event delivery.

That means handlers must be written as idempotent or near-idempotent:

- use stable ids when writing command records
- use `on conflict` for records that must be unique
- record input event before side effects
- publish follow-up events only after local validation and local writes
- never ack before local handler work is complete

For workflows that need strict database/event atomicity, add an outbox table before production use:

```text
single DB transaction
-> write business rows
-> write outbox rows
-> commit
-> outbox relay publishes events
-> mark outbox rows published
```

The current MVP implements the processing ledger and DLQ first. The outbox relay is the next hardening step when business writes and emitted events must commit atomically.
