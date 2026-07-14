import { memo, useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  AlertTriangle,
  Zap
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import type { NodeKind, TopologyNode } from '../../types'
import { getTopologyIcon } from '../../utils/resource-icons'

// Resource kind configuration
const RESOURCE_KINDS: {
  kind: NodeKind
  label: string
  icon: LucideIcon
  color: string
  category: 'gitops' | 'workloads' | 'networking' | 'config' | 'scaling' | 'custom'
}[] = [
  // GitOps (ArgoCD + FluxCD)
  { kind: 'Application', label: 'Application', icon: getTopologyIcon('Application'), color: 'text-orange-400', category: 'gitops' },
  { kind: 'Kustomization', label: 'Kustomization', icon: getTopologyIcon('Kustomization'), color: 'text-sky-400', category: 'gitops' },
  { kind: 'HelmRelease', label: 'HelmRelease', icon: getTopologyIcon('HelmRelease'), color: 'text-sky-400', category: 'gitops' },
  { kind: 'GitRepository', label: 'GitRepository', icon: getTopologyIcon('GitRepository'), color: 'text-teal-400', category: 'gitops' },

  // Networking
  { kind: 'Ingress', label: 'Ingress', icon: getTopologyIcon('Ingress'), color: 'text-purple-400', category: 'networking' },
  { kind: 'Gateway', label: 'Gateway', icon: getTopologyIcon('Gateway'), color: 'text-purple-400', category: 'networking' },
  { kind: 'HTTPRoute', label: 'HTTPRoute', icon: getTopologyIcon('HTTPRoute'), color: 'text-purple-300', category: 'networking' },
  { kind: 'GRPCRoute', label: 'GRPCRoute', icon: getTopologyIcon('GRPCRoute'), color: 'text-purple-300', category: 'networking' },
  { kind: 'TCPRoute', label: 'TCPRoute', icon: getTopologyIcon('TCPRoute'), color: 'text-purple-300', category: 'networking' },
  { kind: 'TLSRoute', label: 'TLSRoute', icon: getTopologyIcon('TLSRoute'), color: 'text-purple-300', category: 'networking' },
  { kind: 'Service', label: 'Service', icon: getTopologyIcon('Service'), color: 'text-blue-400', category: 'networking' },

  // Workloads
  { kind: 'Deployment', label: 'Deployment', icon: getTopologyIcon('Deployment'), color: 'text-success', category: 'workloads' },
  { kind: 'Rollout', label: 'Rollout', icon: getTopologyIcon('Rollout'), color: 'text-success', category: 'workloads' },
  { kind: 'DaemonSet', label: 'DaemonSet', icon: getTopologyIcon('DaemonSet'), color: 'text-teal-400', category: 'workloads' },
  { kind: 'StatefulSet', label: 'StatefulSet', icon: getTopologyIcon('StatefulSet'), color: 'text-cyan-400', category: 'workloads' },
  { kind: 'ReplicaSet', label: 'ReplicaSet', icon: getTopologyIcon('ReplicaSet'), color: 'text-success', category: 'workloads' },
  { kind: 'Pod', label: 'Pod', icon: getTopologyIcon('Pod'), color: 'text-lime-400', category: 'workloads' },
  { kind: 'PodGroup', label: 'Pod Group', icon: getTopologyIcon('PodGroup'), color: 'text-lime-400', category: 'workloads' },
  { kind: 'Job', label: 'Job', icon: getTopologyIcon('Job'), color: 'text-orange-400', category: 'workloads' },
  { kind: 'CronJob', label: 'CronJob', icon: getTopologyIcon('CronJob'), color: 'text-orange-300', category: 'workloads' },
  { kind: 'Workflow', label: 'Workflow', icon: getTopologyIcon('Workflow'), color: 'text-purple-400', category: 'workloads' },
  { kind: 'CronWorkflow', label: 'CronWorkflow', icon: getTopologyIcon('CronWorkflow'), color: 'text-purple-300', category: 'workloads' },

  // Config
  { kind: 'ConfigMap', label: 'ConfigMap', icon: getTopologyIcon('ConfigMap'), color: 'text-warning', category: 'config' },
  { kind: 'Secret', label: 'Secret', icon: getTopologyIcon('Secret'), color: 'text-destructive', category: 'config' },
  { kind: 'ServiceAccount', label: 'Service Account', icon: getTopologyIcon('ServiceAccount'), color: 'text-fuchsia-400', category: 'config' },
  { kind: 'SealedSecret', label: 'Sealed Secret', icon: getTopologyIcon('SealedSecret'), color: 'text-violet-400', category: 'config' },
  { kind: 'ServiceMonitor', label: 'Service Monitor', icon: getTopologyIcon('ServiceMonitor'), color: 'text-sky-400', category: 'config' },
  { kind: 'PodMonitor', label: 'Pod Monitor', icon: getTopologyIcon('PodMonitor'), color: 'text-sky-400', category: 'config' },
  { kind: 'WorkflowTemplate', label: 'WorkflowTemplate', icon: getTopologyIcon('WorkflowTemplate'), color: 'text-purple-300', category: 'config' },
  { kind: 'ClusterWorkflowTemplate', label: 'ClusterWorkflowTemplate', icon: getTopologyIcon('ClusterWorkflowTemplate'), color: 'text-purple-300', category: 'config' },

  // Scaling
  { kind: 'HorizontalPodAutoscaler', label: 'HPA', icon: getTopologyIcon('HorizontalPodAutoscaler'), color: 'text-pink-400', category: 'scaling' },
  { kind: 'ScaledJob', label: 'ScaledJob', icon: getTopologyIcon('ScaledJob'), color: 'text-pink-300', category: 'scaling' },

  // Knative
  { kind: 'KnativeService', label: 'Knative Service', icon: getTopologyIcon('KnativeService'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'KnativeConfiguration', label: 'Knative Config', icon: getTopologyIcon('KnativeConfiguration'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'KnativeRevision', label: 'Revision', icon: getTopologyIcon('KnativeRevision'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'KnativeRoute', label: 'Route', icon: getTopologyIcon('KnativeRoute'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'Broker', label: 'Broker', icon: getTopologyIcon('Broker'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'Channel', label: 'Channel', icon: getTopologyIcon('Channel'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'Trigger', label: 'Trigger', icon: getTopologyIcon('Trigger'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'PingSource', label: 'PingSource', icon: getTopologyIcon('PingSource'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'ApiServerSource', label: 'ApiServerSource', icon: getTopologyIcon('ApiServerSource'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'ContainerSource', label: 'ContainerSource', icon: getTopologyIcon('ContainerSource'), color: 'text-fuchsia-400', category: 'custom' },
  { kind: 'SinkBinding', label: 'SinkBinding', icon: getTopologyIcon('SinkBinding'), color: 'text-fuchsia-400', category: 'custom' },

  // Traefik
  { kind: 'IngressRoute', label: 'IngressRoute', icon: getTopologyIcon('IngressRoute'), color: 'text-cyan-400', category: 'networking' },
  { kind: 'IngressRouteTCP', label: 'TCP Route', icon: getTopologyIcon('IngressRouteTCP'), color: 'text-cyan-400', category: 'networking' },
  { kind: 'IngressRouteUDP', label: 'UDP Route', icon: getTopologyIcon('IngressRouteUDP'), color: 'text-cyan-400', category: 'networking' },
  { kind: 'Middleware', label: 'Middleware', icon: getTopologyIcon('Middleware'), color: 'text-cyan-400', category: 'custom' },
  { kind: 'MiddlewareTCP', label: 'MW TCP', icon: getTopologyIcon('MiddlewareTCP'), color: 'text-cyan-400', category: 'custom' },
  { kind: 'TraefikService', label: 'Traefik Svc', icon: getTopologyIcon('TraefikService'), color: 'text-cyan-400', category: 'custom' },
  { kind: 'ServersTransport', label: 'Transport', icon: getTopologyIcon('ServersTransport'), color: 'text-cyan-400', category: 'custom' },
  { kind: 'ServersTransportTCP', label: 'Transport TCP', icon: getTopologyIcon('ServersTransportTCP'), color: 'text-cyan-400', category: 'custom' },
  { kind: 'TLSOption', label: 'TLS Option', icon: getTopologyIcon('TLSOption'), color: 'text-cyan-400', category: 'custom' },
  { kind: 'TLSStore', label: 'TLS Store', icon: getTopologyIcon('TLSStore'), color: 'text-cyan-400', category: 'custom' },

  // Contour
  { kind: 'HTTPProxy', label: 'HTTPProxy', icon: getTopologyIcon('HTTPProxy'), color: 'text-violet-400', category: 'networking' },

  // Cluster API
  { kind: 'CAPICluster', label: 'CAPI Cluster', icon: getTopologyIcon('CAPICluster'), color: 'text-indigo-400', category: 'custom' },
  { kind: 'MachineDeployment', label: 'Machine Deploy', icon: getTopologyIcon('MachineDeployment'), color: 'text-indigo-400', category: 'custom' },
  { kind: 'MachineSet', label: 'MachineSet', icon: getTopologyIcon('MachineSet'), color: 'text-indigo-400', category: 'custom' },
  { kind: 'Machine', label: 'Machine', icon: getTopologyIcon('Machine'), color: 'text-indigo-400', category: 'custom' },
  { kind: 'MachinePool', label: 'MachinePool', icon: getTopologyIcon('MachinePool'), color: 'text-indigo-400', category: 'custom' },
  { kind: 'KubeadmControlPlane', label: 'Control Plane', icon: getTopologyIcon('KubeadmControlPlane'), color: 'text-indigo-400', category: 'custom' },
  { kind: 'ClusterClass', label: 'ClusterClass', icon: getTopologyIcon('ClusterClass'), color: 'text-indigo-400', category: 'custom' },
  { kind: 'MachineHealthCheck', label: 'Health Check', icon: getTopologyIcon('MachineHealthCheck'), color: 'text-indigo-400', category: 'custom' },
  // AWS CAPI infrastructure
  { kind: 'AWSManagedControlPlane', label: 'AWS Control Plane', icon: getTopologyIcon('AWSManagedControlPlane'), color: 'text-warning', category: 'custom' },
  { kind: 'AWSManagedMachinePool', label: 'AWS Machine Pool', icon: getTopologyIcon('AWSManagedMachinePool'), color: 'text-warning', category: 'custom' },
  { kind: 'AWSMachine', label: 'AWS Machine', icon: getTopologyIcon('AWSMachine'), color: 'text-warning', category: 'custom' },
  { kind: 'EKSConfig', label: 'EKS Config', icon: getTopologyIcon('EKSConfig'), color: 'text-warning', category: 'custom' },
]

const CATEGORIES = [
  { id: 'gitops', label: 'GitOps' },
  { id: 'networking', label: 'Networking' },
  { id: 'workloads', label: 'Workloads' },
  { id: 'config', label: 'Configuration' },
  { id: 'scaling', label: 'Scaling' },
  { id: 'custom', label: 'Custom Resources' },
] as const

interface TopologyFilterSidebarProps {
  nodes: TopologyNode[]
  visibleKinds: Set<NodeKind>
  onToggleKind: (kind: NodeKind) => void
  onShowAll: () => void
  onHideAll: () => void
  collapsed?: boolean
  onToggleCollapse?: () => void
  hiddenKinds?: string[] // Kinds auto-hidden for performance in large clusters
  onEnableHiddenKind?: (kind: string) => void // Callback to re-enable a hidden kind
}

export const TopologyFilterSidebar = memo(function TopologyFilterSidebar({
  nodes,
  visibleKinds,
  onToggleKind,
  onShowAll,
  onHideAll,
  collapsed = false,
  onToggleCollapse,
  hiddenKinds = [],
  onEnableHiddenKind,
}: TopologyFilterSidebarProps) {
  // Track which hidden kinds the user has confirmed to show (performance warning acknowledged)
  const [confirmedKinds, setConfirmedKinds] = useState<Set<string>>(new Set())
  // Track which kind is pending confirmation
  const [pendingConfirmKind, setPendingConfirmKind] = useState<string | null>(null)
  // Count nodes by kind
  const kindCounts = useMemo(() => {
    const counts = new Map<NodeKind, number>()
    for (const node of nodes) {
      counts.set(node.kind, (counts.get(node.kind) || 0) + 1)
    }
    return counts
  }, [nodes])

  // Filter to only show kinds that exist in the topology
  // Also include dynamic CRD kinds not in RESOURCE_KINDS
  const availableKinds = useMemo(() => {
    // Start with known kinds that exist
    const known = RESOURCE_KINDS.filter(k => kindCounts.has(k.kind))

    // Find CRD kinds not in RESOURCE_KINDS (dynamic CRDs)
    const knownKindSet = new Set(RESOURCE_KINDS.map(k => k.kind))
    const dynamicKinds: typeof RESOURCE_KINDS = []

    for (const [kind] of kindCounts) {
      if (!knownKindSet.has(kind) && kind !== 'Internet') {
        dynamicKinds.push({
          kind: kind as NodeKind,
          label: kind, // Use the kind name as label
          icon: getTopologyIcon(kind), // Returns Puzzle for unknown kinds
          color: 'text-gray-400',
          category: 'custom',
        })
      }
    }

    return [...known, ...dynamicKinds]
  }, [kindCounts])

  // Group by category
  const kindsByCategory = useMemo(() => {
    const grouped = new Map<string, typeof availableKinds>()
    for (const category of CATEGORIES) {
      const kinds = availableKinds.filter(k => k.category === category.id)
      if (kinds.length > 0) {
        grouped.set(category.id, kinds)
      }
    }
    return grouped
  }, [availableKinds])

  const allVisible = availableKinds.every(k => visibleKinds.has(k.kind))
  const noneVisible = availableKinds.every(k => !visibleKinds.has(k.kind))

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1 bg-card/90 backdrop-blur border-r border-border">
        <button
          onClick={onToggleCollapse}
          className="p-2 text-muted-foreground hover:text-foreground hover:bg-popover rounded-lg transition-colors"
          title="Expand filters"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="mt-3 flex flex-col gap-2">
          {availableKinds.slice(0, 6).map(({ kind, icon: Icon, color }) => {
            const isVisible = visibleKinds.has(kind)
            return (
              <button
                key={kind}
                onClick={() => onToggleKind(kind)}
                className={cn(
                  'p-1.5 rounded transition-colors',
                  isVisible
                    ? 'bg-popover text-foreground'
                    : 'text-muted-foreground/75 hover:text-muted-foreground'
                )}
                title={kind}
              >
                <Icon className={cn('w-4 h-4', isVisible && color)} />
              </button>
            )
          })}
          {availableKinds.length > 6 && (
            <span className="text-xs text-muted-foreground/75 text-center">
              +{availableKinds.length - 6}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="w-56 flex flex-col bg-card/90 backdrop-blur border-r border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-medium text-muted-foreground">Filters</span>
        <button
          onClick={onToggleCollapse}
          className="p-1 text-muted-foreground hover:text-foreground hover:bg-popover rounded transition-colors"
          title="Collapse sidebar"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Quick actions */}
      <div className="flex gap-1 px-3 py-2 border-b border-border">
        <button
          onClick={onShowAll}
          disabled={allVisible}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors',
            allVisible
              ? 'bg-popover/50 text-muted-foreground/75 cursor-not-allowed'
              : 'bg-popover text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <Eye className="w-3 h-3" />
          Show All
        </button>
        <button
          onClick={onHideAll}
          disabled={noneVisible}
          className={cn(
            'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors',
            noneVisible
              ? 'bg-popover/50 text-muted-foreground/75 cursor-not-allowed'
              : 'bg-popover text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <EyeOff className="w-3 h-3" />
          Hide All
        </button>
      </div>

      {/* Kind toggles by category */}
      <div className="flex-1 overflow-y-auto">
        {CATEGORIES.map(category => {
          const kinds = kindsByCategory.get(category.id)
          if (!kinds || kinds.length === 0) return null

          return (
            <div key={category.id} className="px-2 py-2">
              <div className="text-xs font-medium text-muted-foreground/75 uppercase tracking-wider px-1 mb-1">
                {category.label}
              </div>
              <div className="space-y-0.5">
                {kinds.map(({ kind, label, icon: Icon, color }) => {
                  const count = kindCounts.get(kind) || 0
                  const isVisible = visibleKinds.has(kind)

                  return (
                    <button
                      key={kind}
                      onClick={() => onToggleKind(kind)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors',
                        isVisible
                          ? 'bg-popover/70 text-foreground'
                          : 'text-muted-foreground hover:bg-popover/40 hover:text-muted-foreground'
                      )}
                    >
                      <Icon className={cn('w-4 h-4 shrink-0', isVisible ? color : 'text-muted-foreground/75')} />
                      <span className="flex-1 text-sm truncate">{label}</span>
                      <span className={cn(
                        'text-xs px-1.5 py-0.5 rounded',
                        isVisible ? 'bg-accent text-muted-foreground' : 'bg-popover/50 text-muted-foreground/75'
                      )}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Auto-hidden kinds section (for large clusters) */}
        {hiddenKinds.length > 0 && (
          <div className="px-2 py-2 border-t border-border/50">
            <div className="flex items-center gap-1 text-xs font-medium text-warning/80 uppercase tracking-wider px-1 mb-1">
              <Zap className="w-3 h-3" />
              Hidden for Performance
            </div>
            <div className="space-y-0.5">
              {hiddenKinds.map(kindName => {
                const kindConfig = RESOURCE_KINDS.find(k => k.kind === kindName)
                if (!kindConfig) return null

                const { kind, label, icon: Icon } = kindConfig
                const isConfirmed = confirmedKinds.has(kind)
                const isPending = pendingConfirmKind === kind

                return (
                  <div key={kind} className="relative">
                    <button
                      onClick={() => {
                        if (isConfirmed) {
                          // Already confirmed - just toggle
                          onEnableHiddenKind?.(kind)
                        } else {
                          // Show confirmation
                          setPendingConfirmKind(kind)
                        }
                      }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors text-muted-foreground/75 hover:bg-warning/10 hover:text-warning/80"
                      title="Hidden for performance - click to show"
                    >
                      <Icon className="w-4 h-4 shrink-0 opacity-50" />
                      <span className="flex-1 text-sm truncate opacity-70">{label}</span>
                      <EyeOff className="w-3 h-3 opacity-50" />
                    </button>

                    {/* Confirmation popup */}
                    {isPending && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-card border border-warning/30 rounded-lg shadow-lg p-3">
                        <div className="flex items-start gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                          <div className="text-xs text-muted-foreground">
                            <p className="font-medium text-warning">Performance Warning</p>
                            <p className="mt-1">
                              Showing {label}s may slow down the topology view in large clusters.
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setConfirmedKinds(prev => new Set(prev).add(kind))
                              setPendingConfirmKind(null)
                              onEnableHiddenKind?.(kind)
                            }}
                            className="flex-1 px-2 py-1 text-xs bg-warning/20 text-warning hover:bg-warning/30 rounded transition-colors"
                          >
                            Show Anyway
                          </button>
                          <button
                            onClick={() => setPendingConfirmKind(null)}
                            className="flex-1 px-2 py-1 text-xs bg-popover text-muted-foreground hover:bg-accent rounded transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-2 border-t border-border bg-card/50">
        {(() => {
          // Total and visible both sum over availableKinds (the kinds the user
          // can filter). nodes.length would include the synthetic Internet node,
          // which isn't a filterable kind, so the two wouldn't reconcile and a
          // "filtered" count would show even with nothing hidden.
          const sumKinds = (ks: typeof availableKinds) =>
            ks.reduce((sum, k) => sum + (kindCounts.get(k.kind) || 0), 0)
          const total = sumKinds(availableKinds)
          const visible = sumKinds(availableKinds.filter(k => visibleKinds.has(k.kind)))
          const hidden = total - visible
          const filteredOutKinds = availableKinds.filter(k => !visibleKinds.has(k.kind) && (kindCounts.get(k.kind) || 0) > 0)
          return (
            <div
              className="text-xs text-muted-foreground/75"
              title={filteredOutKinds.length > 0
                ? `Hidden by kind filter: ${filteredOutKinds.map(k => `${kindCounts.get(k.kind)} ${k.kind}`).join(', ')}`
                : undefined}
            >
              Showing {visible} of {total} resources
              {hidden > 0 && (
                <span className="ml-1 text-warning cursor-help">· {hidden} filtered</span>
              )}
            </div>
          )
        })()}
      </div>
    </div>
  )
})
