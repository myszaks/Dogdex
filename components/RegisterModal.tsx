'use client'
import { useState } from 'react'
import RegisterForm from './RegisterForm'
import type { FormField } from '@/types'

interface Props {
  eventId: string
  eventTitle: string
  formFields: FormField[]
}

export default function RegisterModal({ eventId, eventTitle, formFields }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary btn-sm">
        Zapisz się
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[92dvh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div className="min-w-0">
                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Zapis</p>
                <h2 className="font-semibold text-slate-800 truncate">{eventTitle}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 shrink-0 ml-3"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
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
