import { describe, expect, it } from "vitest"

import {
  connectorKey,
  flowKey,
  relationKey,
  revision,
  sceneRelationKey,
} from "../brand"
import {
  validateRenderScene,
  type RenderScene,
  type RenderSceneEntity,
} from "../renderScene"
import { ids, key, layoutRevision } from "./builders"

function sceneEntity(value: string, x: number): RenderSceneEntity {
  return {
    entityKey: key(value),
    rect: { x, y: 0, width: 10, height: 10 },
    zLayer: 10,
    density: "name",
    interactive: true,
    label: value,
    kindLabel: "Test",
    healthLevel: "healthy",
    metricText: null,
    membershipRole: "primary",
    lifecycle: "live",
    statusTokens: [],
    accessibilityName: value,
  }
}

function validFocusScene(): RenderScene {
  const source = sceneEntity("source", 0)
  const target = sceneEntity("target", 20)
  const geometryEntities = [source, target].map(
    ({ entityKey, rect, zLayer, density, interactive }) => ({
      entityKey,
      rect,
      zLayer,
      density,
      interactive,
    }),
  )
  return {
    schemaVersion: "topology-render-scene/v1",
    frameId: ids.frame("frame-render"),
    sceneRevision: revision("scene-1", "render-scene"),
    layoutRevision: layoutRevision("render"),
    presentation: {
      mode: "focus-sankey",
      lens: { kind: "placement" },
      focusEntityKey: source.entityKey,
    },
    mapUniverseEntityKeys: [source.entityKey, target.entityKey],
    geometry: {
      bounds: { x: 0, y: 0, width: 100, height: 100 },
      entities: geometryEntities,
      relations: [
        {
          kind: "focus-face-connector",
          sceneRelationKey: sceneRelationKey("scene-focus"),
          connectorKey: connectorKey("connector-healthy"),
          healthLevel: "healthy",
          memberEntityKeys: [target.entityKey],
          sourceFace: [
            { x: 10, y: 0 },
            { x: 10, y: 10 },
          ],
          targetFace: [
            { x: 20, y: 0 },
            { x: 20, y: 10 },
          ],
        },
      ],
    },
    entities: [source, target],
    focusedEntityKey: source.entityKey,
    selectedEntityKeys: [],
    completeness: {
      completeness: "complete",
      access: "allowed",
      sources: [],
    },
    warnings: [],
  }
}

describe("RenderScene discriminants", () => {
  it("accepts face-bound focus geometry without treating it as observed flow", () => {
    expect(validateRenderScene(validFocusScene())).toEqual([])
  })

  it("rejects a focus connector outside focus-Sankey presentation", () => {
    const scene = validFocusScene()
    const invalid: RenderScene = {
      ...scene,
      presentation: { mode: "map", lens: { kind: "placement" } },
    }
    expect(validateRenderScene(invalid)).toContainEqual(
      expect.objectContaining({ code: "FOCUS_CONNECTOR_OUTSIDE_FOCUS" }),
    )
  })

  it("keeps observed flow and canonical relations as distinct runtime variants", () => {
    const scene = validFocusScene()
    const source = scene.entities[0]!
    const target = scene.entities[1]!
    const withDistinctRelations: RenderScene = {
      ...scene,
      geometry: {
        ...scene.geometry,
        relations: [
          {
            kind: "canonical-relation",
            sceneRelationKey: sceneRelationKey("scene-canonical"),
            relationKey: relationKey("canonical-edge"),
            plane: "ownership",
            points: [
              { x: source.rect.x, y: source.rect.y },
              { x: target.rect.x, y: target.rect.y },
            ],
          },
          {
            kind: "observed-flow",
            sceneRelationKey: sceneRelationKey("scene-flow"),
            relationKey: relationKey("observed-edge"),
            flowKey: flowKey("flow-1"),
            points: [
              { x: source.rect.x, y: source.rect.y },
              { x: target.rect.x, y: target.rect.y },
            ],
          },
        ],
      },
    }
    expect(validateRenderScene(withDistinctRelations)).toEqual([])
    expect(
      withDistinctRelations.geometry.relations.map((relation) => relation.kind),
    ).toEqual(["canonical-relation", "observed-flow"])
  })
})
