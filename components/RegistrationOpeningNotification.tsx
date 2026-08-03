'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, Check } from 'lucide-react'
import AuthModal from '@/components/AuthModal'
import useUser from '@/hooks/useUser'

interface Props {
  eventId: string
  opensAt: string
  className?: string
}

export default function RegistrationOpeningNotification({ eventId, opensAt, className }: Props) {
  const { loading: authLoading, user } = useUser()
  const [subscribed, setSubscribed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (!user) return

    const controller = new AbortController()
    fetch(`/api/events/${eventId}/registration-notification`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : { subscribed: false })
      .then(data => setSubscribed(Boolean(data.subscribed)))
      .finally(() => setChecking(false))
    return () => controller.abort()
  }, [authLoading, eventId, user])

  const isSubscribed = Boolean(user && subscribed)
  const isChecking = authLoading || Boolean(user && checking)

  async function toggleSubscription() {
    if (!user) {
      setAuthOpen(true)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`/api/events/${eventId}/registration-notification`, {
        method: isSubscribed ? 'DELETE' : 'POST',
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nie udało się zmienić powiadomienia')
      setSubscribed(Boolean(data.subscribed))
    } catch (requestError) {
      setError((requestError as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const formattedOpensAt = new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(opensAt))

  return (
    <div className={className}>
      <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Zapisy ruszą {formattedOpensAt}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Wyślemy Ci jedną wiadomość e-mail, gdy formularz zapisów zostanie otwarty.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={isChecking || saving}
          onClick={toggleSubscription}
          className={`btn mt-4 w-full ${isSubscribed ? 'btn-secondary' : 'btn-primary'}`}
        >
          {isSubscribed ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
          {isChecking
            ? 'Sprawdzanie…'
            : saving
              ? 'Zapisywanie…'
              : isSubscribed
                ? 'Wyłącz powiadomienie'
                : 'Powiadom mnie o starcie zapisów'}
        </button>

        {isSubscribed && !saving && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Powiadomienie jest włączone dla adresu przypisanego do Twojego konta.
          </p>
        )}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </div>
  )
}
