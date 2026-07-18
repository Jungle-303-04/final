#!/usr/bin/env bash

wait_for_public_edge_release() {
  local base_url="$1"
  local expected_bundle="$2"
  local source_sha="$3"
  local max_attempts="${PUBLIC_EDGE_MAX_ATTEMPTS:-30}"
  local retry_seconds="${PUBLIC_EDGE_RETRY_SECONDS:-2}"
  local health_file
  local index_file
  local bundle_file
  local attempt
  local health_status
  local index_status
  local bundle_status
  local observed_bundle
  local release_bundle

  [[ "${base_url}" =~ ^https://[^[:space:]]+$ ]]
  [[ -z "${expected_bundle}" ]] || [[ "${expected_bundle}" =~ ^index-[A-Za-z0-9_-]+\.js$ ]]
  [[ "${source_sha}" =~ ^[0-9a-f]{40}$ ]]
  [[ "${max_attempts}" =~ ^[1-9][0-9]*$ ]]
  [[ "${retry_seconds}" =~ ^[0-9]+([.][0-9]+)?$ ]]

  health_file="$(mktemp)"
  index_file="$(mktemp)"
  bundle_file="$(mktemp)"
  for attempt in $(seq 1 "${max_attempts}"); do
    health_status="$(
      curl --silent --show-error \
        --connect-timeout 5 \
        --max-time 10 \
        --output "${health_file}" \
        --write-out '%{http_code}' \
        "${base_url}/api/healthz" || true
    )"
    index_status="$(
      curl --silent --show-error \
        --connect-timeout 5 \
        --max-time 10 \
        --header 'Cache-Control: no-cache' \
        --output "${index_file}" \
        --write-out '%{http_code}' \
        "${base_url}/?source_sha=${source_sha}&edge_attempt=${attempt}" || true
    )"
    observed_bundle="$(
      grep -Eom1 'index-[A-Za-z0-9_-]+\.js' "${index_file}" 2>/dev/null || true
    )"
    bundle_status="000"
    release_bundle="${expected_bundle:-${observed_bundle}}"
    if [[ "${release_bundle}" =~ ^index-[A-Za-z0-9_-]+\.js$ ]]; then
      bundle_status="$(
        curl --silent --show-error \
          --connect-timeout 5 \
          --max-time 15 \
          --header 'Cache-Control: no-cache' \
          --output "${bundle_file}" \
          --write-out '%{http_code}' \
          "${base_url}/assets/${release_bundle}?source_sha=${source_sha}" || true
      )"
    fi

    if [[ "${health_status}" == "200" ]] \
      && jq -e '.status == "ok" and .service == "api-gateway"' \
        "${health_file}" >/dev/null 2>&1 \
      && [[ "${index_status}" == "200" ]] \
      && [[ -n "${release_bundle}" ]] \
      && { [[ -z "${expected_bundle}" ]] \
        || [[ "${observed_bundle}" == "${expected_bundle}" ]]; } \
      && [[ "${bundle_status}" == "200" ]] \
      && grep --fixed-strings --quiet "${source_sha}" "${bundle_file}"; then
      printf 'public edge converged: attempt=%s health=200 bundle=%s\n' \
        "${attempt}" "${release_bundle}"
      rm -f -- "${health_file}" "${index_file}" "${bundle_file}"
      return 0
    fi

    printf 'public edge pending: attempt=%s/%s health=%s index=%s bundle=%s observed=%s\n' \
      "${attempt}" "${max_attempts}" "${health_status:-000}" "${index_status:-000}" \
      "${bundle_status:-000}" "${observed_bundle:-none}" >&2
    if (( attempt < max_attempts )); then
      sleep "${retry_seconds}"
    fi
  done

  rm -f -- "${health_file}" "${index_file}" "${bundle_file}"
  echo "public edge failed to converge to ${source_sha} / ${expected_bundle:-discovered-bundle}" >&2
  return 1
}
