// Prometheus Operator cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import {
  getServiceMonitorStatus,
  getServiceMonitorEndpointCount,
  getServiceMonitorJobLabel,
  getServiceMonitorSelector,
  getPrometheusRuleStatus,
  getPrometheusRuleGroupCount,
  getPrometheusRuleTotalRules,
  getPodMonitorStatus,
  getPodMonitorEndpointCount,
  getPodMonitorSelector,
} from '../resource-utils-prometheus'

export function ServiceMonitorCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getServiceMonitorStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'endpoints':
      return <span className="text-sm text-muted-foreground">{getServiceMonitorEndpointCount(resource)}</span>
    case 'jobLabel':
      return <span className="text-sm text-muted-foreground truncate block">{getServiceMonitorJobLabel(resource)}</span>
    case 'selector':
      return <span className="text-sm text-muted-foreground truncate block">{getServiceMonitorSelector(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function PrometheusRuleCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getPrometheusRuleStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'groups':
      return <span className="text-sm text-muted-foreground">{getPrometheusRuleGroupCount(resource)}</span>
    case 'rules':
      return <span className="text-sm text-muted-foreground">{getPrometheusRuleTotalRules(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function PodMonitorCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getPodMonitorStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'endpoints':
      return <span className="text-sm text-muted-foreground">{getPodMonitorEndpointCount(resource)}</span>
    case 'selector':
      return <span className="text-sm text-muted-foreground truncate block">{getPodMonitorSelector(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
