import { describe, expect, it } from "vitest"

import {
  createTopologyCoreState,
  reduceTopologyCore,
  type CanonicalGraphState,
  type CanonicalStreamMessage,
  type FocusSankeyEnterMessage,
  type FocusSankeyExitMessage,
  type FocusSankeyRetargetMessage,
  type FocusSankeySettledMessage,
  type TopologyCoreState,
} from "../reducer"
import { entity, ids, relation } from "./builders"

function initialState(): TopologyCoreState {
  const source = entity("source")
  const target = entity("target", "degraded")
  const canonical: CanonicalGraphState = {
    canonicalRevision: ids.canonical("canonical-1"),
    universeRevision: ids.universe("universe-1"),
    frameId: ids.frame("frame-1"),
    streamId: ids.stream("stream-1"),
    streamSequence: 0,
    entities: [source, target],
    relations: [relation("source-target", source, target)],
    mapUniverseEntityKeys: [source.ref.entityKey, target.ref.entityKey],
  }
  return createTopologyCoreState({
    canonical,
    presentationRevision: ids.presentation("presentation-1"),
  })
}

function enterMessage(state: TopologyCoreState): FocusSankeyEnterMessage {
  return {
    channel: "presentation-intent",
    type: "focusSankey.entered",
    transitionId: ids.transition("enter-1"),
    sourceEntityKey: state.canonical.mapUniverseEntityKeys[0]!,
    expectedFrameId: state.canonical.frameId,
    expectedPresentationRevision: state.presentation.revision,
    nextPresentationRevision: ids.presentation("presentation-2"),
    method: "keyboard",
  }
}

describe("reduceTopologyCore", () => {
  it("captures focus presentation without blocking canonical stream commits", () => {
    const initial = initialState()
    const entered = reduceTopologyCore(initial, enterMessage(initial))
    expect(entered.kind).toBe("committed")
    if (entered.kind !== "committed") return

    const lateEntity = entity("late", "unhealthy")
    const delta: CanonicalStreamMessage = {
      channel: "canonical-stream",
      type: "canonical.deltaBatch",
      batch: {
        streamId: entered.state.canonical.streamId,
        sequence: 1,
        baseCanonicalRevision: entered.state.canonical.canonicalRevision,
        nextCanonicalRevision: ids.canonical("canonical-2"),
        baseFrameId: entered.state.canonical.frameId,
        nextFrameId: ids.frame("frame-2"),
        nextUniverseRevision: ids.universe("universe-2"),
        deltas: [
          { type: "entity.upserted", entity: lateEntity },
          {
            type: "mapUniverse.replaced",
            entityKeys: [
              ...entered.state.canonical.mapUniverseEntityKeys,
              lateEntity.ref.entityKey,
            ],
          },
        ],
      },
    }
    const updated = reduceTopologyCore(entered.state, delta)
    expect(updated.kind).toBe("committed")
    if (updated.kind !== "committed") return

    expect(updated.state.canonical.mapUniverseEntityKeys).toContain(
      lateEntity.ref.entityKey,
    )
    const runtime = updated.state.presentation.focusSankey
    expect(runtime.kind).toBe("transitioning")
    if (runtime.kind !== "transitioning") return
    expect(runtime.frozenUniverse.mapUniverseEntityKeys).not.toContain(
      lateEntity.ref.entityKey,
    )
    expect(runtime.pendingCanonicalRevision).toBe(ids.canonical("canonical-2"))
  })

  it("settles, retargets within the captured universe, and exits through one reducer", () => {
    const initial = initialState()
    const entered = reduceTopologyCore(initial, enterMessage(initial))
    if (entered.kind !== "committed") throw new Error("enter must commit")

    const settleEnter: FocusSankeySettledMessage = {
      channel: "presentation-effect",
      type: "focusSankey.transitionSettled",
      transitionId: ids.transition("enter-1"),
      expectedPresentationRevision: ids.presentation("presentation-2"),
      nextPresentationRevision: ids.presentation("presentation-2-settled"),
    }
    const settled = reduceTopologyCore(entered.state, settleEnter)
    expect(settled.kind).toBe("committed")
    if (settled.kind !== "committed") return
    expect(settled.state.presentation.settled.mode).toBe("focus-sankey")

    const retarget: FocusSankeyRetargetMessage = {
      channel: "presentation-intent",
      type: "focusSankey.retargeted",
      transitionId: ids.transition("retarget-1"),
      sourceEntityKey: settled.state.canonical.mapUniverseEntityKeys[1]!,
      expectedFrameId: settled.state.canonical.frameId,
      expectedPresentationRevision: settled.state.presentation.revision,
      nextPresentationRevision: ids.presentation("presentation-3"),
      method: "pointer",
    }
    const retargeted = reduceTopologyCore(settled.state, retarget)
    expect(retargeted.kind).toBe("committed")
    if (retargeted.kind !== "committed") return
    expect(retargeted.state.presentation.target).toMatchObject({
      mode: "focus-sankey",
      focusEntityKey: retarget.sourceEntityKey,
    })

    const settleRetarget: FocusSankeySettledMessage = {
      channel: "presentation-effect",
      type: "focusSankey.transitionSettled",
      transitionId: ids.transition("retarget-1"),
      expectedPresentationRevision: ids.presentation("presentation-3"),
      nextPresentationRevision: ids.presentation("presentation-3-settled"),
    }
    const retargetSettled = reduceTopologyCore(retargeted.state, settleRetarget)
    if (retargetSettled.kind !== "committed") {
      throw new Error("retarget settle must commit")
    }

    const exit: FocusSankeyExitMessage = {
      channel: "presentation-intent",
      type: "focusSankey.exited",
      transitionId: ids.transition("exit-1"),
      expectedFrameId: retargetSettled.state.canonical.frameId,
      expectedPresentationRevision: retargetSettled.state.presentation.revision,
      nextPresentationRevision: ids.presentation("presentation-4"),
      method: "escape",
    }
    const exiting = reduceTopologyCore(retargetSettled.state, exit)
    expect(exiting.kind).toBe("committed")
    if (exiting.kind !== "committed") return
    expect(exiting.state.presentation.target.mode).toBe("map")

    const exitSettled = reduceTopologyCore(exiting.state, {
      channel: "presentation-effect",
      type: "focusSankey.transitionSettled",
      transitionId: ids.transition("exit-1"),
      expectedPresentationRevision: ids.presentation("presentation-4"),
      nextPresentationRevision: ids.presentation("presentation-4-settled"),
    })
    expect(exitSettled.kind).toBe("committed")
    if (exitSettled.kind !== "committed") return
    expect(exitSettled.state.presentation.focusSankey).toEqual({ kind: "inactive" })
    expect(exitSettled.state.presentation.settled.mode).toBe("map")
  })

  it("does not guess when a presentation revision is stale", () => {
    const state = initialState()
    const stale: FocusSankeyEnterMessage = {
      ...enterMessage(state),
      expectedPresentationRevision: ids.presentation("stale"),
    }
    const result = reduceTopologyCore(state, stale)
    expect(result).toEqual({
      kind: "no-op",
      state,
      reason: "stale-presentation",
    })
  })

  it("requires resync for a stream sequence gap", () => {
    const state = initialState()
    const result = reduceTopologyCore(state, {
      channel: "canonical-stream",
      type: "canonical.deltaBatch",
      batch: {
        streamId: state.canonical.streamId,
        sequence: 2,
        baseCanonicalRevision: state.canonical.canonicalRevision,
        nextCanonicalRevision: ids.canonical("canonical-2"),
        baseFrameId: state.canonical.frameId,
        nextFrameId: ids.frame("frame-2"),
        nextUniverseRevision: ids.universe("universe-2"),
        deltas: [
          {
            type: "relation.deleted",
            relationKey: state.canonical.relations[0]!.relationKey,
          },
        ],
      },
    })
    expect(result).toMatchObject({
      kind: "resync-required",
      reasonCode: "STREAM_GAP",
    })
  })

  it("rejects an invalid delta batch atomically", () => {
    const state = initialState()
    const absent = entity("absent")
    const invalidRelation = relation(
      "invalid-endpoint",
      state.canonical.entities[0]!,
      absent,
    )
    const result = reduceTopologyCore(state, {
      channel: "canonical-stream",
      type: "canonical.deltaBatch",
      batch: {
        streamId: state.canonical.streamId,
        sequence: 1,
        baseCanonicalRevision: state.canonical.canonicalRevision,
        nextCanonicalRevision: ids.canonical("canonical-2"),
        baseFrameId: state.canonical.frameId,
        nextFrameId: ids.frame("frame-2"),
        nextUniverseRevision: ids.universe("universe-2"),
        deltas: [{ type: "relation.upserted", relation: invalidRelation }],
      },
    })
    expect(result).toMatchObject({
      kind: "rejected",
      state,
      error: { code: "ATOMIC_BATCH_INVALID" },
    })
    expect(state.canonical.relations).toHaveLength(1)
  })

  it("rejects canonical relation key-material mutation", () => {
    const state = initialState()
    const current = state.canonical.relations[0]!
    const conflicting = {
      ...current,
      source: current.target,
      target: current.source,
    }
    const result = reduceTopologyCore(state, {
      channel: "canonical-stream",
      type: "canonical.deltaBatch",
      batch: {
        streamId: state.canonical.streamId,
        sequence: 1,
        baseCanonicalRevision: state.canonical.canonicalRevision,
        nextCanonicalRevision: ids.canonical("canonical-conflict"),
        baseFrameId: state.canonical.frameId,
        nextFrameId: ids.frame("frame-conflict"),
        nextUniverseRevision: ids.universe("universe-conflict"),
        deltas: [{ type: "relation.upserted", relation: conflicting }],
      },
    })
    expect(result).toMatchObject({
      kind: "rejected",
      error: { code: "RELATION_KEY_MATERIAL_MUTATION" },
    })
    expect(state.canonical.relations[0]).toBe(current)
  })
})
