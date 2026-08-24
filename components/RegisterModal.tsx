'use client'
import { useEffect, useId, useRef, useState } from 'react'
import RegisterForm from './RegisterForm'
import type { FormField } from '@/types'
import { X } from 'lucide-react'

import type { ReactNode } from 'react'

interface Props {
  eventId: string
  eventTitle: string
  formFields: FormField[]
  triggerClassName?: string
  triggerLabel?: ReactNode
}

export default function RegisterModal({ eventId, eventTitle, formFields, triggerClassName, triggerLabel }: Props) {
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const previousOverflow = document.body.style.overflow
    const trigger = triggerRef.current
    document.body.style.overflow = 'hidden'

    const focusableSelector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',')

    const focusFirstControl = window.requestAnimationFrame(() => {
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector)
      controls?.[0]?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
      if (controls.length === 0) return
      const first = controls[0]
      const last = controls[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFirstControl)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      trigger?.focus()
    }
  }, [open])

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={triggerClassName ?? 'btn btn-primary btn-sm'}>
        {triggerLabel ?? 'Zapisz się'}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="bg-card rounded-t-3xl sm:rounded-3xl shadow-2xl border border-border w-full sm:max-w-lg max-h-[92dvh] flex flex-col"
          >
            <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Zapis na wydarzenie</p>
                <h2 id={titleId} className="font-heading font-semibold text-foreground truncate">{eventTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-border transition-colors shrink-0 ml-3"
                aria-label="Zamknij"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <RegisterForm
                eventId={eventId}
                formFields={formFields}
                onSuccess={() => setTimeout(() => setOpen(false), 2500)}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}

