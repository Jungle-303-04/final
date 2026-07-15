// Cluster API (CAPI) cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import { Tooltip } from '../../ui/Tooltip'
import {
  getClusterStatus, getClusterClass, getClusterVersion, getClusterCPReplicas, getClusterWorkerReplicas,
  getMachineStatus, getMachineRole, getMachineClusterName, getMachineNodeRef, getMachineVersion,
  getMachineDeploymentStatus, getMachineDeploymentReplicas, getMachineDeploymentVersion,
  getMachineSetStatus, getMachineSetReplicas,
  getMachinePoolStatus, getMachinePoolReplicas,
  getKCPStatus, getKCPReplicas, getKCPVersion, getKCPInitialized,
  getClusterClassStatus,
  getMachineHealthCheckStatus, getMachineHealthCheckHealthy, getMachineHealthCheckClusterName,
  getClusterProvider,
} from '../resource-utils-capi'

function StatusBadge({ resource, getStatus }: { resource: any; getStatus: (r: any) => { text: string; color: string } }) {
  const status = getStatus(resource)
  return (
    <Tooltip content={status.text}>
      <span className={cn('badge truncate max-w-[140px]', status.color)}>{status.text}</span>
    </Tooltip>
  )
}

function TextCell({ value }: { value: string }) {
  return <span className="text-sm text-muted-foreground">{value}</span>
}

export function CAPIClusterCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'phase':
      return <StatusBadge resource={resource} getStatus={getClusterStatus} />
    case 'provider':
      return <TextCell value={getClusterProvider(resource)} />
    case 'class':
      return <TextCell value={getClusterClass(resource)} />
    case 'cpReplicas':
      return <TextCell value={getClusterCPReplicas(resource)} />
    case 'workerReplicas':
      return <TextCell value={getClusterWorkerReplicas(resource)} />
    case 'version':
      return <TextCell value={getClusterVersion(resource)} />
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CAPIMachineCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'phase':
      return <StatusBadge resource={resource} getStatus={getMachineStatus} />
    case 'cluster':
      return <TextCell value={getMachineClusterName(resource)} />
    case 'role': {
      const role = getMachineRole(resource)
      return (
        <span className={cn('badge badge-sm', role === 'Control Plane'
          ? 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-700/40'
          : 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-700/40'
        )}>{role}</span>
      )
    }
    case 'node':
      return <TextCell value={getMachineNodeRef(resource)} />
    case 'version':
      return <TextCell value={getMachineVersion(resource)} />
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CAPIMachineDeploymentCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'phase':
      return <StatusBadge resource={resource} getStatus={getMachineDeploymentStatus} />
    case 'cluster':
      return <TextCell value={getMachineClusterName(resource)} />
    case 'ready':
      return <TextCell value={getMachineDeploymentReplicas(resource)} />
    case 'version':
      return <TextCell value={getMachineDeploymentVersion(resource)} />
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CAPIMachineSetCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'phase':
      return <StatusBadge resource={resource} getStatus={getMachineSetStatus} />
    case 'cluster':
      return <TextCell value={getMachineClusterName(resource)} />
    case 'ready':
      return <TextCell value={getMachineSetReplicas(resource)} />
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CAPIMachinePoolCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'phase':
      return <StatusBadge resource={resource} getStatus={getMachinePoolStatus} />
    case 'cluster':
      return <TextCell value={getMachineClusterName(resource)} />
    case 'ready':
      return <TextCell value={getMachinePoolReplicas(resource)} />
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CAPIKubeadmControlPlaneCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status':
      return <StatusBadge resource={resource} getStatus={getKCPStatus} />
    case 'cluster':
      return <TextCell value={getMachineClusterName(resource)} />
    case 'ready':
      return <TextCell value={getKCPReplicas(resource)} />
    case 'initialized': {
      const init = getKCPInitialized(resource)
      return (
        <span className={cn('badge badge-sm', init
          ? 'bg-success text-success border-success dark:bg-success/50 dark:text-success dark:border-success/40'
          : 'bg-warning text-warning border-warning dark:bg-warning/50 dark:text-warning dark:border-warning/40'
        )}>{init ? 'Yes' : 'No'}</span>
      )
    }
    case 'version':
      return <TextCell value={getKCPVersion(resource)} />
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CAPIClusterClassCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status':
      return <StatusBadge resource={resource} getStatus={getClusterClassStatus} />
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CAPIMachineHealthCheckCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status':
      return <StatusBadge resource={resource} getStatus={getMachineHealthCheckStatus} />
    case 'cluster':
      return <TextCell value={getMachineHealthCheckClusterName(resource)} />
    case 'healthy':
      return <TextCell value={getMachineHealthCheckHealthy(resource)} />
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
