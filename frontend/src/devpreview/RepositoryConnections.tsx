import { GithubIcon } from "./brandIcons";
import type { RepositoryGroup } from "./repositoryRegistry";

/**
 * Repository-level summary backed by observed application bindings.
 *
 * Disconnect remains intentionally unavailable until the backend exposes a
 * capability-gated repository disconnect contract.
 */
export function RepositoryConnections({
  groups,
  onOpenRepository,
  selectedRepository,
  expandedRepositories,
}: {
  groups: readonly RepositoryGroup[];
  onOpenRepository?: (repositoryRef: string) => void;
  onDisconnected?: (repositoryRef: string) => void;
  selectedRepository?: string | null;
  expandedRepositories?: readonly string[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {groups.map((group) => {
        const repositoryKey = group.repositoryRef.toLowerCase();
        const selected = expandedRepositories
          ? expandedRepositories.some((repositoryRef) => repositoryRef.toLowerCase() === repositoryKey)
          : selectedRepository?.toLowerCase() === repositoryKey;
        const applicationsId = `repository-${group.repositoryRef.replace(/[^a-zA-Z0-9_-]/g, "-")}-applications`;

        return (
          <div key={group.repositoryRef}>
            <button
              type="button"
              aria-expanded={selected}
              aria-controls={applicationsId}
              aria-label={`${group.repositoryRef} GitOps ${selected ? "닫기" : "열기"}`}
              onClick={() => onOpenRepository?.(group.repositoryRef)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                minWidth: 0,
                minHeight: 54,
                padding: "6px 7px",
                border: selected ? "1px solid rgba(37,99,235,.45)" : "1px solid transparent",
                borderRadius: 9,
                background: selected ? "rgba(37,99,235,.09)" : "rgba(34,197,94,.08)",
                boxShadow: selected ? "0 0 0 2px rgba(37,99,235,.08)" : "none",
                color: "#0f172a",
                textAlign: "left",
                cursor: onOpenRepository ? "pointer" : "default",
              }}
            >
              <GithubIcon size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <strong
                  title={group.repositoryRef}
                  style={{
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    color: "#0f172a",
                    fontSize: 12,
                  }}
                >
                  {group.repositoryRef}
                </strong>
                <span style={{ display: "block", marginTop: 2, color: "#16803b", fontSize: 11, lineHeight: 1.35 }}>
                  연결됨 · 앱 {group.applications.length}개
                </span>
              </span>
              <span aria-hidden="true" style={{ color: "#64748b", fontSize: 13, transform: selected ? "rotate(180deg)" : "none", transition: "transform 150ms ease" }}>
                ▾
              </span>
            </button>

            {selected && (
              <ul
                id={applicationsId}
                style={{ display: "grid", gap: 4, margin: "4px 0 7px", padding: "0 7px 0 31px", listStyle: "none" }}
              >
                {group.applications.map((application) => (
                  <li
                    key={application.id}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, minWidth: 0, padding: "9px 10px", border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff" }}
                  >
                    <span style={{ minWidth: 0 }}>
                      <strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#111827", fontSize: 12 }}>
                        {application.name}
                      </strong>
                      <span style={{ display: "block", marginTop: 2, overflow: "hidden", color: "#9aa0aa", fontSize: 11, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {application.manifestPath ?? "매니페스트 경로 관측 안 됨"}
                      </span>
                    </span>
                    <span style={{ flex: "0 0 auto", color: "#9aa0aa", fontSize: 11 }}>
                      {application.branch ?? "브랜치 관측 안 됨"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
