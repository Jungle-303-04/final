// DRA (resource.k8s.io) cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import {
  getResourceClaimStatus,
  getResourceClaimDeviceClasses,
  getResourceClaimAllocation,
  getResourceClaimReservedFor,
  getResourceClaimTemplateDeviceClasses,
  getDeviceClassSelectorCount,
  getResourceSliceDriver,
  getResourceSlicePool,
  getResourceSliceNode,
  getResourceSliceDeviceCount,
} from '../resource-utils-dra'

export function ResourceClaimCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getResourceClaimStatus(resource)
      return <span className={cn('badge', status.color)}>{status.text}</span>
    }
    case 'deviceClass': {
      const classes = getResourceClaimDeviceClasses(resource)
      return <span className="text-sm text-muted-foreground truncate block">{classes.join(', ') || '-'}</span>
    }
    case 'allocated': {
      const results = getResourceClaimAllocation(resource)
      if (results.length === 0) return <span className="text-sm text-muted-foreground/75">-</span>
      return <span className="text-sm text-muted-foreground truncate block">{results[0].driver}{results.length > 1 ? ` +${results.length - 1}` : ''}</span>
    }
    case 'reservedFor': {
      const reserved = getResourceClaimReservedFor(resource)
      if (reserved.length === 0) return <span className="text-sm text-muted-foreground/75">-</span>
      return <span className="text-sm text-muted-foreground truncate block">{reserved.map(r => r.name).join(', ')}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ResourceClaimTemplateCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'deviceClass': {
      const classes = getResourceClaimTemplateDeviceClasses(resource)
      return <span className="text-sm text-muted-foreground truncate block">{classes.join(', ') || '-'}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function DeviceClassCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'selectors': {
      // 0 is meaningful — a class with no selectors matches all devices
      const count = getDeviceClassSelectorCount(resource)
      return <span className="text-sm text-muted-foreground">{count}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ResourceSliceCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'driver':
      return <span className="text-sm text-muted-foreground truncate block">{getResourceSliceDriver(resource)}</span>
    case 'pool':
      return <span className="text-sm text-muted-foreground truncate block">{getResourceSlicePool(resource)}</span>
    case 'node': {
      const node = getResourceSliceNode(resource)
      return <span className="text-sm text-muted-foreground truncate block">{node || '-'}</span>
    }
    case 'devices':
      return <span className="text-sm text-muted-foreground">{getResourceSliceDeviceCount(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
