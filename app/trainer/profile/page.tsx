'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import type { TrainerProfile } from '@/types'
import TrainerPhotoUploader from '@/components/TrainerPhotoUploader'

const STRIPE_ERROR_MESSAGES: Record<string, string> = {
  Brak_autoryzacji: 'Brak autoryzacji Stripe. Spróbuj połączyć konto ponownie.',
  Stripe_error: 'Nie udało się połączyć konta Stripe. Spróbuj ponownie za chwilę.',
}

export default function TrainerProfilePage() {
  const searchParams = useSearchParams()
  const [profile, setProfile] = useState<TrainerProfile & { stripe_onboarded?: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stripeConnecting, setStripeConnecting] = useState(false)

  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    location_city: '',
    location_details: '',
    profile_image_url: '',
    is_active: false,
  })

  useEffect(() => {
    // Check for stripe callback messages
    const stripeConnected = searchParams?.get('stripe_connected')
    const stripeError = searchParams?.get('error')

    if (stripeConnected === 'true') {
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    }
    if (stripeError) {
      setError(STRIPE_ERROR_MESSAGES[stripeError] ?? 'Wystąpił błąd Stripe. Spróbuj ponownie za chwilę.')
      setTimeout(() => setError(null), 5000)
    }
  }, [searchParams])

  useEffect(() => {
    fetch('/api/trainer-profile')
      .then(r => r.json())
      .then(data => {
        if (data) {
          setProfile(data)
          setFormData({
            full_name: data.full_name || '',
            bio: data.bio || '',
            location_city: data.location_city || '',
            location_details: data.location_details || '',
            profile_image_url: data.profile_image_url || '',
            is_active: data.is_active || false,
          })
        }
        setLoading(false)
      })
      .catch(err => {
        setError('Błąd przy ładowaniu profilu')
        setLoading(false)
      })
  }, [])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target as HTMLInputElement
    if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked,
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value,
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const payload = {
        ...formData,
      }

      const response = await fetch('/api/trainer-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Błąd przy zapisywaniu')
      }

      const data = await response.json()
      setProfile(data)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleStripeConnect = async () => {
    setStripeConnecting(true)
    try {
      const response = await fetch('/api/stripe/connect')
      if (!response.ok) {
        throw new Error('Błąd przy łączeniu ze Stripe')
      }
      // Redirect happens automatically
    } catch (err) {
      setError((err as Error).message)
      setStripeConnecting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link href="/trainer" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" />
          Wróć do panelu
        </Link>
        <div className="text-center text-slate-500">Ładowanie…</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link href="/trainer" className="inline-flex items-center gap-2 text-accent hover:underline mb-6">
        <ArrowLeft className="w-4 h-4" />
        Wróć do panelu
      </Link>

      <div className="space-y-6">
        {/* Profile Form */}
        <div className="card p-8">
          <h1 className="font-heading font-bold text-3xl mb-6">Edytuj profil trenera</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Full Name */}
            <div>
              <label className="block text-sm font-semibold mb-2">Imię i nazwisko *</label>
              <input
                type="text"
                name="full_name"
                value={formData.full_name}
                onChange={handleChange}
                required
                className="form-input"
                placeholder="Jan Kowalski"
              />
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-semibold mb-2">O Tobie</label>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                className="form-input resize-none"
                rows={4}
                placeholder="Opowiedz o sobie, doświadczeniu i specjalizacjach…"
              />
            </div>

            {/* Location City */}
            <div>
              <label className="block text-sm font-semibold mb-2">Miasto</label>
              <input
                type="text"
                name="location_city"
                value={formData.location_city}
                onChange={handleChange}
                className="form-input"
                placeholder="Warszawa"
              />
            </div>

            {/* Location Details */}
            <div>
              <label className="block text-sm font-semibold mb-2">Szczegóły lokalizacji</label>
              <input
                type="text"
                name="location_details"
                value={formData.location_details}
                onChange={handleChange}
                className="form-input"
                placeholder="np. Park Lazienki, Dąb Park"
              />
            </div>            

            {/* Profile Image Upload */}
            <div>
              <label className="block text-sm font-semibold mb-2">Zdjęcie profilu</label>
              <TrainerPhotoUploader
                currentUrl={formData.profile_image_url || null}
                onUrlChange={(url) => {
                  setFormData(prev => ({
                    ...prev,
                    profile_image_url: url || '',
                  }))
                }}
              />
            </div>

            {/* Is Active */}
            <div className="flex items-center gap-3 p-4 bg-accent/5 rounded-lg border border-accent/20">
              <input
                type="checkbox"
                name="is_active"
                checked={formData.is_active}
                onChange={handleChange}
                id="is_active"
                className="w-5 h-5"
              />
              <label htmlFor="is_active" className="flex-1 cursor-pointer">
                <p className="font-semibold text-sm">Profil aktywny</p>
                <p className="text-xs text-muted-foreground">
                  Zaznacz aby Twój profil był widoczny dla użytkowników
                </p>
              </label>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {saved && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                Profil zaktualizowany!
              </div>
            )}

            <button type="submit" disabled={saving} className="w-full btn btn-primary">
              {saving ? 'Zapisywanie…' : 'Zapisz zmiany'}
            </button>
          </form>
        </div>

        {/* Stripe Connect */}
        <div className="card p-8">
          <h2 className="font-heading font-bold text-2xl mb-4">Płatności</h2>
          <p className="text-muted-foreground mb-6">
            Aby przyjmować płatności za treningi, musisz połączyć swoje konto Stripe.
          </p>

          {profile?.stripe_onboarded ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 flex items-center gap-4">
              <Check className="w-6 h-6 text-green-600 shrink-0" />
              <div>
                <p className="font-semibold text-green-900">Konto Stripe połączone!</p>
                <p className="text-sm text-green-800">
                  Możesz teraz przyjmować płatności za treningi
                </p>
              </div>
            </div>
          ) : (
            <button
              onClick={handleStripeConnect}
              disabled={stripeConnecting}
              className="btn btn-primary"
            >
              {stripeConnecting ? 'Łączenie…' : 'Połącz konto Stripe'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
