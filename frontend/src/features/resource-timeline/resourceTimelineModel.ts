import type { PhysicalTopologyPod } from "../resources/physicalTopologyContract";
import type {
  ResourceHealthTone,
  ResourceSummary,
} from "../resources/resourcesContract";

export const RESOURCE_TIMELINE_RETENTION_MS = 2 * 60 * 60 * 1_000;
export const RESOURCE_TIMELINE_MAX_SAMPLES_PER_POD = 7_200;
export const RESOURCE_TIMELINE_ESTIMATED_SAMPLE_BYTES = 2_048;
export const RESOURCE_TIMELINE_ESTIMATED_POD_BYTES = 256;
export const RESOURCE_TIMELINE_DEFAULT_MAX_ESTIMATED_BYTES = 64 * 1_024 * 1_024;

export interface PodTimelineIdentityInput {
  clusterId: string;
  namespace: string;
  name: string;
}

export interface PodTimelineSample {
  readonly present: boolean;
  readonly sequence: number;
  readonly observedAt: string;
  readonly observedAtMs: number;
  readonly ingestOrdinal: number;
  readonly usagePercent?: number | null;
  readonly cpuMillicores?: number | null;
  readonly cpuRequestMillicores?: number | null;
  readonly memoryMebibytes?: number | null;
  readonly memoryRequestMebibytes?: number | null;
  readonly phase?: string;
  readonly health?: string;
  readonly restartCount?: number;
  readonly graphPod?: PhysicalTopologyPod;
  readonly tableRow?: ResourceSummary;
}

export interface ResourceTimelineAvailableRange {
  readonly from: string;
  readonly fromMs: number;
  readonly to: string;
  readonly toMs: number;
}

export type ResourceTimelineCursor =
  | { readonly mode: "live" }
  | {
      readonly mode: "replay";
      readonly at: string;
      readonly atMs: number;
      readonly maxIngestOrdinal: number;
      readonly availableThrough: string;
      readonly availableThroughMs: number;
      readonly playback: "paused" | "playing";
    };

export type ResourceTimelineConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";

export interface ResourceTimelineConnectionState {
  readonly status: ResourceTimelineConnectionStatus;
  readonly actualIntervalSeconds: number | null;
  readonly source: string | null;
  readonly degradedReason: string | null;
  /** Latest timestamp supplied by the data source. Never a browser-generated clock value. */
  readonly lastObservedAt: string | null;
}

export interface ResourceTimelineConnectionUpdate {
  readonly status: ResourceTimelineConnectionStatus;
  readonly actualIntervalSeconds?: number | null;
  readonly source?: string | null;
  readonly degradedReason?: string | null;
}

export interface ResourceTimelinePresentationState {
  readonly cursor: ResourceTimelineCursor;
  readonly connection: ResourceTimelineConnectionState;
  readonly latestLiveAt: string | null;
  readonly selectedAt: string | null;
  readonly availableThrough: string | null;
  readonly gap: {
    readonly visible: boolean;
    readonly eventCount: number;
    readonly skippedSequenceCount: number;
  };
  readonly degraded: boolean;
  readonly degradedReasons: readonly string[];
}

export type ResourceTimelineSequenceAnomaly = {
  readonly kind: "gap" | "duplicate" | "out-of-order";
  readonly previousSequence: number;
  readonly receivedSequence: number;
  readonly skippedSequenceCount: number;
};

export interface ResourceTimelineSequenceQuality {
  readonly phase: "awaiting-snapshot" | "tracking";
  readonly lastSequence: number | null;
  readonly snapshotCount: number;
  readonly gapEventCount: number;
  readonly skippedSequenceCount: number;
  readonly duplicateCount: number;
  readonly outOfOrderCount: number;
  readonly lastAnomaly: ResourceTimelineSequenceAnomaly | null;
  readonly resyncRequired: boolean;
}

export interface ResourceTimelineMemoryEstimate {
  readonly sampleCount: number;
  readonly podBufferCount: number;
  readonly estimatedBytes: number;
  readonly maxEstimatedBytes: number;
  readonly evictedSampleCount: number;
  readonly retentionTruncated: boolean;
}

export type ResourceTimelineIngestResult =
  | {
      readonly accepted: true;
      readonly storedSamples: number;
      readonly anomaly: "gap" | null;
      readonly resyncRequired: false;
      readonly reason:
        | "measurement-without-time"
        | "invalid-pod-measurement"
        | "non-pod-resource"
        | "removal-without-time"
        | null;
    }
  | {
      readonly accepted: false;
      readonly storedSamples: 0;
      readonly anomaly: "gap" | "duplicate" | "out-of-order" | null;
      readonly resyncRequired: boolean;
      readonly reason:
        | "invalid-message"
        | "snapshot-required"
        | "sequence-gap"
        | "duplicate-sequence"
        | "out-of-order-sequence";
    };

export interface ResourceTimelineOptions {
  /** Estimated history-buffer budget. It does not claim to measure the JS heap. */
  readonly maxEstimatedBytes?: number;
  /** Testable lower bound; production callers cannot exceed the hard 7,200 sample cap. */
  readonly maxSamplesPerPod?: number;
}

interface MutableSequenceQuality {
  phase: "awaiting-snapshot" | "tracking";
  lastSequence: number | null;
  snapshotCount: number;
  gapEventCount: number;
  skippedSequenceCount: number;
  duplicateCount: number;
  outOfOrderCount: number;
  lastAnomaly: ResourceTimelineSequenceAnomaly | null;
  resyncRequired: boolean;
}

interface ParsedPodIdentity extends PodTimelineIdentityInput {
  key: string;
}

interface ParsedSnapshot {
  type: "snapshot";
  seq: number;
  resources: Record<string, unknown>;
}

interface ParsedDelta {
  type: "resource.delta";
  seq: number;
  op: "replace" | "remove";
  key: string;
  value: unknown;
  observedAt: string | null;
}

interface ParsedPodValue {
  observedAt: string | null;
  observedAtMs: number | null;
  usagePercent?: number | null;
  cpuMillicores?: number | null;
  cpuRequestMillicores?: number | null;
  memoryMebibytes?: number | null;
  memoryRequestMebibytes?: number | null;
  phase?: string;
  health?: string;
  restartCount?: number;
}

interface UpsertResult {
  added: boolean;
  replaced: boolean;
}

export class ResourceTimelineModel {
  private readonly buffers = new Map<string, PodSampleBuffer>();
  private readonly liveSamples = new Map<string, PodTimelineSample>();
  private readonly livePodIdentities = new Set<string>();
  private readonly maxEstimatedBytes: number;
  private readonly maxSamplesPerPod: number;
  private cursor: ResourceTimelineCursor = { mode: "live" };
  private sequence: MutableSequenceQuality = initialSequenceQuality();
  private nextIngestOrdinal = 0;
  private sampleCount = 0;
  private latestObservedAtMs = Number.NEGATIVE_INFINITY;
  private latestObservedAt: string | null = null;
  private evictedSampleCount = 0;
  private retentionTruncated = false;
  private historyInvalid = false;
  private untimedRemovalCount = 0;
  private connection: ResourceTimelineConnectionState = {
    status: "idle",
    actualIntervalSeconds: null,
    source: null,
    degradedReason: null,
    lastObservedAt: null,
  };

  constructor(options: ResourceTimelineOptions = {}) {
    this.maxEstimatedBytes = positiveInteger(
      options.maxEstimatedBytes ?? RESOURCE_TIMELINE_DEFAULT_MAX_ESTIMATED_BYTES,
      "maxEstimatedBytes",
    );
    this.maxSamplesPerPod = positiveInteger(
      options.maxSamplesPerPod ?? RESOURCE_TIMELINE_MAX_SAMPLES_PER_POD,
      "maxSamplesPerPod",
    );
    if (this.maxSamplesPerPod > RESOURCE_TIMELINE_MAX_SAMPLES_PER_POD) {
      throw new RangeError(
        `maxSamplesPerPod cannot exceed ${RESOURCE_TIMELINE_MAX_SAMPLES_PER_POD}`,
      );
    }
  }

  ingest(message: unknown): ResourceTimelineIngestResult {
    const parsed = parseMessage(message);
    if (parsed === null) return rejected("invalid-message", null);
    if (parsed.type === "snapshot") return this.ingestSnapshot(parsed);
    return this.ingestDelta(parsed);
  }

  setReplayCursor(value: string | number): ResourceTimelineCursor {
    if (this.sequence.resyncRequired) {
      throw new RangeError("Replay is unavailable until an authoritative snapshot is received.");
    }
    if (this.historyInvalid) {
      throw new RangeError("Replay is unavailable because a removal omitted observed time.");
    }
    const requestedAtMs = parseCursorTime(value);
    const available = this.latestBufferedSample(this.nextIngestOrdinal);
    if (available === null) {
      throw new RangeError("Replay requires at least one measured sample.");
    }
    const atMs = Math.min(requestedAtMs, available.observedAtMs);
    this.cursor = {
      mode: "replay",
      at: new Date(atMs).toISOString(),
      atMs,
      maxIngestOrdinal: this.nextIngestOrdinal,
      availableThrough: available.observedAt,
      availableThroughMs: available.observedAtMs,
      playback: "paused",
    };
    return this.getCursor();
  }

  setReplayPlaying(playing: boolean): ResourceTimelineCursor {
    if (this.cursor.mode !== "replay") {
      throw new Error("Replay playback can only change while the replay cursor is active.");
    }
    this.cursor = { ...this.cursor, playback: playing ? "playing" : "paused" };
    return this.getCursor();
  }

  advanceReplayCursor(value: string | number): ResourceTimelineCursor {
    if (this.cursor.mode !== "replay") {
      throw new Error("Replay cursor can only advance while replay is active.");
    }
    const atMs = Math.min(parseCursorTime(value), this.cursor.availableThroughMs);
    this.cursor = { ...this.cursor, at: new Date(atMs).toISOString(), atMs };
    return this.getCursor();
  }

  setLiveCursor(): ResourceTimelineCursor {
    this.cursor = { mode: "live" };
    return this.getCursor();
  }

  getCursor(): ResourceTimelineCursor {
    return { ...this.cursor };
  }

  setConnectionState(update: ResourceTimelineConnectionUpdate): ResourceTimelineConnectionState {
    const next = { ...this.connection, status: update.status };
    if (hasOwn(update, "actualIntervalSeconds")) {
      next.actualIntervalSeconds = validInterval(update.actualIntervalSeconds);
    }
    if (hasOwn(update, "source")) next.source = optionalLabel(update.source, "source");
    if (hasOwn(update, "degradedReason")) {
      next.degradedReason = optionalLabel(update.degradedReason, "degradedReason");
    }
    this.connection = next;
    return this.getConnectionState();
  }

  getConnectionState(): ResourceTimelineConnectionState {
    return { ...this.connection };
  }

  getPresentationState(): ResourceTimelinePresentationState {
    const cursor = this.getCursor();
    const degradedReasons: string[] = [];
    if (this.connection.degradedReason !== null) {
      degradedReasons.push(this.connection.degradedReason);
    }
    if (this.connection.status === "reconnecting" || this.connection.status === "disconnected") {
      degradedReasons.push(`connection-${this.connection.status}`);
    }
    if (this.sequence.resyncRequired) degradedReasons.push("stream-sequence-integrity");
    if (this.historyInvalid) degradedReasons.push("resource-removal-time-unavailable");
    return {
      cursor,
      connection: this.getConnectionState(),
      latestLiveAt: this.latestObservedAt,
      selectedAt: cursor.mode === "replay" ? cursor.at : this.latestObservedAt,
      availableThrough: cursor.mode === "replay"
        ? cursor.availableThrough
        : this.latestObservedAt,
      gap: {
        visible: this.sequence.gapEventCount > 0 || this.untimedRemovalCount > 0,
        eventCount: this.sequence.gapEventCount + this.untimedRemovalCount,
        skippedSequenceCount: this.sequence.skippedSequenceCount,
      },
      degraded: degradedReasons.length > 0,
      degradedReasons,
    };
  }

  getSequenceQuality(): ResourceTimelineSequenceQuality {
    return {
      ...this.sequence,
      lastAnomaly: this.sequence.lastAnomaly === null
        ? null
        : { ...this.sequence.lastAnomaly },
    };
  }

  getMemoryEstimate(): ResourceTimelineMemoryEstimate {
    return {
      sampleCount: this.sampleCount,
      podBufferCount: this.buffers.size,
      estimatedBytes: this.estimatedBytes(),
      maxEstimatedBytes: this.maxEstimatedBytes,
      evictedSampleCount: this.evictedSampleCount,
      retentionTruncated: this.retentionTruncated,
    };
  }

  getAvailableRange(): ResourceTimelineAvailableRange | null {
    if (this.sequence.resyncRequired || this.historyInvalid) return null;
    let oldest: PodTimelineSample | null = null;
    let latest: PodTimelineSample | null = null;
    for (const buffer of this.buffers.values()) {
      const candidateOldest = buffer.oldest();
      const candidateLatest = buffer.newest(this.nextIngestOrdinal);
      if (candidateOldest !== null && (
        oldest === null || candidateOldest.observedAtMs < oldest.observedAtMs
      )) oldest = candidateOldest;
      if (candidateLatest !== null && (
        latest === null || candidateLatest.observedAtMs > latest.observedAtMs
      )) latest = candidateLatest;
    }
    return oldest === null || latest === null
      ? null
      : {
          from: oldest.observedAt,
          fromMs: oldest.observedAtMs,
          to: latest.observedAt,
          toMs: latest.observedAtMs,
        };
  }

  hasReplayCoverage(): boolean {
    if (this.cursor.mode !== "replay" || this.historyInvalid) return false;
    for (const buffer of this.buffers.values()) {
      if (buffer.select(this.cursor.atMs, this.cursor.maxIngestOrdinal) !== null) return true;
    }
    return false;
  }

  captureActualView(
    clusterId: string,
    pods: readonly PhysicalTopologyPod[],
    rows: readonly ResourceSummary[],
  ): number {
    const graphPods = new Map(pods
      .filter((pod) => pod.namespace !== null)
      .map((pod) => [podTimelineIdentity({
        clusterId,
        namespace: pod.namespace ?? "",
        name: pod.name,
      }), pod]));
    const tableRows = new Map(rows
      .filter((row) => row.facts.type === "pod" && row.namespace !== null)
      .map((row) => [podTimelineIdentity({
        clusterId: row.clusterId,
        namespace: row.namespace ?? "",
        name: row.name,
      }), row]));
    let captured = 0;
    for (const identity of this.livePodIdentities) {
      const current = this.liveSamples.get(identity);
      if (current === undefined) continue;
      const graphPod = current.graphPod === undefined ? graphPods.get(identity) : undefined;
      const tableRow = current.tableRow === undefined ? tableRows.get(identity) : undefined;
      if (graphPod === undefined && tableRow === undefined) continue;
      const next: PodTimelineSample = {
        ...current,
        ...(graphPod === undefined ? {} : { graphPod: structuredClone(graphPod) }),
        ...(tableRow === undefined ? {} : { tableRow: structuredClone(tableRow) }),
      };
      this.liveSamples.set(identity, next);
      this.buffers.get(identity)?.replaceIngestOrdinal(next);
      captured += 1;
    }
    return captured;
  }

  selectGraphPods(
    clusterId: string,
    currentPods: readonly PhysicalTopologyPod[],
  ): PhysicalTopologyPod[] {
    if (this.cursor.mode === "live") {
      return currentPods.map((pod) => this.selectGraphPod(clusterId, pod));
    }
    const selected: PhysicalTopologyPod[] = [];
    for (const [identity, buffer] of this.buffers) {
      if (!identity.startsWith(`${clusterId}/`)) continue;
      const sample = buffer.select(this.cursor.atMs, this.cursor.maxIngestOrdinal);
      if (sample === null || !sample.present || sample.graphPod === undefined) continue;
      selected.push(projectGraphPod(structuredClone(sample.graphPod), sample));
    }
    return selected.sort((left, right) => left.id.localeCompare(right.id));
  }

  selectTableRows(currentRows: readonly ResourceSummary[]): ResourceSummary[] {
    if (this.cursor.mode === "live") {
      return currentRows.map((row) => this.selectTableRow(row));
    }
    const selected: ResourceSummary[] = [];
    for (const buffer of this.buffers.values()) {
      const sample = buffer.select(this.cursor.atMs, this.cursor.maxIngestOrdinal);
      if (sample === null || !sample.present || sample.tableRow === undefined) continue;
      selected.push(projectTableRow(structuredClone(sample.tableRow), sample));
    }
    return selected.sort((left, right) => left.inventoryKey.localeCompare(right.inventoryKey));
  }

  getPodSamples(identity: string): readonly PodTimelineSample[] {
    return this.buffers.get(identity)?.values() ?? [];
  }

  selectPod(identity: string): PodTimelineSample | null {
    if (this.cursor.mode === "live") {
      if (!this.livePodIdentities.has(identity)) return null;
      return this.liveSamples.get(identity) ?? null;
    }
    const sample = this.buffers.get(identity)?.select(
      this.cursor.atMs,
      this.cursor.maxIngestOrdinal,
    ) ?? null;
    return sample?.present === true ? sample : null;
  }

  selectGraphPod(clusterId: string, pod: PhysicalTopologyPod): PhysicalTopologyPod {
    if (pod.namespace === null) return pod;
    const sample = this.selectPod(podTimelineIdentity({
      clusterId,
      namespace: pod.namespace,
      name: pod.name,
    }));
    return sample === null ? pod : projectGraphPod(pod, sample);
  }

  selectTableRow(row: ResourceSummary): ResourceSummary {
    if (row.facts.type !== "pod" || row.namespace === null) return row;
    const sample = this.selectPod(podTimelineIdentity({
      clusterId: row.clusterId,
      namespace: row.namespace,
      name: row.name,
    }));
    return sample === null ? row : projectTableRow(row, sample);
  }

  private ingestSnapshot(message: ParsedSnapshot): ResourceTimelineIngestResult {
    if (this.sequence.resyncRequired || this.historyInvalid) this.clearHistory();
    this.sequence = {
      ...this.sequence,
      phase: "tracking",
      lastSequence: message.seq,
      snapshotCount: this.sequence.snapshotCount + 1,
      lastAnomaly: null,
      resyncRequired: false,
    };
    this.livePodIdentities.clear();
    this.liveSamples.clear();
    let storedSamples = 0;
    for (const [key, value] of Object.entries(message.resources)) {
      const identity = parsePodIdentity(key);
      if (identity === null) continue;
      this.livePodIdentities.add(identity.key);
      storedSamples += this.storePodMeasurement(identity, value, message.seq);
    }
    return accepted(storedSamples, null, null);
  }

  private ingestDelta(message: ParsedDelta): ResourceTimelineIngestResult {
    if (this.sequence.phase !== "tracking" || this.sequence.lastSequence === null) {
      return rejected("snapshot-required", null, true);
    }
    const sequenceResult = this.acceptDeltaSequence(message.seq);
    if (sequenceResult.accepted === false) return sequenceResult;
    const identity = parsePodIdentity(message.key);
    if (identity === null) {
      return accepted(0, sequenceResult.anomaly, "non-pod-resource");
    }
    if (message.op === "remove") {
      this.livePodIdentities.delete(identity.key);
      this.liveSamples.delete(identity.key);
      if (message.observedAt === null) {
        this.historyInvalid = true;
        this.untimedRemovalCount += 1;
        this.cursor = { mode: "live" };
        return accepted(0, sequenceResult.anomaly, "removal-without-time");
      }
      return accepted(
        this.storeRemoval(identity, message.observedAt, message.seq),
        sequenceResult.anomaly,
        null,
      );
    }
    this.livePodIdentities.add(identity.key);
    const parsedValue = parsePodValue(message.value, identity);
    if (parsedValue === null) {
      return accepted(0, sequenceResult.anomaly, "invalid-pod-measurement");
    }
    const measuredValue = !hasObservedTime(parsedValue) && message.observedAt !== null
      ? {
          ...parsedValue,
          observedAt: message.observedAt,
          observedAtMs: Date.parse(message.observedAt),
        }
      : parsedValue;
    if (!hasObservedTime(measuredValue)) {
      return accepted(0, sequenceResult.anomaly, "measurement-without-time");
    }
    return accepted(
      this.storeParsedPodMeasurement(identity, measuredValue, message.seq),
      sequenceResult.anomaly,
      null,
    );
  }

  private acceptDeltaSequence(sequence: number): ResourceTimelineIngestResult {
    const previousSequence = this.sequence.lastSequence;
    if (previousSequence === null) return rejected("snapshot-required", null);
    if (sequence === previousSequence) {
      this.recordSequenceAnomaly("duplicate", previousSequence, sequence, 0);
      this.sequence.duplicateCount += 1;
      this.requireResync();
      return rejected("duplicate-sequence", "duplicate", true);
    }
    if (sequence < previousSequence) {
      this.recordSequenceAnomaly("out-of-order", previousSequence, sequence, 0);
      this.sequence.outOfOrderCount += 1;
      this.requireResync();
      return rejected("out-of-order-sequence", "out-of-order", true);
    }
    // `seq` is allocated by the hub globally, while each browser receives only
    // messages matching its subscription. A higher non-adjacent value therefore
    // means that unrelated messages were filtered out, not that this stream lost
    // data. The transport already replaces an overflowing client queue with an
    // authoritative snapshot, so only stale/duplicate ordering is corruption.
    this.sequence.lastSequence = sequence;
    return accepted(0, null, null);
  }

  private requireResync(): void {
    this.sequence.phase = "awaiting-snapshot";
    this.sequence.resyncRequired = true;
    this.cursor = { mode: "live" };
  }

  private clearHistory(): void {
    this.buffers.clear();
    this.liveSamples.clear();
    this.livePodIdentities.clear();
    this.sampleCount = 0;
    this.latestObservedAtMs = Number.NEGATIVE_INFINITY;
    this.latestObservedAt = null;
    this.nextIngestOrdinal = 0;
    this.connection = { ...this.connection, lastObservedAt: null };
    this.cursor = { mode: "live" };
    this.historyInvalid = false;
    this.untimedRemovalCount = 0;
  }

  private recordSequenceAnomaly(
    kind: ResourceTimelineSequenceAnomaly["kind"],
    previousSequence: number,
    receivedSequence: number,
    skippedSequenceCount: number,
  ): void {
    this.sequence.lastAnomaly = {
      kind,
      previousSequence,
      receivedSequence,
      skippedSequenceCount,
    };
  }

  private storePodMeasurement(
    identity: ParsedPodIdentity,
    value: unknown,
    sequence: number,
  ): number {
    const parsed = parsePodValue(value, identity);
    if (parsed === null || !hasObservedTime(parsed)) {
      return 0;
    }
    return this.storeParsedPodMeasurement(identity, parsed, sequence);
  }

  private storeParsedPodMeasurement(
    identity: ParsedPodIdentity,
    value: ParsedPodValue & { observedAt: string; observedAtMs: number },
    sequence: number,
  ): number {
    const sample: PodTimelineSample = {
      present: true,
      sequence,
      observedAt: value.observedAt,
      observedAtMs: value.observedAtMs,
      ingestOrdinal: ++this.nextIngestOrdinal,
      ...(value.usagePercent === undefined ? {} : { usagePercent: value.usagePercent }),
      ...(value.cpuMillicores === undefined ? {} : { cpuMillicores: value.cpuMillicores }),
      ...(value.cpuRequestMillicores === undefined
        ? {}
        : { cpuRequestMillicores: value.cpuRequestMillicores }),
      ...(value.memoryMebibytes === undefined
        ? {}
        : { memoryMebibytes: value.memoryMebibytes }),
      ...(value.memoryRequestMebibytes === undefined
        ? {}
        : { memoryRequestMebibytes: value.memoryRequestMebibytes }),
      ...(value.phase === undefined ? {} : { phase: value.phase }),
      ...(value.health === undefined ? {} : { health: value.health }),
      ...(value.restartCount === undefined ? {} : { restartCount: value.restartCount }),
    };
    this.liveSamples.set(identity.key, sample);
    const buffer = this.buffers.get(identity.key) ?? new PodSampleBuffer();
    this.buffers.set(identity.key, buffer);
    const upsert = buffer.upsert(sample);
    if (upsert.added) this.sampleCount += 1;
    if (sample.observedAtMs >= this.latestObservedAtMs) {
      this.latestObservedAtMs = sample.observedAtMs;
      this.latestObservedAt = sample.observedAt;
      this.connection = { ...this.connection, lastObservedAt: sample.observedAt };
    }
    this.enforceBounds(buffer);
    return upsert.added || upsert.replaced ? 1 : 0;
  }

  private storeRemoval(
    identity: ParsedPodIdentity,
    observedAt: string,
    sequence: number,
  ): number {
    const sample: PodTimelineSample = {
      present: false,
      sequence,
      observedAt,
      observedAtMs: Date.parse(observedAt),
      ingestOrdinal: ++this.nextIngestOrdinal,
    };
    const buffer = this.buffers.get(identity.key) ?? new PodSampleBuffer();
    this.buffers.set(identity.key, buffer);
    const upsert = buffer.upsert(sample);
    if (upsert.added) this.sampleCount += 1;
    if (sample.observedAtMs >= this.latestObservedAtMs) {
      this.latestObservedAtMs = sample.observedAtMs;
      this.latestObservedAt = sample.observedAt;
      this.connection = { ...this.connection, lastObservedAt: sample.observedAt };
    }
    this.enforceBounds(buffer);
    return upsert.added || upsert.replaced ? 1 : 0;
  }

  private latestBufferedSample(maxIngestOrdinal: number): PodTimelineSample | null {
    let latest: PodTimelineSample | null = null;
    for (const buffer of this.buffers.values()) {
      const candidate = buffer.newest(maxIngestOrdinal);
      if (
        candidate !== null &&
        (latest === null ||
          candidate.observedAtMs > latest.observedAtMs ||
          (candidate.observedAtMs === latest.observedAtMs &&
            candidate.ingestOrdinal > latest.ingestOrdinal))
      ) latest = candidate;
    }
    return latest;
  }

  private enforceBounds(changedBuffer: PodSampleBuffer): void {
    const perPodEvictions = changedBuffer.trimTo(this.maxSamplesPerPod);
    this.recordEvictions(perPodEvictions);
    if (Number.isFinite(this.latestObservedAtMs)) {
      const cutoff = this.latestObservedAtMs - RESOURCE_TIMELINE_RETENTION_MS;
      for (const [identity, buffer] of this.buffers) {
        const evicted = buffer.pruneBefore(cutoff);
        this.recordEvictions(evicted);
        if (buffer.size === 0) this.buffers.delete(identity);
      }
    }
    while (this.estimatedBytes() > this.maxEstimatedBytes && this.buffers.size > 0) {
      const oldest = this.oldestBuffer();
      if (oldest === null) break;
      oldest.buffer.removeOldest();
      this.recordEvictions(1);
      if (oldest.buffer.size === 0) this.buffers.delete(oldest.identity);
    }
  }

  private oldestBuffer(): { identity: string; buffer: PodSampleBuffer } | null {
    let selected: { identity: string; buffer: PodSampleBuffer } | null = null;
    for (const [identity, buffer] of this.buffers) {
      const sample = buffer.oldest();
      if (sample === null) continue;
      const current = selected?.buffer.oldest() ?? null;
      if (
        current === null ||
        sample.observedAtMs < current.observedAtMs ||
        (sample.observedAtMs === current.observedAtMs &&
          sample.ingestOrdinal < current.ingestOrdinal)
      ) {
        selected = { identity, buffer };
      }
    }
    return selected;
  }

  private recordEvictions(count: number): void {
    if (count <= 0) return;
    this.sampleCount -= count;
    this.evictedSampleCount += count;
    this.retentionTruncated = true;
  }

  private estimatedBytes(): number {
    return this.sampleCount * RESOURCE_TIMELINE_ESTIMATED_SAMPLE_BYTES +
      this.buffers.size * RESOURCE_TIMELINE_ESTIMATED_POD_BYTES;
  }
}

function hasObservedTime(
  value: ParsedPodValue,
): value is ParsedPodValue & { observedAt: string; observedAtMs: number } {
  return value.observedAt !== null && value.observedAtMs !== null;
}

class PodSampleBuffer {
  private readonly samples: PodTimelineSample[] = [];

  get size(): number {
    return this.samples.length;
  }

  values(): readonly PodTimelineSample[] {
    return [...this.samples];
  }

  replaceIngestOrdinal(sample: PodTimelineSample): void {
    const index = this.samples.findIndex(
      (candidate) => candidate.ingestOrdinal === sample.ingestOrdinal,
    );
    if (index >= 0) this.samples[index] = sample;
  }

  upsert(sample: PodTimelineSample): UpsertResult {
    const bucket = sampleBucket(sample);
    const index = lowerBound(this.samples, bucket);
    const current = this.samples[index];
    if (current !== undefined && sampleBucket(current) === bucket) {
      if (
        sample.observedAtMs > current.observedAtMs ||
        (sample.observedAtMs === current.observedAtMs &&
          sample.ingestOrdinal > current.ingestOrdinal)
      ) {
        this.samples[index] = sample;
        return { added: false, replaced: true };
      }
      return { added: false, replaced: false };
    }
    this.samples.splice(index, 0, sample);
    return { added: true, replaced: false };
  }

  select(atMs: number, maxIngestOrdinal: number): PodTimelineSample | null {
    for (let index = this.samples.length - 1; index >= 0; index -= 1) {
      const sample = this.samples[index];
      if (
        sample !== undefined &&
        sample.observedAtMs <= atMs &&
        sample.ingestOrdinal <= maxIngestOrdinal
      ) return sample;
    }
    return null;
  }

  trimTo(maximum: number): number {
    const removeCount = Math.max(0, this.samples.length - maximum);
    if (removeCount > 0) this.samples.splice(0, removeCount);
    return removeCount;
  }

  pruneBefore(cutoff: number): number {
    let removeCount = 0;
    while (
      removeCount < this.samples.length &&
      (this.samples[removeCount]?.observedAtMs ?? Number.POSITIVE_INFINITY) < cutoff
    ) removeCount += 1;
    if (removeCount > 0) this.samples.splice(0, removeCount);
    return removeCount;
  }

  oldest(): PodTimelineSample | null {
    return this.samples[0] ?? null;
  }

  newest(maxIngestOrdinal: number): PodTimelineSample | null {
    for (let index = this.samples.length - 1; index >= 0; index -= 1) {
      const sample = this.samples[index];
      if (sample !== undefined && sample.ingestOrdinal <= maxIngestOrdinal) return sample;
    }
    return null;
  }

  removeOldest(): void {
    this.samples.shift();
  }
}

export function podTimelineIdentity(identity: PodTimelineIdentityInput): string {
  return `${identity.clusterId}/${identity.namespace}/pod/${identity.name}`;
}

function parseMessage(value: unknown): ParsedSnapshot | ParsedDelta | null {
  const object = objectValue(value);
  if (object === null || !nonNegativeInteger(object.seq)) return null;
  if (object.type === "snapshot") {
    const state = objectValue(object.state);
    if (state === null) return null;
    return {
      type: "snapshot",
      seq: object.seq,
      resources: objectValue(state.resources) ?? {},
    };
  }
  if (
    object.type !== "resource.delta" ||
    (object.op !== "replace" && object.op !== "remove") ||
    typeof object.key !== "string" ||
    object.key.length === 0 ||
    !("value" in object)
  ) return null;
  const observed = observedTime(object.observed_at);
  if (observed.valid === false) return null;
  return {
    type: "resource.delta",
    seq: object.seq,
    op: object.op,
    key: object.key,
    value: object.value,
    observedAt: observed.value?.text ?? null,
  };
}

function parsePodIdentity(key: string): ParsedPodIdentity | null {
  const [clusterId, namespace, kind, name, ...extra] = key.split("/");
  if (
    extra.length > 0 ||
    !clusterId ||
    !namespace ||
    kind?.toLocaleLowerCase() !== "pod" ||
    !name
  ) return null;
  return { clusterId, namespace, name, key: podTimelineIdentity({ clusterId, namespace, name }) };
}

function parsePodValue(value: unknown, identity: ParsedPodIdentity): ParsedPodValue | null {
  const object = objectValue(value);
  if (object === null) return null;
  if (object.resource_type !== undefined && object.resource_type !== "pod") return null;
  if (object.kind !== undefined && object.kind !== "Pod") return null;
  if (object.name !== undefined && object.name !== identity.name) return null;
  if (object.namespace !== undefined && object.namespace !== identity.namespace) return null;
  const metrics = {
    cpuMillicores: optionalMetric(object, "cpu_mcores"),
    cpuRequestMillicores: optionalMetric(object, "cpu_request_mcores"),
    memoryMebibytes: optionalMetric(object, "mem_mib"),
    memoryRequestMebibytes: optionalMetric(object, "mem_request_mib"),
    cpuRequestPercent: optionalMetric(object, "cpu_request_pct"),
    memoryRequestPercent: optionalMetric(object, "mem_request_pct"),
  };
  if (Object.values(metrics).some((metric) => metric.valid === false)) return null;
  const restarts = optionalRestartCount(object.restarts);
  if (restarts.valid === false) return null;
  const observed = observedTime(object.observed_at);
  if (observed.valid === false) return null;
  const usagePresent = Object.prototype.hasOwnProperty.call(object, "cpu_request_pct") ||
    Object.prototype.hasOwnProperty.call(object, "mem_request_pct");
  const usagePercent = usagePresent
    ? completeUsagePercent(
        metrics.cpuRequestPercent.value,
        metrics.memoryRequestPercent.value,
        metrics.cpuRequestMillicores.value,
        metrics.memoryRequestMebibytes.value,
      )
    : undefined;
  return {
    observedAt: observed.value?.text ?? null,
    observedAtMs: observed.value?.timestamp ?? null,
    ...(usagePresent ? { usagePercent } : {}),
    ...optionalValue("cpuMillicores", metrics.cpuMillicores),
    ...optionalValue("cpuRequestMillicores", metrics.cpuRequestMillicores),
    ...optionalValue("memoryMebibytes", metrics.memoryMebibytes),
    ...optionalValue("memoryRequestMebibytes", metrics.memoryRequestMebibytes),
    ...(typeof object.phase === "string" && object.phase.length > 0
      ? { phase: object.phase }
      : {}),
    ...(typeof object.health === "string" && object.health.length > 0
      ? { health: object.health }
      : {}),
    ...(restarts.present ? { restartCount: restarts.value } : {}),
  };
}

function completeUsagePercent(
  cpuRequestPercent: number | null | undefined,
  memoryRequestPercent: number | null | undefined,
  cpuRequestMillicores: number | null | undefined,
  memoryRequestMebibytes: number | null | undefined,
): number | null {
  if (
    typeof cpuRequestMillicores !== "number" ||
    typeof memoryRequestMebibytes !== "number"
  ) return null;
  const ratios = [cpuRequestPercent, memoryRequestPercent]
    .filter((candidate): candidate is number => typeof candidate === "number");
  return ratios.length === 0 ? null : Math.max(...ratios);
}

function projectGraphPod(
  pod: PhysicalTopologyPod,
  sample: PodTimelineSample,
): PhysicalTopologyPod {
  return {
    ...pod,
    ...(sample.usagePercent === undefined ? {} : { usagePercent: sample.usagePercent }),
    ...(sample.cpuMillicores === undefined ? {} : { cpuMillicores: sample.cpuMillicores }),
    ...(sample.cpuRequestMillicores === undefined
      ? {}
      : { cpuRequestMillicores: sample.cpuRequestMillicores }),
    ...(sample.memoryMebibytes === undefined
      ? {}
      : { memoryMebibytes: sample.memoryMebibytes }),
    ...(sample.memoryRequestMebibytes === undefined
      ? {}
      : { memoryRequestMebibytes: sample.memoryRequestMebibytes }),
    ...(sample.phase === undefined ? {} : { phase: sample.phase }),
    ...(sample.health === undefined ? {} : { health: sample.health }),
    ...(sample.restartCount === undefined ? {} : { restartCount: sample.restartCount }),
  };
}

function projectTableRow(
  row: ResourceSummary,
  sample: PodTimelineSample,
): ResourceSummary {
  if (row.facts.type !== "pod") return row;
  const health = resourceHealth(sample.health);
  return {
    ...row,
    ...(sample.phase === undefined ? {} : { status: sample.phase }),
    ...(health === null ? {} : { health }),
    ...(sample.health === undefined ? {} : { healthStatus: sample.health }),
    observedAt: sample.observedAt,
    facts: {
      ...row.facts,
      ...(sample.phase === undefined ? {} : { phase: sample.phase }),
      ...(sample.cpuMillicores === undefined
        ? {}
        : { cpuMillicores: sample.cpuMillicores }),
      ...(sample.memoryMebibytes === undefined
        ? {}
        : { memoryMebibytes: sample.memoryMebibytes }),
      ...(sample.restartCount === undefined
        ? {}
        : { restartCount: sample.restartCount }),
    },
  };
}

function resourceHealth(value: string | undefined): ResourceHealthTone | null {
  return value === "healthy" ||
    value === "warning" ||
    value === "critical" ||
    value === "stale" ||
    value === "unknown"
    ? value
    : null;
}

function initialSequenceQuality(): MutableSequenceQuality {
  return {
    phase: "awaiting-snapshot",
    lastSequence: null,
    snapshotCount: 0,
    gapEventCount: 0,
    skippedSequenceCount: 0,
    duplicateCount: 0,
    outOfOrderCount: 0,
    lastAnomaly: null,
    resyncRequired: false,
  };
}

function accepted(
  storedSamples: number,
  anomaly: "gap" | null,
  reason: Extract<ResourceTimelineIngestResult, { accepted: true }>["reason"],
): ResourceTimelineIngestResult {
  return { accepted: true, storedSamples, anomaly, reason, resyncRequired: false };
}

function rejected(
  reason: Extract<ResourceTimelineIngestResult, { accepted: false }>["reason"],
  anomaly: "gap" | "duplicate" | "out-of-order" | null,
  resyncRequired = false,
): ResourceTimelineIngestResult {
  return { accepted: false, storedSamples: 0, anomaly, reason, resyncRequired };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === "number" && value >= 0;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }
  return value;
}

interface OptionalMetric {
  valid: boolean;
  present: boolean;
  value?: number | null;
}

function optionalMetric(object: Record<string, unknown>, key: string): OptionalMetric {
  if (!Object.prototype.hasOwnProperty.call(object, key)) {
    return { valid: true, present: false };
  }
  const value = object[key];
  return value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
    ? { valid: true, present: true, value }
    : { valid: false, present: true };
}

function optionalValue<Key extends string>(
  key: Key,
  metric: OptionalMetric,
): Partial<Record<Key, number | null>> {
  return metric.present ? { [key]: metric.value ?? null } as Partial<Record<Key, number | null>> : {};
}

function optionalRestartCount(value: unknown): {
  valid: boolean;
  present: boolean;
  value?: number;
} {
  if (value === undefined) return { valid: true, present: false };
  return nonNegativeInteger(value)
    ? { valid: true, present: true, value }
    : { valid: false, present: true };
}

function observedTime(value: unknown): {
  valid: boolean;
  value?: { text: string; timestamp: number };
} {
  if (value === undefined || value === null) return { valid: true };
  if (typeof value !== "string" || value.length === 0) return { valid: false };
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? { valid: true, value: { text: value, timestamp } }
    : { valid: false };
}

function sampleBucket(sample: PodTimelineSample): number {
  return Math.floor(sample.observedAtMs / 1_000);
}

function lowerBound(samples: readonly PodTimelineSample[], bucket: number): number {
  let low = 0;
  let high = samples.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const sample = samples[middle];
    if (sample !== undefined && sampleBucket(sample) < bucket) low = middle + 1;
    else high = middle;
  }
  return low;
}

function parseCursorTime(value: string | number): number {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new RangeError("Replay cursor must be a valid timestamp.");
  }
  return timestamp;
}

function validInterval(value: number | null | undefined): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError("actualIntervalSeconds must be a positive finite number or null.");
  }
  return value;
}

function optionalLabel(value: string | null | undefined, name: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RangeError(`${name} must be a non-empty string or null.`);
  }
  return value;
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}
