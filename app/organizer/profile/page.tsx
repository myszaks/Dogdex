'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, ExternalLink } from 'lucide-react'
import type { OrganizerProfile } from '@/types'

const emptyForm = {
  display_name: '',
  organization_name: '',
  bio: '',
  location_city: '',
  profile_image_url: '',
  website_url: '',
  is_active: true,
}

export default function OrganizerProfilePage() {
  const [profile, setProfile] = useState<OrganizerProfile | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/organizer-profile')
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Nie udało się pobrać profilu')
        const source = data.profile
        setProfile(source)
        setForm({
          display_name: source?.display_name || data.defaults?.display_name || '',
          organization_name: source?.organization_name || data.defaults?.organization_name || '',
          bio: source?.bio || '',
          location_city: source?.location_city || '',
          profile_image_url: source?.profile_image_url || '',
          website_url: source?.website_url || '',
          is_active: source?.is_active ?? true,
        })
      })
      .catch(loadError => setError((loadError as Error).message))
      .finally(() => setLoading(false))
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const response = await fetch('/api/organizer-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Nie udało się zapisać profilu')
      setProfile(data)
      setSaved(true)
    } catch (saveError) {
      setError((saveError as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="py-12 text-center text-muted-foreground">Ładowanie…</div>

  return (
    <div className="max-w-3xl space-y-6 py-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Wizerunek organizatora</p>
          <h1 className="mt-2 font-heading text-3xl font-bold text-primary">Profil publiczny</h1>
          <p className="mt-2 text-muted-foreground">Te informacje zobaczą osoby przeglądające Twoje wydarzenia i opinie.</p>
        </div>
        {profile?.slug && profile.is_active && (
          <Link href={`/organizers/${profile.slug}`} className="btn btn-secondary" target="_blank">
            Zobacz profil <ExternalLink className="h-4 w-4" />
          </Link>
        )}
      </div>

      <form onSubmit={submit} className="card space-y-5 p-6 sm:p-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="organizer-display-name" label="Nazwa publiczna *">
            <input id="organizer-display-name" className="form-input" required maxLength={120} value={form.display_name} onChange={event => setForm(current => ({ ...current, display_name: event.target.value }))} />
          </Field>
          <Field id="organizer-organization-name" label="Klub / organizacja">
            <input id="organizer-organization-name" className="form-input" maxLength={160} value={form.organization_name} onChange={event => setForm(current => ({ ...current, organization_name: event.target.value }))} />
          </Field>
        </div>

        <Field id="organizer-bio" label="Opis">
          <textarea id="organizer-bio" className="form-input resize-none" rows={5} maxLength={5000} value={form.bio} onChange={event => setForm(current => ({ ...current, bio: event.target.value }))} placeholder="Opisz doświadczenie, rodzaje organizowanych wydarzeń i wartości, które są dla Ciebie ważne." />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="organizer-location-city" label="Miasto">
            <input id="organizer-location-city" className="form-input" maxLength={120} value={form.location_city} onChange={event => setForm(current => ({ ...current, location_city: event.target.value }))} />
          </Field>
          <Field id="organizer-website-url" label="Strona internetowa">
            <input id="organizer-website-url" className="form-input" type="url" maxLength={2048} value={form.website_url} onChange={event => setForm(current => ({ ...current, website_url: event.target.value }))} placeholder="https://…" />
          </Field>
        </div>

        <Field id="organizer-profile-image-url" label="Adres zdjęcia profilowego">
          <input id="organizer-profile-image-url" className="form-input" type="url" maxLength={2048} value={form.profile_image_url} onChange={event => setForm(current => ({ ...current, profile_image_url: event.target.value }))} placeholder="https://…" />
        </Field>

        <label htmlFor="organizer-profile-active" className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/40 p-4">
          <input id="organizer-profile-active" type="checkbox" checked={form.is_active} onChange={event => setForm(current => ({ ...current, is_active: event.target.checked }))} className="mt-1" />
          <span>
            <span className="block font-semibold text-foreground">Profil widoczny publicznie</span>
            <span className="mt-1 block text-sm text-muted-foreground">Po wyłączeniu opinie pozostaną zapisane, ale profil nie będzie dostępny publicznie.</span>
          </span>
        </label>

        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {saved && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><Check className="h-4 w-4" /> Profil został zapisany.</div>}

        <button type="submit" disabled={saving} className="btn btn-primary w-full">
          {saving ? 'Zapisywanie…' : 'Zapisz profil'}
        </button>
      </form>
    </div>
  )
}

function Field({ children, id, label }: { children: React.ReactNode; id: string; label: string }) {
  return <div><label htmlFor={id} className="mb-2 block text-sm font-semibold text-foreground">{label}</label>{children}</div>
}
