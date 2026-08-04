'use client'

import { useState } from 'react'
import { Megaphone, Send } from 'lucide-react'
import { formatDate } from '@/lib/utils'

interface Announcement {
  id: string
  title: string
  body: string
  audience: 'confirmed' | 'active' | 'waitlist'
  recipient_count: number
  delivered_count: number
  failed_count: number
  created_at: string
}

interface Props {
  eventId: string
  initialAnnouncements: Announcement[]
}

const audienceLabel = {
  confirmed: 'Potwierdzeni uczestnicy',
  active: 'Oczekujący i potwierdzeni',
  waitlist: 'Lista rezerwowa',
}

export default function EventAnnouncementsPanel({ eventId, initialAnnouncements }: Props) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<Announcement['audience']>('confirmed')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendAnnouncement(event: React.FormEvent) {
    event.preventDefault()
    setSending(true)
    setError(null)
    try {
      const response = await fetch(`/api/events/${eventId}/announcements`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, message, audience }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'Nie udało się wysłać komunikatu')
      setAnnouncements(current => [data, ...current])
      setTitle('')
      setMessage('')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nie udało się wysłać komunikatu')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="card p-6">
      <div>
        <h3 className="flex items-center gap-2 font-heading text-lg font-semibold"><Megaphone className="h-5 w-5 text-accent" />Komunikaty do uczestników</h3>
        <p className="mt-1 text-sm text-muted-foreground">Wiadomość trafi e-mailem i pozostanie w historii wydarzenia odbiorcy.</p>
      </div>

      <form onSubmit={sendAnnouncement} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="announcement-title" className="form-label">Tytuł</label>
            <input id="announcement-title" className="form-input" value={title} maxLength={120} required onChange={event => setTitle(event.target.value)} placeholder="Np. Zmiana miejsca odprawy" />
          </div>
          <div>
            <label htmlFor="announcement-audience" className="form-label">Odbiorcy</label>
            <select id="announcement-audience" className="form-input" value={audience} onChange={event => setAudience(event.target.value as Announcement['audience'])}>
              {Object.entries(audienceLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="announcement-message" className="form-label">Treść komunikatu</label>
          <textarea id="announcement-message" className="form-input min-h-28 resize-y" value={message} maxLength={5000} required onChange={event => setMessage(event.target.value)} placeholder="Napisz konkretnie, co się zmieniło i czego oczekujesz od uczestników." />
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end">
          <button className="btn btn-primary" disabled={sending || !title.trim() || !message.trim()}>
            <Send className="h-4 w-4" />{sending ? 'Wysyłanie…' : 'Wyślij komunikat'}
          </button>
        </div>
      </form>

      {announcements.length > 0 && (
        <div className="mt-7 border-t border-border pt-5">
          <h4 className="text-sm font-semibold text-foreground">Historia komunikatów</h4>
          <div className="mt-3 space-y-3">
            {announcements.map(announcement => (
              <article key={announcement.id} className="rounded-2xl bg-secondary/70 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-foreground">{announcement.title}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{announcement.body}</p>
                  </div>
                  <p className="shrink-0 text-xs text-muted-foreground">{formatDate(announcement.created_at)}</p>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {audienceLabel[announcement.audience]} · wysłano {announcement.delivered_count}/{announcement.recipient_count}
                  {announcement.recipient_count - announcement.delivered_count - announcement.failed_count > 0
                    ? ` · w kolejce: ${announcement.recipient_count - announcement.delivered_count - announcement.failed_count}`
                    : ''}
                  {announcement.failed_count > 0 ? ` · błędy: ${announcement.failed_count}` : ''}
                </p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
