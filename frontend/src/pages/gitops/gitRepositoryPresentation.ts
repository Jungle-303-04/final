import type { MessageKey } from "../../shared/i18n";

export type GitRepositoryProvider = "github" | "gitlab" | "bitbucket" | "generic";

const providerHosts: readonly [GitRepositoryProvider, string][] = [
  ["github", "github.com"],
  ["gitlab", "gitlab.com"],
  ["bitbucket", "bitbucket.org"],
];

export function detectGitRepositoryProvider(repository: string): GitRepositoryProvider {
  const normalized = repository.trim().toLowerCase();
  return providerHosts.find(([, host]) => normalized.includes(host))?.[0] ?? "generic";
}

export function isGitRepositoryReference(repository: string): boolean {
  const normalized = repository.trim();
  if (!normalized || /\s/.test(normalized)) return false;
  if (/^(https?:\/\/|ssh:\/\/)/i.test(normalized)) {
    try {
      return new URL(normalized).pathname.split("/").filter(Boolean).length >= 2;
    } catch {
      return false;
    }
  }
  if (/^git@/i.test(normalized)) {
    const segments = normalized.split(":");
    const path = segments[segments.length - 1] ?? "";
    return path.split("/").filter(Boolean).length >= 2;
  }
  return /^[^/]+\/[^/]+(?:\.git)?$/.test(normalized);
}

export function gitProviderLabelKey(provider: GitRepositoryProvider): MessageKey {
  if (provider === "github") return "workflows.target.provider.github";
  if (provider === "gitlab") return "workflows.target.provider.gitlab";
  if (provider === "bitbucket") return "workflows.target.provider.bitbucket";
  return "workflows.target.providerGeneric";
}
