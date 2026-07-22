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
}: {
  groups: readonly RepositoryGroup[];
  onOpenRepository?: (repositoryRef: string) => void;
  onDisconnected?: (repositoryRef: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {groups.map((group) => (
        <button
          key={group.repositoryRef}
          type="button"
          aria-label={`${group.repositoryRef} GitOps 열기`}
          onClick={() => onOpenRepository?.(group.repositoryRef)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            minWidth: 0,
            minHeight: 54,
            padding: "6px 7px",
            border: 0,
            borderRadius: 9,
            background: "rgba(34,197,94,.08)",
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
            <span
              style={{
                display: "block",
                marginTop: 2,
                color: "#16803b",
                fontSize: 11,
                lineHeight: 1.35,
              }}
            >
              연결됨 · 앱 {group.applications.length}개
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
