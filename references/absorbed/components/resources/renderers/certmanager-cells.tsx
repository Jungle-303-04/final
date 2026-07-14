// cert-manager cell components for ResourcesView table — extracted from ResourcesView.tsx

import { cn } from '@/shared/lib/cn'
import { Tooltip } from '../../ui/Tooltip'
import {
  getCertificateStatus,
  getCertificateDomains,
  getCertificateIssuer,
  getCertificateExpiry,
  getCertificateRequestStatus,
  getCertificateRequestIssuer,
  getCertificateRequestApproved,
  getClusterIssuerStatus,
  getClusterIssuerType,
  getIssuerStatus,
  getIssuerType,
  getOrderState,
  getOrderDomains,
  getOrderIssuer,
  getChallengeState,
  getChallengeType,
  getChallengeDomain,
  getChallengePresented,
} from '../resource-utils'

export function CertificateCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getCertificateStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'domains': {
      const domains = getCertificateDomains(resource)
      return (
        <Tooltip content={domains}>
          <span className="text-sm text-muted-foreground truncate block">{domains || '-'}</span>
        </Tooltip>
      )
    }
    case 'issuer': {
      const issuer = getCertificateIssuer(resource)
      return <span className="text-sm text-muted-foreground">{issuer}</span>
    }
    case 'expires': {
      const expiry = getCertificateExpiry(resource)
      return (
        <span className={cn(
          'text-sm font-medium',
          expiry.level === 'unhealthy' ? 'text-destructive' :
          expiry.level === 'degraded' ? 'text-warning' :
          expiry.level === 'healthy' ? 'text-success' :
          'text-muted-foreground/75'
        )}>
          {expiry.text}
        </span>
      )
    }
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function CertificateRequestCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getCertificateRequestStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'issuer':
      return <span className="text-sm text-muted-foreground">{getCertificateRequestIssuer(resource)}</span>
    case 'approved':
      return <span className="text-sm text-muted-foreground">{getCertificateRequestApproved(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ClusterIssuerCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getClusterIssuerStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'issuerType':
      return <span className="text-sm text-muted-foreground">{getClusterIssuerType(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function IssuerCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'status': {
      const status = getIssuerStatus(resource)
      return (
        <span className={cn('badge', status.color)}>
          {status.text}
        </span>
      )
    }
    case 'issuerType':
      return <span className="text-sm text-muted-foreground">{getIssuerType(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function OrderCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'state': {
      const state = getOrderState(resource)
      return (
        <span className={cn('badge', state.color)}>
          {state.text}
        </span>
      )
    }
    case 'domains': {
      const domains = getOrderDomains(resource)
      return (
        <Tooltip content={domains}>
          <span className="text-sm text-muted-foreground truncate block">{domains}</span>
        </Tooltip>
      )
    }
    case 'issuer':
      return <span className="text-sm text-muted-foreground">{getOrderIssuer(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}

export function ChallengeCell({ resource, column }: { resource: any; column: string }) {
  switch (column) {
    case 'state': {
      const state = getChallengeState(resource)
      return (
        <span className={cn('badge', state.color)}>
          {state.text}
        </span>
      )
    }
    case 'challengeType':
      return <span className="text-sm text-muted-foreground">{getChallengeType(resource)}</span>
    case 'domain':
      return <span className="text-sm text-muted-foreground">{getChallengeDomain(resource)}</span>
    case 'presented':
      return <span className="text-sm text-muted-foreground">{getChallengePresented(resource)}</span>
    default:
      return <span className="text-sm text-muted-foreground/75">-</span>
  }
}
