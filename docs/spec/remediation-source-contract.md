---
source_commit: 30e0f8c20
status: synced
---

# Remediation source contract

Opsia는 렌더링된 Kubernetes object를 보고 Helm values나 Kustomize 원문 위치를 추측하지
않는다. 저장소 루트의 `.remediation.yaml`이 수정 가능한 파일과 scalar를 명시하며, Safe PR
SCM provider는 승인된 exact base SHA에서 이 계약과 대상 원문을 함께 읽는다. 계약이 없거나
요청한 변경이 선언되지 않으면 branch·commit·PR을 만들기 전에 `unsupported`로 종료한다.

## v1alpha1 형식

```yaml
apiVersion: remediation.opsia.dev/v1alpha1
kind: RemediationSource
spec:
  sources:
    - manifestPath: deploy/app.yaml
      sourceType: raw-yaml
      path: deploy/app.yaml
      imagePath: spec.template.spec.containers[name=checkout-api].image
      replicaPath: spec.replicas
      probePaths:
        spec.template.spec.containers[name=checkout-api].readinessProbe.timeoutSeconds: spec.template.spec.containers[name=checkout-api].readinessProbe.timeoutSeconds

    - manifestPath: charts/checkout/Chart.yaml
      sourceType: helm-values
      path: charts/checkout/values.yaml
      imageTagPath: image.tag
      replicaPath: replicaCount
      probePaths:
        spec.template.spec.containers[name=checkout-api].readinessProbe.timeoutSeconds: probes.readiness.timeoutSeconds

    - manifestPath: overlays/prod/kustomization.yaml
      sourceType: kustomize
      path: overlays/prod/kustomization.yaml
      images:
        - name: ghcr.io/project/checkout-api
```

`manifestPath`는 workflow authority가 승인한 render entrypoint와 정확히 일치해야 한다.
`path`는 실제 PR에서 수정할 저장소 상대 경로다. 한 `manifestPath`에는 source entry 하나만
허용하며, field path는 재직렬화 대상이 아니라 exact scalar span을 찾는 선택자다.

## adapter와 변경 범위

| sourceType | 선언 | 허용 변경 |
|---|---|---|
| `raw-yaml` | `imagePath`, `replicaPath`, `probePaths` | 선언된 full image scalar, replica scalar, 제한된 probe scalar |
| `helm-values` | `imageTagPath`, `replicaPath`, `probePaths` | 같은 image repository의 tag, 선언된 replica/probe values scalar |
| `kustomize` | `images[].name` | 이름이 일치하는 `images[name=...].newTag` |

Helm/Kustomize image adapter는 repository 교체와 digest 전환을 허용하지 않는다. 두 경우는
tag-only 계약 밖이므로 `unsupported`다. full image 변경은 정확한 `imagePath`가 선언된
`raw-yaml`에서만 가능하다.

probe key는 rendered manifest의 full field path여야 하며 다음 suffix만 허용한다.

- `readinessProbe.httpGet.path`, `readinessProbe.httpGet.port`,
  `readinessProbe.timeoutSeconds`
- `livenessProbe.httpGet.path`, `livenessProbe.httpGet.port`,
  `livenessProbe.timeoutSeconds`

full field path를 key로 쓰므로 다른 container의 probe를 선언 위치로 잘못 redirect하지 않는다.
현재 v1alpha1에는 memory와 selector source adapter가 없다. 기존 semantic patch generator가
`oom_memory`나 `selector_fix` plan을 만들더라도 실제 SCM write 경계에서는 `unsupported`로
종료한다. adapter 범위를 넓힐 때는 계약 schema, parser, scorer를 함께 확장해야 한다.

## fail-closed 검증

다음 입력은 fallback이나 경로 추측 없이 거부한다.

- 계약 누락, 64 KiB 초과, YAML multi-document, anchor/alias, duplicate key
- 알 수 없는 root/spec/source key 또는 source type
- 절대 경로, `..`, backslash, 빈 segment, 계약 파일 자체를 patch하는 경로
- 중복 `manifestPath`, field path, Kustomize image name
- 미선언 action/field, raw image의 다른 container redirect
- Helm/Kustomize repository 교체, digest image, source scalar current-value 불일치

SCM provider는 `.remediation.yaml`과 source를 `expectedBaseSha`로 조회한다. 기존 PR을 재전달할
때 base branch가 앞서 있으면 change document, 계약 파일, render entrypoint, 선언 source 중
하나라도 바뀐 경우 재사용하지 않는다. 이 검사는 계약과 원문의 TOCTOU를 막는다.

## 재현

```bash
uv run python scripts/verify-remediation-source-contract.py
```

성공 기준은 raw image/replica/probe, Helm image tag, Kustomize image tag와 미선언 selector
차단까지 6개 검사가 통과하고 마지막 줄이 다음과 같은 것이다.

```json
{"failed": 0, "passed": 6, "total": 6}
```
