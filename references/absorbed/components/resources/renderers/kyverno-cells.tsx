// Kyverno / Policy Report cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import {
  getPolicyReportStatus,
  getPolicyReportSummary,
  getKyvernoPolicyStatus,
  getKyvernoPolicyAction,
  getKyvernoPolicyRuleCount,
} from '../resource-utils-kyverno'

export function PolicyReportCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getPolicyReportStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'pass': {
      const summary = getPolicyReportSummary(resource)
      return <span className={cn('text-sm', summary.pass > 0 ? 'text-success' : 'text-muted-foreground/75')}>{summary.pass}</span>
    }
    case 'fail': {
      const summary = getPolicyReportSummary(resource)
      return <span className={cn('text-sm', summary.fail > 0 ? 'text-destructive font-medium' : 'text-muted-foreground/75')}>{summary.fail}</span>
    }
    case 'warn': {
      const summary = getPolicyReportSummary(resource)
      return <span className={cn('text-sm', summary.warn > 0 ? 'text-warning' : 'text-muted-foreground/75')}>{summary.warn}</span>
    }
    case 'error': {
      const summary = getPolicyReportSummary(resource)
      return <span className={cn('text-sm', summary.error > 0 ? 'text-destructive font-medium' : 'text-muted-foreground/75')}>{summary.error}</span>
    }
    case 'skip': {
      const summary = getPolicyReportSummary(resource)
      return <span className={cn('text-sm', summary.skip > 0 ? 'text-blue-400' : 'text-muted-foreground/75')}>{summary.skip}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ClusterPolicyReportCell({ resource, column }: { resource: any; column: string }) {
  // Same rendering logic as PolicyReport
  return <PolicyReportCell resource={resource} column={column} />
}

export function KyvernoPolicyCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getKyvernoPolicyStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'action': {
      const action = getKyvernoPolicyAction(resource)
      return (
        <span className={cn(
          'badge',
          action === 'Enforce' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning',
        )}>
          {action}
        </span>
      )
    }
    case 'rules': {
      const count = getKyvernoPolicyRuleCount(resource)
      return <span className="text-sm text-muted-foreground">{count}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ClusterPolicyCell({ resource, column }: { resource: any; column: string }) {
  // Same rendering logic as KyvernoPolicy
  return <KyvernoPolicyCell resource={resource} column={column} />
}
