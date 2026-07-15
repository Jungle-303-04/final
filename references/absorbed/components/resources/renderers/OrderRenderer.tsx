import { ShoppingCart, AlertTriangle, Globe, Shield } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Section, PropertyList, Property, ConditionsSection } from '../../ui/drawer-components'
import { BADGE_INACTIVE } from '../../../utils/badge-colors'

function getOrderStateBadge(state: string): { color: string; text: string } {
  switch (state?.toLowerCase()) {
    case 'valid':
      return { text: 'Valid', color: 'bg-success/20 text-success' }
    case 'ready':
      return { text: 'Ready', color: 'bg-blue-500/20 text-blue-400' }
    case 'pending':
      return { text: 'Pending', color: 'bg-warning/20 text-warning' }
    case 'invalid':
      return { text: 'Invalid', color: 'bg-destructive/20 text-destructive' }
    case 'expired':
      return { text: 'Expired', color: 'bg-destructive/20 text-destructive' }
    case 'errored':
      return { text: 'Errored', color: 'bg-destructive/20 text-destructive' }
    default:
      return { text: state || 'Unknown', color: BADGE_INACTIVE }
  }
}

export function OrderRenderer({ data }: { data: any }) {
  const spec = data.spec || {}
  const status = data.status || {}
  const conditions = status.conditions || []
  const state = status.state || ''
  const dnsNames = spec.dnsNames || []
  const issuerRef = spec.issuerRef || {}
  const authorizations = status.authorizations || []

  const isError = state === 'invalid' || state === 'expired' || state === 'errored'

  return (
    <>
      {/* Problem detection alert */}
      {isError && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-destructive">Order {state.charAt(0).toUpperCase() + state.slice(1)}</div>
              {status.reason && (
                <div className="text-xs text-destructive/80 mt-1">{status.reason}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status */}
      <Section title="Status" icon={Shield}>
        <PropertyList>
          <Property
            label="State"
            value={
              <span className={cn('badge', getOrderStateBadge(state).color)}>
                {getOrderStateBadge(state).text}
              </span>
            }
          />
          {status.url && <Property label="ACME URL" value={status.url} />}
        </PropertyList>
      </Section>

      {/* Domains */}
      {dnsNames.length > 0 && (
        <Section title="Domains" icon={Globe}>
          <div className="flex flex-wrap gap-1.5">
            {dnsNames.map((name: string) => (
              <span key={name} className="badge bg-popover text-muted-foreground">
                {name}
              </span>
            ))}
          </div>
        </Section>
      )}

      {/* Issuer */}
      {issuerRef.name && (
        <Section title="Issuer" icon={Shield}>
          <PropertyList>
            <Property label="Name" value={issuerRef.name} />
            <Property label="Kind" value={issuerRef.kind || 'ClusterIssuer'} />
            {issuerRef.group && <Property label="Group" value={issuerRef.group} />}
          </PropertyList>
        </Section>
      )}

      {/* Authorizations */}
      {authorizations.length > 0 && (
        <Section title={`Authorizations (${authorizations.length})`} icon={ShoppingCart}>
          <div className="space-y-1">
            {authorizations.map((auth: any, i: number) => (
              <div key={i} className="text-xs text-muted-foreground card-inner">
                {auth.url || `Authorization ${i + 1}`}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Conditions */}
      <ConditionsSection conditions={conditions} />
    </>
  )
}
