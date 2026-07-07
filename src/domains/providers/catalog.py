from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum

from packages.config.settings import env


class ProviderCategory(StrEnum):
    SOURCE = "source"
    DEPLOY = "deploy"
    CLOUD = "cloud"
    SECRET = "secret"


class ProviderStatus(StrEnum):
    AVAILABLE = "available"
    UNAVAILABLE = "unavailable"


PROVIDER_DISABLED_ENV = "KUBEHEAL_DISABLED_PROVIDERS"


@dataclass(frozen=True)
class CredentialRequirement:
    key: str
    ref_prefixes: tuple[str, ...]
    required_for: tuple[str, ...] = field(default_factory=tuple)
    description: str = ""

    def to_body(self) -> dict[str, object]:
        return {
            "key": self.key,
            "ref_prefixes": list(self.ref_prefixes),
            "required_for": list(self.required_for),
            "description": self.description,
        }


@dataclass(frozen=True)
class ProviderDefinition:
    category: ProviderCategory
    key: str
    label: str
    status: ProviderStatus
    adapter: str | None
    capabilities: tuple[str, ...] = field(default_factory=tuple)
    credential_requirements: tuple[CredentialRequirement, ...] = field(default_factory=tuple)
    config_keys: tuple[str, ...] = field(default_factory=tuple)
    unavailable_reason: str | None = None

    def to_body(self) -> dict[str, object]:
        return {
            "category": self.category.value,
            "key": self.key,
            "label": self.label,
            "status": self.status.value,
            "adapter": self.adapter,
            "capabilities": list(self.capabilities),
            "credential_requirements": [
                requirement.to_body() for requirement in self.credential_requirements
            ],
            "config_keys": list(self.config_keys),
            "unavailable_reason": self.unavailable_reason,
        }


CATALOG: tuple[ProviderDefinition, ...] = (
    ProviderDefinition(
        category=ProviderCategory.SOURCE,
        key="github",
        label="GitHub",
        status=ProviderStatus.AVAILABLE,
        adapter="GithubScmProvider + GitHub Contents API",
        capabilities=("webhook", "poll", "manifest_read", "safe_pr"),
        credential_requirements=(
            CredentialRequirement(
                key="github_token",
                ref_prefixes=("env:", "k8s-secret:", "aws-sm:"),
                required_for=("private_repo", "safe_pr"),
                description="GitHub API token or GitHub App installation token secret ref.",
            ),
        ),
        config_keys=("GITHUB_TOKEN_REF", "GITHUB_API_BASE", "SCM_REPO", "SCM_BASE_BRANCH"),
    ),
    ProviderDefinition(
        category=ProviderCategory.SOURCE,
        key="git-url",
        label="Generic Git URL",
        status=ProviderStatus.UNAVAILABLE,
        adapter=None,
        capabilities=("manifest_read",),
        unavailable_reason=(
            "checkout cache can mirror repos internally, but per-repository credential "
            "binding and allowlist are unavailable in this build"
        ),
    ),
    ProviderDefinition(
        category=ProviderCategory.SOURCE,
        key="gitlab",
        label="GitLab",
        status=ProviderStatus.UNAVAILABLE,
        adapter=None,
        unavailable_reason="GitLab webhook, contents, and merge request adapters are unavailable",
    ),
    ProviderDefinition(
        category=ProviderCategory.SOURCE,
        key="bitbucket",
        label="Bitbucket",
        status=ProviderStatus.UNAVAILABLE,
        adapter=None,
        unavailable_reason="Bitbucket webhook, contents, and pull request adapters are unavailable",
    ),
    ProviderDefinition(
        category=ProviderCategory.DEPLOY,
        key="manual-manifest",
        label="Manual Manifest Export",
        status=ProviderStatus.AVAILABLE,
        adapter="POST /targets apply=false",
        capabilities=("preview", "download_manifest"),
    ),
    ProviderDefinition(
        category=ProviderCategory.DEPLOY,
        key="kube-context",
        label="Kubernetes Context Apply",
        status=ProviderStatus.AVAILABLE,
        adapter="kubectl apply with KUBE_CONTEXT_ALLOWLIST",
        capabilities=("preview", "server_apply"),
        config_keys=("KUBE_CONTEXT_ALLOWLIST",),
    ),
    ProviderDefinition(
        category=ProviderCategory.DEPLOY,
        key="github-actions",
        label="GitHub Actions",
        status=ProviderStatus.AVAILABLE,
        adapter=".github/workflows/promote-dev.yml + .github/workflows/aws-cd.yml",
        capabilities=("ci", "build", "promote", "deploy"),
        credential_requirements=(
            CredentialRequirement(
                key="scm_write",
                ref_prefixes=("github-actions-permissions",),
                required_for=("promote",),
                description="Repository workflow permission that allows the runner to push to main.",
            ),
        ),
        config_keys=("AUTO_PROMOTE_DEV_TO_MAIN", "AWS_AUTO_DEPLOY"),
    ),
    ProviderDefinition(
        category=ProviderCategory.DEPLOY,
        key="gitops-controller",
        label="GitOps Controller",
        status=ProviderStatus.UNAVAILABLE,
        adapter=None,
        unavailable_reason="GitOps controller adapter is unavailable",
    ),
    ProviderDefinition(
        category=ProviderCategory.DEPLOY,
        key="jenkins",
        label="Jenkins",
        status=ProviderStatus.UNAVAILABLE,
        adapter=None,
        unavailable_reason="Jenkins job trigger/status adapter is unavailable",
    ),
    ProviderDefinition(
        category=ProviderCategory.CLOUD,
        key="existing-k8s",
        label="Existing Kubernetes",
        status=ProviderStatus.AVAILABLE,
        adapter="kubeconfig context or target agent bootstrap",
        capabilities=("install_target_agent", "apply_manifest"),
        config_keys=("KUBE_CONTEXT_ALLOWLIST",),
    ),
    ProviderDefinition(
        category=ProviderCategory.CLOUD,
        key="local",
        label="Local Kubernetes",
        status=ProviderStatus.AVAILABLE,
        adapter="scripts/up.sh",
        capabilities=("kind", "minikube", "developer_loop"),
    ),
    ProviderDefinition(
        category=ProviderCategory.CLOUD,
        key="aws",
        label="AWS",
        status=ProviderStatus.AVAILABLE,
        adapter="scripts/aws-up.sh + GitHub OIDC workflow",
        capabilities=("eks", "ecr", "oidc_deploy"),
        credential_requirements=(
            CredentialRequirement(
                key="aws_role",
                ref_prefixes=("github-oidc:", "env:"),
                required_for=("deploy",),
                description="OIDC role ARN or environment credential chain for AWS deployments.",
            ),
        ),
        config_keys=("AWS_REGION", "AWS_ROLE_ARN", "ECR_REPO"),
    ),
    ProviderDefinition(
        category=ProviderCategory.CLOUD,
        key="gcp",
        label="Google Cloud",
        status=ProviderStatus.UNAVAILABLE,
        adapter=None,
        unavailable_reason="GKE, Artifact Registry, and workload identity adapters are unavailable",
    ),
    ProviderDefinition(
        category=ProviderCategory.CLOUD,
        key="azure",
        label="Azure",
        status=ProviderStatus.UNAVAILABLE,
        adapter=None,
        unavailable_reason="AKS, ACR, and workload identity adapters are unavailable",
    ),
    ProviderDefinition(
        category=ProviderCategory.SECRET,
        key="env",
        label="Environment Variable",
        status=ProviderStatus.AVAILABLE,
        adapter="EnvSecretVault",
        capabilities=("local", "ci"),
        config_keys=("SECRET_VAULT_PROVIDER", "TOKEN_VAULT_PROVIDER"),
    ),
    ProviderDefinition(
        category=ProviderCategory.SECRET,
        key="k8s-secret",
        label="Kubernetes Secret",
        status=ProviderStatus.AVAILABLE,
        adapter="KubernetesSecretVault",
        capabilities=("in_cluster", "namespaced_secret"),
        config_keys=("KUBERNETES_SERVICE_HOST", "KUBEHEAL_K8S_API_BASE"),
    ),
    ProviderDefinition(
        category=ProviderCategory.SECRET,
        key="aws-sm",
        label="AWS Secrets Manager",
        status=ProviderStatus.AVAILABLE,
        adapter="AwsSecretsManagerSecretVault",
        capabilities=("managed_secret", "rotation_stage"),
        config_keys=("SECRET_VAULT_AWS_REGION",),
    ),
    ProviderDefinition(
        category=ProviderCategory.SECRET,
        key="vault",
        label="HashiCorp Vault",
        status=ProviderStatus.UNAVAILABLE,
        adapter=None,
        unavailable_reason="HashiCorp Vault adapter is unavailable",
    ),
    ProviderDefinition(
        category=ProviderCategory.SECRET,
        key="gcp-sm",
        label="Google Secret Manager",
        status=ProviderStatus.UNAVAILABLE,
        adapter=None,
        unavailable_reason="Google Secret Manager adapter is unavailable",
    ),
)


class ProviderUnavailable(ValueError):
    pass


class UnknownProvider(ValueError):
    pass


def provider_catalog() -> tuple[ProviderDefinition, ...]:
    disabled = disabled_provider_keys()
    if not disabled:
        return CATALOG
    return tuple(
        definition
        if provider_key(definition.category, definition.key) not in disabled
        else ProviderDefinition(
            category=definition.category,
            key=definition.key,
            label=definition.label,
            status=ProviderStatus.UNAVAILABLE,
            adapter=definition.adapter,
            capabilities=definition.capabilities,
            credential_requirements=definition.credential_requirements,
            config_keys=definition.config_keys,
            unavailable_reason="disabled by KUBEHEAL_DISABLED_PROVIDERS",
        )
        for definition in CATALOG
    )


def catalog_body() -> dict[str, list[dict[str, object]]]:
    grouped: dict[str, list[dict[str, object]]] = {
        category.value: [] for category in ProviderCategory
    }
    for definition in provider_catalog():
        grouped[definition.category.value].append(definition.to_body())
    return grouped


def get_provider(category: ProviderCategory | str, key: str) -> ProviderDefinition:
    normalized_category = ProviderCategory(str(category))
    normalized_key = normalize_key(key)
    for definition in provider_catalog():
        if definition.category == normalized_category and definition.key == normalized_key:
            return definition
    raise UnknownProvider(
        f"unknown {normalized_category.value} provider: {key}; supported: "
        f"{', '.join(provider_keys_for_category(normalized_category))}"
    )


def require_available_provider(category: ProviderCategory | str, key: str) -> ProviderDefinition:
    definition = get_provider(category, key)
    if definition.status != ProviderStatus.AVAILABLE:
        reason = definition.unavailable_reason or "provider adapter is not available"
        raise ProviderUnavailable(
            f"{definition.category.value} provider '{definition.key}' unavailable: {reason}"
        )
    return definition


def validate_provider_selection(
    selection: dict[str, str | None],
    *,
    credential_refs: dict[str, str] | None = None,
    capabilities: tuple[str, ...] = (),
) -> dict[str, object]:
    refs = credential_refs or {}
    errors: list[str] = []
    warnings: list[str] = []
    selected: dict[str, dict[str, object]] = {}

    for category in ProviderCategory:
        key = selection.get(category.value)
        if not key:
            continue
        try:
            definition = require_available_provider(category, key)
        except (ProviderUnavailable, UnknownProvider) as exc:
            errors.append(str(exc))
            continue
        selected[category.value] = definition.to_body()
        warnings.extend(credential_warnings(definition, refs, capabilities))

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "selected": selected,
    }


def credential_warnings(
    definition: ProviderDefinition, refs: dict[str, str], capabilities: tuple[str, ...]
) -> list[str]:
    warnings: list[str] = []
    requested = set(capabilities)
    for requirement in definition.credential_requirements:
        if requirement.required_for and not requested.intersection(requirement.required_for):
            continue
        ref = refs.get(requirement.key)
        if not ref:
            warnings.append(
                f"{definition.category.value} provider '{definition.key}' needs credential_ref "
                f"'{requirement.key}' for {', '.join(requirement.required_for)}"
            )
            continue
        if not ref.startswith(requirement.ref_prefixes):
            warnings.append(
                f"credential_ref '{requirement.key}' for provider '{definition.key}' must start with "
                f"{', '.join(requirement.ref_prefixes)}"
            )
    return warnings


def provider_keys_for_category(category: ProviderCategory) -> tuple[str, ...]:
    return tuple(
        definition.key for definition in provider_catalog() if definition.category == category
    )


def disabled_provider_keys() -> set[str]:
    raw = env(PROVIDER_DISABLED_ENV, "")
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


def provider_key(category: ProviderCategory, key: str) -> str:
    return f"{category.value}:{normalize_key(key)}"


def normalize_key(key: str) -> str:
    return key.strip().lower().replace("_", "-")
