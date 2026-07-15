import { useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Shield, ChevronDown, Copy, Check } from 'lucide-react'

// RestrictedState is the shared "you can't see this because of Kubernetes RBAC"
// surface — distinct from EmptyState (which covers healthy / filtered / no-data).
// It never claims WHY the SAR failed (Opsia can't prove tier vs custom-role vs
// disabled-value from a denied check); it states the fact and hands the operator
// something to forward to whoever administers their cluster.
//
// Reused across the resource list, topology, search, and the per-cluster access
// summary so the messaging can't drift.

interface Props {
  /** Display kind, e.g. "Node". */
  kindLabel: string
  /** API group for the kind ("" for core). Used to build the example RBAC. */
  group?: string
  /** Plural resource name, e.g. "nodes". When omitted the snippet uses a
   *  placeholder the admin fills in. */
  resource?: string
  /** Why the kind is hidden. "rbac_denied" (default): Opsia can read it but the
   *  user's RBAC can't — show the grant request. "unavailable": Opsia's
   *  ServiceAccount can't read it at all (not installed / SA RBAC / feature off)
   *  — a user grant won't help, so show a different message and no snippet. */
  reason?: 'rbac_denied' | 'unavailable' | string
  /** Tightens spacing for inline/embedded use (topology overlay, etc.). */
  compact?: boolean
  className?: string
}

function buildRbacRequest(group: string, resource: string): string {
  // resource is the placeholder when we don't have a confident API plural
  // (e.g. a CRD deep-link before discovery resolves the kind) — use a generic
  // role name rather than opsia-read-<Kind>.
  const roleName = resource === '<resource>' ? 'opsia-read-access' : `opsia-read-${resource}`
  return [
    `apiVersion: rbac.authorization.k8s.io/v1`,
    `kind: ClusterRole`,
    `metadata:`,
    `  name: ${roleName}`,
    `rules:`,
    `  - apiGroups: ["${group}"]`,
    `    resources: ["${resource}"]`,
    `    verbs: ["get", "list", "watch"]`,
    `---`,
    `apiVersion: rbac.authorization.k8s.io/v1`,
    `kind: ClusterRoleBinding`,
    `metadata:`,
    `  name: ${roleName}`,
    `roleRef:`,
    `  apiGroup: rbac.authorization.k8s.io`,
    `  kind: ClusterRole`,
    `  name: ${roleName}`,
    `subjects:`,
    `  - kind: Group        # or User / ServiceAccount`,
    `    name: <your-identity>`,
    `    apiGroup: rbac.authorization.k8s.io`,
  ].join('\n')
}

export function RestrictedState({ kindLabel, group = '', resource, reason, compact, className }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const isUnavailable = reason === 'unavailable'

  // RBAC `resources` must be the lowercase API plural. selectedKind.name is
  // that in normal use, but a CRD deep-link can transiently carry the Kind
  // (e.g. "HTTPRoute") before discovery resolves it — emitting that would
  // produce a snippet that doesn't grant access. Only inline the resource when
  // it looks like a valid resource name; otherwise leave a clear placeholder.
  const validResource = resource && /^[a-z0-9.-]+$/.test(resource) ? resource : '<resource>'
  const snippet = buildRbacRequest(group, validResource)

  const copy = () => {
    navigator.clipboard.writeText(snippet).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      },
      () => {},
    )
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center text-muted-foreground/75',
        compact ? 'p-4' : 'p-6',
        className,
      )}
    >
      <Shield className="w-8 h-8 text-warning mb-2" />
      {isUnavailable ? (
        // Opsia's ServiceAccount can't read this kind — a user grant won't help.
        <>
          <p className="text-muted-foreground font-medium">{kindLabel} isn't available here</p>
          <p className="text-sm mt-1 max-w-md">
            Opsia can't read {kindLabel} resources in this cluster — the type may not be installed,
            or read access isn't granted to Opsia's ServiceAccount (some kinds, like RBAC objects
            and Secrets, are off unless enabled in the Opsia chart). Granting your own identity
            access won't surface it.
          </p>
        </>
      ) : (
        <>
          <p className="text-muted-foreground font-medium">You don't have access to {kindLabel}</p>
          <p className="text-sm mt-1 max-w-md">
            Your Kubernetes RBAC doesn't allow listing {kindLabel} resources in this cluster. This
            isn't an empty cluster — Opsia is hiding what your identity can't read.
          </p>

          <div className="mt-3 w-full max-w-md">
            <button
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1.5 mx-auto text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronDown className={cn('w-4 h-4 transition-transform', expanded && 'rotate-180')} />
              How to get access
            </button>

            {expanded && (
              <div className="mt-2 text-left">
                <p className="text-xs text-muted-foreground/75 mb-2">
                  Apply this, or send it to whoever administers your cluster, to grant your identity
                  read access.
                </p>
                <div className="rounded-md border border-border bg-background overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-popover">
                    <span className="text-xs text-muted-foreground/75">
                      ClusterRole + ClusterRoleBinding
                    </span>
                    <button
                      onClick={copy}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-xs p-3 max-h-72 overflow-auto text-muted-foreground">
                    {snippet}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
