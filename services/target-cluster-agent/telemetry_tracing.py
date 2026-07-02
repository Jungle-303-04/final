from __future__ import annotations

from collections.abc import Iterator
from contextlib import AbstractContextManager, contextmanager
from typing import Any, Protocol

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import SERVICE_NAME, Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import Span, Status, StatusCode, Tracer

_TRACING_CONFIGURED = False


class TraceSpan(Protocol):
    def set_attribute(self, key: str, value: Any) -> None: ...

    def mark_error(self, exc: Exception) -> None: ...


class TraceTracer(Protocol):
    def start_as_current_span(self, name: str) -> AbstractContextManager[TraceSpan]: ...


class OpenTelemetryTraceSpan:
    def __init__(self, span: Span) -> None:
        self.span = span

    def set_attribute(self, key: str, value: Any) -> None:
        self.span.set_attribute(key, value)

    def mark_error(self, exc: Exception) -> None:
        self.span.record_exception(exc)
        self.span.set_status(Status(StatusCode.ERROR, str(exc)))


class OpenTelemetryTraceTracer:
    def __init__(self, tracer: Tracer) -> None:
        self.tracer = tracer

    @contextmanager
    def start_as_current_span(self, name: str) -> Iterator[TraceSpan]:
        with self.tracer.start_as_current_span(name) as span:
            yield OpenTelemetryTraceSpan(span)


def configure_tracing(service_name: str, traces_endpoint: str) -> TraceTracer:
    # Configure where this process sends generated spans.
    global _TRACING_CONFIGURED

    if not _TRACING_CONFIGURED:
        resource = Resource.create({SERVICE_NAME: service_name})
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=traces_endpoint)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        _TRACING_CONFIGURED = True

    return OpenTelemetryTraceTracer(trace.get_tracer(service_name))


def get_tracer(name: str) -> TraceTracer:
    return OpenTelemetryTraceTracer(trace.get_tracer(name))


def mark_span_error(span: TraceSpan, exc: Exception) -> None:
    span.mark_error(exc)
