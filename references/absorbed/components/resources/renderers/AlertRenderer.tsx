import { Bell, AlertTriangle, Filter, Send } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Section, PropertyList, Property, ConditionsSection } from '../../ui/drawer-components'
import { GitOpsStatusBadge } from '../../gitops'
import { fluxConditionsToGitOpsStatus, type FluxCondition } from '../../../types/gitops'

interface AlertRendererProps {
  data: any
}

export function AlertRenderer({ data }: AlertRendererProps) {
  const status = data.status || {}
  const spec = data.spec || {}
  const conditions = (status.conditions || []) as FluxCondition[]

  // Convert to unified GitOps status
  const gitOpsStatus = fluxConditionsToGitOpsStatus(conditions, spec.suspend === true)

  // Problem detection
  const problems: Array<{ color: 'red' | 'yellow'; message: string }> = []

  if (gitOpsStatus.suspended) {
    problems.push({ color: 'yellow', message: 'Alert is suspended' })
  }

  if (gitOpsStatus.health === 'Degraded' && gitOpsStatus.message) {
    problems.push({ color: 'red', message: gitOpsStatus.message })
  }

  // Event sources
  const eventSources = spec.eventSources || []
  const eventSeverity = spec.eventSeverity || 'info'
  const inclusionList = spec.inclusionList || []
  const exclusionList = spec.exclusionList || []

  return (
    <>
      {/* Problem alerts */}
      {problems.map((problem, i) => (
        <div
          key={i}
          className={cn(
            'mb-4 p-3 border rounded-lg',
            problem.color === 'red'
              ? 'bg-destructive/10 border-destructive/30'
              : 'bg-warning/10 border-warning/30'
          )}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle
              className={cn(
                'w-4 h-4 mt-0.5 shrink-0',
                problem.color === 'red' ? 'text-destructive' : 'text-warning'
              )}
            />
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  'text-sm font-medium',
                  problem.color === 'red' ? 'text-destructive' : 'text-warning'
                )}
              >
                {problem.color === 'red' ? 'Issue Detected' : 'Warning'}
              </div>
              <div
                className={cn(
                  'text-xs mt-1',
                  problem.color === 'red' ? 'text-destructive/80' : 'text-warning/80'
                )}
              >
                {problem.message}
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Status section */}
      <Section title="Status">
        <GitOpsStatusBadge status={gitOpsStatus} showHealth={false} />
      </Section>

      {/* Provider section */}
      <Section title="Provider" icon={Send}>
        <PropertyList>
          <Property label="Provider Ref" value={spec.providerRef?.name} />
          <Property
            label="Event Severity"
            value={
              <span className={cn(
                'badge',
                eventSeverity === 'error' ? 'bg-destructive/20 text-destructive' :
                eventSeverity === 'warning' ? 'bg-warning/20 text-warning' :
                'bg-blue-500/20 text-blue-400'
              )}>
                {eventSeverity}
              </span>
            }
          />
          {spec.summary && <Property label="Summary" value={spec.summary} />}
        </PropertyList>
      </Section>

      {/* Event Sources section */}
      {eventSources.length > 0 && (
        <Section title={`Event Sources (${eventSources.length})`} icon={Bell}>
          <div className="space-y-2">
            {eventSources.map((source: any, idx: number) => (
              <div
                key={idx}
                className="card-inner text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground/75">{source.kind}</span>
                  <span className="text-foreground">{source.name || '*'}</span>
                </div>
                {source.namespace && (
                  <div className="text-xs text-muted-foreground/75 mt-1">
                    Namespace: {source.namespace === '*' ? 'All' : source.namespace}
                  </div>
                )}
                {source.matchLabels && Object.keys(source.matchLabels).length > 0 && (
                  <div className="text-xs text-muted-foreground/75 mt-1">
                    Labels: {Object.entries(source.matchLabels).map(([k, v]) => `${k}=${v}`).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Filters section */}
      {(inclusionList.length > 0 || exclusionList.length > 0) && (
        <Section title="Filters" icon={Filter} defaultExpanded={false}>
          <PropertyList>
            {inclusionList.length > 0 && (
              <Property
                label="Include"
                value={inclusionList.join(', ')}
              />
            )}
            {exclusionList.length > 0 && (
              <Property
                label="Exclude"
                value={exclusionList.join(', ')}
              />
            )}
          </PropertyList>
        </Section>
      )}

      {/* Additional Info */}
      {status.observedGeneration !== undefined && (
        <Section title="Additional Info" defaultExpanded={false}>
          <PropertyList>
            <Property label="Observed Generation" value={status.observedGeneration} />
          </PropertyList>
        </Section>
      )}

      {/* Conditions section */}
      <ConditionsSection conditions={conditions} />
    </>
  )
}
