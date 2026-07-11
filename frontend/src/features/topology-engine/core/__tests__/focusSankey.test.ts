import { describe, expect, it } from "vitest"

import { revision } from "../brand"
import {
  assertFocusSankeyLayout,
  computeFocusSankeyLayout,
  FocusSankeyInvariantError,
  type FocusSankeyInput,
  type FocusSankeyLayout,
} from "../focusSankey"
import { entity, key, layoutRevision, relation } from "./builders"

function inputFixture(): FocusSankeyInput {
  const source = entity("source", "healthy")
  const alpha = entity("alpha", "unhealthy")
  const beta = entity("beta", "unhealthy")
  const restricted = entity("restricted", "healthy")
  const unrelated = entity("unrelated", "degraded")

  return {
    layoutRevision: layoutRevision(),
    universeRevision: revision("universe-1", "universe"),
    sourceEntityKey: source.ref.entityKey,
    mapUniverseEntityKeys: [
      source.ref.entityKey,
      alpha.ref.entityKey,
      beta.ref.entityKey,
      restricted.ref.entityKey,
      unrelated.ref.entityKey,
    ],
    entities: [source, alpha, beta, restricted, unrelated],
    relations: [
      relation("source-alpha-primary", source, alpha),
      relation("source-alpha-secondary", source, alpha),
      relation("beta-source", beta, source),
      relation("source-restricted", source, restricted, "restricted"),
    ],
    faceIntervalScale: 3,
  }
}

describe("computeFocusSankeyLayout", () => {
  it("keeps U minus source exactly once and deduplicates multi-relation members", () => {
    const result = computeFocusSankeyLayout(inputFixture())
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.layout.orderedRightEntityKeys).toEqual([
      key("alpha"),
      key("beta"),
      key("restricted"),
      key("unrelated"),
    ])
    expect(result.layout.orderedRightEntityKeys.length + 1).toBe(
      result.layout.mapUniverseEntityKeys.length,
    )
    expect(new Set(result.layout.orderedRightEntityKeys).size).toBe(
      result.layout.orderedRightEntityKeys.length,
    )

    expect(result.layout.connectors).toHaveLength(1)
    const connector = result.layout.connectors[0]
    expect(connector?.healthLevel).toBe("unhealthy")
    expect(connector?.memberEntityKeys).toEqual([key("alpha"), key("beta")])
    expect(connector?.canonicalRelationKeys).toEqual([
      "beta-source",
      "source-alpha-primary",
      "source-alpha-secondary",
    ])
    expect(result.layout.unrelatedEntityKeys).toEqual([
      key("restricted"),
      key("unrelated"),
    ])
  })

  it("orders health groups deterministically and closes decimal residual to one", () => {
    const source = entity("source")
    const unhealthyA = entity("unhealthy-a", "unhealthy")
    const unhealthyB = entity("unhealthy-b", "unhealthy")
    const healthy = entity("healthy", "healthy")
    const result = computeFocusSankeyLayout({
      layoutRevision: layoutRevision("residual"),
      universeRevision: revision("universe-residual", "universe"),
      sourceEntityKey: source.ref.entityKey,
      mapUniverseEntityKeys: [
        source.ref.entityKey,
        healthy.ref.entityKey,
        unhealthyA.ref.entityKey,
        unhealthyB.ref.entityKey,
      ],
      entities: [source, healthy, unhealthyA, unhealthyB],
      relations: [
        relation("healthy", source, healthy),
        relation("unhealthy-a", source, unhealthyA),
        relation("unhealthy-b", source, unhealthyB),
      ],
      faceIntervalScale: 3,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.layout.connectors.map((group) => group.healthLevel)).toEqual([
      "unhealthy",
      "healthy",
    ])
    expect(result.layout.connectors.map((group) => group.sourceFaceStartRatio)).toEqual([
      "0",
      "0.667",
    ])
    expect(result.layout.connectors.map((group) => group.sourceFaceEndRatio)).toEqual([
      "0.667",
      "1",
    ])
  })

  it("uses half-even quantization and canonical-key residual tie breaking", () => {
    const source = entity("source")
    const members = [
      entity("u", "unhealthy"),
      entity("d", "degraded"),
      entity("n", "neutral"),
      entity("h", "healthy"),
    ]
    const result = computeFocusSankeyLayout({
      layoutRevision: layoutRevision("half-even"),
      universeRevision: revision("universe-half-even", "universe"),
      sourceEntityKey: source.ref.entityKey,
      mapUniverseEntityKeys: [
        source.ref.entityKey,
        ...members.map((member) => member.ref.entityKey),
      ],
      entities: [source, ...members],
      relations: members.map((member, index) =>
        relation(`edge-${index}`, source, member),
      ),
      faceIntervalScale: 1,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.layout.connectors.map((group) => group.sourceFaceStartRatio)).toEqual([
      "0",
      "0.2",
      "0.4",
      "0.6",
    ])
    expect(result.layout.connectors.map((group) => group.sourceFaceEndRatio)).toEqual([
      "0.2",
      "0.4",
      "0.6",
      "1",
    ])
  })

  it("is independent of canonical relation input order", () => {
    const original = inputFixture()
    const first = computeFocusSankeyLayout(original)
    const second = computeFocusSankeyLayout({
      ...original,
      relations: [...original.relations].reverse(),
    })
    expect(first).toEqual(second)
  })

  it("keeps a source-only universe complete with no synthetic connector", () => {
    const source = entity("source")
    const result = computeFocusSankeyLayout({
      layoutRevision: layoutRevision("single"),
      universeRevision: revision("universe-single", "universe"),
      sourceEntityKey: source.ref.entityKey,
      mapUniverseEntityKeys: [source.ref.entityKey],
      entities: [source],
      relations: [],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.layout.orderedRightEntityKeys).toEqual([])
    expect(result.layout.connectors).toEqual([])
  })

  it("returns a typed error for duplicate universe membership", () => {
    const source = entity("source")
    const result = computeFocusSankeyLayout({
      layoutRevision: layoutRevision("duplicate"),
      universeRevision: revision("universe-duplicate", "universe"),
      sourceEntityKey: source.ref.entityKey,
      mapUniverseEntityKeys: [source.ref.entityKey, source.ref.entityKey],
      entities: [source],
      relations: [],
    })
    expect(result).toMatchObject({
      ok: false,
      error: { code: "DUPLICATE_UNIVERSE_ENTITY" },
    })
  })

  it("rejects a corrupted worker proof before commit", () => {
    const input = inputFixture()
    const result = computeFocusSankeyLayout(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const corrupted = {
      ...result.layout,
      orderedRightEntityKeys: [
        result.layout.orderedRightEntityKeys[0],
        result.layout.orderedRightEntityKeys[0],
      ],
    } as FocusSankeyLayout

    expect(() => assertFocusSankeyLayout(input, corrupted)).toThrow(
      FocusSankeyInvariantError,
    )
  })

  it("preserves completeness across relation membership combinations", () => {
    const levels = [
      "unhealthy",
      "degraded",
      "unknown",
      "neutral",
      "healthy",
    ] as const

    for (let memberCount = 0; memberCount <= 6; memberCount += 1) {
      const source = entity(`source-${memberCount}`)
      const members = Array.from({ length: memberCount }, (_, index) =>
        entity(`member-${memberCount}-${index}`, levels[index % levels.length]),
      )
      const combinationCount = 2 ** memberCount
      for (let mask = 0; mask < combinationCount; mask += 1) {
        const relations = members.flatMap((member, index) => {
          if ((mask & (1 << index)) === 0) return []
          const primary = relation(
            `edge-${memberCount}-${mask}-${index}-a`,
            source,
            member,
          )
          return index === 0
            ? [
                primary,
                relation(
                  `edge-${memberCount}-${mask}-${index}-b`,
                  member,
                  source,
                ),
              ]
            : [primary]
        })
        const input: FocusSankeyInput = {
          layoutRevision: layoutRevision(`matrix-${memberCount}-${mask}`),
          universeRevision: revision(
            `universe-matrix-${memberCount}-${mask}`,
            "universe",
          ),
          sourceEntityKey: source.ref.entityKey,
          mapUniverseEntityKeys: [
            source.ref.entityKey,
            ...members.map((member) => member.ref.entityKey),
          ],
          entities: [source, ...members],
          relations,
          faceIntervalScale: 6,
        }
        const result = computeFocusSankeyLayout(input)
        expect(result.ok).toBe(true)
        if (!result.ok) continue
        expect(result.layout.orderedRightEntityKeys).toHaveLength(memberCount)
        expect(new Set(result.layout.orderedRightEntityKeys).size).toBe(memberCount)
        expect(() => assertFocusSankeyLayout(input, result.layout)).not.toThrow()
      }
    }
  })
})
