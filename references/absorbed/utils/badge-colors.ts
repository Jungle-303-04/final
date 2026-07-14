// Centralized badge color utilities for consistent light/dark mode theming
// Color definitions live in Badge.tsx (static strings for Tailwind scanning)
// This file re-exports them and provides helper functions for backwards compat

import { BADGE_SEVERITY_COLORS, BADGE_KIND_COLORS, getKindColorClass } from '../components/ui/Badge'

// Kind badge colors - re-exported from Badge.tsx (static strings, Tailwind-safe)
export const KIND_BADGE_COLORS: Record<string, string> = BADGE_KIND_COLORS

// Kind badge bordered - same as KIND_BADGE_COLORS (colors already include border classes)
export const KIND_BADGE_BORDERED: Record<string, string> = BADGE_KIND_COLORS

export { getKindColorClass }

// Event type colors - for K8s event types (Normal, Warning)
export const EVENT_TYPE_COLORS: Record<string, string> = {
  Warning: 'bg-warning text-warning border-warning dark:bg-warning/40 dark:text-warning dark:border-warning/40',
  Normal: 'bg-success text-success border-success dark:bg-success/40 dark:text-success dark:border-success/40',
}

// Operation colors - for change events (add, update, delete)
export const OPERATION_COLORS: Record<string, string> = {
  add: 'text-success dark:text-success',
  update: 'text-sky-700 dark:text-sky-400',
  delete: 'text-destructive dark:text-destructive',
}

// Operation background colors - derived from SEVERITY
export const OPERATION_BADGE_COLORS: Record<string, string> = {
  add: BADGE_SEVERITY_COLORS.success,
  update: BADGE_SEVERITY_COLORS.info,
  delete: BADGE_SEVERITY_COLORS.error,
}

// Health badge colors - derived from SEVERITY
export const HEALTH_BADGE_COLORS: Record<string, string> = {
  healthy: BADGE_SEVERITY_COLORS.success,
  degraded: BADGE_SEVERITY_COLORS.warning,
  alert: BADGE_SEVERITY_COLORS.alert,
  unhealthy: BADGE_SEVERITY_COLORS.error,
  // neutral = intentional/idle (suspended, scaled-to-0, completed) — sky, calm
  // and distinct from `unknown` (gray, "can't determine"). Reuses the `info`
  // sky palette; see `.status-neutral` in styles/$1.css.
  neutral: BADGE_SEVERITY_COLORS.info,
  unknown: BADGE_SEVERITY_COLORS.neutral,
}

// Helm release status colors - derived from SEVERITY
export const HELM_STATUS_COLORS: Record<string, string> = {
  deployed: BADGE_SEVERITY_COLORS.success,
  superseded: BADGE_SEVERITY_COLORS.neutral,
  failed: BADGE_SEVERITY_COLORS.error,
  'pending-install': BADGE_SEVERITY_COLORS.warning,
  'pending-upgrade': BADGE_SEVERITY_COLORS.warning,
  'pending-rollback': BADGE_SEVERITY_COLORS.warning,
  uninstalling: BADGE_SEVERITY_COLORS.warning,
  uninstalled: BADGE_SEVERITY_COLORS.neutral,
}

// Cloud instance capacity/priority badges — used by Karpenter NodeClaim and CAPI cloud-provider renderers
// Keyed by the value as it appears in the resource (spot, on-demand, regular, onDemand)
export const CAPACITY_TYPE_BADGE: Record<string, string> = {
  spot: 'bg-warning text-warning border-warning dark:bg-warning/50 dark:text-warning dark:border-warning/40',
  'on-demand': 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-700/40',
  onDemand: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-700/40',
  regular: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-700/40',
}

// AKS-style nodepool mode badges — System (control plane) vs User (workload)
export const NODEPOOL_MODE_BADGE: Record<string, string> = {
  System: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-400 dark:border-purple-700/40',
  User: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-700/40',
}

// Translucent gray badge for "inactive / unknown / pending / unset / disabled" states.
// The de-facto fallback in renderers when no severity or category applies.
export const BADGE_INACTIVE = 'bg-gray-500/20 text-gray-400'

// Best practices category colors
export const BP_CATEGORY_BADGE: Record<string, string> = {
  Security: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800/40',
  Reliability: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:border-sky-800/40',
  Efficiency: 'bg-success text-success border-success dark:bg-success/40 dark:text-success dark:border-success/40',
}

// Default fallback color
export const DEFAULT_BADGE_COLOR = 'bg-popover text-muted-foreground'

// =============================================================================
// SEVERITY COLORS - for status indicators, alerts, and feedback
// =============================================================================

// Severity badge colors — re-exported from Badge.tsx (static strings, Tailwind-safe)
export const SEVERITY_BADGE = BADGE_SEVERITY_COLORS

// Severity text colors - without background (for inline text, icons)
export const SEVERITY_TEXT = {
  success: 'text-success dark:text-success',
  warning: 'text-warning dark:text-warning',
  alert: 'text-orange-700 dark:text-orange-400',
  error: 'text-destructive dark:text-destructive',
  info: 'text-sky-700 dark:text-sky-400',
  neutral: 'text-muted-foreground',
} as const

// Severity dot/indicator colors - solid colors for small status dots
export const SEVERITY_DOT = {
  success: 'bg-success',
  warning: 'bg-warning',
  alert: 'bg-orange-500',
  error: 'bg-destructive',
  info: 'bg-sky-500',
  neutral: 'bg-accent',
} as const

// Severity border colors - for bordered elements
export const SEVERITY_BORDER = {
  success: 'border-success dark:border-success/40',
  warning: 'border-warning dark:border-warning/40',
  alert: 'border-orange-200 dark:border-orange-800/40',
  error: 'border-destructive dark:border-destructive/40',
  info: 'border-sky-200 dark:border-sky-800/40',
  neutral: 'border-border',
} as const

// Combined severity styles - same as SEVERITY_BADGE (border comes from .badge class + border-color in color string)
export const SEVERITY_BADGE_BORDERED = {
  ...BADGE_SEVERITY_COLORS,
  debug: 'bg-gray-50 text-gray-600 border-gray-200 dark:bg-gray-900/30 dark:text-gray-400 dark:border-gray-700/40',
} as const

// Severity type
export type Severity = 'success' | 'warning' | 'alert' | 'error' | 'info' | 'neutral'

// =============================================================================
// RESOURCE STATUS COLORS - for K8s resource states
// =============================================================================

// Pod/workload status colors - maps common K8s status strings to severity
export const RESOURCE_STATUS_COLORS: Record<string, string> = {
  // Success states
  running: SEVERITY_BADGE.success,
  active: SEVERITY_BADGE.success,
  succeeded: SEVERITY_BADGE.success,
  bound: SEVERITY_BADGE.success,
  ready: SEVERITY_BADGE.success,
  available: SEVERITY_BADGE.success,

  // Warning states
  pending: SEVERITY_BADGE.warning,
  progressing: SEVERITY_BADGE.warning,
  suspended: SEVERITY_BADGE.warning,
  'scaled to 0': SEVERITY_BADGE.warning,
  waiting: SEVERITY_BADGE.warning,

  // Error states
  failed: SEVERITY_BADGE.error,
  error: SEVERITY_BADGE.error,
  crashloopbackoff: SEVERITY_BADGE.error,
  imagepullbackoff: SEVERITY_BADGE.error,
  evicted: SEVERITY_BADGE.error,
  oomkilled: SEVERITY_BADGE.error,

  // Info/completed states
  completed: SEVERITY_BADGE.info,
  terminated: SEVERITY_BADGE.info,

  // Unknown/neutral
  unknown: SEVERITY_BADGE.neutral,
}

// Helper functions

/**
 * Get severity badge classes (with background)
 */
export function getSeverityBadge(severity: Severity): string {
  return SEVERITY_BADGE[severity]
}

/**
 * Get severity text classes (no background)
 */
export function getSeverityText(severity: Severity): string {
  return SEVERITY_TEXT[severity]
}

/**
 * Get severity dot classes (solid background for indicators)
 */
export function getSeverityDot(severity: Severity): string {
  return SEVERITY_DOT[severity]
}

/**
 * Get severity badge with border classes
 */
export function getSeverityBadgeBordered(severity: Severity): string {
  return SEVERITY_BADGE_BORDERED[severity]
}

/**
 * Get resource status badge color from a status string
 * Automatically maps common K8s status strings to appropriate colors
 */
export function getResourceStatusColor(status: string): string {
  if (!status) return SEVERITY_BADGE.neutral
  const statusLower = status.toLowerCase()
  return RESOURCE_STATUS_COLORS[statusLower] || SEVERITY_BADGE.neutral
}

/**
 * Map a health/status level to a severity
 */
export function healthToSeverity(health: string): Severity {
  switch (health.toLowerCase()) {
    case 'healthy':
    case 'success':
    case 'running':
    case 'ready':
      return 'success'
    case 'degraded':
    case 'warning':
    case 'pending':
      return 'warning'
    case 'alert':
      return 'alert'
    case 'unhealthy':
    case 'error':
    case 'failed':
      return 'error'
    // health 'neutral' (intentional/idle) renders sky via the `info` palette —
    // calm, and visually distinct from 'unknown' which falls through to gray.
    case 'neutral':
    case 'info':
      return 'info'
    default:
      return 'neutral'
  }
}

// =============================================================================
// LEGACY HELPER FUNCTIONS - for backward compatibility
// =============================================================================

/**
 * Get the badge color classes for a K8s resource kind
 */
export function getKindBadgeColor(kind: string): string {
  return KIND_BADGE_COLORS[kind] || DEFAULT_BADGE_COLOR
}

/**
 * Get the badge color classes with border for a K8s resource kind
 */
export function getKindBadgeBordered(kind: string): string {
  return KIND_BADGE_BORDERED[kind] || 'bg-accent/50 text-muted-foreground border border-border'
}

/**
 * Get the badge color classes for a K8s event type (Normal, Warning)
 */
export function getEventTypeColor(eventType: string): string {
  return EVENT_TYPE_COLORS[eventType] || DEFAULT_BADGE_COLOR
}

/**
 * Get the text color classes for a change operation (add, update, delete)
 */
export function getOperationColor(operation: string): string {
  return OPERATION_COLORS[operation] || 'text-muted-foreground'
}

/**
 * Get the badge color classes for a change operation (add, update, delete)
 */
export function getOperationBadgeColor(operation: string): string {
  return OPERATION_BADGE_COLORS[operation] || DEFAULT_BADGE_COLOR
}

/**
 * Get the badge color classes for a health state
 */
export function getHealthBadgeColor(healthState: string): string {
  return HEALTH_BADGE_COLORS[healthState] || HEALTH_BADGE_COLORS.unknown
}

/**
 * Get the badge color classes for a Helm release status
 */
export function getHelmStatusColor(status: string): string {
  const statusLower = status.toLowerCase()
  return HELM_STATUS_COLORS[statusLower] || 'bg-accent/50 text-muted-foreground'
}

/**
 * Helm release statuses where the row UI should signpost the user
 * toward the drawer (history / rollback / logs).
 *
 * Currently `failed` only. The `pending-*` statuses (install /
 * upgrade / rollback) are excluded deliberately: they're Helm's
 * normal in-flight states during every routine operation. Treating
 * them as "actionable" would briefly attach an alarming chevron +
 * tooltip to every install while it ran — indistinguishable from
 * the genuinely-stuck case (controller crashed mid-flight). Until
 * we have release age available client-side to disambiguate
 * "in-flight" from "stuck > N min", we give up the stuck-detect
 * signpost rather than wrongly alarm the common case.
 *
 * @see https://github.com/helm/helm/blob/dev-v3/pkg/release/status.go
 */
const ACTIONABLE_HELM_STATUSES: ReadonlySet<string> = new Set([
  'failed',
])

export function isHelmReleaseActionable(status: string | null | undefined): boolean {
  if (!status) return false
  return ACTIONABLE_HELM_STATUSES.has(status.toLowerCase())
}

// =============================================================================
// VULNERABILITY SEVERITY COLORS - for Trivy and other security scanners
// =============================================================================

export const VULN_SEVERITY_BADGE: Record<string, string> = {
  CRITICAL: 'bg-destructive text-destructive border-destructive dark:bg-destructive/50 dark:text-destructive dark:border-destructive/40',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-700/40',
  MEDIUM: 'bg-warning text-warning border-warning dark:bg-warning/50 dark:text-warning dark:border-warning/40',
  LOW: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/50 dark:text-sky-400 dark:border-sky-700/40',
  UNKNOWN: 'bg-gray-100 text-gray-700 border-gray-300 dark:bg-gray-950/50 dark:text-gray-400 dark:border-gray-700/40',
}

export const VULN_SEVERITY_BAR: Record<string, string> = {
  CRITICAL: 'bg-destructive',
  HIGH: 'bg-orange-500',
  MEDIUM: 'bg-warning',
  LOW: 'bg-blue-500',
  UNKNOWN: 'bg-gray-500',
}

export const VULN_SEVERITY_TEXT: Record<string, string> = {
  CRITICAL: 'text-destructive dark:text-destructive',
  HIGH: 'text-orange-700 dark:text-orange-400',
  MEDIUM: 'text-warning dark:text-warning',
  LOW: 'text-blue-700 dark:text-blue-400',
  UNKNOWN: 'text-gray-600 dark:text-gray-400',
}
