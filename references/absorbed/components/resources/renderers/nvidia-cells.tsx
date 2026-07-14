// NVIDIA GPU Operator (nvidia.com) cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import {
  getNvidiaClusterPolicyStatus,
  getNvidiaClusterPolicyEnabledComponents,
  getNvidiaClusterPolicyMigStrategy,
  getNvidiaDriverStatus,
  getNvidiaDriverType,
  getNvidiaDriverVersion,
} from '../resource-utils-nvidia'

export function NvidiaClusterPolicyCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getNvidiaClusterPolicyStatus(resource)
      return <span className={cn('badge', status.color)}>{status.text}</span>
    }
    case 'components': {
      const enabled = getNvidiaClusterPolicyEnabledComponents(resource).filter(c => c.enabled)
      return <span className="text-sm text-muted-foreground truncate block">{enabled.length ? enabled.map(c => c.label).join(', ') : '-'}</span>
    }
    case 'mig':
      return <span className="text-sm text-muted-foreground">{getNvidiaClusterPolicyMigStrategy(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function NvidiaDriverCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getNvidiaDriverStatus(resource)
      return <span className={cn('badge', status.color)}>{status.text}</span>
    }
    case 'driverType':
      return <span className="text-sm text-muted-foreground">{getNvidiaDriverType(resource)}</span>
    case 'version':
      return <span className="text-sm text-muted-foreground">{getNvidiaDriverVersion(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
