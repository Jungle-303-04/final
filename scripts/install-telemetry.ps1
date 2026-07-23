param(
  [string]$TargetContext = "",
  [string]$TargetNamespace = "target",
  [Parameter(Mandatory = $true)]
  [string]$AssetBaseUrl
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "missing required command: $Name"
  }
}

function Invoke-Native([scriptblock]$Command, [string]$Failure) {
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw $Failure
  }
}

function Wait-ServiceEndpoints([string]$Name) {
  Invoke-Native {
    & kubectl --context $TargetContext -n $TargetNamespace get "service/$Name"
  } "service/$Name is missing"
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $ready = & kubectl --context $TargetContext -n $TargetNamespace get endpointslices `
      -l "kubernetes.io/service-name=$Name" `
      -o "jsonpath={range .items[*].endpoints[*]}{.conditions.ready}{'\n'}{end}" 2>$null
    if (($ready -join "`n") -match "(^|`n)true(`n|$)") {
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "service/$Name has no ready endpoints"
}

function Require-ReleaseWorkload([string]$Release) {
  $resources = & kubectl --context $TargetContext -n $TargetNamespace `
    get deployment,statefulset,daemonset `
    -l "app.kubernetes.io/instance=$Release" -o name 2>$null
  if (-not $resources) {
    throw "telemetry release $Release has no workload"
  }
}

function Require-TempoRuntimeBounds {
  $argsText = (
    & kubectl --context $TargetContext -n $TargetNamespace `
      get statefulset/tempo `
      -o "jsonpath={.spec.template.spec.containers[0].args[*]}"
  ).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "tempo StatefulSet lookup failed"
  }
  $memoryLimit = (
    & kubectl --context $TargetContext -n $TargetNamespace `
      get statefulset/tempo `
      -o "jsonpath={.spec.template.spec.containers[0].resources.limits.memory}"
  ).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "tempo memory limit lookup failed"
  }
  $renderedConfig = (
    & kubectl --context $TargetContext -n $TargetNamespace `
      get configmap/tempo -o "jsonpath={.data.tempo\.yaml}"
  ) -join "`n"
  if ($LASTEXITCODE -ne 0) {
    throw "tempo config lookup failed"
  }

  if ($argsText -notmatch "(^|\s)-mem-ballast-size-mbs=0(\s|$)") {
    throw "tempo runtime has an unsafe memory ballast: $argsText"
  }
  if ($memoryLimit -ne "1Gi") {
    throw "tempo runtime memory limit is not the required 1Gi: $memoryLimit"
  }
  foreach ($expected in @(
    "block_retention: 6h",
    "trace_idle_period: 10s",
    "max_block_duration: 5m",
    "max_concurrent_queries: 4",
    "concurrent_jobs: 32"
  )) {
    if (-not $renderedConfig.Contains($expected)) {
      throw "tempo runtime config is missing required bound: $expected"
    }
  }
}

function New-RandomHex {
  $bytes = New-Object byte[] 32
  $generator = New-Object Security.Cryptography.RNGCryptoServiceProvider
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant()
}

Require-Command "helm"
Require-Command "kubectl"

if (-not $TargetContext) {
  $TargetContext = (& kubectl config current-context).Trim()
}
if (-not $TargetContext) {
  throw "unable to resolve the current kubectl context"
}

$assetDirectory = Join-Path ([IO.Path]::GetTempPath()) ("kyro-telemetry-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $assetDirectory | Out-Null
try {
  $assets = @("prometheus.yaml", "loki.yaml", "tempo.yaml", "opentelemetry.yaml", "minio.yaml")
  foreach ($asset in $assets) {
    Invoke-WebRequest -UseBasicParsing `
      -Uri ($AssetBaseUrl.TrimEnd("/") + "/" + $asset) `
      -OutFile (Join-Path $assetDirectory $asset)
  }

  Invoke-Native {
    & kubectl --context $TargetContext create namespace $TargetNamespace `
      --dry-run=client -o yaml |
      & kubectl --context $TargetContext apply -f -
  } "target namespace creation failed"

  $minioPassword = ""
  $encodedPassword = & kubectl --context $TargetContext -n $TargetNamespace `
    get secret minio-secret -o "jsonpath={.data.MINIO_ROOT_PASSWORD}" 2>$null
  if ($encodedPassword) {
    $minioPassword = [Text.Encoding]::UTF8.GetString(
      [Convert]::FromBase64String(($encodedPassword -join "").Trim())
    )
  }
  if (-not $minioPassword) {
    $minioPassword = New-RandomHex
  }

  Invoke-Native {
    & kubectl --context $TargetContext -n $TargetNamespace create secret generic minio-secret `
      --from-literal="MINIO_ROOT_USER=minioadmin" `
      --from-literal="MINIO_ROOT_PASSWORD=$minioPassword" `
      --dry-run=client -o yaml |
      & kubectl --context $TargetContext -n $TargetNamespace apply -f -
  } "MinIO credential installation failed"
  Invoke-Native {
    & kubectl --context $TargetContext -n $TargetNamespace `
      delete job/minio-create-buckets --ignore-not-found --wait=true
  } "old MinIO bucket job cleanup failed"
  Invoke-Native {
    & kubectl --context $TargetContext -n $TargetNamespace `
      apply -f (Join-Path $assetDirectory "minio.yaml")
  } "MinIO installation failed"
  Invoke-Native {
    & kubectl --context $TargetContext -n $TargetNamespace `
      rollout status statefulset/minio --timeout=180s
  } "MinIO rollout failed"
  Invoke-Native {
    & kubectl --context $TargetContext -n $TargetNamespace `
      wait --for=condition=complete job/minio-create-buckets --timeout=180s
  } "MinIO bucket creation failed"

  Invoke-Native {
    & helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update
  } "Prometheus Helm repository setup failed"
  Invoke-Native {
    & helm repo add grafana https://grafana.github.io/helm-charts --force-update
  } "Grafana Helm repository setup failed"
  Invoke-Native {
    & helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts --force-update
  } "OpenTelemetry Helm repository setup failed"
  Invoke-Native { & helm repo update } "Helm repository update failed"

  $releases = @(
    @("prometheus", "prometheus-community/prometheus", "29.19.0", "prometheus.yaml"),
    @("loki", "grafana/loki", "7.1.0", "loki.yaml"),
    @("tempo", "grafana/tempo", "1.24.4", "tempo.yaml"),
    @("opentelemetry-collector", "open-telemetry/opentelemetry-collector", "0.165.0", "opentelemetry.yaml")
  )
  foreach ($release in $releases) {
    $name, $chart, $version, $values = $release
    Invoke-Native {
      & helm upgrade --install $name $chart `
        --version $version `
        --kube-context $TargetContext `
        --namespace $TargetNamespace `
        --values (Join-Path $assetDirectory $values) `
        --wait --timeout 5m
    } "$name installation failed"
    Require-ReleaseWorkload $name
  }

  Require-TempoRuntimeBounds
  foreach ($service in @("prometheus", "loki-gateway", "tempo", "opentelemetry-collector")) {
    Wait-ServiceEndpoints $service
  }

  Write-Host "telemetry is installed in context $TargetContext, namespace $TargetNamespace."
}
finally {
  Remove-Item -LiteralPath $assetDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
