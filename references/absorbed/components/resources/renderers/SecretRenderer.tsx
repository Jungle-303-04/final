import { useState, useCallback, useRef, useEffect } from 'react'
import { AlertTriangle, Copy, Check, Shield, Pencil, Save, XCircle, RefreshCw, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/shared/lib/cn'
import { stringify as yamlStringify } from 'yaml'
import { Section, PropertyList, Property, AlertBanner } from '../../ui/drawer-components'
import { ConfirmDialog } from '../../ui/ConfirmDialog'
import type { SecretCertificateInfo, CertificateInfo } from '../../../types'
import { pluralize } from '../../../utils/pluralize'
import { cleanResourceForYaml } from '../../../utils/yaml'

interface SecretRendererProps {
  data: any
  certificateInfo?: SecretCertificateInfo
  resourceData?: any
  onSaveSecretValue?: (yaml: string) => Promise<void>
  isSaving?: boolean
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function SecretRenderer({ data, certificateInfo, resourceData, onSaveSecretValue, isSaving }: SecretRendererProps) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [showSaveConfirm, setShowSaveConfirm] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dataKeys = Object.keys(data.data || {})
  const isImmutable = data.immutable === true

  function toggleReveal(key: string) {
    setRevealed(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function decodeBase64(value: string): string {
    try {
      return decodeURIComponent(escape(atob(value)))
    } catch {
      return '[binary data]'
    }
  }

  async function copyValue(key: string, decodedValue: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(decodedValue)
      setCopied(key)
      setTimeout(() => setCopied(null), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  function startEdit(key: string, decoded: string) {
    setEditingKey(key)
    setEditValue(decoded)
  }

  function cancelEdit() {
    setEditingKey(null)
    setEditValue('')
    setShowSaveConfirm(false)
  }

  const handleSave = useCallback(async (key: string, newValue: string) => {
    if (!onSaveSecretValue || !resourceData) return
    const cleaned = cleanResourceForYaml(resourceData)
    if (!cleaned.data) cleaned.data = {}
    // btoa is byte-only; round-trip through encodeURIComponent/unescape so non-ASCII secret values survive base64 encoding.
    cleaned.data[key] = btoa(unescape(encodeURIComponent(newValue)))
    const yaml = yamlStringify(cleaned, { lineWidth: 0, indent: 2 })
    try {
      await onSaveSecretValue(yaml)
      setEditingKey(null)
      setEditValue('')
      setShowSaveConfirm(false)
    } catch {
      // Error is handled by the mutation (toast)
      setShowSaveConfirm(false)
    }
  }, [onSaveSecretValue, resourceData])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [editValue])

  const certs = certificateInfo?.certificates
  const leafCert = certs?.[0]

  return (
    <>
      <Section title="Secret">
        <PropertyList>
          <Property label="Type" value={data.type || 'Opaque'} />
          <Property label="Keys" value={String(dataKeys.length)} />
          {data.immutable && <Property label="Immutable" value="Yes" />}
        </PropertyList>
      </Section>

      {/* Certificate expiry alerts */}
      {leafCert && leafCert.expired && (
        <AlertBanner
          variant="error"
          title="Certificate has expired"
          message={`Expired ${formatDate(leafCert.notAfter)}.${leafCert.daysLeft !== 0 ? ` ${Math.abs(leafCert.daysLeft)}d ago.` : ''}`}
        />
      )}

      {leafCert && !leafCert.expired && leafCert.daysLeft <= 7 && (
        <AlertBanner
          variant="error"
          title={`Certificate expires in ${pluralize(leafCert.daysLeft, 'day')}`}
          message="Check that cert-manager or your CA is renewing this certificate."
        />
      )}

      {leafCert && !leafCert.expired && leafCert.daysLeft > 7 && leafCert.daysLeft <= 30 && (
        <AlertBanner
          variant="warning"
          title={`Certificate expires in ${pluralize(leafCert.daysLeft, 'day')}`}
          message="Renewal should happen automatically before expiry."
        />
      )}

      {/* Certificate info section */}
      {certs && certs.length > 0 && (
        <>
          {certs.map((cert, i) => (
            <CertificateInfoSection
              key={cert.serialNumber}
              cert={cert}
              index={i}
              total={certs.length}
            />
          ))}
        </>
      )}

      {dataKeys.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded text-warning text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Secret values are sensitive. Reveal carefully — anyone who can see your
            screen will see the plaintext.
          </span>
        </div>
      )}

      <Section title="Data" defaultExpanded>
        <div className="space-y-2">
          {dataKeys.map((key) => {
            const decoded = decodeBase64(data.data[key])
            const isBinary = decoded === '[binary data]'
            const isEditing = editingKey === key
            const canEdit = onSaveSecretValue && !isImmutable && !isBinary

            return (
              <div key={key} className="card-inner">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-foreground truncate">{key}</span>
                  <div className="flex items-center gap-1 shrink-0">
                    {revealed.has(key) && !isBinary && !isEditing && canEdit && (
                      <button
                        onClick={() => startEdit(key, decoded)}
                        className="p-1 text-muted-foreground/75 hover:text-blue-400 transition-colors"
                        title="Edit value"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {revealed.has(key) && !isBinary && !isEditing && (
                      <button
                        onClick={() => copyValue(key, decoded)}
                        className="p-1 text-muted-foreground/75 hover:text-foreground transition-colors"
                        title="Copy value"
                      >
                        {copied === key ? (
                          <Check className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                    {!isEditing && (
                      <button
                        onClick={() => toggleReveal(key)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-popover transition-colors"
                      >
                        {revealed.has(key) ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                        {revealed.has(key) ? 'Hide' : 'Reveal'}
                      </button>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="mt-2">
                    <textarea
                      ref={textareaRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      autoCorrect="off"
                      autoCapitalize="off"
                      className="w-full bg-background rounded p-2 text-xs text-muted-foreground font-mono border border-blue-500/50 focus:border-blue-500 focus:outline-none resize-none overflow-hidden whitespace-pre-wrap"
                      style={{ minHeight: '60px' }}
                      disabled={isSaving}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => setShowSaveConfirm(true)}
                        disabled={isSaving}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs btn-brand rounded"
                      >
                        {isSaving ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <Save className="w-3 h-3" />
                        )}
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={cancelEdit}
                        disabled={isSaving}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded hover:bg-popover transition-colors disabled:opacity-50"
                      >
                        <XCircle className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : revealed.has(key) ? (
                  <pre className="mt-2 bg-background rounded p-2 text-xs text-muted-foreground overflow-x-auto max-h-40 whitespace-pre-wrap">
                    {decoded}
                  </pre>
                ) : null}
              </div>
            )
          })}
          {dataKeys.length === 0 && (
            <div className="text-sm text-muted-foreground/75">No data</div>
          )}
        </div>
      </Section>

      {editingKey && (
        <ConfirmDialog
          open={showSaveConfirm}
          onClose={() => setShowSaveConfirm(false)}
          onConfirm={() => handleSave(editingKey, editValue)}
          title="Update Secret"
          message={`Update key "${editingKey}" in secret "${data.metadata?.name || 'unknown'}"?`}
          details="This will modify the secret value in the cluster immediately."
          confirmLabel="Update"
          variant="warning"
          isLoading={isSaving}
        />
      )}
    </>
  )
}

function CertificateInfoSection({ cert, index, total }: { cert: CertificateInfo; index: number; total: number }) {
  const expiryTextColor = cert.expired || cert.daysLeft <= 7
    ? 'text-destructive'
    : cert.daysLeft <= 30
      ? 'text-warning'
      : 'text-success'

  const title = total > 1
    ? `Certificate ${index + 1} of ${total}`
    : 'Certificate Info'

  return (
    <Section title={title} icon={Shield} defaultExpanded={index === 0}>
      <PropertyList>
        <Property label="Subject (CN)" value={cert.subject} />
        {cert.sans && cert.sans.length > 0 && (
          <Property label="SANs" value={
            <div className="flex flex-wrap gap-1">
              {cert.sans.map(san => (
                <span key={san} className="badge bg-popover text-muted-foreground">
                  {san}
                </span>
              ))}
            </div>
          } />
        )}
        <Property label="Issuer" value={
          <span>
            {cert.issuer}
            {cert.selfSigned && (
              <span className="ml-2 text-[10px] px-1 py-0.5 bg-warning/10 text-warning rounded">self-signed</span>
            )}
          </span>
        } />
        <Property label="Key Type" value={cert.keyType} />
        <Property label="Serial" value={
          <span className="font-mono text-xs">{cert.serialNumber}</span>
        } />
        <Property label="Not Before" value={formatDate(cert.notBefore)} />
        <Property label="Expires" value={
          <span>
            {formatDate(cert.notAfter)}
            <span className={cn('ml-2 text-xs', expiryTextColor)}>
              {cert.expired
                ? `(expired ${Math.abs(cert.daysLeft)}d ago)`
                : `(${cert.daysLeft}d remaining)`}
            </span>
          </span>
        } />
      </PropertyList>
    </Section>
  )
}
