// Shared severity color vocabulary. The Issue card (2-tier: critical/warning)
// and the Check card (4-tier: critical/high/medium/low) are different severity
// axes, but every tier resolves to one of four hues — so the color strings live
// here once and each card maps its own severity enum onto a tone. A palette
// change lands in one place instead of drifting between the two cards.
//
// Literal class strings (no template interpolation) so Tailwind's scanner sees
// every utility.

export type SeverityTone = 'red' | 'orange' | 'amber' | 'yellow' | 'slate'

// Text color — leading severity glyph + emphasis text. Yellow takes the darker
// -700 step in light mode: its low luminance is illegible at -600 on a light
// surface, where red/orange/amber still clear.
export const TONE_TEXT_CLASS: Record<SeverityTone, string> = {
  red: 'text-destructive dark:text-destructive',
  orange: 'text-orange-600 dark:text-orange-400',
  amber: 'text-warning dark:text-warning',
  yellow: 'text-warning dark:text-warning',
  slate: 'text-slate-500 dark:text-slate-400',
}

// Solid fill — dots + the proportional distribution-bar segments.
export const TONE_FILL_CLASS: Record<SeverityTone, string> = {
  red: 'bg-destructive',
  orange: 'bg-orange-500',
  amber: 'bg-warning',
  yellow: 'bg-warning',
  slate: 'bg-slate-400',
}

// Left accent rail on a collapsed queue row — the scan-down severity cue + a
// faint hover tint. The expanded row swaps this for the header band below.
export const TONE_RAIL_CLASS: Record<SeverityTone, string> = {
  red: 'border-l-red-500 hover:bg-destructive/40 dark:hover:bg-destructive/20',
  orange: 'border-l-orange-500 hover:bg-orange-50/40 dark:hover:bg-orange-950/20',
  amber: 'border-l-amber-500 hover:bg-warning/30 dark:hover:bg-warning/15',
  yellow: 'border-l-yellow-500 hover:bg-warning/30 dark:hover:bg-warning/15',
  slate: 'border-l-slate-300 dark:border-l-slate-600 hover:bg-accent/40',
}

// Solid severity pill — the loud focus signal on an expanded card's header band
// (collapsed cards keep the soft BADGE pill so a long queue stays calm).
// The warm mid-tones (orange/amber/yellow) take dark text: white on them sits
// below WCAG for the 12px pill text.
export const TONE_SOLID_CLASS: Record<SeverityTone, string> = {
  red: 'bg-destructive text-white',
  orange: 'bg-orange-500 text-orange-950',
  amber: 'bg-warning text-warning',
  yellow: 'bg-warning text-warning',
  slate: 'bg-slate-500 text-white dark:bg-slate-600',
}

// Severity-tinted header band, shown only when a card is expanded. The left
// rail keeps its color so the queue's scan-down severity rhythm doesn't break
// at the focused row; no hover variant, so it doesn't lighten on hover.
export const TONE_HEADER_BAND_CLASS: Record<SeverityTone, string> = {
  red: 'border-l-red-500 bg-destructive dark:bg-destructive/40',
  orange: 'border-l-orange-500 bg-orange-50 dark:bg-orange-950/30',
  amber: 'border-l-amber-500 bg-warning dark:bg-warning/30',
  yellow: 'border-l-yellow-500 bg-warning dark:bg-warning/30',
  slate: 'border-l-slate-300 dark:border-l-slate-600 bg-slate-50 dark:bg-slate-900/40',
}
