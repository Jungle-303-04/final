import { Shield, Activity } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Section, PropertyList, Property, ConditionsSection, LabelSelectorDisplay, AlertBanner } from '../../ui/drawer-components'

interface PodDisruptionBudgetRendererProps {
  data: any
}

export function PodDisruptionBudgetRenderer({ data }: PodDisruptionBudgetRendererProps) {
  const spec = data.spec || {}
  const status = data.status || {}
  const selector = spec.selector

  // Determine budget type
  const hasMaxUnavailable = spec.maxUnavailable !== undefined && spec.maxUnavailable !== null
  const hasMinAvailable = spec.minAvailable !== undefined && spec.minAvailable !== null
  const budgetType = hasMaxUnavailable ? 'Max Unavailable' : hasMinAvailable ? 'Min Available' : undefined
  const budgetValue = hasMaxUnavailable ? spec.maxUnavailable : hasMinAvailable ? spec.minAvailable : undefined

  // Problem detection
  const disruptionsAllowed = status.disruptionsAllowed
  const expectedPods = status.expectedPods
  const currentHealthy = status.currentHealthy
  const desiredHealthy = status.desiredHealthy

  const noDisruptionsAllowed = disruptionsAllowed === 0 && expectedPods > 0
  const insufficientHealthy = currentHealthy !== undefined && desiredHealthy !== undefined && currentHealthy < desiredHealthy

  return (
    <>
      {/* Problem alerts */}
      {insufficientHealthy && (
        <AlertBanner
          variant="error"
          title="Issues Detected"
          message={`Insufficient healthy pods (${currentHealthy} healthy, ${desiredHealthy} desired)`}
        />
      )}

      {noDisruptionsAllowed && !insufficientHealthy && (
        <AlertBanner
          variant="warning"
          title="Issues Detected"
          message="No disruptions currently allowed"
        />
      )}

      <Section title="Budget" icon={Shield}>
        <PropertyList>
          <Property label="Budget Type" value={budgetType} />
          <Property label="Budget Value" value={budgetValue !== undefined ? String(budgetValue) : undefined} />
          <Property
            label="Disruptions"
            value={
              disruptionsAllowed !== undefined ? (
                <span className={cn(
                  disruptionsAllowed > 0 ? 'text-success' : 'text-destructive'
                )}>
                  {disruptionsAllowed} allowed
                </span>
              ) : undefined
            }
          />
          <Property label="Eviction Policy" value={spec.unhealthyPodEvictionPolicy} />
        </PropertyList>
      </Section>

      <Section title="Pod Status" icon={Activity}>
        <PropertyList>
          <Property
            label="Current Healthy"
            value={
              currentHealthy !== undefined ? (
                <span className={cn(
                  desiredHealthy !== undefined && currentHealthy >= desiredHealthy
                    ? 'text-success'
                    : 'text-destructive'
                )}>
                  {currentHealthy}
                </span>
              ) : undefined
            }
          />
          <Property label="Desired Healthy" value={desiredHealthy} />
          <Property label="Expected Pods" value={expectedPods} />
        </PropertyList>
        {currentHealthy !== undefined && expectedPods !== undefined && expectedPods > 0 && (
          <div className="mt-3 card-inner text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Health</span>
              <span className={cn(
                desiredHealthy !== undefined && currentHealthy >= desiredHealthy
                  ? 'text-success'
                  : 'text-destructive'
              )}>
                {currentHealthy}/{expectedPods} healthy
              </span>
            </div>
            <div className="mt-2 h-2 bg-accent rounded overflow-hidden">
              <div
                className={cn(
                  'h-full transition-all',
                  desiredHealthy !== undefined && currentHealthy >= desiredHealthy
                    ? 'bg-success'
                    : 'bg-destructive'
                )}
                style={{ width: `${Math.min(100, (currentHealthy / expectedPods) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </Section>

      <Section title="Selector">
        <LabelSelectorDisplay selector={selector} emptyText="All pods in namespace" />
      </Section>

      <ConditionsSection conditions={status.conditions} />
    </>
  )
}
