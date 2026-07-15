import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

export interface SelectMenuOption {
  value: string
  label: string
}

export function SelectMenu({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  value: string
  options: SelectMenuOption[]
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-full items-center justify-between gap-2 rounded-md border border-border bg-popover px-2.5 text-xs text-foreground transition-colors hover:bg-accent"
      >
        <span className="truncate">{selected?.label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground/75 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" className="absolute right-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-md border border-border bg-card py-1 shadow-lg">
          {options.map((option) => {
            const active = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 whitespace-nowrap px-2.5 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0 text-accent', !active && 'opacity-0')} />
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
