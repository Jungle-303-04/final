#!/usr/bin/env bash
set -euo pipefail

need() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "missing required command: $1" >&2
    exit 1
  fi
}

need kubectl
need radar

RADAR_CONTEXTS="${RADAR_CONTEXTS:-${RADAR_CONTEXT:-cluster-1,mgmt}}"
RADAR_PORT="${RADAR_PORT:-9280}"
RADAR_NAMESPACE="${RADAR_NAMESPACE:-}"
RADAR_RESTRICTED="${RADAR_RESTRICTED:-1}"
RADAR_NO_BROWSER="${RADAR_NO_BROWSER:-0}"
RADAR_TIMELINE_STORAGE="${RADAR_TIMELINE_STORAGE:-sqlite}"
RADAR_TIMELINE_DB="${RADAR_TIMELINE_DB:-${HOME}/.radar/kubeheal-timeline.db}"
RADAR_TIMELINE_MAX_SIZE="${RADAR_TIMELINE_MAX_SIZE:-1Gi}"

if [[ ! "${RADAR_PORT}" =~ ^[0-9]+$ ]] || (( RADAR_PORT < 1 || RADAR_PORT > 65535 )); then
  echo "RADAR_PORT must be an integer between 1 and 65535" >&2
  exit 1
fi

IFS=',' read -r -a requested_contexts <<<"${RADAR_CONTEXTS}"
if (( ${#requested_contexts[@]} == 0 )); then
  echo "RADAR_CONTEXTS must contain at least one Kubernetes context" >&2
  exit 1
fi

RADAR_TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kubeheal-radar.XXXXXX")"
trap 'rm -rf "${RADAR_TEMP_DIR}"' EXIT
RADAR_KUBECONFIG="${RADAR_TEMP_DIR}/config"
context_files=()
contexts=()

for index in "${!requested_contexts[@]}"; do
  context="${requested_contexts[${index}]}"
  context="${context#"${context%%[![:space:]]*}"}"
  context="${context%"${context##*[![:space:]]}"}"
  if [[ -z "${context}" ]]; then
    echo "RADAR_CONTEXTS contains an empty context" >&2
    exit 1
  fi
  if [[ "$(kubectl config get-contexts "${context}" -o name 2>/dev/null)" != "${context}" ]]; then
    echo "unknown Kubernetes context: ${context}" >&2
    echo "available contexts:" >&2
    kubectl config get-contexts -o name >&2
    exit 1
  fi

  context_file="${RADAR_TEMP_DIR}/context-${index}"
  kubectl config view \
    --raw \
    --flatten \
    --minify \
    --context "${context}" >"${context_file}"
  chmod 600 "${context_file}"
  context_files+=("${context_file}")
  contexts+=("${context}")
done

MERGED_KUBECONFIG="$(IFS=:; echo "${context_files[*]}")"
KUBECONFIG="${MERGED_KUBECONFIG}" kubectl config view --raw --flatten >"${RADAR_KUBECONFIG}"
chmod 600 "${RADAR_KUBECONFIG}"

args=(
  --kubeconfig "${RADAR_KUBECONFIG}"
  --port "${RADAR_PORT}"
)

case "${RADAR_TIMELINE_STORAGE}" in
  sqlite)
    mkdir -p "$(dirname "${RADAR_TIMELINE_DB}")"
    args+=(
      --timeline-storage sqlite
      --timeline-db "${RADAR_TIMELINE_DB}"
      --timeline-max-size "${RADAR_TIMELINE_MAX_SIZE}"
    )
    ;;
  memory)
    args+=(--timeline-storage memory)
    ;;
  *)
    echo "RADAR_TIMELINE_STORAGE must be one of: sqlite, memory" >&2
    exit 1
    ;;
esac

if [[ -n "${RADAR_NAMESPACE}" ]]; then
  args+=(--namespace "${RADAR_NAMESPACE}")
fi

case "${RADAR_RESTRICTED}" in
  1|true|yes)
    args+=(--disable-exec --disable-helm-write --disable-local-terminal)
    ;;
  0|false|no)
    ;;
  *)
    echo "RADAR_RESTRICTED must be one of: 1, 0, true, false, yes, no" >&2
    exit 1
    ;;
esac

case "${RADAR_NO_BROWSER}" in
  1|true|yes)
    args+=(--no-browser)
    ;;
  0|false|no)
    ;;
  *)
    echo "RADAR_NO_BROWSER must be one of: 1, 0, true, false, yes, no" >&2
    exit 1
    ;;
esac

echo "Opening Radar for contexts '${contexts[*]}' at http://localhost:${RADAR_PORT}"
if [[ -n "${RADAR_NAMESPACE}" ]]; then
  echo "Initial namespace: ${RADAR_NAMESPACE}"
fi
if [[ "${RADAR_RESTRICTED}" =~ ^(1|true|yes)$ ]]; then
  echo "Exec, Helm write, and local terminal safeguards enabled"
fi
if [[ "${RADAR_TIMELINE_STORAGE}" == "sqlite" ]]; then
  echo "Persistent timeline enabled at ${RADAR_TIMELINE_DB}"
fi

radar "${args[@]}" "$@"
