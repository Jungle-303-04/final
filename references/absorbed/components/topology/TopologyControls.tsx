import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { FolderTree, ShieldCheck, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import type { TopologyMode, GroupingMode } from '../../types/core'
import { Tooltip } from '../ui/Tooltip'

interface TopologyControlsProps {
  viewMode: TopologyMode
  onViewModeChange: (mode: TopologyMode) => void
  groupingMode: GroupingMode
  onGroupingModeChange: (mode: GroupingMode) => void
  showNoGrouping?: boolean
  showPolicyEffect?: boolean
  onShowPolicyEffectChange?: (show: boolean) => void
  /** Show the "Fleet" button (CAPI cluster management view) */
  showFleetMode?: boolean
  /**
   * Navigate to the observed-traffic view. When provided, the "Network Flow"
   * tooltip offers a link to it — disambiguating the config-derived flow graph
   * here from the live, observed Traffic view. Omitted by hosts without one.
   */
  onNavigateToTraffic?: () => void
  /** Optional leading element (e.g. a freshness/liveness indicator). */
  leadingSlot?: ReactNode
}

export function TopologyControls({
  viewMode,
  onViewModeChange,
  groupingMode,
  onGroupingModeChange,
  showNoGrouping = true,
  showPolicyEffect = false,
  onShowPolicyEffectChange,
  showFleetMode = false,
  onNavigateToTraffic,
  leadingSlot,
}: TopologyControlsProps) {
  const [groupOpen, setGroupOpen] = useState(false)
  const groupRef = useRef<HTMLDivElement>(null)
  const groupTriggerRef = useRef<HTMLButtonElement>(null)
  const groupItemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const groupOptions: { value: GroupingMode; label: string }[] = [
    ...(showNoGrouping ? [{ value: 'none' as GroupingMode, label: 'No Grouping' }] : []),
    { value: 'namespace', label: 'By Namespace' },
    { value: 'app', label: 'By App Label' },
  ]
  const currentGroupLabel = groupOptions.find((o) => o.value === groupingMode)?.label ?? 'Grouping'

  const closeGroup = useCallback((restoreFocus = false) => {
    setGroupOpen(false)
    if (restoreFocus) groupTriggerRef.current?.focus()
  }, [])

  // On open, move focus onto the active option so the menu is keyboard-navigable
  // (parity with the native <select> this replaced). Click-outside closes it.
  useEffect(() => {
    if (!groupOpen) return
    const active = Math.max(0, groupOptions.findIndex((o) => o.value === groupingMode))
    groupItemRefs.current[active]?.focus()
    const onDown = (e: MouseEvent) => {
      if (groupRef.current && !groupRef.current.contains(e.target as Node)) setGroupOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // groupOptions/groupingMode are read once at open; re-running on their
    // identity change would steal focus mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupOpen])

  const onGroupMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = groupItemRefs.current.filter(Boolean) as HTMLButtonElement[]
    const i = items.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); items[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1]?.focus() }
    else if (e.key === 'Escape') { e.preventDefault(); closeGroup(true) }
  }

  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
      {/* Freshness/liveness status — backed for legibility over the canvas but
          borderless + divided off, so it reads as a status, not another control. */}
      {leadingSlot && (
        <>
          <div className="flex items-center rounded-lg bg-card/80 px-2.5 py-1.5 backdrop-blur">
            {leadingSlot}
          </div>
          <div className="h-5 w-px bg-border/70" />
        </>
      )}
      {/* Policy effect toggle */}
      {onShowPolicyEffectChange && (
        <button
          onClick={() => onShowPolicyEffectChange(!showPolicyEffect)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
            showPolicyEffect
              ? 'bg-indigo-600 text-white border-indigo-600'
              : 'bg-card/90 backdrop-blur text-muted-foreground border-border hover:text-foreground'
          }`}
          title="Show NetworkPolicy effects on edges"
        >
          <ShieldCheck className="w-3.5 h-3.5" />
          Policies
        </button>
      )}

      {/* Grouping selector — themed dropdown (not a native <select>). */}
      <div ref={groupRef} className="relative">
        <button
          ref={groupTriggerRef}
          type="button"
          onClick={() => setGroupOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={groupOpen}
          className="flex items-center gap-1.5 px-2 py-1.5 bg-card/90 backdrop-blur border border-border rounded-lg text-xs text-foreground hover:bg-popover transition-colors"
        >
          <FolderTree className="w-3.5 h-3.5 text-muted-foreground" />
          {currentGroupLabel}
          <ChevronDown className="w-3 h-3 text-muted-foreground/75" />
        </button>
        {groupOpen && (
          <div role="menu" onKeyDown={onGroupMenuKey} className="absolute right-0 top-full mt-1 z-50 min-w-[160px] rounded-lg border border-border bg-card py-1 shadow-xl">
            {groupOptions.map((o, idx) => (
              <button
                key={o.value}
                ref={(el) => { groupItemRefs.current[idx] = el }}
                type="button"
                role="menuitemradio"
                aria-checked={groupingMode === o.value}
                onClick={() => { onGroupingModeChange(o.value); closeGroup(true) }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground focus:outline-none transition-colors"
              >
                <Check className={cn('w-3.5 h-3.5 shrink-0', groupingMode === o.value ? 'opacity-100 text-primary' : 'opacity-0')} />
                <span className="truncate">{o.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* View mode toggle */}
      <div className="flex items-center gap-0.5 p-1 bg-card/90 backdrop-blur border border-border rounded-lg">
        <button
          onClick={() => onViewModeChange('resources')}
          className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
            viewMode === 'resources'
              ? 'bg-primary text-white'
              : 'text-muted-foreground hover:text-foreground hover:bg-popover'
          }`}
        >
          Resources
        </button>
        <Tooltip
          position="bottom"
          content={
            <div className="space-y-1.5 text-left">
              <p className="text-muted-foreground">
                How requests <em>should</em> route, derived from Ingress, Services and
                routing CRDs (Traefik, Gateway API, Istio…) — not observed packets.
              </p>
              {onNavigateToTraffic && (
                <p className="text-muted-foreground/75">
                  Looking for observed, measured traffic?{' '}
                  <button
                    type="button"
                    onClick={onNavigateToTraffic}
                    className="text-primary hover:text-primary underline underline-offset-2"
                  >
                    Open Live Traffic →
                  </button>
                </p>
              )}
            </div>
          }
        >
          <button
            onClick={() => onViewModeChange('traffic')}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
              viewMode === 'traffic'
                ? 'bg-primary text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-popover'
            }`}
          >
            Network Flow <span className="opacity-70">(config)</span>
          </button>
        </Tooltip>
        {showFleetMode && (
          <button
            onClick={() => onViewModeChange('fleet')}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'fleet'
                ? 'bg-primary text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-popover'
            }`}
            title="Cluster API fleet view — shows only CAPI resources and nodes"
          >
            Fleet
          </button>
        )}
      </div>
    </div>
  )
}
