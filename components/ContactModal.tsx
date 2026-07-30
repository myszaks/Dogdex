'use client'
import { useState, useEffect } from 'react'
import Modal from './Modal'
import useUser from '@/hooks/useUser'
import { getSupabaseBrowserClient } from '@/lib/supabaseClient'

interface Props {
  open: boolean
  onClose: () => void
}

export default function ContactModal({ open, onClose }: Props) {
  const supabase = getSupabaseBrowserClient()
  const { user } = useUser()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  // Pre-fill email immediately; try to fetch full_name from profile
  useEffect(() => {
    if (!open) return
    if (!user) return
    setEmail(user.email ?? '')
    // Try metadata first (OAuth providers), then fetch profile
    const metaName = (user.user_metadata?.full_name ?? user.user_metadata?.name ?? '') as string
    if (metaName) {
      setName(metaName)
    } else if (supabase) {
      supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.full_name) setName(data.full_name as string)
        })
    }
  }, [user, open, supabase])

  // Reset form when closing
  useEffect(() => {
    if (!open) {
      setSubject('')
      setMessage('')
      setStatus('idle')
      setErrorMsg('')
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setStatus('idle')
    setErrorMsg('')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, subject, message }),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus('success')
      } else {
        setStatus('error')
        setErrorMsg(data.error ?? 'Coś poszło nie tak')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Błąd połączenia — sprawdź internet i spróbuj ponownie')
    }
    setLoading(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="📨 Pomoc i kontakt">
      {status === 'success' ? (
        <div className="text-center py-6">
          <p className="text-5xl mb-4">✅</p>
          <p className="font-semibold text-slate-800 text-lg">Wiadomość wysłana!</p>
          <p className="text-sm text-slate-500 mt-2">
            Odpowiemy na adres <strong>{email}</strong> najszybciej jak to możliwe.
          </p>
          <button onClick={onClose} className="btn btn-primary mt-6 w-full">
            Zamknij
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          aria-describedby={status === 'error' ? 'contact-form-error' : undefined}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="contact-name" className="form-label">Imię *</label>
              <input
                id="contact-name"
                type="text"
                required
                maxLength={120}
                value={name}
                onChange={e => setName(e.target.value)}
                className="form-input"
                placeholder="Jan Kowalski"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="form-label">E-mail *</label>
              <input
                id="contact-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="form-input"
                placeholder="jan@example.com"
              />
            </div>
          </div>

          <div>
            <label htmlFor="contact-subject" className="form-label">Temat *</label>
            <input
              id="contact-subject"
              type="text"
              required
              maxLength={200}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="form-input"
              placeholder="np. Problem z rejestracją, Pytanie o wydarzenie..."
            />
          </div>

          <div>
            <label htmlFor="contact-message" className="form-label">Wiadomość *</label>
            <textarea
              id="contact-message"
              required
              rows={5}
              maxLength={5000}
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="form-input resize-none"
              placeholder="Opisz swój problem lub pytanie..."
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{message.length} / 5000</p>
          </div>

          {status === 'error' && (
            <p id="contact-form-error" role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorMsg}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
              Anuluj
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary flex-1"
            >
              {loading ? '⏳ Wysyłanie...' : '📨 Wyślij wiadomość'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
