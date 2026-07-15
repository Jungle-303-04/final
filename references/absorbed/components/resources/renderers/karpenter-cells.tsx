// Karpenter cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import { Tooltip } from '../../ui/Tooltip'
import { CAPACITY_TYPE_BADGE } from '../../../utils/badge-colors'
import {
  getNodePoolStatus,
  getNodePoolNodeClassRef,
  getNodePoolLimits,
  getNodePoolDisruptionPolicy,
  getNodeClaimStatus,
  getNodeClaimInstanceType,
  getNodeClaimNodeName,
  getNodeClaimNodePoolRef,
  getEC2NodeClassStatus,
  getEC2NodeClassAMI,
  getEC2NodeClassRole,
  getEC2NodeClassVolumeSize,
} from '../resource-utils-karpenter'

export function NodePoolCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getNodePoolStatus(resource)
      return (
        <Tooltip content={status.text}>
          <span className={cn('badge truncate max-w-[140px]', status.color)}>
            {status.text}
          </span>
        </Tooltip>
      )
    }
    case 'nodeClass': {
      const ref = getNodePoolNodeClassRef(resource)
      return <span className="text-sm text-muted-foreground">{ref}</span>
    }
    case 'limits': {
      const limits = getNodePoolLimits(resource)
      return (
        <Tooltip content={limits}>
          <span className="text-sm text-muted-foreground truncate block">{limits}</span>
        </Tooltip>
      )
    }
    case 'disruption': {
      const policy = getNodePoolDisruptionPolicy(resource)
      return <span className="text-sm text-muted-foreground">{policy}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function NodeClaimCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getNodeClaimStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'instanceType': {
      const instanceType = getNodeClaimInstanceType(resource)
      return <span className="text-sm text-muted-foreground">{instanceType}</span>
    }
    case 'nodeName': {
      const name = getNodeClaimNodeName(resource)
      return <span className="text-sm text-muted-foreground">{name}</span>
    }
    case 'nodePool': {
      const pool = getNodeClaimNodePoolRef(resource)
      return <span className="text-sm text-muted-foreground">{pool}</span>
    }
    case 'capacityType': {
      const ct = resource.metadata?.labels?.['karpenter.sh/capacity-type'] || '-'
      return (
        <span className={cn('badge-sm', CAPACITY_TYPE_BADGE[ct] || '')}>
          {ct}
        </span>
      )
    }
    case 'zone': {
      const zone = resource.metadata?.labels?.['topology.kubernetes.io/zone'] || '-'
      return <span className="text-sm text-muted-foreground">{zone}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function EC2NodeClassCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getEC2NodeClassStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'ami': {
      const ami = getEC2NodeClassAMI(resource)
      return <span className="text-sm text-muted-foreground">{ami}</span>
    }
    case 'role': {
      const role = getEC2NodeClassRole(resource)
      return (
        <Tooltip content={role}>
          <span className="text-sm text-muted-foreground truncate block">{role}</span>
        </Tooltip>
      )
    }
    case 'volumeSize': {
      const size = getEC2NodeClassVolumeSize(resource)
      return <span className="text-sm text-muted-foreground">{size}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
