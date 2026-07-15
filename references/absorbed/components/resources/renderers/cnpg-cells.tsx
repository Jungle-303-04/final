// CloudNativePG cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import {
  getCNPGClusterStatus,
  getCNPGClusterInstances,
  getCNPGClusterPrimary,
  getCNPGClusterImageTag,
  getCNPGClusterStorage,
  getCNPGBackupStatus,
  getCNPGBackupCluster,
  getCNPGBackupMethod,
  getCNPGBackupDuration,
  getCNPGScheduledBackupStatus,
  getCNPGScheduledBackupCluster,
  getCNPGScheduleCron,
  getCNPGScheduledBackupLastSchedule,
  getCNPGScheduledBackupIsSuspended,
  getCNPGPoolerStatus,
  getCNPGPoolerCluster,
  getCNPGPoolerType,
  getCNPGPoolerMode,
  getCNPGPoolerInstances,
} from '../resource-utils-cnpg'

export function CNPGClusterCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getCNPGClusterStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'instances': {
      const instances = getCNPGClusterInstances(resource)
      const desired = resource.spec?.instances ?? 0
      const ready = resource.status?.readyInstances ?? 0
      return (
        <span className={cn('text-sm', ready < desired ? 'text-warning' : 'text-muted-foreground')}>
          {instances}
        </span>
      )
    }
    case 'primary': {
      const primary = getCNPGClusterPrimary(resource)
      return <span className="text-sm text-muted-foreground truncate block">{primary}</span>
    }
    case 'image': {
      const tag = getCNPGClusterImageTag(resource)
      return <span className="text-sm text-muted-foreground font-mono">{tag}</span>
    }
    case 'storage': {
      const storage = getCNPGClusterStorage(resource)
      return <span className="text-sm text-muted-foreground">{storage}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CNPGBackupCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getCNPGBackupStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'cluster': {
      const cluster = getCNPGBackupCluster(resource)
      return <span className="text-sm text-muted-foreground">{cluster}</span>
    }
    case 'method': {
      const method = getCNPGBackupMethod(resource)
      return <span className="text-sm text-muted-foreground">{method}</span>
    }
    case 'duration': {
      const duration = getCNPGBackupDuration(resource)
      return <span className="text-sm text-muted-foreground">{duration}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CNPGScheduledBackupCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getCNPGScheduledBackupStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'cluster': {
      const cluster = getCNPGScheduledBackupCluster(resource)
      return <span className="text-sm text-muted-foreground">{cluster}</span>
    }
    case 'schedule': {
      const cron = getCNPGScheduleCron(resource)
      return <span className="text-sm text-muted-foreground font-mono">{cron}</span>
    }
    case 'lastSchedule': {
      const last = getCNPGScheduledBackupLastSchedule(resource)
      return <span className="text-sm text-muted-foreground">{last}</span>
    }
    case 'suspended': {
      const suspended = getCNPGScheduledBackupIsSuspended(resource)
      return (
        <span className={cn('text-sm', suspended ? 'text-warning' : 'text-muted-foreground/75')}>
          {suspended ? 'Yes' : '-'}
        </span>
      )
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CNPGPoolerCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getCNPGPoolerStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'cluster': {
      const cluster = getCNPGPoolerCluster(resource)
      return <span className="text-sm text-muted-foreground">{cluster}</span>
    }
    case 'type': {
      const type = getCNPGPoolerType(resource)
      return (
        <span className={cn(
          'badge-sm',
          type === 'rw' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
        )}>
          {type}
        </span>
      )
    }
    case 'poolMode': {
      const mode = getCNPGPoolerMode(resource)
      return <span className="text-sm text-muted-foreground">{mode}</span>
    }
    case 'instances': {
      const instances = getCNPGPoolerInstances(resource)
      return <span className="text-sm text-muted-foreground">{instances}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
