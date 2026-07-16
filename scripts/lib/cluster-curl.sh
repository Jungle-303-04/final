#!/usr/bin/env bash

# Run one in-cluster curl probe without allowing kubectl's attach fallback to
# duplicate the response. `kubectl run --rm -i` can replay completed pod logs
# after an attach race, so curl writes an unambiguous marker and this helper
# retains only the last complete response.
cluster_curl() {
  local url="$1"
  local pod_name="${CLUSTER_CURL_POD_PREFIX:-deploy-smoke}-${GITHUB_RUN_ID:-local}-${RANDOM}"
  local response

  response="$(
    kubectl --context "${MGMT_CONTEXT}" -n "${MGMT_NS}" run "${pod_name}" \
      --rm -i --restart=Never \
      --image="${SMOKE_CURL_IMAGE}" \
      --quiet -- \
      curl --silent --show-error \
        --connect-timeout 5 \
        --max-time 15 \
        --write-out $'\n__OPSIA_HTTP_STATUS__=%{http_code}' \
        "${url}"
  )"
  _normalize_cluster_curl_response <<<"${response}"
}

_normalize_cluster_curl_response() {
  local response
  local marker="__OPSIA_HTTP_STATUS__="
  local body
  local http_status

  response="$(cat)"
  if [[ "${response}" != *"${marker}"* ]]; then
    # Test doubles and older callers already return one canonical body/status
    # pair. Preserve that shape while all real probes use the marker above.
    printf '%s\n' "${response}"
    return 0
  fi

  http_status="${response##*${marker}}"
  http_status="${http_status%%$'\n'*}"
  body="${response%${marker}*}"
  if [[ "${body}" == *"${marker}"* ]]; then
    body="${body##*${marker}}"
    body="${body#*$'\n'}"
  fi
  body="${body%$'\n'}"
  printf '%s\n%s\n' "${body}" "${http_status}"
}
