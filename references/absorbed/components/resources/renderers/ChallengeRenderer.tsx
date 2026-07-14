import { Shield, AlertTriangle, Globe, Key, FileText } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Section, PropertyList, Property, ConditionsSection } from '../../ui/drawer-components'
import { getSolverType } from './ClusterIssuerRenderer'
import { BADGE_INACTIVE } from '../../../utils/badge-colors'

function getChallengeStateBadge(state: string): { color: string; text: string } {
  switch (state?.toLowerCase()) {
    case 'valid':
      return { text: 'Valid', color: 'bg-success/20 text-success' }
    case 'ready':
      return { text: 'Ready', color: 'bg-blue-500/20 text-blue-400' }
    case 'pending':
      return { text: 'Pending', color: 'bg-warning/20 text-warning' }
    case 'processing':
      return { text: 'Processing', color: 'bg-warning/20 text-warning' }
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

export function ChallengeRenderer({ data }: { data: any }) {
  const spec = data.spec || {}
  const status = data.status || {}
  const conditions = status.conditions || []
  const state = status.state || ''
  const presented = status.presented

  const isError = state === 'invalid' || state === 'expired' || state === 'errored'

  // Determine challenge type from spec
  const challengeType = spec.type || (spec.solver?.http01 ? 'HTTP-01' : spec.solver?.dns01 ? 'DNS-01' : 'Unknown')

  // Extract solver info
  const solver = spec.solver || {}
  const solverInfo = getSolverType(solver)

  return (
    <>
      {/* Problem detection alert */}
      {isError && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-destructive">Challenge {state.charAt(0).toUpperCase() + state.slice(1)}</div>
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
              <span className={cn('badge', getChallengeStateBadge(state).color)}>
                {getChallengeStateBadge(state).text}
              </span>
            }
          />
          {status.reason && !isError && <Property label="Reason" value={status.reason} />}
          <Property
            label="Type"
            value={
              <span className="flex items-center gap-2">
                <span className="badge bg-popover text-muted-foreground">
                  {challengeType}
                </span>
                {spec.wildcard && (
                  <span className="badge bg-purple-500/20 text-purple-400">
                    Wildcard
                  </span>
                )}
              </span>
            }
          />
          <Property
            label="Presented"
            value={presented === true ? 'Yes' : presented === false ? 'No' : '-'}
          />
          {spec.dnsName && <Property label="Domain" value={spec.dnsName} />}
        </PropertyList>
      </Section>

      {/* Issuer */}
      {spec.issuerRef && (
        <Section title="Issuer" icon={FileText}>
          <PropertyList>
            <Property label="Name" value={spec.issuerRef.name} />
            <Property label="Kind" value={spec.issuerRef.kind} />
            <Property label="Group" value={spec.issuerRef.group} />
          </PropertyList>
        </Section>
      )}

      {/* ACME */}
      {(spec.url || spec.token) && (
        <Section title="ACME" icon={Globe}>
          <PropertyList>
            {spec.url && <Property label="Challenge URL" value={spec.url} />}
            {spec.token && <Property label="Token" value={spec.token.length > 32 ? spec.token.slice(0, 32) + '...' : spec.token} />}
          </PropertyList>
        </Section>
      )}

      {/* Solver */}
      {solverInfo.type !== 'Unknown' && (
        <Section title="Solver" icon={Key}>
          <PropertyList>
            <Property label="Type" value={solverInfo.type} />
            {solverInfo.detail && <Property label="Detail" value={solverInfo.detail} />}
          </PropertyList>
        </Section>
      )}

      {/* Conditions */}
      <ConditionsSection conditions={conditions} />
    </>
  )
}
