declare const topologyCoreBrand: unique symbol

/** Compile-time identity boundary for opaque topology values. */
export type Brand<Value, Name extends string> = Value & {
  readonly [topologyCoreBrand]: Name
}

export type EntityKey = Brand<string, "EntityKey">
export type RelationKey = Brand<string, "RelationKey">
export type ConnectorKey = Brand<string, "ConnectorKey">
export type SceneRelationKey = Brand<string, "SceneRelationKey">
export type FlowKey = Brand<string, "FlowKey">
export type FrameId = Brand<string, "FrameId">
export type TransitionId = Brand<string, "TransitionId">
export type DecimalString = Brand<string, "DecimalString">

export type Revision<Domain extends string = "generic"> = Brand<
  string,
  `Revision:${Domain}`
>

export class InvalidOpaqueValueError extends Error {
  readonly code = "INVALID_OPAQUE_VALUE"

  constructor(
    readonly valueKind: string,
    message: string,
  ) {
    super(message)
    this.name = "InvalidOpaqueValueError"
  }
}

function opaqueString<Name extends string>(
  value: string,
  valueKind: Name,
): Brand<string, Name> {
  if (value.length === 0 || value.trim() !== value) {
    throw new InvalidOpaqueValueError(
      valueKind,
      `${valueKind} must be a non-empty, non-trimmed string`,
    )
  }

  return value as Brand<string, Name>
}

export function entityKey(value: string): EntityKey {
  return opaqueString(value, "EntityKey")
}

export function relationKey(value: string): RelationKey {
  return opaqueString(value, "RelationKey")
}

export function connectorKey(value: string): ConnectorKey {
  return opaqueString(value, "ConnectorKey")
}

export function sceneRelationKey(value: string): SceneRelationKey {
  return opaqueString(value, "SceneRelationKey")
}

export function flowKey(value: string): FlowKey {
  return opaqueString(value, "FlowKey")
}

export function frameId(value: string): FrameId {
  return opaqueString(value, "FrameId")
}

export function transitionId(value: string): TransitionId {
  return opaqueString(value, "TransitionId")
}

export function revision<Domain extends string>(
  value: string,
  domain: Domain,
): Revision<Domain> {
  return opaqueString(value, `Revision:${domain}`)
}

/** Lexicographic comparison for canonical opaque-key tie breaking. */
export function compareOpaque(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
