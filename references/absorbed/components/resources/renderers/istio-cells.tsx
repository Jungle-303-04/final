// Istio cell components for ResourcesView table

import { cn } from '@/shared/lib/cn'
import { Badge, type BadgeSeverity } from '../../ui/Badge'
import {
  getVirtualServiceStatus,
  getVirtualServiceHosts,
  getVirtualServiceGateways,
  getVirtualServiceRouteCount,
  getDestinationRuleStatus,
  getDestinationRuleHost,
  getDestinationRuleSubsetCount,
  getDestinationRuleLoadBalancer,
  getIstioGatewayStatus,
  getIstioGatewayServerCount,
  getIstioGatewaySelectorString,
  getServiceEntryStatus,
  getServiceEntryHosts,
  getServiceEntryLocation,
  getServiceEntryPortsString,
  getPeerAuthenticationStatus,
  getPeerAuthenticationMode,
  getPeerAuthenticationSelectorString,
  getAuthorizationPolicyStatus,
  getAuthorizationPolicyAction,
  getAuthorizationPolicyRuleCount,
} from '../resource-utils-istio'

const modeSeverity: Record<string, BadgeSeverity> = {
  STRICT: 'success',
  PERMISSIVE: 'warning',
  DISABLE: 'error',
}

const actionSeverity: Record<string, BadgeSeverity> = {
  ALLOW: 'success',
  DENY: 'error',
  CUSTOM: 'info',
  AUDIT: 'warning',
}

export function VirtualServiceCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getVirtualServiceStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'hosts': {
      const hosts = getVirtualServiceHosts(resource)
      return <span className="text-sm text-muted-foreground truncate block">{hosts}</span>
    }
    case 'gateways': {
      const gateways = getVirtualServiceGateways(resource)
      return <span className="text-sm text-muted-foreground truncate block">{gateways}</span>
    }
    case 'routes': {
      const count = getVirtualServiceRouteCount(resource)
      return <span className="text-sm text-muted-foreground">{count}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function DestinationRuleCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getDestinationRuleStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'host': {
      const host = getDestinationRuleHost(resource)
      return <span className="text-sm text-muted-foreground truncate block">{host}</span>
    }
    case 'subsets': {
      const count = getDestinationRuleSubsetCount(resource)
      return <span className="text-sm text-muted-foreground">{count > 0 ? count : '-'}</span>
    }
    case 'loadBalancer': {
      const lb = getDestinationRuleLoadBalancer(resource)
      return <span className="text-sm text-muted-foreground">{lb}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function IstioGatewayCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getIstioGatewayStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'servers': {
      const count = getIstioGatewayServerCount(resource)
      return <span className="text-sm text-muted-foreground">{count}</span>
    }
    case 'selector': {
      const selector = getIstioGatewaySelectorString(resource)
      return <span className="text-sm text-muted-foreground truncate block">{selector}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ServiceEntryCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getServiceEntryStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'hosts': {
      const hosts = getServiceEntryHosts(resource)
      return <span className="text-sm text-muted-foreground truncate block">{hosts}</span>
    }
    case 'location': {
      const location = getServiceEntryLocation(resource)
      return (
        <Badge tone={location === 'MESH_EXTERNAL' ? 'accent2' : 'accent1'}>
          {location === 'MESH_EXTERNAL' ? 'External' : 'Internal'}
        </Badge>
      )
    }
    case 'ports': {
      const ports = getServiceEntryPortsString(resource)
      return <span className="text-sm text-muted-foreground truncate block">{ports}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function PeerAuthenticationCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getPeerAuthenticationStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'mode': {
      const mode = getPeerAuthenticationMode(resource)
      return (
        <Badge severity={modeSeverity[mode] ?? 'neutral'}>
          {mode}
        </Badge>
      )
    }
    case 'selector': {
      const selector = getPeerAuthenticationSelectorString(resource)
      return <span className="text-sm text-muted-foreground truncate block">{selector}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function AuthorizationPolicyCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getAuthorizationPolicyStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'action': {
      const action = getAuthorizationPolicyAction(resource)
      return (
        <Badge severity={actionSeverity[action] ?? 'neutral'}>
          {action}
        </Badge>
      )
    }
    case 'rules': {
      const count = getAuthorizationPolicyRuleCount(resource)
      return <span className="text-sm text-muted-foreground">{count}</span>
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
