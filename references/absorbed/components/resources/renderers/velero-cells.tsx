// Velero cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import {
  getBackupStatus,
  getBackupStorageLocation,
  getBackupIncludedNamespaces,
  getBackupDuration,
  getBackupExpiry,
  getBackupErrors,
  getBackupWarnings,
  getRestoreStatus,
  getRestoreBackupName,
  getRestoreIncludedNamespaces,
  getRestoreDuration,
  getRestoreErrors,
  getScheduleStatus,
  getScheduleCron,
  getScheduleLastBackup,
  getSchedulePaused,
  getBSLStatus,
  getBSLProvider,
  getBSLBucket,
  getBSLDefault,
  getBSLLastValidation,
} from '../resource-utils-velero'

export function BackupCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getBackupStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'storageLocation': {
      const loc = getBackupStorageLocation(resource)
      return <span className="text-sm text-muted-foreground truncate block">{loc}</span>
    }
    case 'namespaces': {
      const ns = getBackupIncludedNamespaces(resource)
      return <span className="text-sm text-muted-foreground">{ns.length > 0 ? ns.length : '*'}</span>
    }
    case 'duration': {
      const dur = getBackupDuration(resource)
      return <span className="text-sm text-muted-foreground">{dur}</span>
    }
    case 'expiry': {
      const exp = getBackupExpiry(resource)
      const isExpired = exp === 'Expired'
      return <span className={cn('text-sm', isExpired ? 'text-destructive' : 'text-muted-foreground')}>{exp}</span>
    }
    case 'errors': {
      const errors = getBackupErrors(resource)
      const warnings = getBackupWarnings(resource)
      if (errors === 0 && warnings === 0) {
        return <span className="text-sm text-muted-foreground/75">-</span>
      }
      return (
        <span className="text-sm">
          {errors > 0 && <span className="text-destructive">{errors}E</span>}
          {errors > 0 && warnings > 0 && <span className="text-muted-foreground/75"> / </span>}
          {warnings > 0 && <span className="text-warning">{warnings}W</span>}
        </span>
      )
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function RestoreCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getRestoreStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'backupName': {
      const name = getRestoreBackupName(resource)
      return <span className="text-sm text-muted-foreground truncate block">{name}</span>
    }
    case 'namespaces': {
      const ns = getRestoreIncludedNamespaces(resource)
      return <span className="text-sm text-muted-foreground">{ns.length > 0 ? ns.length : '*'}</span>
    }
    case 'duration': {
      const dur = getRestoreDuration(resource)
      return <span className="text-sm text-muted-foreground">{dur}</span>
    }
    case 'errors': {
      const errors = getRestoreErrors(resource)
      if (errors === 0) {
        return <span className="text-sm text-muted-foreground/75">-</span>
      }
      return <span className="text-sm text-destructive">{errors}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ScheduleCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getScheduleStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'schedule': {
      const cron = getScheduleCron(resource)
      return <span className="text-sm text-muted-foreground font-mono">{cron}</span>
    }
    case 'lastBackup': {
      const last = getScheduleLastBackup(resource)
      return <span className="text-sm text-muted-foreground">{last}</span>
    }
    case 'paused': {
      const paused = getSchedulePaused(resource)
      return <span className={cn('text-sm', paused ? 'text-warning' : 'text-muted-foreground/75')}>{paused ? 'Yes' : '-'}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function BackupStorageLocationCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getBSLStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'provider': {
      const provider = getBSLProvider(resource)
      return <span className="text-sm text-muted-foreground">{provider}</span>
    }
    case 'bucket': {
      const bucket = getBSLBucket(resource)
      return <span className="text-sm text-muted-foreground truncate block">{bucket}</span>
    }
    case 'default': {
      const isDefault = getBSLDefault(resource)
      return <span className={cn('text-sm', isDefault ? 'text-blue-400' : 'text-muted-foreground/75')}>{isDefault ? 'Yes' : '-'}</span>
    }
    case 'lastValidation': {
      const lastVal = getBSLLastValidation(resource)
      return <span className="text-sm text-muted-foreground">{lastVal}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
