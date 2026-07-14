import { Filter, Settings } from 'lucide-react'
import { Section } from '../../ui/drawer-components'

interface DeviceClassRendererProps {
  data: any
}

export function DeviceClassRenderer({ data }: DeviceClassRendererProps) {
  const selectors = data.spec?.selectors || []
  const config = data.spec?.config || []

  return (
    <>
      <Section title={`Selectors (${selectors.length})`} icon={Filter} defaultExpanded>
        {selectors.length > 0 ? (
          <div className="space-y-2">
            {selectors.map((sel: any, i: number) => (
              <div key={i} className="card-inner">
                {sel?.cel?.expression ? (
                  <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all">{sel.cel.expression}</pre>
                ) : (
                  <span className="text-sm text-muted-foreground/75">-</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground/75">No selectors — matches all devices</div>
        )}
      </Section>

      {config.length > 0 && (
        <Section title={`Configuration (${config.length})`} icon={Settings}>
          <div className="space-y-2">
            {config.map((c: any, i: number) => (
              <div key={i} className="card-inner text-sm">
                {c?.opaque?.driver ? (
                  <span className="text-muted-foreground">opaque config for driver <span className="text-foreground font-medium">{c.opaque.driver}</span></span>
                ) : (
                  <span className="text-muted-foreground/75">config entry {i + 1}</span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  )
}
