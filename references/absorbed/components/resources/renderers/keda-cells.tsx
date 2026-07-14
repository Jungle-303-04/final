// KEDA cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import {
  getScaledObjectStatus,
  getScaledObjectTarget,
  getScaledObjectReplicas,
  getScaledObjectTriggerTypes,
  getScaledJobStatus,
  getScaledJobTarget,
  getScaledJobStrategy,
  getScaledJobTriggerTypes,
  getTriggerAuthSecretRefCount,
  getTriggerAuthEnvCount,
  getTriggerAuthHasVault,
} from '../resource-utils-keda'

export function ScaledObjectCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getScaledObjectStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'target': {
      const target = getScaledObjectTarget(resource)
      return <span className="text-sm text-muted-foreground">{target}</span>
    }
    case 'replicas': {
      const replicas = getScaledObjectReplicas(resource)
      return <span className="text-sm text-muted-foreground">{replicas}</span>
    }
    case 'triggerTypes': {
      const types = getScaledObjectTriggerTypes(resource)
      return <span className="text-sm text-muted-foreground truncate block">{types}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ScaledJobCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getScaledJobStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'target': {
      const target = getScaledJobTarget(resource)
      return <span className="text-sm text-muted-foreground">{target}</span>
    }
    case 'strategy': {
      const strategy = getScaledJobStrategy(resource)
      return <span className="text-sm text-muted-foreground">{strategy}</span>
    }
    case 'triggerTypes': {
      const types = getScaledJobTriggerTypes(resource)
      return <span className="text-sm text-muted-foreground truncate block">{types}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function TriggerAuthenticationCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'secretTargetRef': {
      const count = getTriggerAuthSecretRefCount(resource)
      return <span className="text-sm text-muted-foreground">{count > 0 ? count : '-'}</span>
    }
    case 'env': {
      const count = getTriggerAuthEnvCount(resource)
      return <span className="text-sm text-muted-foreground">{count > 0 ? count : '-'}</span>
    }
    case 'hashiCorpVault': {
      const hasVault = getTriggerAuthHasVault(resource)
      return <span className="text-sm text-muted-foreground">{hasVault ? 'Yes' : '-'}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ClusterTriggerAuthenticationCell({ resource, column }: { resource: any; column: string }) {
  // Same rendering logic as TriggerAuthentication
  return <TriggerAuthenticationCell resource={resource} column={column} />
}
