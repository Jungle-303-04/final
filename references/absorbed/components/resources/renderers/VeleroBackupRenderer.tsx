import { Archive, Clock, HardDrive, Filter } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Section, PropertyList, Property, ConditionsSection, AlertBanner } from '../../ui/drawer-components'
import {
  getBackupStatus,
  getBackupStorageLocation,
  getBackupIncludedNamespaces,
  getBackupExcludedNamespaces,
  getBackupIncludedResources,
  getBackupExcludedResources,
  getBackupDuration,
  getBackupItemCount,
  getBackupExpiry,
  getBackupErrors,
  getBackupWarnings,
  getBackupValidationErrors,
  getBackupTTL,
  getBackupSnapshotVolumes,
  getBackupDefaultVolumesToFsBackup,
  getBackupVolumeSnapshotLocations,
} from '../resource-utils-velero'
import { formatAge } from '../resource-utils'

interface VeleroBackupRendererProps {
  data: any
}

export function VeleroBackupRenderer({ data }: VeleroBackupRendererProps) {
  const status = data.status || {}
  const conditions = status.conditions || []

  const backupStatus = getBackupStatus(data)
  const errors = getBackupErrors(data)
  const warnings = getBackupWarnings(data)
  const validationErrors = getBackupValidationErrors(data)
  const includedNamespaces = getBackupIncludedNamespaces(data)
  const excludedNamespaces = getBackupExcludedNamespaces(data)
  const includedResources = getBackupIncludedResources(data)
  const excludedResources = getBackupExcludedResources(data)
  const vslLocations = getBackupVolumeSnapshotLocations(data)

  const isFailed = backupStatus.level === 'unhealthy'
  const isPartiallyFailed = backupStatus.text === 'PartiallyFailed'
  const isInProgress = backupStatus.text === 'InProgress' || backupStatus.text === 'Uploading'

  // Progress data
  const progress = status.progress
  const itemsBacked = progress?.itemsBackedUp ?? 0
  const totalItems = progress?.totalItems ?? 0
  const progressPercent = totalItems > 0 ? Math.round((itemsBacked / totalItems) * 100) : 0

  return (
    <>
      {/* Problem alerts */}
      {(isFailed || isPartiallyFailed) && (
        <AlertBanner
          variant="error"
          title={isFailed ? 'Backup Failed' : 'Backup Partially Failed'}
          message={status.failureReason || `${errors} error(s) occurred during backup.`}
          items={validationErrors.length > 0 ? validationErrors : undefined}
        />
      )}
      {warnings > 0 && !isFailed && (
        <AlertBanner
          variant="warning"
          title={`${warnings} Warning(s)`}
          message={`Backup completed with ${warnings} warning(s).`}
        />
      )}

      {/* Status section */}
      <Section title="Status" icon={Archive} defaultExpanded>
        <PropertyList>
          <Property label="Phase" value={
            <span className={cn('badge', backupStatus.color)}>
              {backupStatus.text}
            </span>
          } />
          {status.startTimestamp && (
            <Property label="Started" value={formatAge(status.startTimestamp) + ' ago'} />
          )}
          {status.completionTimestamp && (
            <Property label="Completed" value={formatAge(status.completionTimestamp) + ' ago'} />
          )}
          <Property label="Duration" value={getBackupDuration(data)} />
          <Property label="Expiration" value={getBackupExpiry(data)} />
          <Property label="Errors" value={
            errors > 0
              ? <span className="text-destructive dark:text-destructive font-medium">{errors}</span>
              : '0'
          } />
          <Property label="Warnings" value={
            warnings > 0
              ? <span className="text-warning dark:text-warning font-medium">{warnings}</span>
              : '0'
          } />
        </PropertyList>
      </Section>

      {/* Progress section (if in progress) */}
      {isInProgress && progress && (
        <Section title="Progress" defaultExpanded>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Items backed up</span>
              <span className="text-foreground font-medium">{getBackupItemCount(data)}</span>
            </div>
            <div className="w-full bg-popover rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground/75 text-right">{progressPercent}%</div>
          </div>
        </Section>
      )}

      {/* Scope section */}
      {(includedNamespaces.length > 0 || excludedNamespaces.length > 0 || includedResources.length > 0 || excludedResources.length > 0 || data.spec?.labelSelector) && (
        <Section title="Scope" icon={Filter} defaultExpanded>
          <PropertyList>
            {includedNamespaces.length > 0 && (
              <Property label="Included Namespaces" value={
                <div className="flex flex-wrap gap-1">
                  {includedNamespaces.map((ns: string) => (
                    <span key={ns} className="badge-sm bg-accent text-muted-foreground">{ns}</span>
                  ))}
                </div>
              } />
            )}
            {includedNamespaces.length === 0 && (
              <Property label="Included Namespaces" value="* (all)" />
            )}
            {excludedNamespaces.length > 0 && (
              <Property label="Excluded Namespaces" value={
                <div className="flex flex-wrap gap-1">
                  {excludedNamespaces.map((ns: string) => (
                    <span key={ns} className="badge-sm bg-destructive/10 text-destructive">{ns}</span>
                  ))}
                </div>
              } />
            )}
            {includedResources.length > 0 && (
              <Property label="Included Resources" value={
                <div className="flex flex-wrap gap-1">
                  {includedResources.map((r: string) => (
                    <span key={r} className="badge-sm bg-accent text-muted-foreground">{r}</span>
                  ))}
                </div>
              } />
            )}
            {excludedResources.length > 0 && (
              <Property label="Excluded Resources" value={
                <div className="flex flex-wrap gap-1">
                  {excludedResources.map((r: string) => (
                    <span key={r} className="badge-sm bg-destructive/10 text-destructive">{r}</span>
                  ))}
                </div>
              } />
            )}
            {data.spec?.labelSelector && (
              <Property label="Label Selector" value={
                <span className="inline-code break-all">
                  {JSON.stringify(data.spec.labelSelector)}
                </span>
              } />
            )}
          </PropertyList>
        </Section>
      )}

      {/* Storage section */}
      <Section title="Storage" icon={HardDrive} defaultExpanded>
        <PropertyList>
          <Property label="Storage Location" value={getBackupStorageLocation(data)} />
          {vslLocations.length > 0 && (
            <Property label="Volume Snapshot Locations" value={
              <div className="flex flex-wrap gap-1">
                {vslLocations.map((loc: string) => (
                  <span key={loc} className="badge-sm bg-accent text-muted-foreground">{loc}</span>
                ))}
              </div>
            } />
          )}
        </PropertyList>
      </Section>

      {/* Options section */}
      <Section title="Options" icon={Clock}>
        <PropertyList>
          <Property label="TTL" value={getBackupTTL(data)} />
          <Property label="Snapshot Volumes" value={getBackupSnapshotVolumes(data)} />
          <Property label="Default FS Backup" value={getBackupDefaultVolumesToFsBackup(data)} />
        </PropertyList>
      </Section>

      <ConditionsSection conditions={conditions} />
    </>
  )
}
