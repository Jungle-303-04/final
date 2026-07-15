import { BookOpen, Server, Settings, Shield } from 'lucide-react'
import { Section, PropertyList, Property, ConditionsSection } from '../../ui/drawer-components'

interface Props {
  data: any
  onNavigate?: (ref: { kind: string; namespace: string; name: string; group?: string }) => void
}

export function CAPIClusterClassRenderer({ data }: Props) {
  const status = data.status || {}
  const spec = data.spec || {}
  const conditions = status.v1beta2?.conditions || status.conditions || []

  const infraRef = spec.infrastructure?.ref || {}
  const cpRef = spec.controlPlane?.ref || {}
  const cpMachineInfraRef = spec.controlPlane?.machineInfrastructure?.ref || {}
  const variables = spec.variables || []
  const patches = spec.patches || []
  const mdClasses = spec.workers?.machineDeployments || []
  const mpClasses = spec.workers?.machinePools || []

  return (
    <>
      {/* Overview */}
      <Section title="Overview" icon={BookOpen}>
        <PropertyList>
          {infraRef.kind && (
            <Property label="Infrastructure Template" value={`${infraRef.kind}/${infraRef.name}`} />
          )}
          {cpRef.kind && (
            <Property label="Control Plane Template" value={`${cpRef.kind}/${cpRef.name}`} />
          )}
          {cpMachineInfraRef.kind && (
            <Property label="CP Machine Infra" value={`${cpMachineInfraRef.kind}/${cpMachineInfraRef.name}`} />
          )}
          <Property label="Variables" value={String(variables.length)} />
          <Property label="Patches" value={String(patches.length)} />
        </PropertyList>
      </Section>

      {/* Control Plane */}
      {cpRef.kind && (
        <Section title="Control Plane" icon={Shield}>
          <PropertyList>
            <Property label="Template" value={`${cpRef.kind}/${cpRef.name}`} />
            {spec.controlPlane?.machineHealthCheck && (
              <Property label="Health Check" value="Configured" />
            )}
          </PropertyList>
        </Section>
      )}

      {/* Worker Topology */}
      {(mdClasses.length > 0 || mpClasses.length > 0) && (
        <Section title="Worker Topology" icon={Server}>
          {mdClasses.length > 0 && (
            <div className="mb-2">
              <div className="text-xs font-medium text-muted-foreground mb-1">MachineDeployment Classes</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground/75">
                    <th className="text-left font-medium py-1">Class</th>
                    <th className="text-left font-medium py-1">Infra Template</th>
                    <th className="text-left font-medium py-1">Bootstrap Template</th>
                  </tr>
                </thead>
                <tbody>
                  {mdClasses.map((md: any, i: number) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1 text-muted-foreground font-medium">{md.class}</td>
                      <td className="py-1 text-muted-foreground">{md.template?.infrastructure?.ref?.kind || '-'}</td>
                      <td className="py-1 text-muted-foreground">{md.template?.bootstrap?.ref?.kind || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {mpClasses.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">MachinePool Classes</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground/75">
                    <th className="text-left font-medium py-1">Class</th>
                    <th className="text-left font-medium py-1">Infra Template</th>
                    <th className="text-left font-medium py-1">Bootstrap Template</th>
                  </tr>
                </thead>
                <tbody>
                  {mpClasses.map((mp: any, i: number) => (
                    <tr key={i} className="border-t border-border">
                      <td className="py-1 text-muted-foreground font-medium">{mp.class}</td>
                      <td className="py-1 text-muted-foreground">{mp.template?.infrastructure?.ref?.kind || '-'}</td>
                      <td className="py-1 text-muted-foreground">{mp.template?.bootstrap?.ref?.kind || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* Variables */}
      {variables.length > 0 && (
        <Section title="Variables" icon={Settings}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground/75">
                <th className="text-left font-medium py-1">Name</th>
                <th className="text-left font-medium py-1">Required</th>
                <th className="text-left font-medium py-1">Schema Type</th>
              </tr>
            </thead>
            <tbody>
              {variables.map((v: any, i: number) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 text-muted-foreground font-medium">{v.name}</td>
                  <td className="py-1 text-muted-foreground">{v.required ? 'Yes' : 'No'}</td>
                  <td className="py-1 text-muted-foreground">{v.schema?.openAPIV3Schema?.type || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* Patches */}
      {patches.length > 0 && (
        <Section title="Patches" icon={Settings} defaultExpanded={false}>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground/75">
                <th className="text-left font-medium py-1">Name</th>
                <th className="text-left font-medium py-1">Definitions</th>
                <th className="text-left font-medium py-1">Enabled If</th>
              </tr>
            </thead>
            <tbody>
              {patches.map((p: any, i: number) => (
                <tr key={i} className="border-t border-border">
                  <td className="py-1 text-muted-foreground font-medium">{p.name}</td>
                  <td className="py-1 text-muted-foreground">{p.definitions?.length ?? 0}</td>
                  <td className="py-1 text-muted-foreground font-mono text-[10px]">{p.enabledIf || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      <ConditionsSection conditions={conditions} />
    </>
  )
}
