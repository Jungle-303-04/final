import { useState, useEffect, type ComponentType } from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, Loader2, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'

import { DialogPortal } from '../ui/DialogPortal'
import { Input } from '../ui/Input'
import { Tooltip } from '../ui/Tooltip'
import type { GitOpsInsightRef } from '../../types/gitops-insights'

// =============================================================================
// SyncOptionsDialog — Argo CD Sync drawer, shared between per-cluster
// Opsia (OSS web/) and Opsia Hub's fleet GitOps detail page. Presentational
// only: caller controls open state, supplies the app label, and handles
// the onConfirm callback (POST to /api/argo/applications/{ns}/{name}/sync
// or the hub-proxied equivalent /c/{ctrl}/api/argo/...).
//
// Full sync defaults match Argo's most-common path (prune true, no dry-run,
// no force). Resource sync fixes prune off and omits revision/apply-only so
// selecting one object cannot opt into deletion behavior.
// =============================================================================

// ArgoSyncOpts is the payload shape the dialog passes to its onConfirm
// callback (and that downstream POSTs to `/api/argo/applications/{ns}/{name}/sync`
// expect). Exported separately so consumers can type the mutationFn arg
// without redeclaring the structure — keeps OSS and Hub in lockstep on
// the wire shape.
export interface ArgoSyncOpts {
  revision?: string
  prune: boolean
  dryRun: boolean
  force: boolean
  applyOnly: boolean
  syncOptions: string[]
}

export interface SyncOptionsDialogProps {
  open: boolean
  appLabel: string
  resource?: GitOpsInsightRef
  pending?: boolean
  autoSyncEnabled?: boolean
  validationPending?: boolean
  operationInProgress?: boolean
  validationResult?: ResourceValidationResult | null
  validationError?: string | null
  onCancel: () => void
  onConfirm: (opts: ArgoSyncOpts) => void
  onValidate?: (opts: ArgoSyncOpts) => void
  onValidationReset?: () => void
}

export interface ResourceValidationResult {
  outcome: 'succeeded' | 'failed' | 'inconclusive'
  message: string
  resource?: {
    status?: string
    message?: string
  }
}

export function SyncOptionsDialog({ open, appLabel, resource, pending, autoSyncEnabled, validationPending, operationInProgress, validationResult, validationError, onCancel, onConfirm, onValidate, onValidationReset }: SyncOptionsDialogProps) {
  const [revision, setRevision] = useState('')
  const [prune, setPrune] = useState(true)
  const [dryRun, setDryRun] = useState(false)
  const [force, setForce] = useState(false)
  const [applyOnly, setApplyOnly] = useState(false)
  const [replace, setReplace] = useState(false)
  const [serverSideApply, setServerSideApply] = useState(false)
  const richResourceValidation = !!resource && !!onValidate
  const busy = !!pending || !!validationPending
  const optionsDisabled = busy || !!operationInProgress

  // Reset on each open so a previous attempt's flags don't leak into the
  // next sync — easy footgun in modal-heavy flows.
  useEffect(() => {
    if (open) {
      setRevision('')
      setPrune(!resource)
      setDryRun(false)
      setForce(false)
      setApplyOnly(false)
      setReplace(false)
      setServerSideApply(false)
    }
  }, [open, resource])

  function submit() {
    onConfirm(buildArgoSyncOpts({ resourceMode: !!resource, revision, prune, dryRun: richResourceValidation ? false : dryRun, force, applyOnly, replace, serverSideApply }))
  }

  function validate() {
    onValidate?.(buildArgoSyncOpts({ resourceMode: true, revision, prune, dryRun: true, force, applyOnly, replace, serverSideApply }))
  }

  function updateValidationOption(setter: (value: boolean) => void, value: boolean) {
    setter(value)
    onValidationReset?.()
  }

  return (
    <DialogPortal open={open} onClose={busy ? () => {} : onCancel} className="w-[480px]" closable={!busy}>
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{resource ? 'Sync resource' : 'Sync application'}</h2>
        <p className="mt-0.5 break-all text-xs text-muted-foreground/75">{appLabel}</p>
      </div>
      <div className="space-y-4 px-4 py-4 text-sm">
        {resource && (
          <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning dark:text-warning" />
              <div className="min-w-0">
                <div className="break-all text-xs font-medium text-foreground">
                  {resource.kind} / {resource.namespace ? `${resource.namespace}/` : ''}{resource.name}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  Only this resource will be applied. Selective sync bypasses hooks and normal sync-wave ordering; use a full application sync when this resource depends on them.
                </p>
                {autoSyncEnabled && (
                  <p className="mt-2 border-t border-warning/20 pt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Auto-sync is enabled. Argo can reconcile this Application independently while the dry-run runs; a dry-run does not pause automation.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
        {!resource && (
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Revision (optional)</span>
            <Input
              value={revision}
              onChange={(e) => setRevision(e.target.value)}
              placeholder="HEAD"
              disabled={optionsDisabled}
              className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/75 focus:border-sky-500"
            />
            <span className="mt-0.5 block text-[11px] text-muted-foreground/75">
              Branch, tag, or commit SHA. Leave empty to use the Application's targetRevision.
            </span>
          </label>
        )}

        {/* Common (Prune / Dry run) sit above a divider; Advanced toggles
            stay accessible but visually subordinate so the common-case user
            can scan past them without parsing every helper line. */}
        {!richResourceValidation && (
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Sync options</legend>
            {!resource && <Toggle label="Prune" checked={prune} onChange={setPrune} disabled={optionsDisabled} hint="Delete resources that are no longer in Git." />}
            <Toggle label="Dry run" checked={dryRun} onChange={setDryRun} disabled={optionsDisabled} hint="Preview only — Argo computes the diff but applies nothing." />
          </fieldset>
        )}
        <fieldset className="space-y-2 border-t border-border pt-3">
          <legend className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/75">Advanced</legend>
          {!resource && <Toggle label="Apply only" checked={applyOnly} onChange={setApplyOnly} disabled={optionsDisabled} hint="Skip PreSync / PostSync / SyncFail hooks." />}
          <Toggle label="Force" checked={force} onChange={(value) => updateValidationOption(setForce, value)} disabled={optionsDisabled} hint="Use kubectl --force; required for some immutable-field changes." />
          <Toggle label="Replace" checked={replace} onChange={(value) => updateValidationOption(setReplace, value)} disabled={optionsDisabled} hint="kubectl replace instead of apply (drops fields not in source)." />
          <Toggle label="Server-side apply" checked={serverSideApply} onChange={(value) => updateValidationOption(setServerSideApply, value)} disabled={optionsDisabled} hint="Use the K8s server-side apply mechanism for ownership tracking." />
        </fieldset>
        {richResourceValidation && (validationPending || validationResult || validationError) && (
          <ValidationResult pending={!!validationPending} result={validationResult} error={validationError} />
        )}
        {richResourceValidation && !validationPending && operationInProgress && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Argo is finishing the current operation. Sync becomes available when it releases the operation slot.
          </p>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border bg-background px-4 py-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </button>
        {richResourceValidation && (
          <Tooltip content="Runs an Argo selective dry-run. Applies nothing; API admission can still reject the real sync." wrapperClassName="inline-flex">
            <button
              type="button"
              onClick={validate}
              disabled={optionsDisabled}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {validationPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              {validationPending ? 'Running dry-run…' : 'Dry-run'}
            </button>
          </Tooltip>
        )}
        <PrimaryButton onClick={submit} disabled={optionsDisabled} icon={pending ? Loader2 : RefreshCw} loading={pending} label={dryRun && !richResourceValidation ? 'Run dry-run' : resource ? 'Sync resource' : 'Sync now'} />
      </div>
    </DialogPortal>
  )
}

function ValidationResult({ pending, result, error }: { pending: boolean; result?: ResourceValidationResult | null; error?: string | null }) {
  if (pending) {
    return (
      <div className="card-inner flex items-start gap-2 px-3 py-2.5">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        <div>
          <div className="text-xs font-medium text-foreground">Running selective dry-run</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">Waiting for the selective dry-run result. No resource changes will be applied.</p>
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <div className="text-xs font-medium text-foreground">Dry-run could not start or complete</div>
            <p className="mt-0.5 max-h-20 overflow-auto break-words text-[11px] text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    )
  }
  if (!result) return null

  const succeeded = result.outcome === 'succeeded'
  const inconclusive = result.outcome === 'inconclusive'
  const Icon = succeeded ? CheckCircle2 : inconclusive ? CircleAlert : XCircle
  const title = succeeded ? 'Dry-run passed' : inconclusive ? 'Dry-run was inconclusive' : 'Dry-run failed'
  const surface = succeeded
    ? 'border-success/30 bg-success/5'
    : inconclusive
      ? 'border-warning/30 bg-warning/5'
      : 'border-destructive/30 bg-destructive/5'
  const iconTone = succeeded ? 'text-success' : inconclusive ? 'text-warning' : 'text-destructive'
  return (
    <div className={`rounded-md border px-3 py-2.5 ${surface}`}>
      <div className="flex items-start gap-2">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconTone}`} />
        <div className="min-w-0">
          <div className="text-xs font-medium text-foreground">{title}</div>
          <p className="mt-0.5 max-h-20 overflow-auto break-words text-[11px] text-muted-foreground">{result.message}</p>
          {(result.resource?.status || result.resource?.message) && (
            <div className="mt-2 max-h-28 overflow-auto break-all font-mono text-[10px] text-muted-foreground">
              {result.resource.status}{result.resource.status && result.resource.message ? ' — ' : ''}{result.resource.message}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function buildArgoSyncOpts({ resourceMode, revision, prune, dryRun, force, applyOnly, replace, serverSideApply }: {
  resourceMode: boolean
  revision: string
  prune: boolean
  dryRun: boolean
  force: boolean
  applyOnly: boolean
  replace: boolean
  serverSideApply: boolean
}): ArgoSyncOpts {
  const syncOptions: string[] = []
  if (replace) syncOptions.push('Replace=true')
  if (serverSideApply) syncOptions.push('ServerSideApply=true')
  return {
    revision: resourceMode ? undefined : revision.trim() || undefined,
    prune: resourceMode ? false : prune,
    dryRun,
    force,
    applyOnly: resourceMode ? false : applyOnly,
    syncOptions,
  }
}

function Toggle({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="mt-0.5 h-3.5 w-3.5 cursor-pointer accent-sky-500 disabled:cursor-not-allowed"
      />
      <div className="min-w-0">
        <div className="text-xs text-foreground">{label}</div>
        {hint && <div className="text-[11px] text-muted-foreground/75">{hint}</div>}
      </div>
    </label>
  )
}

function PrimaryButton({ onClick, disabled, icon: Icon, loading, label }: { onClick: () => void; disabled?: boolean; icon: ComponentType<{ className?: string }>; loading?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-brand inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
      {label}
    </button>
  )
}
