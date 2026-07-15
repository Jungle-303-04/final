// External Secrets Operator cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import {
  getExternalSecretStatus,
  getExternalSecretStore,
  getExternalSecretRefreshInterval,
  getExternalSecretLastSync,
  getExternalSecretProvider,
  getClusterExternalSecretStatus,
  getClusterExternalSecretNamespaceCount,
  getClusterExternalSecretFailedCount,
  getSecretStoreStatus,
  getSecretStoreProviderType,
  getClusterSecretStoreStatus,
} from '../resource-utils-eso'

export function ExternalSecretCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getExternalSecretStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'store': {
      const store = getExternalSecretStore(resource)
      return (
        <span className="text-sm text-muted-foreground truncate block" title={`${store.kind}/${store.name}`}>
          {store.name}
        </span>
      )
    }
    case 'provider': {
      const provider = getExternalSecretProvider(resource)
      return <span className="text-sm text-muted-foreground truncate block">{provider}</span>
    }
    case 'refreshInterval': {
      const interval = getExternalSecretRefreshInterval(resource)
      return <span className="text-sm text-muted-foreground">{interval}</span>
    }
    case 'lastSync': {
      const lastSync = getExternalSecretLastSync(resource)
      return <span className="text-sm text-muted-foreground">{lastSync}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ClusterExternalSecretCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getClusterExternalSecretStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'namespaces': {
      const count = getClusterExternalSecretNamespaceCount(resource)
      return <span className="text-sm text-muted-foreground">{count > 0 ? count : '-'}</span>
    }
    case 'failed': {
      const failedCount = getClusterExternalSecretFailedCount(resource)
      if (failedCount > 0) {
        return <span className="text-sm text-destructive font-medium">{failedCount}</span>
      }
      return <span className="text-sm text-muted-foreground">0</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function SecretStoreCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getSecretStoreStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'provider': {
      const provider = getSecretStoreProviderType(resource)
      return <span className="text-sm text-muted-foreground truncate block">{provider}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ClusterSecretStoreCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getClusterSecretStoreStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'provider': {
      const provider = getSecretStoreProviderType(resource)
      return <span className="text-sm text-muted-foreground truncate block">{provider}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
