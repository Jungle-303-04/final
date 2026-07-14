import type { ProductSession } from "./authContract";

export interface SessionPresentation {
  avatarLabel: string;
  displayName: string;
  fullIdentity: string;
  secondaryLabel: string;
}

export function presentProductSession(session: ProductSession): SessionPresentation {
  const displayName = firstCanonical(session.displayName, session.email)
    ?? abbreviatedIdentity(session.userId);
  const fullIdentity = firstCanonical(session.displayName, session.email, session.userId)
    ?? session.userId;
  const secondaryLabel = firstCanonical(
    session.email !== displayName ? session.email : null,
    session.roles[0],
  ) ?? session.workspaceId;

  return {
    avatarLabel: avatarLabel(displayName),
    displayName,
    fullIdentity,
    secondaryLabel,
  };
}

export function abbreviatedIdentity(value: string): string {
  const canonical = value.trim();
  if (canonical.length <= 8) return canonical;
  return `${canonical.slice(0, 8)}…`;
}

function firstCanonical(...values: readonly (string | null | undefined)[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function avatarLabel(value: string): string {
  const parts = value.split(/[\s@._-]+/u).filter(Boolean);
  const label = parts.length > 1
    ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
    : value.slice(0, 2);
  return label.toLocaleUpperCase();
}
