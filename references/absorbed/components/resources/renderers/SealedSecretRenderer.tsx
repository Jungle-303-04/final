import { Lock, Key, FileText } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Section, PropertyList, Property, ConditionsSection, KeyValueBadgeList, AlertBanner, ResourceLink, useOperationalIssuesShown } from '../../ui/drawer-components'

interface SealedSecretRendererProps {
  data: any
  onNavigate?: (ref: { kind: string; namespace: string; name: string }) => void
}

function getScope(annotations: Record<string, string> | undefined): string {
  if (!annotations) return 'strict'
  if (annotations['sealedsecrets.bitnami.com/cluster-wide'] === 'true') return 'cluster-wide'
  if (annotations['sealedsecrets.bitnami.com/namespace-wide'] === 'true') return 'namespace-wide'
  return 'strict'
}

export function SealedSecretRenderer({ data, onNavigate }: SealedSecretRendererProps) {
  const spec = data.spec || {}
  const status = data.status || {}
  const conditions = status.conditions || []
  const annotations = data.metadata?.annotations || {}

  const encryptedData = spec.encryptedData || {}
  const encryptedKeys = Object.keys(encryptedData)
  const template = spec.template || {}
  const templateMetadata = template.metadata || {}
  const templateLabels = templateMetadata.labels
  const templateAnnotations = templateMetadata.annotations
  const secretType = template.type || 'Opaque'
  const scope = getScope(annotations)

  const syncedCond = conditions.find((c: any) => c.type === 'Synced')
  const isSynced = syncedCond?.status === 'True'
  const isNotSynced = syncedCond?.status === 'False'
  const operationalIssuesShown = useOperationalIssuesShown()

  const hasTemplateMetadata =
    (templateLabels && Object.keys(templateLabels).length > 0) ||
    (templateAnnotations && Object.keys(templateAnnotations).length > 0)

  return (
    <>
      {/* Problem detection alert */}
      {isNotSynced && !operationalIssuesShown && (
        <AlertBanner
          variant="error"
          title="Secret is not synced"
          message={<>{syncedCond.reason && <span className="font-medium">{syncedCond.reason}: </span>}{syncedCond.message || 'The sealed secret failed to unseal and sync to a Secret.'}</>}
        />
      )}

      {/* Status */}
      <Section title="Status" icon={Lock}>
        <PropertyList>
          <Property
            label="Synced"
            value={
              <span className={cn(
                'badge',
                isSynced
                  ? 'bg-success/20 text-success'
                  : isNotSynced
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-warning/20 text-warning'
              )}>
                {isSynced ? 'Synced' : isNotSynced ? 'Not Synced' : 'Unknown'}
              </span>
            }
          />
          <Property label="Target Secret" value={
            <ResourceLink
              name={data.spec?.template?.metadata?.name || data.metadata?.name || ''}
              kind="secrets"
              namespace={data.metadata?.namespace || ''}
              onNavigate={onNavigate}
            />
          } />
          <Property label="Secret Type" value={secretType} />
          <Property label="Scope" value={scope} />
          <Property label="Observed Gen" value={status.observedGeneration} />
        </PropertyList>
      </Section>

      {/* Encrypted Keys */}
      <Section title={`Encrypted Keys (${encryptedKeys.length})`} icon={Key}>
        {encryptedKeys.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {encryptedKeys.map((key) => (
              <span
                key={key}
                className="badge bg-popover text-muted-foreground"
              >
                {key}
              </span>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground/75">No encrypted keys</div>
        )}
      </Section>

      {/* Template Metadata */}
      {hasTemplateMetadata && (
        <Section title="Template Metadata" icon={FileText}>
          {templateLabels && Object.keys(templateLabels).length > 0 && (
            <div className="mb-3">
              <div className="text-xs text-muted-foreground/75 mb-1">Labels</div>
              <KeyValueBadgeList items={templateLabels} />
            </div>
          )}
          {templateAnnotations && Object.keys(templateAnnotations).length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground/75 mb-1">Annotations</div>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {Object.entries(templateAnnotations).map(([k, v]) => (
                  <div key={k} className="text-xs">
                    <span className="text-muted-foreground/75">{k}:</span>
                    <span className="text-muted-foreground ml-1 break-all">{v as string}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Conditions */}
      <ConditionsSection conditions={conditions} />
    </>
  )
}
