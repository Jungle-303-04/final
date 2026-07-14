import { useState, useMemo } from 'react'
import { Bell, Search, ChevronRight } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { Section, PropertyList, Property, ConditionsSection } from '../../ui/drawer-components'
import { Input } from '../../ui/Input'
import { BADGE_SEVERITY_COLORS } from '../../ui/Badge'
import {
  getPrometheusRuleGroups,
  getPrometheusRuleTotalRules,
  getPrometheusRuleGroupCount,
} from '../resource-utils-prometheus'
import type { PrometheusRuleGroup, PrometheusRule, PrometheusAlertRule, PrometheusRecordingRule } from '../resource-utils-prometheus'
import { pluralize, pluralNoun } from '../../../utils/pluralize'

interface PrometheusRuleRendererProps {
  data: any
}

// Map Prometheus severity names to centralized badge colors
const SEVERITY_BADGE: Record<string, string> = {
  critical: BADGE_SEVERITY_COLORS.error,
  warning: BADGE_SEVERITY_COLORS.warning,
  info: BADGE_SEVERITY_COLORS.info,
}

function matchesSearch(rule: PrometheusRule, term: string): boolean {
  if (rule.type === 'alert') {
    return (
      rule.alert.toLowerCase().includes(term) ||
      rule.expr.toLowerCase().includes(term) ||
      (rule.severity || '').toLowerCase().includes(term) ||
      (rule.summary || '').toLowerCase().includes(term) ||
      (rule.description || '').toLowerCase().includes(term)
    )
  }
  return (
    (rule.record || '').toLowerCase().includes(term) ||
    rule.expr.toLowerCase().includes(term)
  )
}

const EXPR_TRUNCATE_LEN = 200
const SUMMARY_TRUNCATE_LEN = 100

function TruncatedExpr({ expr }: { expr: string }) {
  const [expanded, setExpanded] = useState(false)
  const needsTruncation = expr.length > EXPR_TRUNCATE_LEN

  return (
    <div className="mt-1">
      <pre className="text-xs font-mono text-muted-foreground bg-popover rounded px-2 py-1.5 whitespace-pre-wrap break-all">
        {expanded || !needsTruncation ? expr : expr.slice(0, EXPR_TRUNCATE_LEN) + '...'}
      </pre>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] text-accent-text hover:underline mt-0.5"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

function AlertRuleCard({ rule }: { rule: PrometheusAlertRule }) {
  const severityClass = rule.severity ? SEVERITY_BADGE[rule.severity] : undefined
  const summaryText = rule.summary || rule.description || ''
  const truncatedSummary = summaryText.length > SUMMARY_TRUNCATE_LEN
    ? summaryText.slice(0, SUMMARY_TRUNCATE_LEN) + '...'
    : summaryText

  return (
    <div className="card-inner text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-foreground font-medium">{rule.alert}</span>
        {rule.severity && (
          <span className={cn('badge-sm', severityClass || 'bg-accent text-muted-foreground')}>
            {rule.severity}
          </span>
        )}
        {rule.for && (
          <span className="badge-sm bg-accent text-muted-foreground">
            for: {rule.for}
          </span>
        )}
      </div>
      {truncatedSummary && (
        <div className="text-xs text-muted-foreground/75 mt-1">{truncatedSummary}</div>
      )}
      <TruncatedExpr expr={rule.expr} />
    </div>
  )
}

function RecordingRuleCard({ rule }: { rule: PrometheusRecordingRule }) {
  return (
    <div className="card-inner text-sm">
      <div className="flex items-center gap-2">
        <span className="text-foreground font-medium">{rule.record}</span>
        <span className="badge-sm bg-accent text-muted-foreground/75">recording</span>
      </div>
      <TruncatedExpr expr={rule.expr} />
    </div>
  )
}

function RuleGroupSection({ group, searchTerm }: { group: PrometheusRuleGroup; searchTerm: string }) {
  const [manualExpanded, setManualExpanded] = useState(group.ruleCount <= 10)

  const filteredRules = useMemo(() => {
    if (!searchTerm) return group.rules
    const term = searchTerm.toLowerCase()
    return group.rules.filter((rule) => matchesSearch(rule, term))
  }, [group.rules, searchTerm])

  // Auto-expand when searching so matched rules are visible
  const expanded = searchTerm ? filteredRules.length > 0 : manualExpanded

  // If searching and no matches, hide the group entirely
  if (searchTerm && filteredRules.length === 0) return null

  return (
    <div className="card-inner">
      <button
        onClick={() => setManualExpanded(!manualExpanded)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <ChevronRight className={cn('w-3.5 h-3.5 text-muted-foreground/75 transition-transform duration-200', expanded && 'rotate-90')} />
          <span className="text-sm text-foreground font-medium">{group.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {group.interval && (
            <span className="badge-sm bg-accent text-muted-foreground">
              {group.interval}
            </span>
          )}
          <span className="text-xs text-muted-foreground/75">
            {searchTerm ? `${filteredRules.length}/${group.ruleCount}` : group.ruleCount} {pluralNoun(group.ruleCount, 'rule')}
          </span>
        </div>
      </button>
      {!expanded && (
        <div className="text-xs text-muted-foreground mt-1 ml-5.5 flex gap-3">
          {group.alertCount > 0 && <span>{pluralize(group.alertCount, 'alert')}</span>}
          {group.recordCount > 0 && <span>{group.recordCount} recording</span>}
        </div>
      )}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: expanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="mt-2 space-y-2">
            {filteredRules.map((rule, i) => (
              rule.type === 'alert'
                ? <AlertRuleCard key={`alert-${rule.alert}-${i}`} rule={rule} />
                : <RecordingRuleCard key={`rec-${rule.record}-${i}`} rule={rule} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PrometheusRuleRenderer({ data }: PrometheusRuleRendererProps) {
  const groups = getPrometheusRuleGroups(data)
  const totalRules = getPrometheusRuleTotalRules(data)
  const totalAlerts = groups.reduce((sum, g) => sum + g.alertCount, 0)
  const totalRecords = groups.reduce((sum, g) => sum + g.recordCount, 0)
  const conditions = data.status?.conditions

  const [searchTerm, setSearchTerm] = useState('')

  return (
    <>
      <Section title="PrometheusRule" icon={Bell}>
        <PropertyList>
          <Property label="Groups" value={String(getPrometheusRuleGroupCount(data))} />
          <Property label="Total Rules" value={String(totalRules)} />
          <Property label="Alert Rules" value={String(totalAlerts)} />
          <Property label="Recording Rules" value={String(totalRecords)} />
        </PropertyList>
      </Section>

      {groups.length > 0 && (
        <Section title={`Rule Groups (${groups.length})`} defaultExpanded>
          {/* Search bar */}
          {totalRules > 5 && (
            <div className="relative mb-3">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/75" />
              <Input
                placeholder="Filter rules by name or expression..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs bg-popover border border-border rounded-md text-foreground placeholder:text-muted-foreground/75 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
          )}
          <div className="space-y-2">
            {groups.map((group, i) => (
              <RuleGroupSection key={i} group={group} searchTerm={searchTerm} />
            ))}
            {searchTerm && groups.every(g => {
              const term = searchTerm.toLowerCase()
              return g.rules.every(rule => !matchesSearch(rule, term))
            }) && (
              <div className="text-xs text-muted-foreground/75 py-3 text-center">
                No rules match "{searchTerm}".
              </div>
            )}
          </div>
        </Section>
      )}

      <ConditionsSection conditions={conditions} />
    </>
  )
}
