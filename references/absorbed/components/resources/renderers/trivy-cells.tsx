// Trivy Operator cell components for ResourcesView table — extracted from ResourcesView.tsx

import { cn } from '@/shared/lib/cn'
import { Tooltip } from '../../ui/Tooltip'
import {
  getVulnerabilityReportSummary,
  getVulnerabilityReportContainer,
  getVulnerabilityReportImage,
  getConfigAuditReportSummary,
  getConfigAuditReportStatus,
  getExposedSecretReportSummary,
  getExposedSecretReportContainer,
  getExposedSecretReportImage,
  getRbacAssessmentReportSummary,
  getRbacAssessmentReportStatus,
  getClusterComplianceReportStatus,
  getSbomReportStatus,
  getSbomReportContainer,
} from '../resource-utils'

// Shared severity count cell
export function TrivySeverityCell({ summary, column }: { summary: { critical: number; high: number; medium: number; low: number }; column: string }) {
  switch (column) {
    case 'critical':
      return <span className={cn('text-sm font-medium', summary.critical > 0 ? 'text-destructive' : 'text-muted-foreground/75')}>{summary.critical}</span>
    case 'high':
      return <span className={cn('text-sm font-medium', summary.high > 0 ? 'text-orange-400' : 'text-muted-foreground/75')}>{summary.high}</span>
    case 'medium':
      return <span className={cn('text-sm font-medium', summary.medium > 0 ? 'text-warning' : 'text-muted-foreground/75')}>{summary.medium}</span>
    case 'low':
      return <span className={cn('text-sm font-medium', summary.low > 0 ? 'text-blue-400' : 'text-muted-foreground/75')}>{summary.low}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function VulnerabilityReportCell({ resource, column }: { resource: any; column: string }) {
  const summary = getVulnerabilityReportSummary(resource)
  if (['critical', 'high', 'medium', 'low'].includes(column)) return <TrivySeverityCell summary={summary} column={column} />
  switch (column) {
    case 'container':
      return <span className="text-sm text-muted-foreground">{getVulnerabilityReportContainer(resource)}</span>
    case 'image': {
      const image = getVulnerabilityReportImage(resource)
      return (
        <Tooltip content={image}>
          <span className="text-sm text-muted-foreground truncate block">{image}</span>
        </Tooltip>
      )
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ConfigAuditReportCell({ resource, column }: { resource: any; column: string }) {
  const summary = getConfigAuditReportSummary(resource)
  if (['critical', 'high', 'medium', 'low'].includes(column)) return <TrivySeverityCell summary={summary} column={column} />
  switch (column) {
    case 'status': {
      const status = getConfigAuditReportStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ExposedSecretReportCell({ resource, column }: { resource: any; column: string }) {
  const summary = getExposedSecretReportSummary(resource)
  if (['critical', 'high', 'medium', 'low'].includes(column)) return <TrivySeverityCell summary={summary} column={column} />
  switch (column) {
    case 'container':
      return <span className="text-sm text-muted-foreground">{getExposedSecretReportContainer(resource)}</span>
    case 'image': {
      const image = getExposedSecretReportImage(resource)
      return (
        <Tooltip content={image}>
          <span className="text-sm text-muted-foreground truncate block">{image}</span>
        </Tooltip>
      )
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function RbacAssessmentReportCell({ resource, column }: { resource: any; column: string }) {
  const summary = getRbacAssessmentReportSummary(resource)
  if (['critical', 'high', 'medium', 'low'].includes(column)) return <TrivySeverityCell summary={summary} column={column} />
  switch (column) {
    case 'status': {
      const status = getRbacAssessmentReportStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ClusterComplianceReportCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'title':
      return <span className="text-sm text-muted-foreground truncate block">{resource.spec?.compliance?.title || '-'}</span>
    case 'status': {
      const status = getClusterComplianceReportStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'pass': {
      const count = resource.status?.summary?.passCount ?? null
      return <span className={cn('text-sm font-medium', count != null && count > 0 ? 'text-success' : 'text-muted-foreground/75')}>{count != null ? count : '-'}</span>
    }
    case 'fail': {
      const count = resource.status?.summary?.failCount ?? null
      return <span className={cn('text-sm font-medium', count != null && count > 0 ? 'text-destructive' : 'text-muted-foreground/75')}>{count != null ? count : '-'}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function SbomReportCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'container':
      return <span className="text-sm text-muted-foreground">{getSbomReportContainer(resource)}</span>
    case 'components': {
      const count = resource.report?.summary?.componentsCount ?? null
      return <span className="text-sm text-muted-foreground">{count != null ? count : '-'}</span>
    }
    case 'status': {
      const status = getSbomReportStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
