import { Play, FileText, Key, Lock, File, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { Section, PropertyList, Property } from '../../ui/drawer-components'

interface WorkflowTemplateRendererProps {
  data: any
}

function getTemplateType(template: any): string {
  if (template.steps) return 'steps'
  if (template.dag) return 'dag'
  if (template.script) return 'script'
  if (template.container) return 'container'
  if (template.resource) return 'resource'
  return 'unknown'
}

function getTemplateImage(template: any): string | null {
  if (template.container?.image) return template.container.image
  if (template.script?.image) return template.script.image
  return null
}

export function WorkflowTemplateRenderer({ data }: WorkflowTemplateRendererProps) {
  const spec = data.spec || {}
  const templates = spec.templates || []
  const parameters = spec.arguments?.parameters || []
  const imagePullSecrets = spec.imagePullSecrets || []

  return (
    <>
      {/* Overview section */}
      <Section title="Overview" icon={Play}>
        <PropertyList>
          <Property label="Entrypoint" value={spec.entrypoint} />
          <Property label="Templates" value={templates.length} />
          <Property label="Service Account" value={spec.serviceAccountName} />
        </PropertyList>
      </Section>

      {/* Templates section */}
      {templates.length > 0 && (
        <Section title={`Templates (${templates.length})`} icon={FileText} defaultExpanded>
          <div className="space-y-1.5">
            {templates.map((template: any) => {
              const type = getTemplateType(template)
              const image = getTemplateImage(template)
              const inputParams: Array<{ name: string }> = template.inputs?.parameters || []
              const outputParams: Array<{ name: string }> = template.outputs?.parameters || []
              const outputArtifacts: Array<{ name: string }> = template.outputs?.artifacts || []
              const inputArtifacts: Array<{ name: string }> = template.inputs?.artifacts || []
              const hasIO = inputParams.length > 0 || outputParams.length > 0 || outputArtifacts.length > 0 || inputArtifacts.length > 0
              return (
                <div key={template.name} className="card-inner px-3 py-2 text-sm">
                  <div className="font-medium text-foreground">{template.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{type}</div>
                  {image && (
                    <div className="text-xs text-muted-foreground/75 mt-0.5 truncate" title={image}>
                      {image}
                    </div>
                  )}
                  {hasIO && (
                    <div className="mt-2 space-y-1.5">
                      {(inputParams.length > 0 || inputArtifacts.length > 0) && (
                        <div className="flex items-start gap-1.5">
                          <ArrowDownToLine className="w-3 h-3 text-muted-foreground/75 mt-0.5 shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {inputParams.map((p) => (
                              <span key={p.name} className="badge-sm bg-popover text-muted-foreground">
                                {p.name}
                              </span>
                            ))}
                            {inputArtifacts.map((a) => (
                              <span key={a.name} className="badge-sm bg-popover text-muted-foreground flex items-center gap-0.5">
                                <File className="w-2.5 h-2.5" />
                                {a.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {(outputParams.length > 0 || outputArtifacts.length > 0) && (
                        <div className="flex items-start gap-1.5">
                          <ArrowUpFromLine className="w-3 h-3 text-muted-foreground/75 mt-0.5 shrink-0" />
                          <div className="flex flex-wrap gap-1">
                            {outputParams.map((p) => (
                              <span key={p.name} className="badge-sm bg-popover text-muted-foreground">
                                {p.name}
                              </span>
                            ))}
                            {outputArtifacts.map((a) => (
                              <span key={a.name} className="badge-sm bg-popover text-muted-foreground flex items-center gap-0.5">
                                <File className="w-2.5 h-2.5" />
                                {a.name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Arguments section */}
      {parameters.length > 0 && (
        <Section title={`Arguments (${parameters.length})`} icon={Key} defaultExpanded={parameters.length <= 5}>
          <PropertyList>
            {parameters.map((param: any) => (
              <Property key={param.name} label={param.name} value={param.value} />
            ))}
          </PropertyList>
        </Section>
      )}

      {/* Image Pull Secrets section */}
      {imagePullSecrets.length > 0 && (
        <Section title={`Image Pull Secrets (${imagePullSecrets.length})`} icon={Lock}>
          <div className="flex flex-wrap gap-1">
            {imagePullSecrets.map((secret: any) => (
              <span
                key={secret.name}
                className="badge bg-popover text-muted-foreground"
              >
                {secret.name}
              </span>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}
