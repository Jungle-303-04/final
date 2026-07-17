export const HELM_ARTIFACT_KINDS = [
  "manifest",
  "values",
  "manifest_diff",
  "values_diff",
  "notes_diff",
  "hooks_diff",
  "resources_diff",
] as const;

export type HelmArtifactUrlKind = typeof HELM_ARTIFACT_KINDS[number];

export interface HelmArtifactUrlState {
  revision: number | null;
  comparisonRevision: number | null;
  artifact: HelmArtifactUrlKind | null;
  commandId: string | null;
  allValues: boolean;
}

const REVISION_KEY = "helmRevision";
const COMPARISON_KEY = "helmCompare";
const ARTIFACT_KEY = "helmArtifact";
const COMMAND_KEY = "helmCommand";
const ALL_VALUES_KEY = "helmAllValues";
const COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

export function parseHelmArtifactUrlState(params: URLSearchParams): HelmArtifactUrlState {
  const revision = positiveInteger(params.get(REVISION_KEY));
  const artifact = artifactKind(params.get(ARTIFACT_KEY));
  const comparisonRevision = positiveInteger(params.get(COMPARISON_KEY));
  const commandValue = params.get(COMMAND_KEY);
  const commandId = revision !== null
    && artifact !== null
    && (!artifact.endsWith("_diff") || comparisonRevision !== null)
    && commandValue !== null
    && COMMAND_ID_PATTERN.test(commandValue)
      ? commandValue
      : null;
  return {
    revision,
    comparisonRevision,
    artifact,
    commandId,
    allValues: params.get(ALL_VALUES_KEY) === "1",
  };
}

export function writeHelmArtifactSearchParams(
  current: URLSearchParams,
  state: HelmArtifactUrlState,
): URLSearchParams {
  const next = new URLSearchParams(current);
  writeNumber(next, REVISION_KEY, state.revision);
  writeNumber(next, COMPARISON_KEY, state.comparisonRevision);
  writeValue(next, ARTIFACT_KEY, state.artifact);
  writeValue(next, COMMAND_KEY, state.commandId);
  if (state.allValues) next.set(ALL_VALUES_KEY, "1");
  else next.delete(ALL_VALUES_KEY);
  return next;
}

function positiveInteger(value: string | null): number | null {
  if (value === null || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function artifactKind(value: string | null): HelmArtifactUrlKind | null {
  return HELM_ARTIFACT_KINDS.find((candidate) => candidate === value) ?? null;
}

function writeNumber(params: URLSearchParams, key: string, value: number | null): void {
  writeValue(params, key, value === null ? null : String(value));
}

function writeValue(params: URLSearchParams, key: string, value: string | null): void {
  if (value === null) params.delete(key);
  else params.set(key, value);
}
